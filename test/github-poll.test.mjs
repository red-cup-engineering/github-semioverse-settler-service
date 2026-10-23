import assert from "node:assert/strict";
import test from "node:test";
import { collectGitHubRepositoryDeltas, collectGitHubRepositories } from "../src/github-poll.mjs";
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


const archiveSource=(repo,ref,sha,type='commit')=>({
 repositoryFullName:repo.full_name,repositoryId:repo.id,
 refName:ref,objectSha:sha,objectType:type,
});

test("one source-qualified custom Git ref produces one native Work event without traversing 504 other refs",async()=>{
 const repo={id:561,full_name:"red-cup-engineering/x",default_branch:"main",private:false};
 const sha="a".repeat(40),ref="refs/archive/2026-10-08/stash-218";
 const selected=archiveSource(repo,ref,sha);
 const selectedPath="repos/red-cup-engineering/x/git/ref/archive/2026-10-08/stash-218";
 const repositoryPath="repos/red-cup-engineering/x",paths=[];
 const response={ref,object:{type:"commit",sha},
   url:"https://api.github.com/repos/red-cup-engineering/x/git/refs/archive/2026-10-08/stash-218"};
 const getJson=async path=>{
  paths.push(path);
  if(path.startsWith(repositoryPath+"/issues?"))return [];
  if(path===repositoryPath)return {id:561,full_name:repo.full_name,default_branch:"main",private:false};
  if(path===selectedPath)return response;
  throw new Error("unselected repository or full archive read "+path);
 };
 const rows=await collectGitHubRepositoryDeltas({
  getJson,repository:repo,archiveRefSources:[selected],
 });
 assert.equal(rows.length,1);
 assert.equal(rows[0].source.objectType,"git_ref");
 assert.equal(rows[0].source.objectId,ref);
 assert.equal(rows[0].source.repositoryId,561);
 assert.equal(rows[0].source.revision,sha);
 assert.equal(rows[0].source.occurredAt,null);
 assert.equal(rows[0].source.actor,null);
 assert.equal(rows[0].source.url,
  "https://api.github.com/repos/red-cup-engineering/x/git/refs/archive/2026-10-08/stash-218");
 assert.equal(paths.filter(path=>path===selectedPath).length,2);
 assert.equal(paths.filter(path=>path===repositoryPath).length,2);
 assert.equal(paths.length,5,"one issue reading plus four exact GitHub source/identity reads");
 assert.equal(paths.some(path=>path.includes("matching-refs/archive")),false,
  "the native selected ref producer must not materialize a broad Git namespace");
 const store=new MemoryReceiptStore();let received=0;
 const admit=async()=>({receiptId:String(++received)});
 assert.equal((await settleGitHubEnvelope({envelope:rows[0],receiptStore:store,admit})).state,"RECEIVED");
 assert.equal((await settleGitHubEnvelope({envelope:rows[0],receiptStore:store,admit})).state,"DUPLICATE_RECEIVED");
 assert.equal(received,1,"the original native Work transport only receives identical material once");
});

test("a different valid source lot retains typed annotations and exact distinct pinned Git targets",async()=>{
 const repo={id:561,full_name:"red-cup-engineering/x",default_branch:"main"};
 const refA="refs/archive/2026-10-08/source-one",refB="refs/archive/2026-10-08/source-two";
 const a="a".repeat(40),b="b".repeat(40);
 const sources=[archiveSource(repo,refA,a),archiveSource(repo,refB,b,"tag")];
 const source=path=>path==="repos/red-cup-engineering/x/git/ref/archive/2026-10-08/source-one"
  ?{ref:refA,object:{sha:a,type:"commit"}}
  :{ref:refB,object:{sha:b,type:"tag"}};
 const calls=[];
 const getJson=async path=>{
  calls.push(path);
  if(path.includes("/issues?"))return [];
  if(path==="repos/red-cup-engineering/x")
   return {id:repo.id,full_name:repo.full_name,default_branch:"main"};
  if(path.startsWith("repos/red-cup-engineering/x/git/ref/archive/"))return source(path);
  throw new Error("unselected source "+path);
 };
 const rows=await collectGitHubRepositoryDeltas({getJson,repository:repo,archiveRefSources:sources});
 assert.equal(rows.length,2);
 assert.deepEqual(new Set(rows.map(row=>row.source.objectId)),new Set([refA,refB]));
 assert.equal(rows.find(row=>row.source.objectId===refB).material.object.type,"tag");
 assert.equal(calls.filter(path=>path.includes("/git/ref/archive/")).length,4);
 assert.equal(calls.length,7);
 assert.equal(calls.some(path=>path.includes("matching-refs")),false);
});

test("selected archive producer refuses stale provider IDs, retargeting, or fabricated source material",async()=>{
 const repo={id:561,full_name:"red-cup-engineering/x",default_branch:"main"};
 const ref="refs/archive/unfinished-code",sha="a".repeat(40);
 const source=archiveSource(repo,ref,sha),path="repos/red-cup-engineering/x/git/ref/archive/unfinished-code";
 const baseline={id:repo.id,full_name:repo.full_name,default_branch:"main"};
 const good={ref,object:{type:"commit",sha}},attempt=async(port,selection=[source])=>
  collectGitHubRepositoryDeltas({
   getJson:async target=>{
    if(target.includes("/issues?"))return [];
    if(target==="repos/red-cup-engineering/x")return port.repo();
    if(target===path)return port.ref();
    throw Error("unselected provider "+target);
   },repository:repo,archiveRefSources:selection,
  });
 const stable=()=>baseline;
 let reads=0;
 await assert.rejects(attempt({repo:stable,ref:()=>reads++===0?good:{...good,object:{...good.object,sha:"b".repeat(40)}}}),
  /changed from its admitted source object/u);
 await assert.rejects(attempt({repo:stable,ref:()=>({...good,ref:"refs/archive/different"})}),
  /changed from its admitted source object/u);
 await assert.rejects(attempt({repo:()=>({...baseline,id:562}),ref:()=>good}),
  /repository identity changed/u);
 let checks=0;
 await assert.rejects(attempt({repo:()=>checks++===0?baseline:{...baseline,default_branch:"other"},ref:()=>good}),
  /repository (?:identity|state) changed/u);
 await assert.rejects(attempt({repo:stable,ref:()=>({...good,object:{...good.object,type:"blob"}})}),
  /changed from its admitted source object/u);
 await assert.rejects(attempt({repo:stable,ref:()=>undefined}),
  /changed from its admitted source object/u);
 await assert.rejects(attempt({repo:stable,ref:()=>good},[
  {...source,objectSha:"not-an-oid"},
 ]),/typed Git object source/u);
 await assert.rejects(attempt({repo:stable,ref:()=>good},[
  {...source,refName:"refs/archive/../malformed"},
 ]),/refname/u);
 await assert.rejects(attempt({repo:stable,ref:()=>good},[source,source]),
  /Unique original refs\/archive source identity/u);
});

test("exact numeric repository identity and pinned object are required before any cross-owner read",async()=>{
 const repo={id:561,full_name:"red-cup-engineering/x",default_branch:"main"};
 const other={id:562,full_name:"red-cup-engineering/y",default_branch:"main"};
 const ref="refs/archive/2026-10-23/historical-code",sha="a".repeat(40);
 const selected=archiveSource(repo,ref,sha);
 const calls=[];
 const getJson=async path=>{
  calls.push(path);
  if(path.endsWith("/issues?state=open&per_page=30&page=1"))return [];
  if(path==="repos/red-cup-engineering/x")
   return {id:561,full_name:repo.full_name,default_branch:"main"};
  if(path==="repos/red-cup-engineering/x/git/ref/archive/2026-10-23/historical-code")
   return {ref,object:{sha,type:"commit"}};
  throw new Error("foreign or unselected source "+path);
 };
 const rows=await collectGitHubRepositories({
  getJson,repositories:[repo,other],archiveRefSelections:[selected],
 });
 assert.equal(rows.length,1);
 assert.equal(rows[0].source.repositoryId,561);
 assert.equal(calls.filter(path=>path.endsWith("/git/ref/archive/2026-10-23/historical-code")).length,2);
 assert.equal(calls.some(path=>path.includes("/y/git/")),false);
 const wrong=[
  [{...selected,repositoryId:562}],
  [{...selected,repositoryFullName:"alien/owner"}],
  [{...selected,refName:"refs/tags/archive/incorrect-family"}],
  [{...selected,objectSha:"b".repeat(39)}],
  [selected,selected],
  [{...selected,received:true}],
  [{repository:repo.full_name,refName:ref}],
 ];
 for(const sources of wrong){
  await assert.rejects(collectGitHubRepositories({
   getJson:async()=>{throw new Error("No provider reads permitted for unadmitted source");},
   repositories:[repo,other],archiveRefSelections:sources,
  }), /original|typed|refname|namespace|previously enumerated/u);
 }
 const defaults=await collectGitHubRepositories({
  getJson:async path=>{
   if(path.includes("/issues?"))return [];
   throw new Error("default operation unexpectedly selected an archive ref");
  },repositories:[repo,other],
 });
 assert.deepEqual(defaults,[]);
});
