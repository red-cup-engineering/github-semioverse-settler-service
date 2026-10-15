const required = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(name + " is required");
  return value.trim();
};

/** Reconcile exact GitHub observations, never a guessed revision ordering.
 * Git SHAs are not clocks; edits can share timestamps and arrive out of order.
 * The receiving settlement port owns durable eventKey-based replay protection. */
export async function reconcileGitHubDeltas({ list, settle, scope = "default", limit = 100 } = {}) {
  if (typeof list !== "function") throw new TypeError("list function is required");
  if (typeof settle !== "function") throw new TypeError("settle function is required");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("limit must be between 1 and 1000");
  const current = await list({ scope, limit });
  if (!Array.isArray(current)) throw new TypeError("list must return an array");
  const selected = current.map(object => ({
    object,
    providerObjectKey: required(object?.providerObjectKey, "providerObjectKey"),
    revision: required(object?.revision ?? object?.source?.revision ?? object?.updatedAt ?? object?.headSha, "revision"),
    eventKey: required(object?.eventKey, "eventKey"),
  })).sort((a, b) => a.providerObjectKey.localeCompare(b.providerObjectKey) || a.eventKey.localeCompare(b.eventKey));
  const identities = new Map();
  for (const item of selected) {
    const observed = identities.get(item.eventKey);
    if (observed && (observed.providerObjectKey !== item.providerObjectKey || observed.revision !== item.revision))
      throw new Error("one GitHub event identity has conflicting source coordinates");
    identities.set(item.eventKey, item);
  }
  const results = [];
  for (const item of selected) {
    // Never discard a source just because an unrelated revision sorted later.
    // Only the exact event-key receipt can establish idempotent receiving.
    const outcome = await settle(item.object);
    if (!outcome || !["RECEIVED", "DUPLICATE_RECEIVED"].includes(outcome.state)) {
      results.push({ state: "NOT_SETTLED", providerObjectKey: item.providerObjectKey,
        revision: item.revision, eventKey: item.eventKey, outcome: outcome ?? null });
      continue;
    }
    results.push({ state: outcome.state, providerObjectKey: item.providerObjectKey,
      revision: item.revision, eventKey: item.eventKey, receipt: outcome.receipt ?? null });
  }
  return {
    scope, observed: selected.length,
    settled: results.filter(x => ["RECEIVED", "DUPLICATE_RECEIVED"].includes(x.state)).length,
    newlyReceived: results.filter(x => x.state === "RECEIVED").length,
    replayed: results.filter(x => x.state === "DUPLICATE_RECEIVED").length,
    pending: results.filter(x => x.state === "NOT_SETTLED").length,
    results,
  };
}
