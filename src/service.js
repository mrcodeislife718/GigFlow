import { GigFlowCore } from './gigflow.js';
import { JsonStore } from './store.js';

function entries(map) {
  return [...map.entries()].map(([key, value]) => [key, structuredClone(value)]);
}

function hydrateMap(items = []) {
  return new Map(items.map(([key, value]) => [key, value]));
}

export class GigFlowService {
  constructor({ core = new GigFlowCore(), store = new JsonStore(process.env.GIGFLOW_DATA ?? './data/gigflow.json') } = {}) {
    this.core = core;
    this.store = store;
  }

  async initialize() {
    const state = await this.store.load(null);
    if (!state) return this;
    this.core.customers = hydrateMap(state.customers);
    this.core.opportunities = hydrateMap(state.opportunities);
    this.core.jobs = hydrateMap(state.jobs);
    this.core.transactions = hydrateMap(state.transactions);
    this.core.events = state.events ?? [];
    this.core.dedupe = hydrateMap(state.dedupe);
    return this;
  }

  snapshot() {
    return {
      customers: entries(this.core.customers),
      opportunities: entries(this.core.opportunities),
      jobs: entries(this.core.jobs),
      transactions: entries(this.core.transactions),
      events: structuredClone(this.core.events),
      dedupe: entries(this.core.dedupe),
    };
  }

  async persist() {
    await this.store.save(this.snapshot());
  }

  dashboard() {
    return {
      earnings: this.core.earningsSummary(),
      opportunities: this.core.rankOpenOpportunities(),
      jobs: [...this.core.jobs.values()].map((item) => structuredClone(item)),
      customers: [...this.core.customers.values()].map((item) => structuredClone(item)),
      continuity: this.core.continuityQueue(),
      recentEvents: this.core.events.slice(-30).reverse().map((item) => structuredClone(item)),
    };
  }

  async ingestOpportunity(input) {
    const result = this.core.ingestOpportunity(input);
    await this.persist();
    return result;
  }

  async updateOpportunity(id, input) {
    const result = this.core.updateOpportunity(id, input);
    await this.persist();
    return result;
  }

  async convertOpportunity(id, input) {
    const result = this.core.convertToJob(id, input);
    await this.persist();
    return result;
  }

  async transitionJob(id, status, details) {
    const result = this.core.transitionJob(id, status, details);
    await this.persist();
    return result;
  }

  async recordTransaction(input) {
    const result = this.core.recordTransaction(input);
    await this.persist();
    return result;
  }
}
