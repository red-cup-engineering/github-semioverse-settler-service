import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileReceiptStore } from "../src/file-receipt-store.mjs";
import { createMetroplatArrivalAdmit, githubDeltaCloudEvent } from "../src/metroplat-http-admit.mjs";
import { normalizeGitHubEvent, settleGitHubEvent } from "../src/settler.mjs";

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

test("MetroPlat adapter admits a structured CloudEvent at /arrivals with stable source identity", async () => {
  let observed;
  const admit = createMetroplatArrivalAdmit({
    url: "http://metroplat.test/arrivals",
    authorization: "Bearer example",
    fetchImpl: async (url, options) => {
      observed = { url: String(url), options };
      return new Response(JSON.stringify(metroplatResponse()), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const envelope = normalizeGitHubEvent(issueEvent());
  const receipt = await admit(envelope);
  assert.equal(observed.url, "http://metroplat.test/arrivals");
  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.headers.authorization, "Bearer example");
  const event = JSON.parse(observed.options.body);
  assert.equal(observed.options.headers["content-type"], "application/cloudevents+json");
  assert.equal(event.specversion, "1.0");
  assert.match(event.id, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
  assert.equal(event.source, "urn:github:repository:561");
  assert.equal(event.type, "org.561group.semioverse.github-delta.v1");
  const { deliveryId, ...qualifiedSource } = envelope.source;
  assert.deepEqual(event.data, { ...envelope, source: qualifiedSource });
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
      url: "http://metroplat.test/arrivals",
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

test("adapter refuses root so HTTP request observations cannot masquerade as GitHub arrivals", () => {
  assert.throws(
    () => createMetroplatArrivalAdmit({ url: "http://metroplat.test/" }),
    /\/arrivals/u,
  );
});

test("CloudEvent identity is source-bound but ignores the transport delivery identifier", () => {
  const current = normalizeGitHubEvent(issueEvent());
  const retry = { ...current, source: { ...current.source, deliveryId: "retry" } };
  assert.deepEqual(githubDeltaCloudEvent(current), githubDeltaCloudEvent(retry));
  const renamed = { ...current, source: { ...current.source, repositoryFullName: "red-cup-engineering/renamed" } };
  assert.notEqual(githubDeltaCloudEvent(current).id, githubDeltaCloudEvent(renamed).id);
});
