export function validateAgentListing(listing, requirements = {}) {
  if (!listing?.id || !listing?.version) throw new Error('agent listing id and version are required');
  const capabilities = new Set(listing.capabilities ?? []);
  const permissions = new Set(listing.permissions ?? []);
  for (const capability of requirements.capabilities ?? []) if (!capabilities.has(capability)) throw new Error(`agent missing required capability: ${capability}`);
  for (const permission of listing.permissions ?? []) if ((requirements.allowedPermissions ?? listing.permissions ?? []).includes(permission) === false) throw new Error(`agent requests disallowed permission: ${permission}`);
  if (requirements.minVerifiedOutcomeRate != null && Number(listing.verifiedOutcomeRate ?? 0) < requirements.minVerifiedOutcomeRate) throw new Error('agent verified outcome rate below requirement');
  if (requirements.maxCvo != null && Number(listing.cvo ?? Infinity) > requirements.maxCvo) throw new Error('agent CVO exceeds requirement');
  return { valid: true, id: listing.id, version: listing.version, capabilities: [...capabilities], permissions: [...permissions] };
}

export class GigAgentCatalog {
  constructor() { this.listings = new Map(); }
  import(listing, requirements = {}) {
    const validated = validateAgentListing(listing, requirements);
    const key = `${listing.id}@${listing.version}`;
    this.listings.set(key, structuredClone(listing));
    return { key, validated };
  }
  select({ capability, maxCvo = Infinity, minVerifiedOutcomeRate = 0 }) {
    return [...this.listings.entries()]
      .filter(([, listing]) => (listing.capabilities ?? []).includes(capability) && Number(listing.cvo ?? Infinity) <= maxCvo && Number(listing.verifiedOutcomeRate ?? 0) >= minVerifiedOutcomeRate)
      .map(([key, listing]) => ({ key, ...structuredClone(listing) }))
      .sort((a, b) => Number(a.cvo ?? Infinity) - Number(b.cvo ?? Infinity) || Number(b.verifiedOutcomeRate ?? 0) - Number(a.verifiedOutcomeRate ?? 0));
  }
}
