import test from 'node:test';
import assert from 'node:assert/strict';
import { GigFlowCore } from '../src/gigflow.js';

test('ingests, deduplicates, prioritizes and converts opportunities', () => {
  const core = new GigFlowCore({ now: () => '2026-08-13T20:00:00.000Z' });
  const first = core.ingestOpportunity({ source: 'direct', externalId: 'lead-1', customerName: 'A', email: 'a@example.com', service: 'cleaning', expectedRevenueCents: 30000, estimatedCostCents: 8000, distanceMiles: 5, skillFit: 1, timingFit: 0.9, conversionProbability: 0.8, repeatPotential: 0.7 });
  const duplicate = core.ingestOpportunity({ source: 'direct', externalId: 'lead-1', customerName: 'A', email: 'a@example.com', service: 'cleaning' });
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(core.opportunities.size, 1);
  const priority = core.prioritize(first.opportunity.id);
  assert.ok(priority.score > 0.5);
  assert.equal(priority.marginCents, 22000);
  const job = core.convertToJob(first.opportunity.id, { scheduledAt: '2026-08-14T14:00:00.000Z' });
  assert.equal(job.status, 'scheduled');
  assert.equal(core.opportunities.get(first.opportunity.id).status, 'converted');
});

test('tracks completed work, transactions, earnings and continuity', () => {
  const core = new GigFlowCore();
  const { opportunity } = core.ingestOpportunity({ source: 'referral', customerName: 'B', phone: '555-0100', service: 'repair', expectedRevenueCents: 50000, estimatedCostCents: 10000 });
  const job = core.convertToJob(opportunity.id, { agreedPriceCents: 52000 });
  core.transitionJob(job.id, 'completed');
  core.recordTransaction({ jobId: job.id, type: 'payment', amountCents: 52000 });
  core.recordTransaction({ jobId: job.id, type: 'expense', amountCents: 7000, category: 'materials' });
  core.recordTransaction({ jobId: job.id, type: 'fee', amountCents: 2000, category: 'processing' });
  const summary = core.earningsSummary();
  assert.equal(summary.grossCents, 52000);
  assert.equal(summary.costsCents, 9000);
  assert.equal(summary.netCents, 43000);
  assert.equal(summary.completedJobs, 1);
  const queue = core.continuityQueue();
  assert.equal(queue.some((item) => item.entityId === job.id && item.nextAction === 'collect-payment'), true);
});
