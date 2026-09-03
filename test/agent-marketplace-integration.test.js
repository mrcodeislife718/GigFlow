import test from 'node:test';
import assert from 'node:assert/strict';
import { GigAgentCatalog } from '../src/agent-marketplace-integration.js';

test('imports only agents that satisfy gig-work capability, permission and outcome requirements', () => {
  const catalog = new GigAgentCatalog();
  catalog.import({ id: 'scheduler', version: '1.0.0', capabilities: ['schedule'], permissions: ['calendar:write'], verifiedOutcomeRate: 0.98, cvo: 0.4 }, {
    capabilities: ['schedule'], allowedPermissions: ['calendar:write'], minVerifiedOutcomeRate: 0.95, maxCvo: 1,
  });
  assert.equal(catalog.select({ capability: 'schedule', minVerifiedOutcomeRate: 0.95 })[0].id, 'scheduler');
  assert.throws(() => catalog.import({ id: 'bad', version: '1', capabilities: ['schedule'], permissions: ['billing:admin'], verifiedOutcomeRate: 1, cvo: 0.1 }, { capabilities: ['schedule'], allowedPermissions: ['calendar:write'] }), /disallowed permission/);
});
