#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { FileReceiptStore } from "../src/file-receipt-store.mjs";
import { selectGitHubSemioverseTransport } from "../src/transport-selection.mjs";
import { collectGitHubRepositories } from "../src/github-poll.mjs";
import { reconcileGitHubDeltas } from "../src/reconcile.mjs";
import { settleGitHubEnvelope } from "../src/settler.mjs";

const api = path => JSON.parse(execFileSync("gh", ["api", path], {
  encoding: "utf8",
  timeout: 30_000,
  maxBuffer: 4 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
}));

const owners = (process.env.GITHUB_SETTLER_OWNERS ?? "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
if (owners.length === 0) throw new Error("GITHUB_SETTLER_OWNERS is required");

const repositories = [];
for (let page = 1; page <= 100; page += 1) {
  const batch = api("user/repos?sort=full_name&affiliation=owner,organization_member,collaborator&per_page=100&page=" + page);
  if (!Array.isArray(batch)) throw new Error("GitHub repository inventory was not an array");
  repositories.push(...batch.filter(repo => owners.includes(repo.owner?.login)));
  if (batch.length < 100) break;
  if (page === 100) throw new Error("GitHub repository inventory pagination bound reached");
}

const deltas = await collectGitHubRepositories({
  getJson: api,
  repositories,
  state: process.env.GITHUB_SETTLER_STATE ?? "open",
  since: process.env.GITHUB_SETTLER_SINCE,
});

const store = new FileReceiptStore(
  process.env.GITHUB_SEMIOVERSE_RECEIPT_FILE ?? ".state/github-semioverse-receipts.json",
);
const admit = await selectGitHubSemioverseTransport();

const result = await reconcileGitHubDeltas({
  list: async () => deltas,
  settle: envelope => settleGitHubEnvelope({ envelope, receiptStore: store, admit }),
  scope: owners.join(","),
});
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
