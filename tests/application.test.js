import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GigFlowService } from '../src/service.js';
import { JsonStore } from '../src/store.js';

test('persists the opportunity-to-earnings product flow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gigflow-'));
  try {
    const path = join(dir, 'state.json');
    const service = await new GigFlowService({ store: new JsonStore(path) }).initialize();
    const { opportunity } = await service.ingestOpportunity({ customerName: 'A', email: 'a@example.test', service: 'cleaning', expectedRevenueCents: 30000, estimatedCostCents: 5000 });
    const job = await service.convertOpportunity(opportunity.id, {});
    await service.transitionJob(job.id, 'completed', {});
    await service.recordTransaction({ jobId: job.id, type: 'payment', amountCents: 30000 });
    await service.recordTransaction({ jobId: job.id, type: 'expense', amountCents: 5000, category: 'supplies' });

    const restored = await new GigFlowService({ store: new JsonStore(path) }).initialize();
    const dashboard = restored.dashboard();
    assert.equal(dashboard.earnings.netCents, 25000);
    assert.equal(dashboard.earnings.completedJobs, 1);
    assert.equal(dashboard.jobs[0].paymentStatus, 'paid');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
