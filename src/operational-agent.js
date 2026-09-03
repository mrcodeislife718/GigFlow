import crypto from 'node:crypto';

export class OperationalWorkflow {
  constructor({ id = crypto.randomUUID(), trigger, authority, deadline = null, budget = Infinity, success }) {
    if (!trigger || !authority || typeof success !== 'function') throw new Error('trigger, authority and success verifier are required');
    this.id = id;
    this.trigger = structuredClone(trigger);
    this.authority = new Set(authority);
    this.deadline = deadline;
    this.budget = Number(budget);
    this.success = success;
    this.spent = 0;
    this.steps = [];
    this.state = 'created';
  }

  start() {
    if (this.state !== 'created') throw new Error('workflow already started');
    if (this.deadline && Date.now() > new Date(this.deadline).getTime()) throw new Error('workflow deadline expired');
    this.state = 'running';
    return this.snapshot();
  }

  execute({ capability, cost = 0, operation, verify }) {
    if (this.state !== 'running') throw new Error('workflow is not running');
    if (!this.authority.has(capability)) throw new Error(`capability not authorized: ${capability}`);
    if (this.deadline && Date.now() > new Date(this.deadline).getTime()) throw new Error('workflow deadline expired');
    const nextSpend = this.spent + Number(cost);
    if (nextSpend > this.budget) throw new Error('workflow budget exceeded');
    if (typeof operation !== 'function') throw new Error('operation must be executable');
    const result = operation();
    const verification = typeof verify === 'function' ? verify(result) : null;
    this.spent = nextSpend;
    this.steps.push({ capability, cost, result: structuredClone(result), verification: structuredClone(verification), at: Date.now() });
    return structuredClone({ result, verification });
  }

  complete(outcome) {
    if (this.state !== 'running') throw new Error('workflow is not running');
    const verified = Boolean(this.success(outcome));
    this.state = verified ? 'completed' : 'failed';
    this.outcome = structuredClone(outcome);
    this.verified = verified;
    return this.receipt();
  }

  recover({ reason, action }) {
    if (!['running', 'failed'].includes(this.state)) throw new Error('workflow cannot recover from current state');
    if (typeof action !== 'function') throw new Error('recovery action is required');
    const result = action();
    this.steps.push({ capability: 'recovery', cost: 0, result: structuredClone(result), verification: { reason }, at: Date.now() });
    this.state = 'running';
    return structuredClone(result);
  }

  receipt() {
    const payload = this.snapshot();
    return { ...payload, digest: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
  }

  snapshot() {
    return { id: this.id, trigger: structuredClone(this.trigger), authority: [...this.authority], deadline: this.deadline, budget: this.budget, spent: this.spent, state: this.state, verified: this.verified ?? false, outcome: structuredClone(this.outcome ?? null), steps: structuredClone(this.steps) };
  }
}
