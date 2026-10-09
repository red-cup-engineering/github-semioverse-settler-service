import assert from "node:assert/strict";
import test from "node:test";
import { collectGitHubRepositoryDeltas } from "../src/github-poll.mjs";

test("poller paginates and preserves exact PR head revision", async () => {
  const calls = [];
  const getJson = async path => {
    calls.push(path);
    if (path === "repos/red-cup-engineering/x/issues?state=open&per_page=100&page=1") return [
      { number: 1, id: 10, node_id: "I_1", updated_at: "2026-10-07T15:00:00Z", html_url: "https://github.com/red-cup-engineering/x/issues/1", user: { login: "agent" } },
      { number: 2, id: 20, node_id: "PR_2", pull_request: {}, updated_at: "2026-10-07T15:01:00Z", html_url: "https://github.com/red-cup-engineering/x/pull/2", user: { login: "agent" } },
    ];
    if (path === "repos/red-cup-engineering/x/pulls/2") return {
      node_id: "PR_2", number: 2, head: { sha: "head-2" }, updated_at: "2026-10-07T15:01:00Z",
      html_url: "https://github.com/red-cup-engineering/x/pull/2", user: { login: "agent" },
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
  assert.ok(calls.includes("repos/red-cup-engineering/x/pulls/2"));
});

test("poller rejects incomplete repository identity", async () => {
  await assert.rejects(() => collectGitHubRepositoryDeltas({ getJson: async () => [], repository: { id: 561 } }), /repository\.id and repository\.full_name are required/u);
});
