import { admitGitHubRefName, normalizeGitHubEvent } from "./settler.mjs";

// Git refs and Git tags are distinct original GitHub namespaces. Both can
// conceal unreceived agent work; neither grants an archive/retirement receipt.
const ARCHIVE_SOURCE_PREFIXES = Object.freeze(["refs/tags/archive", "refs/archive"]);
const withinArchiveSource = (ref, prefix) =>
  typeof ref === "string" && (ref === prefix || ref.startsWith(prefix + "/"));
const isArchiveSource = ref =>
  ARCHIVE_SOURCE_PREFIXES.some(prefix => withinArchiveSource(ref, prefix));

const required = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(name + " is required");
  return value.trim();
};

async function pages({ getJson, path, perPage = 30, maxPages = 100 }) {
  if (typeof getJson !== "function") throw new TypeError("getJson function is required");
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new RangeError("perPage must be between 1 and 100");
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) throw new RangeError("maxPages must be between 1 and 1000");
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await getJson(path + (path.includes("?") ? "&" : "?") + "per_page=" + perPage + "&page=" + page);
    if (!Array.isArray(batch)) throw new TypeError("GitHub page must be an array: " + path);
    rows.push(...batch);
    if (batch.length < perPage) return rows;
  }
  throw new Error("GitHub pagination bound reached: " + path);
}

// Repository-level endpoints cover historical edits without one request per
// issue or pull request. Comments remain source testimony, never Work moves.
function discussionRow(row, repository, kind, seen) {
  if(!row||typeof row!=="object"||Array.isArray(row)||
    !Number.isSafeInteger(row.id)||row.id<1||
    typeof row.node_id!=="string"||!row.node_id.trim()||
    typeof row.body!=="string"||
    typeof row.created_at!=="string"||typeof row.updated_at!=="string"||
    !Number.isFinite(Date.parse(row.created_at))||
    !Number.isFinite(Date.parse(row.updated_at))||
    Date.parse(row.updated_at)<Date.parse(row.created_at))
    throw new TypeError("GitHub discussion needs exact provider identity, material and chronology");
  const api="https://api.github.com/repos/"+repository.full_name+"/";
  const kindPath=kind==="issue"?"issues/comments/":"pulls/comments/";
  if(row.url!==api+kindPath+row.id)
    throw new TypeError("GitHub discussion API identity outside selected repository");
  const parentPrefix=api+(kind==="issue"?"issues/":"pulls/");
  const parentLocator=kind==="issue"?row.issue_url:row.pull_request_url;
  if(typeof parentLocator!=="string"||!parentLocator.startsWith(parentPrefix))
    throw new TypeError("GitHub discussion parent outside selected repository");
  const number=parentLocator.slice(parentPrefix.length);
  if(!/^[1-9][0-9]*$/u.test(number)||!Number.isSafeInteger(Number(number))||
     (kind==="issue"&&row.pull_request_url!==undefined)||
     (kind==="review"&&(!Number.isSafeInteger(row.pull_request_review_id)||row.pull_request_review_id<1)))
    throw new TypeError("GitHub discussion parent kind and provider identity disagree");
  const publicPrefix="https://github.com/"+repository.full_name+"/";
  if(typeof row.html_url!=="string"||!row.html_url.startsWith(publicPrefix))
    throw new TypeError("GitHub discussion source locator outside selected repository");
  const key=kind+":"+row.id;
  if(seen.has(key))throw new TypeError("GitHub discussion page duplicates a source identity");
  seen.add(key);
  return normalizeGitHubEvent({ action:"observed",repository,comment:row });
}

/** Opt-in complete bounded discussion source. Two repository-level lists,
 * not O(number of issues) comment queries. If one list cannot be received,
 * the entire source lot refuses rather than showing partial collaboration. */
async function discussionDeltas({getJson,repository,since,perPage,maxDiscussionPages}) {
  if(!Number.isInteger(maxDiscussionPages)||maxDiscussionPages<1||maxDiscussionPages>20)
    throw new RangeError("GitHub discussion pages must be bounded to 1–20");
  const root="repos/"+repository.full_name+"/";
  const sinceQuery=since===undefined?"":"&since="+encodeURIComponent(required(since,"since"));
  const seen=new Set(),result=[];
  for(const [kind,endpoint] of [["issue","issues/comments"],["review","pulls/comments"]]) {
    const rows=await pages({getJson,path:root+endpoint+"?sort=updated&direction=asc"+sinceQuery,
      perPage,maxPages:maxDiscussionPages});
    for(const row of rows)result.push(discussionRow(row,repository,kind,seen));
  }
  return result;
}

/** Project an original GitHub Engineering archive-ref census into exact
 * provider source inputs. The caller explicitly selects 1–8 named refs; a
 * ref census is historical source evidence, NEVER receiving or authority.
 * The ordinary native Work normalizer still verifies exact provider material.
 */
export function projectArchiveRefSelectionsFromCensus(refCensus, refNames) {
 if(!refCensus||typeof refCensus!=='object'||Array.isArray(refCensus)
   ||Object.keys(refCensus).sort().join(',')!==
     'count,defaultBranch,defaultHeadSha,effectsPerformed,prefix,recordKind,refs,repositoryFullName,repositoryId,sourceCoverage'
   ||refCensus.recordKind!=='github.archive-ref-census/v1'
   ||!ARCHIVE_SOURCE_PREFIXES.includes(refCensus.prefix)
   ||refCensus.sourceCoverage!=='complete-exact-archive-ref-list-at-two-reads'
   ||refCensus.effectsPerformed!==false
   ||!Number.isSafeInteger(refCensus.repositoryId)||refCensus.repositoryId<1
   ||typeof refCensus.repositoryFullName!=='string'
   ||!/^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9._-]*$/iu.test(refCensus.repositoryFullName)
   ||typeof refCensus.defaultBranch!=='string'||!refCensus.defaultBranch
   ||typeof refCensus.defaultHeadSha!=='string'
   ||!/^[a-f0-9]{40}$/u.test(refCensus.defaultHeadSha)
   ||!Array.isArray(refCensus.refs)||refCensus.refs.length>512
   ||refCensus.refs.length!==refCensus.count)
   throw new TypeError('Complete original GHS archive tag or custom-ref source census required');
 if(!Array.isArray(refNames)||refNames.length<1||refNames.length>8
   ||new Set(refNames).size!==refNames.length)
   throw new TypeError('Explicit one-to-eight distinct original Git ref names required');
 const observations=new Map();
 for(const row of refCensus.refs){
   if(!row||typeof row!=='object'||Array.isArray(row)
     ||Object.keys(row).sort().join(',')!==
       'automaticRefRetirementAllowed,objectSha,objectType,recordKind,refName,sourceConsumerReceiving'
     ||row.recordKind!=='github.archive-ref-observation/v1'
     ||typeof row.refName!=='string'
     ||!withinArchiveSource(row.refName, refCensus.prefix)
     ||!['commit','tag','tree','blob'].includes(row.objectType)
     ||typeof row.objectSha!=='string'||!/^[a-f0-9]{40}$/u.test(row.objectSha)
     ||row.sourceConsumerReceiving!=='not-observed'
     ||row.automaticRefRetirementAllowed!==false
     ||observations.has(row.refName))
     throw new TypeError('GHS archive census contains altered or unqualified original Git source');
   admitGitHubRefName(row.refName);
   observations.set(row.refName,row);
 }
 return Object.freeze(refNames.map(refName=>{
   const source=observations.get(refName);
   if(!source)throw new TypeError('Explicitly selected original Git ref absent from qualified census');
   return Object.freeze({
     repositoryFullName:refCensus.repositoryFullName,
     repositoryId:refCensus.repositoryId,
     refName:source.refName,
     objectType:source.objectType,
     objectSha:source.objectSha,
   });
 }));
}

/** One selected historical Git ref is a SOURCE, never a received Work.
 * Its upstream identity is the original GHS census's stable repository ID,
 * original repository name, full ref, exact typed Git target. Do not enumerate
 * all other refs in a large archive namespace to read this one input: GitHub
 * has a standard exact-ref resource at /git/ref/tags/archive/... for archive
 * tags or /git/ref/archive/... for custom refs.
 *
 * The two exact source cuts and repository-ID rechecks are deliberately
 * read-only. They establish a bounded current observation, not an exhaustive
 * ref namespace census, ref-retirement grant or independent Work acceptance. */
async function selectedArchiveRefDeltas({getJson,repository,sources}) {
 if(!Array.isArray(sources)||sources.length<1||sources.length>8)
   throw new TypeError('Select from one to eight exact original archive source records');
 const selected=new Set();
 for(const source of sources) {
   if(!source||typeof source!=='object'||Array.isArray(source)
     ||Object.keys(source).sort().join(',')!=='objectSha,objectType,refName,repositoryFullName,repositoryId'
     ||source.repositoryId!==repository.id
     ||typeof source.repositoryFullName!=='string'
     ||source.repositoryFullName.toLowerCase()!==repository.full_name.toLowerCase()
     ||!Number.isSafeInteger(source.repositoryId)||source.repositoryId<1
     ||!['commit','tag','tree','blob'].includes(source.objectType)
     ||typeof source.objectSha!=='string'
     ||!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source.objectSha))
     throw new TypeError('Exact original repository ID and typed Git object source required');
   admitGitHubRefName(source.refName);
   if(!isArchiveSource(source.refName) || selected.has(source.refName))
     throw new TypeError('Unique original Git archive source identity required');
   selected.add(source.refName);
 }
 const path='repos/'+repository.full_name;
 const currentRepository=async()=>{
   const observed=await getJson(path);
   if(!observed||observed.id!==repository.id
     ||typeof observed.full_name!=='string'
     ||observed.full_name.toLowerCase()!==repository.full_name.toLowerCase()
     ||typeof observed.default_branch!=='string'||!observed.default_branch
     ||(repository.default_branch!==undefined
       &&observed.default_branch!==repository.default_branch))
     throw new Error('GitHub repository identity changed during selected archive source read');
   return observed;
 };
 const before=await currentRepository();
 const refPath=ref=>'repos/'+repository.full_name+'/git/ref/'
   +ref.slice('refs/'.length).split('/').map(encodeURIComponent).join('/');
 const cut=async()=>{
   const observations=[];
   for(const source of sources) {
     const row=await getJson(refPath(source.refName));
     if(row?.ref!==source.refName
       ||row.object?.sha!==source.objectSha
       ||row.object?.type!==source.objectType)
       throw new Error('Selected exact native Git reference changed from its admitted source object');
     const envelope=normalizeGitHubEvent({action:'observed',repository,git_ref:row});
     if(envelope.source.objectId!==source.refName
       ||envelope.source.revision!==source.objectSha)
       throw new Error('Provider ref identity differs from exact source selection');
     observations.push(envelope);
   }
   return observations;
 };
 const first=await cut(),second=await cut(),after=await currentRepository();
 if(after.default_branch!==before.default_branch
   ||before.private!==after.private
   ||first.length!==second.length
   ||first.some((item,i)=>item.eventKey!==second[i].eventKey
     ||item.providerObjectKey!==second[i].providerObjectKey))
   throw new Error('Selected original Git source or repository state changed during observation');
 return first;
}

/** Complete current Git ref-family observation, independent from issue/PR
 * pagination. GitHub matching-refs is a prefix lookup, not a paged listing:
 * page=1 and page=2 can return the same entire set. A double read binds the
 * same source cut before downstream Work projection. A bounded unavailable
 * namespace remains unavailable; it must not be reported as an empty one. */
async function completeGitRefFamily({getJson,repository,family,maxRefs=512}) {
 if(!['heads','tags'].includes(family)||!Number.isSafeInteger(maxRefs)
   ||maxRefs<1||maxRefs>512)
   throw new TypeError('One exact bounded original Git reference family required');
 const path='repos/'+repository.full_name+'/git/matching-refs/'+family;
 const prefix='refs/'+family+'/';
 const read=async()=>{
   const rows=await getJson(path);
   if(!Array.isArray(rows)||rows.length>maxRefs)
     throw new RangeError('Complete Git reference family unavailable or over bounded source budget');
   const result=new Map();
   for(const row of rows){
     if(typeof row?.ref!=='string'||!row.ref.startsWith('refs/'+family))
       throw new TypeError('Git ref family source returned a foreign source identity');
     // REST matching-refs is a string-prefix query; a returned neighbor such
     // as refs/tagstones/* is NOT part of refs/tags/*.
     if(!row.ref.startsWith(prefix))continue;
     if(result.has(row.ref))
       throw new Error('repeated original Git ref in complete namespace source');
     admitGitHubRefName(row.ref);
     result.set(row.ref,normalizeGitHubEvent({action:'observed',repository,git_ref:row}));
   }
   return result;
 };
 const first=await read(),second=await read();
 const equal=items=>JSON.stringify([...items.entries()].map(([name,envelope])=>
   [name,envelope.eventKey,envelope.materialIdentity]).sort((a,b)=>a[0].localeCompare(b[0])));
 if(equal(first)!==equal(second))
   throw new Error('Complete Git reference family changed during provider source reading');
 return [...first.values()].sort((a,b)=>a.source.objectId.localeCompare(b.source.objectId));
}

export async function collectGitHubRepositoryDeltas({ getJson, repository, since, state = since === undefined ? "open" : "all", perPage = 30, maxPages = 100, includeRefs = false, archiveRefSources = [], sourceOnly = false, includeDiscussion = false, maxDiscussionPages = 10 } = {}) {
  if (!repository || !Number.isInteger(repository.id) || typeof repository.full_name !== "string") {
    throw new TypeError("repository.id and repository.full_name are required");
  }
  // A selected original Git source is not a request to retrieve every issue
  // or PR in its repository; unrelated work is a distinct production lot.
  if(typeof sourceOnly!=='boolean'||sourceOnly && (
    !Array.isArray(archiveRefSources)||archiveRefSources.length<1
    ||includeRefs!==false||includeDiscussion!==false||since!==undefined||state!=='open'))
    throw new TypeError('Source-only Git receiving requires selected exact refs without general polling');
  // Incremental original Work must retain closing, merging and reopening
  // observations. GitHub defaults to open-only; never accidentally project
  // that partial view as a complete changed-Work interval.
  if (!["open", "closed", "all"].includes(state))
    throw new TypeError("GitHub Work source state must be open, closed or all");
  const sinceQuery = since === undefined ? "" : "&since=" + encodeURIComponent(required(since, "since"));
  const issues = sourceOnly ? [] : await pages({
    getJson,
    path: "repos/" + repository.full_name + "/issues?state=" + encodeURIComponent(state) + sinceQuery,
    perPage,
    maxPages,
  });
  if(typeof includeDiscussion!=="boolean")
    throw new TypeError("GitHub discussion collection must be explicitly selected");
  const deltas = [], seenIssueNumbers = new Set();
  for (const item of issues) {
    // GitHub pages can drift under concurrent activity. Repeated source
    // identities are evidence of an unstable lot, not two Work arrivals.
    if (!Number.isSafeInteger(item?.number) || item.number < 1 ||
        seenIssueNumbers.has(item.number))
      throw new TypeError("GitHub issue source number absent or repeated across pages");
    seenIssueNumbers.add(item.number);
    if (item.pull_request) {
      const pull = await getJson("repos/" + repository.full_name + "/pulls/" + encodeURIComponent(String(item.number)));
      deltas.push(normalizeGitHubEvent({ action: "observed", repository, pull_request: pull }));
    } else {
      deltas.push(normalizeGitHubEvent({ action: "observed", repository, issue: item }));
    }
  }
  if(includeDiscussion)
    deltas.push(...await discussionDeltas({getJson,repository,since,perPage,maxDiscussionPages}));
  // These are *observed current references*, not inferred branch-create/
  // branch-delete events. Retain Git's actual ref target: annotated tags may
  // point at a tag object rather than a peeled commit. A missing ref in a later
  // scan cannot independently certify deletion or authorize an effect.
  if (typeof includeRefs !== "boolean") throw new TypeError("includeRefs must be a boolean");
  if (!Array.isArray(archiveRefSources)||archiveRefSources.length>8)
    throw new TypeError('Bounded selected archive sources must be an array');
  if (archiveRefSources.length)
    deltas.push(...await selectedArchiveRefDeltas({getJson,repository,sources:archiveRefSources}));
  if (includeRefs) {
    // Unlike GitHub issues, native git/matching-refs ignores ordinary
    // per_page/page. Keep whole-namespace observation separate from exact
    // selected archive tag/custom-ref source and its quoted object-ID contract.
    for (const family of ["heads", "tags"])
      deltas.push(...await completeGitRefFamily({getJson,repository,family}));
  }
  return deltas.sort((left, right) => String(left.source.occurredAt ?? "").localeCompare(String(right.source.occurredAt ?? "")) || left.eventKey.localeCompare(right.eventKey));
}

export async function collectGitHubRepositories({ getJson, repositories, since, state = since === undefined ? "open" : "all", perPage = 30, maxPages = 100, includeRefs = false, archiveRefSelections = [], sourceOnly = false, includeDiscussion = false, maxDiscussionPages = 10 } = {}) {
  if (!Array.isArray(repositories) || repositories.length === 0) throw new TypeError("repositories are required");
  // Select only upstream source-qualified objects already bound to the
  // authenticated repository inventory. An owner/name label alone cannot
  // select changed historical code; the exact Git target must also match.
  if(!Array.isArray(archiveRefSelections)||archiveRefSelections.length>8)
    throw new TypeError('At most eight original archive source selections required');
  if(typeof sourceOnly!=='boolean'||sourceOnly && (
    archiveRefSelections.length<1||includeRefs!==false||includeDiscussion!==false
    ||since!==undefined||state!=='open'))
    throw new TypeError('Source-only Git receiving requires selected original refs without general polling');
  const available=new Map();
  for(const repo of repositories){
    if(typeof repo?.full_name!=='string'||!Number.isSafeInteger(repo.id)||repo.id<1
      ||available.has(repo.full_name.toLowerCase()))
      throw new TypeError('Original repository inventory is ambiguous or unqualified');
    available.set(repo.full_name.toLowerCase(),repo);
  }
  const byRepository=new Map(),seen=new Set();
  for(const source of archiveRefSelections){
    const name=typeof source?.repositoryFullName==='string'
      ?source.repositoryFullName.toLowerCase():null;
    const parent=name===null?null:available.get(name);
    if(!parent||source.repositoryId!==parent.id
      ||!source||typeof source!=='object'||Array.isArray(source)
      ||Object.keys(source).sort().join(',')!=='objectSha,objectType,refName,repositoryFullName,repositoryId'
      ||typeof source.refName!=='string'
      ||seen.has(name+'@'+source.refName))
      throw new TypeError('Exact previously enumerated Git repository/object source selection required');
    // Check structural admission before any provider call, not after a
    // resource has been fetched under a possibly misleading source name.
    if(!['commit','tag','tree','blob'].includes(source.objectType)
      ||typeof source.objectSha!=='string'
      ||!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source.objectSha))
      throw new TypeError('Selected archive source must declare its typed original Git object');
    admitGitHubRefName(source.refName);
    if(!isArchiveSource(source.refName))
      throw new TypeError('Selected source belongs to neither the original archive tag nor custom Git archive namespace');
    seen.add(name+'@'+source.refName);
    byRepository.set(name,[...(byRepository.get(name)??[]),source]);
  }
  const result = [];
  for (const repository of repositories) {
    const selected=byRepository.get(repository.full_name.toLowerCase())??[];
    if(sourceOnly && selected.length===0)continue;
    result.push(...await collectGitHubRepositoryDeltas({ getJson, repository, state, since, perPage, maxPages, includeRefs,
      archiveRefSources:selected,sourceOnly,includeDiscussion,maxDiscussionPages,
    }));
  }
  return result;
}
