import { randomUUID } from 'node:crypto';

export class GigFlowEstimates {
  constructor({ core, now = () => new Date().toISOString() } = {}) {
    if (!core) throw new Error('GigFlowEstimates requires GigFlowCore');
    this.core = core;
    this.now = now;
    this.estimates = new Map();
  }

  create({ opportunityId, lineItems = [], notes = null, expiresAt = null }) {
    const opportunity = this.core.opportunities.get(opportunityId);
    if (!opportunity) throw new Error('opportunity not found');
    if (!Array.isArray(lineItems) || lineItems.length === 0) throw new Error('lineItems are required');
    const normalized = lineItems.map((item) => {
      if (!item.description?.trim()) throw new Error('line item description is required');
      if (!Number.isInteger(item.amountCents) || item.amountCents < 0) throw new Error('line item amountCents must be a non-negative integer');
      return { description: item.description, amountCents: item.amountCents };
    });
    const totalCents = normalized.reduce((sum, item) => sum + item.amountCents, 0);
    const id = randomUUID();
    const estimate = { id, opportunityId, customerId: opportunity.customerId, lineItems: normalized, totalCents, notes, expiresAt, status: 'draft', createdAt: this.now() };
    this.estimates.set(id, estimate);
    this.core.record('estimate.created', 'estimate', id, { opportunityId, totalCents });
    return structuredClone(estimate);
  }

  send(id) {
    const estimate = this.#require(id);
    estimate.status = 'sent';
    estimate.sentAt = this.now();
    this.core.record('estimate.sent', 'estimate', id, { opportunityId: estimate.opportunityId });
    return structuredClone(estimate);
  }

  accept(id) {
    const estimate = this.#require(id);
    if (!['draft', 'sent'].includes(estimate.status)) throw new Error('estimate cannot be accepted');
    estimate.status = 'accepted';
    estimate.acceptedAt = this.now();
    this.core.updateOpportunity(estimate.opportunityId, { status: 'proposed', nextAction: 'schedule' });
    this.core.record('estimate.accepted', 'estimate', id, { opportunityId: estimate.opportunityId, totalCents: estimate.totalCents });
    return structuredClone(estimate);
  }

  #require(id) {
    const estimate = this.estimates.get(id);
    if (!estimate) throw new Error('estimate not found');
    return estimate;
  }
}
