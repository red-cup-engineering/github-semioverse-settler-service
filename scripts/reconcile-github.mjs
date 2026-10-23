#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, openSync, closeSync, fstatSync, constants } from "node:fs";
import { FileReceiptStore } from "../src/file-receipt-store.mjs";
import { selectGitHubSemioverseTransport } from "../src/transport-selection.mjs";
import { collectGitHubRepositories, projectArchiveRefSelectionsFromCensus } from "../src/github-poll.mjs";
import { reconcileGitHubDeltas } from "../src/reconcile.mjs";
import { settleGitHubEnvelope } from "../src/settler.mjs";

const api = path => JSON.parse(execFileSync("gh", ["api", path], {
  encoding: "utf8",
  timeout: 30_000,
  maxBuffer: 4 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
}));

/** The executable reads the SAME typed upstream census which the original
 * GitHub Engineering provider already produces; it does not reconstruct a
 * second status register or trust archive naming as independent acceptance.
 * Ref selection is an explicit operator input; evidence remains source only. */
function originalArchiveSourceSelections(environment) {
 const manuallyPinned=environment.GITHUB_SETTLER_ARCHIVE_REF_SELECTIONS;
 const sourcePath=environment.GITHUB_SETTLER_ARCHIVE_CENSUS_FILE;
 const selectedRefs=environment.GITHUB_SETTLER_ARCHIVE_SELECTED_REFS;
 if((manuallyPinned!==undefined && (sourcePath!==undefined || selectedRefs!==undefined))
   ||(sourcePath===undefined)!==(selectedRefs===undefined))
   throw new TypeError('Select either explicitly pinned archive source objects OR one original GHS census and exact selected refs');
 if(sourcePath===undefined)return manuallyPinned===undefined?[]:JSON.parse(manuallyPinned);
 if(!sourcePath)throw new TypeError('Explicit original GitHub Engineering census path required');
 const fd=openSync(sourcePath,constants.O_RDONLY | constants.O_NOFOLLOW);
 let parsed;
 try {
   const before=fstatSync(fd);
   if(!before.isFile()||before.size<1||before.size>1024*1024)
     throw new RangeError('Original GHS census file must be bounded regular source');
   const bytes=readFileSync(fd);
   const after=fstatSync(fd);
   if(after.size!==before.size||bytes.length!==before.size
     ||after.mtimeMs!==before.mtimeMs)
     throw new Error('Original GHS census carrier changed during reading');
   parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 } finally { closeSync(fd); }
 const census=parsed?.recordKind==='github.archive-ref-census/v1'
   ?parsed
   :Array.isArray(parsed?.sourceRefAssays)&&parsed.sourceRefAssays.length===1
     ?parsed.sourceRefAssays[0]:null;
 return projectArchiveRefSelectionsFromCensus(census,JSON.parse(selectedRefs));
}

const archiveRefSelections=originalArchiveSourceSelections(process.env);

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
  includeRefs: process.env.GITHUB_SETTLER_INCLUDE_REFS === "1",
  // Explicit source selection; omitting it preserves the original issue/PR
  // and optional head/tag poll. No ambient refs/archive sweep is implied.
  archiveRefSelections,
});

const store = new FileReceiptStore(
  process.env.GITHUB_SEMIOVERSE_RECEIPT_FILE ?? ".state/github-semioverse-receipts.json",
);
const admit = await selectGitHubSemioverseTransport();

const result = await reconcileGitHubDeltas({
  list: async () => deltas.map(envelope => ({
    ...envelope,
    revision: envelope.source.revision,
    eventKey: envelope.eventKey,
  })),
  settle: envelope => settleGitHubEnvelope({ envelope, receiptStore: store, admit }),
  scope: owners.join(","),
});
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
