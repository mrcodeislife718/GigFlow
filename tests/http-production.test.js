import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, test } from 'node:test';
import { createGigFlowHandler } from '../src/http-app.js';

const servers = new Set();
afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve) => server.close(resolve))));
  servers.clear();
});

function fakeService() {
  return {
    async initialize() { return this; },
    dashboard() { return { earnings: { netCents: 25000 } }; },
    async ingestOpportunity(input) { return { opportunity: { id: 'opp-1', ...input } }; },
    async updateOpportunity(id, input) { return { id, ...input }; },
    async convertOpportunity(id, input) { return { id: 'job-1', sourceOpportunityId: id, ...input }; },
    async transitionJob(id, status, input) { return { id, status, ...input }; },
    async recordTransaction(input) { return { id: 'tx-1', ...input }; },
  };
}

async function listen(handler) {
  const server = createServer(handler);
  servers.add(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function expectStatus(response, expected) {
  if (response.status === expected) return;
  assert.fail(`Expected HTTP ${expected}, received ${response.status}: ${await response.text()}`);
}

test('production initialization fails closed without an API credential', async () => {
  await assert.rejects(createGigFlowHandler({ service: fakeService(), requireAuth: true, apiKey: '' }), /GIGFLOW_API_KEY is required/);
});

test('health remains public while product APIs require credentials and expose security headers', async () => {
  const base = await listen(await createGigFlowHandler({ service: fakeService(), requireAuth: true, apiKey: 'secret' }));
  const health = await fetch(`${base}/health`);
  await expectStatus(health, 200);
  assert.equal((await health.json()).service, 'gigflow');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(health.headers.get('x-request-id'));

  const denied = await fetch(`${base}/api/dashboard`);
  await expectStatus(denied, 401);
  assert.equal((await denied.json()).error, 'unauthorized');

  const allowed = await fetch(`${base}/api/dashboard`, { headers: { authorization: 'Bearer secret' } });
  await expectStatus(allowed, 200);
  assert.equal((await allowed.json()).earnings.netCents, 25000);
});

test('rate limiting fails closed before product work is executed', async () => {
  const base = await listen(await createGigFlowHandler({ service: fakeService(), requireAuth: true, apiKey: 'secret', rateLimitMax: 1, rateLimitWindowMs: 60_000 }));
  const headers = { authorization: 'Bearer secret' };
  await expectStatus(await fetch(`${base}/api/dashboard`, { headers }), 200);
  const limited = await fetch(`${base}/api/dashboard`, { headers });
  await expectStatus(limited, 429);
  assert.equal((await limited.json()).error, 'rate_limited');
});

test('job transition rejects missing status instead of forwarding an undefined state', async () => {
  const base = await listen(await createGigFlowHandler({ service: fakeService(), requireAuth: true, apiKey: 'secret' }));
  const response = await fetch(`${base}/api/jobs/job-1/status`, { method: 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' }, body: '{}' });
  await expectStatus(response, 400);
  assert.equal((await response.json()).error, 'status is required');
});
