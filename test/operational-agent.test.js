import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationalWorkflow } from '../src/operational-agent.js';

test('executes bounded gig workflow and only completes on verified outcome', () => {
  const workflow = new OperationalWorkflow({ trigger: { type: 'gig.accepted' }, authority: ['message_client'], budget: 1, success: outcome => outcome?.verified === true });
  workflow.start();
  workflow.execute({ capability: 'message_client', cost: 0.1, operation: () => ({ delivered: true }), verify: result => ({ verified: result.delivered }) });
  assert.throws(() => workflow.execute({ capability: 'charge_card', operation: () => ({}) }), /not authorized/);
  const receipt = workflow.complete({ verified: true, externalReference: 'gig:1' });
  assert.equal(receipt.state, 'completed');
  assert.match(receipt.digest, /^[a-f0-9]{64}$/);
});
