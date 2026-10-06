import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileReceiptStore } from "../src/file-receipt-store.mjs";
import { createMetroplatArrivalAdmit } from "../src/metroplat-http-admit.mjs";
import { settleGitHubEvent } from "../src/settler.mjs";

function issueEvent() {
  return {
    action: "edited",
    delivery_id: "delivery-runtime-1",
    repository: {
      id: 561,
      full_name: "red-cup-engineering/git-services-section",
      html_url: "https://github.com/red-cup-engineering/git-services-section",
    },
    sender: { login: "agent" },
    issue: {
      id: 99,
      node_id: "I_99",
      number: 1,
      updated_at: "2026-10-06T05:00:00Z",
      html_url: "https://github.com/red-cup-engineering/git-services-section/issues/1",
      body: "work_ref: git-semioverse-sync-v1\ncanonical_receiver: Semioverse\n",
    },
  };
}

function metroplatResponse() {
  return {
    kind: "metroplat.arrival.receipt",
    ok: true,
    cloudEventIdentity: "ni:///sha-256;example",
    packetDigest: "abc123",
    packetPath: "packets/abc123.json",
    admission: { artifact: { path: "journal/admit-arrival.jsonl" } },
  };
}

test("file receipt store survives process-style reopen and refuses overwrite", () => {
  const dir = mkdtempSync(join(tmpdir(), "github-settler-"));
  try {
    const path = join(dir, "receipts.json");
    new FileReceiptStore(path).put("event:1", { receiptId: "r1" });
    assert.equal(new FileReceiptStore(path).get("event:1").receiptId, "r1");
    assert.throws(
      () => new FileReceiptStore(path).put("event:1", { receiptId: "r2" }),
      /already exists/u,
    );
    assert.equal(JSON.parse(readFileSync(path, "utf8"))["event:1"].receiptId, "r1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MetroPlat adapter posts typed GitHub delta to the mounted root and binds its arrival receipt", async () => {
  let observed;
  const admit = createMetroplatArrivalAdmit({
    url: "http://metroplat.test/",
    authorization: "Bearer example",
    fetchImpl: async (url, options) => {
      observed = { url: String(url), options };
      return new Response(JSON.stringify(metroplatResponse()), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const receipt = await admit({ schema: "semioverse.github-delta.v1", eventKey: "event:1" });
  assert.equal(observed.url, "http://metroplat.test/");
  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.headers.authorization, "Bearer example");
  assert.equal(JSON.parse(observed.options.body).schema, "semioverse.github-delta.v1");
  assert.equal(
    receipt.receiptId,
    "metroplat-arrival:ni:///sha-256;example:abc123",
  );
  assert.equal(receipt.logPath, "journal/admit-arrival.jsonl");
});

test("persistent receipt store suppresses a second network admission of the same GitHub revision", async () => {
  const dir = mkdtempSync(join(tmpdir(), "github-settler-"));
  let calls = 0;
  try {
    const store = new FileReceiptStore(join(dir, "receipts.json"));
    const admit = createMetroplatArrivalAdmit({
      url: "http://metroplat.test/",
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify(metroplatResponse()), { status: 202 });
      },
    });

    const first = await settleGitHubEvent({ event: issueEvent(), receiptStore: store, admit });
    const replay = await settleGitHubEvent({ event: issueEvent(), receiptStore: new FileReceiptStore(store.path), admit });
    assert.equal(first.state, "RECEIVED");
    assert.equal(replay.state, "DUPLICATE_RECEIVED");
    assert.equal(calls, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adapter refuses a non-root URL so a stale /arrivals assumption cannot silently drift", () => {
  assert.throws(
    () => createMetroplatArrivalAdmit({ url: "http://metroplat.test/arrivals" }),
    /mounted root/u,
  );
});
