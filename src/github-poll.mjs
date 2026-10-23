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
    const seen = new Set();
    for (const family of ["heads", "tags"]) {
      const refs = await pages({
        getJson,
        path: "repos/" + repository.full_name + "/git/matching-refs/" + family,
        perPage, maxPages,
      });
      for (const ref of refs) {
        if (typeof ref?.ref !== "string" || !ref.ref.startsWith("refs/" + family + "/") ||
            seen.has(ref.ref))
          throw new Error("GitHub Git reference identity is missing, outside selected family or repeated");
        seen.add(ref.ref);
        deltas.push(normalizeGitHubEvent({ action: "observed", repository, git_ref: ref }));
      }
    }
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
