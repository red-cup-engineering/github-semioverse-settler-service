import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileHighWaterStore, reconcileGitHubDeltas } from "../src/reconcile.mjs";

const delta = (revision, eventKey = "event:" + revision) => ({
  providerObjectKey: "github:repo:561:issue:I_99", revision, eventKey
});

test("high-water store survives reopen and advances atomically", () => {
  const dir = mkdtempSync(join(tmpdir(), "github-high-water-"));
  try {
    const path = join(dir, "high-water.json");
    const first = new FileHighWaterStore(path);
    first.put("github:repo:561:issue:I_99", { revision: "10", eventKey: "event:10" });
    const second = new FileHighWaterStore(path);
    assert.equal(second.get("github:repo:561:issue:I_99").revision, "10");
    second.put("github:repo:561:issue:I_99", { revision: "11", eventKey: "event:11" });
    assert.equal(new FileHighWaterStore(path).get("github:repo:561:issue:I_99").eventKey, "event:11");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("reconcile settles only above the stored high-water and advances it from the receipt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "github-reconcile-"));
  try {
    const store = new FileHighWaterStore(join(dir, "high-water.json"));
    store.put("github:repo:561:issue:I_99", { revision: "10", eventKey: "event:10" });
    const seen = [];
    const result = await reconcileGitHubDeltas({
      list: async () => [delta("9"), delta("11")],
      highWaterStore: store,
      settle: async object => { seen.push(object.eventKey); return { state: "RECEIVED", receipt: { receiptId: "receipt:" + object.eventKey } }; },
      now: () => "2026-10-07T15:00:00Z",
    });
    assert.deepEqual(seen, ["event:11"]);
    assert.equal(result.observed, 2);
    assert.equal(result.settled, 1);
    assert.equal(result.belowHighWater, 1);
    assert.equal(store.get("github:repo:561:issue:I_99").eventKey, "event:11");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("duplicate settlement still advances the high-water without a second native admission", async () => {
  const dir = mkdtempSync(join(tmpdir(), "github-reconcile-"));
  try {
    const store = new FileHighWaterStore(join(dir, "high-water.json"));
    let calls = 0;
    const settle = async () => { calls += 1; return { state: "DUPLICATE_RECEIVED", receipt: { receiptId: "existing" } }; };
    const result = await reconcileGitHubDeltas({ list: async () => [delta("12")], highWaterStore: store, settle });
    assert.equal(calls, 1);
    assert.equal(result.settled, 1);
    assert.equal(store.get("github:repo:561:issue:I_99").revision, "12");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("failed settlement does not move the high-water", async () => {
  const dir = mkdtempSync(join(tmpdir(), "github-reconcile-"));
  try {
    const store = new FileHighWaterStore(join(dir, "high-water.json"));
    const result = await reconcileGitHubDeltas({
      list: async () => [delta("13")],
      highWaterStore: store,
      settle: async () => ({ state: "PENDING_RECEIVER_READBACK" }),
    });
    assert.equal(result.pending, 1);
    assert.equal(store.get("github:repo:561:issue:I_99"), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
