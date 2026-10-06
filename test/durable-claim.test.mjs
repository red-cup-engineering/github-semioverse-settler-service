import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileReceiptStore } from "../src/file-receipt-store.mjs";
import { normalizeGitHubEvent, settleGitHubEvent } from "../src/settler.mjs";

function issueEvent() {
  return {
    action: "edited",
    repository: { id: 561, full_name: "red-cup-engineering/git-services-section" },
    issue: {
      id: 99,
      node_id: "I_99",
      number: 1,
      updated_at: "2026-10-06T05:00:00Z",
      body: "work_ref: git-semioverse-sync-v1",
    },
  };
}

test("durable claim is shared by independent receipt-store instances", () => {
  const dir = mkdtempSync(join(tmpdir(), "github-settler-"));
  try {
    const path = join(dir, "receipts.json");
    const first = new FileReceiptStore(path);
    const second = new FileReceiptStore(path);
    const acquired = first.claim("event:claim");
    const observed = second.claim("event:claim");
    assert.equal(acquired.state, "ACQUIRED");
    assert.equal(observed.state, "EXISTS");
    assert.equal(observed.claim.claimId, acquired.claim.claimId);
    assert.throws(() => second.clearClaim("event:claim", "other"), /ownership mismatch/u);
    assert.equal(first.clearClaim("event:claim", acquired.claim.claimId), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a second process-shaped store waits for receiver readback instead of admitting twice", async () => {
  const dir = mkdtempSync(join(tmpdir(), "github-settler-"));
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  try {
    const path = join(dir, "receipts.json");
    const firstStore = new FileReceiptStore(path);
    const secondStore = new FileReceiptStore(path);
    const admit = async () => {
      calls += 1;
      await gate;
      return { receiptId: "semioverse:one" };
    };

    const first = settleGitHubEvent({ event: issueEvent(), receiptStore: firstStore, admit });
    await new Promise((resolve) => setImmediate(resolve));
    const second = await settleGitHubEvent({ event: issueEvent(), receiptStore: secondStore, admit });
    assert.equal(second.state, "PENDING_RECEIVER_READBACK");
    assert.equal(calls, 1);

    release();
    const received = await first;
    assert.equal(received.state, "RECEIVED");

    const replay = await settleGitHubEvent({ event: issueEvent(), receiptStore: secondStore, admit });
    assert.equal(replay.state, "DUPLICATE_RECEIVED");
    assert.equal(calls, 1);
  } finally {
    release?.();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ambiguous admission failure leaves a durable claim and suppresses blind retry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "github-settler-"));
  let calls = 0;
  try {
    const path = join(dir, "receipts.json");
    const firstStore = new FileReceiptStore(path);
    const secondStore = new FileReceiptStore(path);
    const event = issueEvent();
    const eventKey = normalizeGitHubEvent(event).eventKey;
    const admit = async () => {
      calls += 1;
      throw new Error("ambiguous admission outcome");
    };

    await assert.rejects(settleGitHubEvent({ event, receiptStore: firstStore, admit }), /ambiguous/u);
    assert.equal(firstStore.getClaim(eventKey).eventKey, eventKey);

    const replay = await settleGitHubEvent({ event, receiptStore: secondStore, admit });
    assert.equal(replay.state, "PENDING_RECEIVER_READBACK");
    assert.equal(calls, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
