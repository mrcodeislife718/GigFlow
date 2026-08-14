import test from 'node:test';
import assert from 'node:assert/strict';
import { GigFlowCore } from '../src/gigflow.js';
import { GigFlowEstimates } from '../src/estimates.js';

test('creates and accepts an estimate', () => {
  const core = new GigFlowCore();
  const { opportunity } = core.ingestOpportunity({ customerName: 'A', email: 'a@example.com', service: 'repair', expectedRevenueCents: 20000 });
  const estimates = new GigFlowEstimates({ core });
  const estimate = estimates.create({ opportunityId: opportunity.id, lineItems: [{ description: 'Repair', amountCents: 22000 }] });
  assert.equal(estimate.totalCents, 22000);
  estimates.send(estimate.id);
  const accepted = estimates.accept(estimate.id);
  assert.equal(accepted.status, 'accepted');
  assert.equal(core.opportunities.get(opportunity.id).nextAction, 'schedule');
});
