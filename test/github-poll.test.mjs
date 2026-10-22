import assert from "node:assert/strict";
import test from "node:test";
import { collectGitHubRepositoryDeltas } from "../src/github-poll.mjs";
import { MemoryReceiptStore, normalizeGitHubEvent, settleGitHubEnvelope } from "../src/settler.mjs";

test("poller paginates and preserves exact PR head revision", async () => {
  const calls = [];
  const getJson = async path => {
    calls.push(path);
    if (path === "repos/red-cup-engineering/x/issues?state=open&per_page=100&page=1") return [
      { number: 1, id: 10, node_id: "I_1", updated_at: "2026-10-07T15:00:00Z", html_url: "https://github.com/red-cup-engineering/x/issues/1", user: { id: 31, login: "author" } },
      { number: 2, id: 20, node_id: "PR_2", pull_request: {}, updated_at: "2026-10-07T15:01:00Z", html_url: "https://github.com/red-cup-engineering/x/pull/2", user: { id: 31, login: "author" } },
    ];
    if (path === "repos/red-cup-engineering/x/pulls/2") return {
      node_id: "PR_2", number: 2, head: { sha: "head-2" }, updated_at: "2026-10-07T15:01:00Z",
      html_url: "https://github.com/red-cup-engineering/x/pull/2", user: { id: 31, login: "author" },
    };
    throw new Error("unexpected path " + path);
  };
  const rows = await collectGitHubRepositoryDeltas({
    getJson, repository: { id: 561, full_name: "red-cup-engineering/x", html_url: "https://github.com/red-cup-engineering/x" }, perPage: 100
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source.objectType, "issue");
  assert.equal(rows[1].source.objectType, "pull_request");
  assert.equal(rows[1].source.revision, "head-2");
  for (const [index, row] of rows.entries()) {
    assert.equal(row.source.actor, null);
    assert.equal(row.source.actorId, null);
    assert.equal(row.source.author, "author");
    assert.equal(row.source.authorId, 31);
    assert.equal(row.source.repositoryId, 561);
    assert.equal(row.source.objectId, index === 0 ? "I_1" : "PR_2");
    assert.deepEqual(row.material.user, { id: 31, login: "author" });
    assert.equal(row.material.html_url, row.source.url);
  }
  assert.ok(calls.includes("repos/red-cup-engineering/x/pulls/2"));
});

test("poller rejects incomplete repository identity", async () => {
  await assert.rejects(() => collectGitHubRepositoryDeltas({ getJson: async () => [], repository: { id: 561 } }), /repository\.id and repository\.full_name are required/u);
});


test("opt-in current branch and annotated-tag refs are typed, source-bound and replay-safe", async () => {
  const repo = {id: 561, full_name: "red-cup-engineering/x", html_url: "https://github.com/red-cup-engineering/x"};
  const a = "a".repeat(40), b = "b".repeat(40);
  const branch = {ref: "refs/heads/feat/small", node_id: "REF_b", object: {type: "commit", sha: a},
    url: "https://api.github.com/repos/red-cup-engineering/x/git/refs/heads/feat/small"};
  const tag = {ref: "refs/tags/archive/old", object: {type: "tag", sha: b},
    url: "https://api.github.com/repos/red-cup-engineering/x/git/refs/tags/archive/old"};
  const requested = [];
  const getJson = async path => {
    requested.push(path);
    if (path.startsWith("repos/red-cup-engineering/x/issues?")) return [];
    if (path.startsWith("repos/red-cup-engineering/x/git/matching-refs/heads?")) return [branch];
    if (path.startsWith("repos/red-cup-engineering/x/git/matching-refs/tags?")) return [tag];
    throw new Error("unexpected API path " + path);
  };
  const rows = await collectGitHubRepositoryDeltas({getJson, repository: repo, includeRefs: true});
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(x => x.source.objectId)), new Set([branch.ref, tag.ref]));
  for (const row of rows) {
    assert.equal(row.source.objectType, "git_ref");
    assert.equal(row.source.actor, null);
    assert.equal(row.source.author, null);
    assert.equal(row.source.occurredAt, null, "a source snapshot has no invented event time");
    assert.equal(row.source.repositoryId, 561);
    assert.equal(row.source.revision, row.material.object.sha);
    assert.equal(row.material.url.startsWith("https://api.github.com/repos/"), true);
    assert.equal(row.source.url, row.material.url, "native source must identify this ref, not the repository homepage");
  }
  assert.equal(rows.find(x => x.source.objectId === tag.ref).material.object.type, "tag");
  assert.equal(requested.length, 3);
  const store = new MemoryReceiptStore(); let admitted = 0;
  const admit = async () => ({receiptId: String(++admitted)});
  const selected = rows.find(x => x.source.objectId === branch.ref);
  assert.equal((await settleGitHubEnvelope({envelope:selected,receiptStore:store,admit})).state, "RECEIVED");
  assert.equal((await settleGitHubEnvelope({envelope:selected,receiptStore:store,admit})).state, "DUPLICATE_RECEIVED");
  const moved = normalizeGitHubEvent({repository:repo, action:"observed",git_ref:{...branch,object:{...branch.object,sha:b}}});
  assert.equal(moved.providerObjectKey,selected.providerObjectKey);
  assert.notEqual(moved.eventKey,selected.eventKey);
  assert.equal((await settleGitHubEnvelope({envelope:moved,receiptStore:store,admit})).state,"RECEIVED");
  assert.equal(admitted,2);
});

test("ref polling refuses repeated and malformed identities before any receiving", async () => {
  const repo = {id: 561, full_name:"red-cup-engineering/x"};
  const row = {ref:"refs/heads/a",object:{type:"commit",sha:"a".repeat(40)}};
  const getJson = async path => {
    if (path.includes("/issues?")) return [];
    if (path.includes("/matching-refs/heads?")) return [row,row];
    return [];
  };
  await assert.rejects(collectGitHubRepositoryDeltas({getJson,repository:repo,includeRefs:true}),/repeated/u);
  for (const ref of ["refs/pull/123/head","refs/heads/../other","refs/heads/x.lock","refs/heads/name with space"]) {
    assert.throws(()=>normalizeGitHubEvent({repository:repo,git_ref:{ref,object:{type:"commit",sha:"a".repeat(40)}}}),/refname/u);
  }
  assert.throws(()=>normalizeGitHubEvent({repository:repo,git_ref:{...row,object:{type:"commit",sha:"bad"}}}),/exact typed SHA/u);
  assert.throws(()=>normalizeGitHubEvent({repository:repo,git_ref:{...row,object:{type:"mystery",sha:"a".repeat(40)}}}),/exact typed SHA/u);
});

test("ordinary issue polling does not expand into expensive ref enumeration", async () => {
  const getJson = async path => {
    if (path.startsWith("repos/red-cup-engineering/x/issues?")) return [];
    throw new Error("ref scanning unexpectedly selected: " + path);
  };
  assert.deepEqual(await collectGitHubRepositoryDeltas({
    getJson, repository:{id:561,full_name:"red-cup-engineering/x"}
  }),[]);
});
