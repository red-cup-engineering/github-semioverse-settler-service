import { normalizeGitHubEvent } from "./settler.mjs";

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

/** One exact opted-in Git source cut, not an archive-to-Work claim.
 * GitHub's matching-refs/archive ignores ordinary page= and per_page=
 * parameters (504 refs were returned for both page 1 and 2). Therefore we
 * read its complete <=512-object population twice at the same original URL.
 * Only explicitly selected refs may become provider delta candidates. */
async function selectedArchiveRefDeltas({getJson,repository,refNames}) {
 if(!Array.isArray(refNames)||refNames.length>8||new Set(refNames).size!==refNames.length
   ||refNames.some(ref=>typeof ref!=='string'
     ||!(ref==='refs/archive'||ref.startsWith('refs/archive/'))))
   throw new TypeError('At most eight distinct exact custom Git archive references required');
 const path='repos/'+repository.full_name+'/git/matching-refs/archive';
 const cut=async()=>{
  const observed=await getJson(path);
  if(!Array.isArray(observed)||observed.length>512)
   throw new RangeError('Complete source Git archive namespace unavailable or over bound');
  const source=new Map();
  for(const row of observed){
   if(typeof row?.ref!=='string'||!row.ref.startsWith('refs/archive'))
     throw new TypeError('GitHub archive provider returned an unqualified Git ref');
   // GitHub matching-refs performs a string-prefix match: archived-* belongs
   // outside the exact refs/archive namespace and is not a lost source.
   if(row.ref!=='refs/archive'&&!row.ref.startsWith('refs/archive/'))continue;
   if(source.has(row.ref))throw new Error('Repeated original archive reference identity');
   const envelope=normalizeGitHubEvent({
     action:'observed',repository,git_ref:row,
   });
   source.set(row.ref,{row,envelope});
  }
  return source;
 };
 const first=await cut(),second=await cut();
 const identity=refs=>JSON.stringify([...refs.entries()].map(([name,{envelope}])=>[
   name,envelope.source.revision,envelope.materialIdentity,
  ]).sort((a,b)=>a[0].localeCompare(b[0])));
 if(identity(first)!==identity(second))
  throw new Error('Custom Git archive ref source changed during complete observation');
 for(const refName of refNames)
  if(!first.has(refName))
   throw new Error('Selected native custom Git ref absent from complete source population');
 return refNames.map(name=>first.get(name).envelope);
}

export async function collectGitHubRepositoryDeltas({ getJson, repository, state = "open", since, perPage = 30, maxPages = 100, includeRefs = false, archiveRefNames = [] } = {}) {
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
  if (archiveRefNames !== undefined && (!Array.isArray(archiveRefNames)
    || archiveRefNames.length>8)) throw new TypeError("bounded selected archive refs must be an array");
  if (archiveRefNames.length)
    deltas.push(...await selectedArchiveRefDeltas({getJson,repository,refNames:archiveRefNames}));
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
  // Exact selections belong to repositories already actually enumerated by
  // authenticated GitHub. A name guessed from an archive ref grants no scope.
  if(!Array.isArray(archiveRefSelections)||archiveRefSelections.length>8)
    throw new TypeError('At most eight original custom archive source selections required');
  const available=new Map(repositories.map(repo=>[repo.full_name.toLowerCase(),repo]));
  const byRepository=new Map(),seen=new Set();
  for(const source of archiveRefSelections){
    if(!source||typeof source!=='object'||Array.isArray(source)
      ||Object.keys(source).sort().join(',')!=='refName,repository'
      ||typeof source.repository!=='string'||!available.has(source.repository.toLowerCase())
      ||typeof source.refName!=='string'
      ||!(source.refName==='refs/archive'||source.refName.startsWith('refs/archive/'))
      ||seen.has(source.repository.toLowerCase()+'@'+source.refName))
      throw new TypeError('Exact previously enumerated Git repository/ref source selection required');
    const name=source.repository.toLowerCase();seen.add(name+'@'+source.refName);
    byRepository.set(name,[...(byRepository.get(name)??[]),source.refName]);
  }
  const result = [];
  for (const repository of repositories) {
    result.push(...await collectGitHubRepositoryDeltas({ getJson, repository, state, since, perPage, maxPages, includeRefs,
      archiveRefNames:byRepository.get(repository.full_name.toLowerCase())??[],
    }));
  }
  return result;
}
