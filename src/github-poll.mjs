import { admitGitHubRefName, normalizeGitHubEvent } from "./settler.mjs";

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

/** One selected historical Git ref is a SOURCE, never a received Work.
 * Its upstream identity is the original GHS census's stable repository ID,
 * original repository name, full ref, exact typed Git target. Do not enumerate
 * all other refs in a large archive namespace to read this one input: GitHub
 * has a standard exact-ref resource at /git/ref/archive/... .
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
   if(!(source.refName==='refs/archive'||source.refName.startsWith('refs/archive/'))
     ||selected.has(source.refName))
     throw new TypeError('Unique original refs/archive source identity required');
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
       throw new Error('Repeated original Git ref in complete namespace source');
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

export async function collectGitHubRepositoryDeltas({ getJson, repository, state = "open", since, perPage = 30, maxPages = 100, includeRefs = false, archiveRefSources = [] } = {}) {
  if (!repository || !Number.isInteger(repository.id) || typeof repository.full_name !== "string") {
    throw new TypeError("repository.id and repository.full_name are required");
  }
  const sinceQuery = since === undefined ? "" : "&since=" + encodeURIComponent(required(since, "since"));
  const issues = await pages({
    getJson,
    path: "repos/" + repository.full_name + "/issues?state=" + encodeURIComponent(state) + sinceQuery,
    perPage,
    maxPages,
  });
  const deltas = [];
  for (const item of issues) {
    if (item.pull_request) {
      const pull = await getJson("repos/" + repository.full_name + "/pulls/" + encodeURIComponent(String(item.number)));
      deltas.push(normalizeGitHubEvent({ action: "observed", repository, pull_request: pull }));
    } else {
      deltas.push(normalizeGitHubEvent({ action: "observed", repository, issue: item }));
    }
  }
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
    // refs/archive source selection and its quoted object-ID contract.
    for (const family of ["heads", "tags"])
      deltas.push(...await completeGitRefFamily({getJson,repository,family}));
  }
  return deltas.sort((left, right) => String(left.source.occurredAt ?? "").localeCompare(String(right.source.occurredAt ?? "")) || left.eventKey.localeCompare(right.eventKey));
}

export async function collectGitHubRepositories({ getJson, repositories, state = "open", since, perPage = 30, maxPages = 100, includeRefs = false, archiveRefSelections = [] } = {}) {
  if (!Array.isArray(repositories) || repositories.length === 0) throw new TypeError("repositories are required");
  // Select only upstream source-qualified objects already bound to the
  // authenticated repository inventory. An owner/name label alone cannot
  // select changed historical code; the exact Git target must also match.
  if(!Array.isArray(archiveRefSelections)||archiveRefSelections.length>8)
    throw new TypeError('At most eight original archive source selections required');
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
    if(!(source.refName==='refs/archive'||source.refName.startsWith('refs/archive/')))
      throw new TypeError('Selected source belongs to the custom Git archive namespace');
    seen.add(name+'@'+source.refName);
    byRepository.set(name,[...(byRepository.get(name)??[]),source]);
  }
  const result = [];
  for (const repository of repositories) {
    result.push(...await collectGitHubRepositoryDeltas({ getJson, repository, state, since, perPage, maxPages, includeRefs,
      archiveRefSources:byRepository.get(repository.full_name.toLowerCase())??[],
    }));
  }
  return result;
}
