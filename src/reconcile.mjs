import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const required = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(name + " is required");
  return value.trim();
};

export class FileHighWaterStore {
  constructor(path) { this.path = resolve(required(path, "high-water store path")); }
  get(key) {
    required(key, "high-water key");
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("high-water store must contain one JSON object");
      return parsed[key] ?? null;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }
  put(key, value) {
    required(key, "high-water key");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("high-water value must be an object");
    mkdirSync(dirname(this.path), { recursive: true });
    let current = {};
    try { current = JSON.parse(readFileSync(this.path, "utf8")); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (!current || typeof current !== "object" || Array.isArray(current)) throw new TypeError("high-water store must contain one JSON object");
    const next = { ...current, [key]: Object.freeze({ ...value }) };
    const temporary = this.path + "." + process.pid + ".tmp";
    writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.path);
    return next[key];
  }
}

const compare = (left, right) => {
  const a = String(left.revision);
  const b = String(right.revision);
  if (a === b) return String(left.eventKey).localeCompare(String(right.eventKey));
  const an = Number(a);
  const bn = Number(b);
  return Number.isFinite(an) && Number.isFinite(bn) ? an - bn : a.localeCompare(b);
};

export async function reconcileGitHubDeltas({ list, highWaterStore, settle, scope = "default", limit = 100, now = () => new Date().toISOString() } = {}) {
  if (typeof list !== "function") throw new TypeError("list function is required");
  if (!highWaterStore || typeof highWaterStore.get !== "function" || typeof highWaterStore.put !== "function") throw new TypeError("highWaterStore get/put interface is required");
  if (typeof settle !== "function") throw new TypeError("settle function is required");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("limit must be between 1 and 1000");
  const current = await list({ scope, limit });
  if (!Array.isArray(current)) throw new TypeError("list must return an array");
  const selected = current.map(object => ({
    object,
    providerObjectKey: required(object.providerObjectKey, "providerObjectKey"),
    revision: required(object.revision ?? object.updatedAt ?? object.headSha, "high-water revision"),
    eventKey: required(object.eventKey, "eventKey"),
  })).sort(compare);
  const results = [];
  for (const item of selected) {
    const previous = highWaterStore.get(item.providerObjectKey);
    if (previous && compare(item, previous) <= 0) {
      results.push({ state: "BELOW_HIGH_WATER", providerObjectKey: item.providerObjectKey, revision: item.revision, eventKey: item.eventKey });
      continue;
    }
    const outcome = await settle(item.object);
    if (!outcome || !["RECEIVED", "DUPLICATE_RECEIVED"].includes(outcome.state)) {
      results.push({ state: "NOT_SETTLED", providerObjectKey: item.providerObjectKey, revision: item.revision, eventKey: item.eventKey, outcome: outcome ?? null });
      continue;
    }
    const highWater = { providerObjectKey: item.providerObjectKey, revision: item.revision, eventKey: item.eventKey, receiptId: outcome.receipt?.receiptId ?? null, settledAt: now() };
    highWaterStore.put(item.providerObjectKey, highWater);
    results.push({ state: outcome.state, providerObjectKey: item.providerObjectKey, revision: item.revision, eventKey: item.eventKey, receipt: outcome.receipt ?? null, highWater });
  }
  return {
    scope, observed: selected.length,
    settled: results.filter(x => ["RECEIVED", "DUPLICATE_RECEIVED"].includes(x.state)).length,
    belowHighWater: results.filter(x => x.state === "BELOW_HIGH_WATER").length,
    pending: results.filter(x => x.state === "NOT_SETTLED").length,
    results,
  };
}
