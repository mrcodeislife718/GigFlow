import { randomUUID } from 'node:crypto';

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class GigFlowCore {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
    this.customers = new Map();
    this.opportunities = new Map();
    this.jobs = new Map();
    this.transactions = new Map();
    this.events = [];
    this.dedupe = new Map();
  }

  record(type, entityType, entityId, payload = {}) {
    const event = { id: randomUUID(), type, entityType, entityId, at: this.now(), payload: structuredClone(payload) };
    this.events.push(event);
    return event;
  }

  ingestOpportunity({ source = 'direct', externalId = null, customerName, phone = null, email = null, service, area = null, expectedRevenueCents = 0, estimatedCostCents = 0, distanceMiles = 0, conversionProbability = 0.5, repeatPotential = 0.5, timingFit = 0.5, skillFit = 0.5 }) {
    if (!service?.trim()) throw new Error('service is required');
    if (!phone && !email && !customerName) throw new Error('customer identity is required');
    if (!Number.isInteger(expectedRevenueCents) || expectedRevenueCents < 0) throw new Error('expectedRevenueCents must be a non-negative integer');
    if (!Number.isInteger(estimatedCostCents) || estimatedCostCents < 0) throw new Error('estimatedCostCents must be a non-negative integer');

    const fingerprint = externalId
      ? `${normalizeText(source)}:${normalizeText(externalId)}`
      : `${normalizeText(phone)}|${normalizeText(email)}|${normalizeText(service)}|${normalizeText(area)}`;
    const duplicateId = this.dedupe.get(fingerprint);
    if (duplicateId) {
      const existing = this.opportunities.get(duplicateId);
      this.record('opportunity.duplicate_detected', 'opportunity', duplicateId, { source, externalId });
      return { opportunity: structuredClone(existing), duplicate: true };
    }

    const customer = this.#upsertCustomer({ name: customerName, phone, email });
    const id = randomUUID();
    const opportunity = {
      id,
      source,
      externalId,
      customerId: customer.id,
      service,
      area,
      expectedRevenueCents,
      estimatedCostCents,
      distanceMiles,
      conversionProbability: clamp(conversionProbability, 0, 1),
      repeatPotential: clamp(repeatPotential, 0, 1),
      timingFit: clamp(timingFit, 0, 1),
      skillFit: clamp(skillFit, 0, 1),
      status: 'new',
      nextAction: 'qualify',
      createdAt: this.now(),
    };
    this.opportunities.set(id, opportunity);
    this.dedupe.set(fingerprint, id);
    this.record('opportunity.ingested', 'opportunity', id, { source, customerId: customer.id, service });
    return { opportunity: structuredClone(opportunity), duplicate: false };
  }

  prioritize(opportunityId) {
    const opportunity = this.#require(this.opportunities, opportunityId, 'opportunity');
    const marginCents = opportunity.expectedRevenueCents - opportunity.estimatedCostCents;
    const marginRatio = opportunity.expectedRevenueCents > 0 ? clamp(marginCents / opportunity.expectedRevenueCents, -1, 1) : 0;
    const distanceScore = clamp(1 - opportunity.distanceMiles / 50, 0, 1);
    const factors = {
      skillFit: opportunity.skillFit,
      timingFit: opportunity.timingFit,
      conversionProbability: opportunity.conversionProbability,
      repeatPotential: opportunity.repeatPotential,
      margin: clamp((marginRatio + 1) / 2, 0, 1),
      distance: distanceScore,
    };
    const weights = { skillFit: 0.2, timingFit: 0.15, conversionProbability: 0.2, repeatPotential: 0.15, margin: 0.2, distance: 0.1 };
    const score = Object.entries(factors).reduce((sum, [key, value]) => sum + value * weights[key], 0);
    const explanation = Object.entries(factors)
      .sort((a, b) => b[1] * weights[b[0]] - a[1] * weights[a[0]])
      .map(([factor, value]) => ({ factor, value, weight: weights[factor], contribution: Number((value * weights[factor]).toFixed(4)) }));
    return { opportunityId, score: Number(score.toFixed(4)), marginCents, factors, explanation };
  }

  rankOpenOpportunities() {
    return [...this.opportunities.values()]
      .filter((item) => !['declined', 'converted', 'closed'].includes(item.status))
      .map((item) => ({ opportunity: structuredClone(item), priority: this.prioritize(item.id) }))
      .sort((a, b) => b.priority.score - a.priority.score);
  }

  updateOpportunity(opportunityId, { status, nextAction = undefined, note = undefined } = {}) {
    const opportunity = this.#require(this.opportunities, opportunityId, 'opportunity');
    const allowed = new Set(['new', 'qualified', 'contacted', 'proposed', 'converted', 'declined', 'closed']);
    if (status && !allowed.has(status)) throw new Error('invalid opportunity status');
    if (status) opportunity.status = status;
    if (nextAction !== undefined) opportunity.nextAction = nextAction;
    opportunity.updatedAt = this.now();
    this.record('opportunity.updated', 'opportunity', opportunityId, { status: opportunity.status, nextAction: opportunity.nextAction, note });
    return structuredClone(opportunity);
  }

  convertToJob(opportunityId, { scheduledAt = null, agreedPriceCents = null, ownerId = null } = {}) {
    const opportunity = this.#require(this.opportunities, opportunityId, 'opportunity');
    if (opportunity.status === 'declined' || opportunity.status === 'closed') throw new Error('opportunity cannot be converted');
    const id = randomUUID();
    const job = {
      id,
      opportunityId,
      customerId: opportunity.customerId,
      source: opportunity.source,
      service: opportunity.service,
      area: opportunity.area,
      ownerId,
      scheduledAt,
      agreedPriceCents: agreedPriceCents ?? opportunity.expectedRevenueCents,
      status: scheduledAt ? 'scheduled' : 'accepted',
      nextAction: scheduledAt ? 'prepare' : 'schedule',
      paymentStatus: 'unpaid',
      createdAt: this.now(),
    };
    this.jobs.set(id, job);
    opportunity.status = 'converted';
    opportunity.nextAction = null;
    opportunity.updatedAt = this.now();
    this.record('job.created', 'job', id, { opportunityId, customerId: job.customerId, agreedPriceCents: job.agreedPriceCents });
    return structuredClone(job);
  }

  transitionJob(jobId, status, { nextAction = undefined, evidence = null } = {}) {
    const job = this.#require(this.jobs, jobId, 'job');
    const allowed = new Set(['accepted', 'scheduled', 'in_progress', 'completed', 'cancelled']);
    if (!allowed.has(status)) throw new Error('invalid job status');
    job.status = status;
    if (nextAction !== undefined) job.nextAction = nextAction;
    if (status === 'completed' && nextAction === undefined) job.nextAction = 'collect-payment';
    job.updatedAt = this.now();
    this.record(`job.${status}`, 'job', jobId, { evidence });
    return structuredClone(job);
  }

  recordTransaction({ jobId, type, amountCents, category = null, source = 'manual' }) {
    const job = this.#require(this.jobs, jobId, 'job');
    if (!['payment', 'payout', 'fee', 'expense', 'refund'].includes(type)) throw new Error('invalid transaction type');
    if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error('amountCents must be a non-negative integer');
    const id = randomUUID();
    const transaction = { id, jobId, customerId: job.customerId, source, type, category, amountCents, createdAt: this.now() };
    this.transactions.set(id, transaction);
    if (type === 'payment' || type === 'payout') job.paymentStatus = 'paid';
    this.record('transaction.recorded', 'transaction', id, { jobId, type, amountCents, category });
    return structuredClone(transaction);
  }

  earningsSummary({ source = null, service = null } = {}) {
    const jobs = [...this.jobs.values()].filter((job) => (!source || job.source === source) && (!service || job.service === service));
    const jobIds = new Set(jobs.map((job) => job.id));
    let grossCents = 0;
    let costsCents = 0;
    for (const transaction of this.transactions.values()) {
      if (!jobIds.has(transaction.jobId)) continue;
      if (transaction.type === 'payment' || transaction.type === 'payout') grossCents += transaction.amountCents;
      if (transaction.type === 'fee' || transaction.type === 'expense' || transaction.type === 'refund') costsCents += transaction.amountCents;
    }
    const completedJobs = jobs.filter((job) => job.status === 'completed').length;
    const convertedOpportunities = [...this.opportunities.values()].filter((item) => item.status === 'converted').length;
    return {
      grossCents,
      costsCents,
      netCents: grossCents - costsCents,
      jobs: jobs.length,
      completedJobs,
      opportunities: this.opportunities.size,
      convertedOpportunities,
      conversionRate: this.opportunities.size ? convertedOpportunities / this.opportunities.size : 0,
    };
  }

  continuityQueue() {
    const opportunities = [...this.opportunities.values()].filter((item) => item.nextAction).map((item) => ({ entityType: 'opportunity', entityId: item.id, nextAction: item.nextAction, status: item.status }));
    const jobs = [...this.jobs.values()].filter((item) => item.nextAction).map((item) => ({ entityType: 'job', entityId: item.id, nextAction: item.nextAction, status: item.status }));
    return [...opportunities, ...jobs];
  }

  #upsertCustomer({ name, phone, email }) {
    const existing = [...this.customers.values()].find((customer) => (phone && customer.phone === phone) || (email && customer.email === email));
    if (existing) return existing;
    const id = randomUUID();
    const customer = { id, name, phone, email, createdAt: this.now() };
    this.customers.set(id, customer);
    this.record('customer.created', 'customer', id, {});
    return customer;
  }

  #require(map, id, label) {
    const value = map.get(id);
    if (!value) throw new Error(`${label} not found: ${id}`);
    return value;
  }
}
