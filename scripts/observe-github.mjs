#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

// Read-only live discovery. No maintained repository inventory, private copy of
// the work board, background worker, or persisted polling cursor.
const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const checkPulls = args.includes('--pull-checks');
const checkBranches = args.includes('--branches');
const explicitOwners = [];
const explicitRepositories = [];
let closedSince;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--owner' && /^[A-Za-z0-9-]+$/.test(args[i + 1] ?? '')) explicitOwners.push(args[++i]);
  else if (args[i] === '--repository' && /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(args[i + 1] ?? '')) explicitRepositories.push(args[++i].toLowerCase());
  else if (args[i] === '--closed-since' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(args[i + 1] ?? '') && Number.isFinite(Date.parse(args[i + 1]))) closedSince = args[++i];
  else if (!['--summary', '--pull-checks', '--branches'].includes(args[i])) throw new TypeError(`Unknown argument: ${args[i]}`);
}
if (explicitOwners.length && explicitRepositories.length) throw new TypeError('--owner and --repository select different coverage scopes; use only one');
const PAGE_SIZE = 30;
function api(path) {
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(execFileSync('gh', ['api', path], {
        encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
    } catch (error) {
      const status = /\bHTTP (500|502|503|504)\b/u.exec(String(error.stderr ?? error.message))?.[1];
      // Retry only provider server failures, at the same page and exact head.
      // Quota, authority, malformed data and exhausted retries still fail visibly.
      if (!status || attempt >= 3) throw error;
      process.stderr.write(`GitHub HTTP ${status}; retry ${attempt + 1}/3: ${path}\n`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * attempt);
    }
  }
}
function pages(path, field) {
  const result = [];
  for (let page = 1; page <= 1000; page++) {
    const response = api(`${path}${path.includes('?') ? '&' : '?'}per_page=${PAGE_SIZE}&page=${page}`);
    const batch = field ? response[field] : response;
    if (!Array.isArray(batch)) throw new TypeError(`Expected an array: ${path}`);
    result.push(...batch);
    if (batch.length < PAGE_SIZE) return result;
  }
  throw new Error(`Pagination bound reached; coverage is incomplete: ${path}`);
}
let searchQuotaUnavailable = false;
function search(query) {
  if (searchQuotaUnavailable) return null;
  const result = [];
  const seen = new Set();
  let expected;
  for (let page = 1; page <= Math.ceil(1000 / PAGE_SIZE); page++) {
    let batch;
    try {
      batch = api(`search/issues?q=${encodeURIComponent(query)}&sort=created&order=asc&per_page=${PAGE_SIZE}&page=${page}`);
    } catch (error) {
      // Search has a separate, much smaller quota than repository APIs. Continue
      // from the discovered repositories, without retries or a partial marker.
      const diagnostic = String(error.stderr ?? error.message);
      if (!diagnostic.includes('API rate limit exceeded')) throw error;
      searchQuotaUnavailable = true;
      return null;
    }
    if (batch.incomplete_results || !Array.isArray(batch.items)) throw new Error(`Incomplete GitHub search: ${query}`);
    if (batch.total_count > 1000) return null; // Partition by actual repositories below.
    if (expected === undefined) expected = batch.total_count;
    else if (expected !== batch.total_count) throw new Error(`GitHub work changed during pagination; rerun: ${query}`);
    for (const item of batch.items) {
      if (seen.has(item.id)) throw new Error(`Repeated GitHub identity during pagination; rerun: ${item.html_url}`);
      seen.add(item.id); result.push(item);
    }
    if (result.length === expected) return result;
    if (batch.items.length < PAGE_SIZE) throw new Error(`Premature end of GitHub search: ${query}`);
  }
  throw new Error(`Search bound reached; coverage is incomplete: ${query}`);
}
function repositoryWork(repository, state, since) {
  const rows = pages(`repos/${repository}/issues?state=${state}&sort=created&direction=asc${since ? `&since=${encodeURIComponent(since)}` : ''}`);
  const seen = new Set();
  for (const item of rows) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(item.id) ||
        item.repository_url?.toLowerCase() !== `https://api.github.com/repos/${repository}`.toLowerCase())
      throw new Error(`Repeated or wrong-repository work identity: ${repository}`);
    seen.add(item.id);
  }
  return rows;
}
function pullTarget(pull, repository, repositoryId) {
  if (typeof pull.base?.ref !== 'string' || !pull.base.ref ||
      !/^[a-f0-9]{40}$/.test(pull.base.sha ?? '') || pull.base.repo?.full_name?.toLowerCase() !== repository.toLowerCase() ||
      (repositoryId !== undefined && (!Number.isSafeInteger(repositoryId) || pull.base.repo.id !== repositoryId)))
    throw new Error(`Invalid pull target: ${repository}`);
  return { repository, name: pull.base.ref };
}
function targetBranch(target) {
  const branch = api(`repos/${target.repository}/branches/${encodeURIComponent(target.name)}`);
  if (branch.name !== target.name || !/^[a-f0-9]{40}$/.test(branch.commit?.sha ?? ''))
    throw new Error(`Invalid target branch observation: ${target.repository}:${target.name}`);
  return { ...target, head: branch.commit.sha };
}
function combinedStatus(repository, head) {
  const statuses = [];
  const seen = new Set();
  let expected;
  let state;
  for (let page = 1; page <= 1000; page++) {
    const result = api(`repos/${repository}/commits/${head}/status?per_page=${PAGE_SIZE}&page=${page}`);
    if (!Number.isInteger(result.total_count) || !Array.isArray(result.statuses)) throw new Error(`Incomplete combined status: ${repository}@${head}`);
    if (expected !== undefined && result.total_count !== expected) throw new Error(`Commit status contexts changed during pagination: ${repository}@${head}`);
    expected = result.total_count;
    state = result.state;
    for (const status of result.statuses) {
      if (!Number.isInteger(status.id) || seen.has(status.id)) throw new Error(`Repeated or missing commit status identity: ${repository}@${head}`);
      seen.add(status.id); statuses.push(status);
    }
    if (statuses.length === expected) return { state, statuses };
    if (result.statuses.length < PAGE_SIZE) throw new Error(`Premature end of commit status contexts: ${repository}@${head}`);
  }
  throw new Error(`Commit status bound reached; coverage is incomplete: ${repository}@${head}`);
}
function checkRuns(repository, head) {
  const runs = [];
  const seen = new Set();
  let expected;
  for (let page = 1; page <= 1000; page++) {
    const result = api(`repos/${repository}/commits/${head}/check-runs?per_page=${PAGE_SIZE}&page=${page}`);
    if (!Number.isSafeInteger(result.total_count) || result.total_count < 0 || !Array.isArray(result.check_runs))
      throw new Error(`Incomplete check runs: ${repository}@${head}`);
    if (expected !== undefined && result.total_count !== expected)
      throw new Error(`Check runs changed during pagination: ${repository}@${head}`);
    expected = result.total_count;
    for (const run of result.check_runs) {
      if (!Number.isSafeInteger(run.id) || run.id <= 0 || seen.has(run.id) || run.head_sha !== head)
        throw new Error(`Repeated, missing or wrong-head check identity: ${repository}@${head}`);
      seen.add(run.id); runs.push(run);
    }
    if (runs.length === expected) return runs;
    if (runs.length > expected || result.check_runs.length < PAGE_SIZE)
      throw new Error(`Premature or excessive check runs: ${repository}@${head}`);
  }
  throw new Error(`Check-run bound reached; coverage is incomplete: ${repository}@${head}`);
}
function pullReviews(repository, number, head) {
  const reviews = pages(`repos/${repository}/pulls/${number}/reviews`);
  const seen = new Set();
  return reviews.map(review => {
    if (!Number.isSafeInteger(review.id) || review.id <= 0 || seen.has(review.id) ||
        !['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING'].includes(review.state) ||
        (review.commit_id !== null && !/^[a-f0-9]{40}$/.test(review.commit_id ?? '')))
      throw new Error(`Invalid or repeated review identity: ${repository}#${number}`);
    seen.add(review.id);
    // These are provider facts, not a reduction to approval or merge authority.
    // Keep stale, dismissed and pending reviews instead of selecting a verdict.
    return { id: review.id, author: review.user?.login ?? null, authorId: review.user?.id ?? null,
      state: review.state, commit: review.commit_id, matchesHead: review.commit_id === head,
      submittedAt: review.submitted_at ?? null, url: review.html_url ?? null };
  });
}
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
function observeBranches(repo) {
  const branches = pages(`repos/${repo.full_name}/branches`);
  const names = new Set();
  for (const branch of branches) {
    if (typeof branch.name !== 'string' || !branch.name || names.has(branch.name) ||
        !/^[a-f0-9]{40}$/.test(branch.commit?.sha ?? '')) throw new Error(`Invalid or repeated branch: ${repo.full_name}`);
    names.add(branch.name);
  }
  const base = branches.find(branch => branch.name === repo.default_branch);
  if (!base && branches.length) throw new Error(`Default branch missing from observation: ${repo.full_name}`);
  const observations = branches.map(branch => {
    let comparison = { status: 'identical', ahead: 0, behind: 0 };
    if (branch.commit.sha !== base.commit.sha) {
      // Compare immutable commits, never moving branch names. One commit in the
      // response is sufficient for provider counts; no patch/file copy is kept.
      let value;
      try {
        value = api(`repos/${repo.full_name}/compare/${base.commit.sha}...${branch.commit.sha}?per_page=1`);
      } catch (error) {
        // Independent publication/orphan histories are real branches. Only this
        // exact provider refusal for the two observed heads establishes absence
        // of ancestry; permission, missing objects and other 404s still fail.
        const diagnostic = String(error.stderr ?? '');
        if (!diagnostic.includes(`No common ancestor between ${base.commit.sha} and ${branch.commit.sha}. (HTTP 404)`)) throw error;
        return { name: branch.name, head: branch.commit.sha, protected: branch.protected === true,
          status: 'unrelated', ahead: null, behind: null };
      }
      if (!['ahead', 'behind', 'diverged', 'identical'].includes(value.status) ||
          !Number.isSafeInteger(value.ahead_by) || value.ahead_by < 0 ||
          !Number.isSafeInteger(value.behind_by) || value.behind_by < 0 ||
          value.base_commit?.sha !== base.commit.sha)
        throw new Error(`Incomplete branch comparison: ${repo.full_name}@${branch.commit.sha}`);
      comparison = { status: value.status, ahead: value.ahead_by, behind: value.behind_by };
    }
    return { name: branch.name, head: branch.commit.sha, protected: branch.protected === true, ...comparison };
  });
  emit({ kind: 'github.repository-branches', repository: repo.full_name,
    archived: repo.archived === true, defaultBranch: repo.default_branch ?? null,
    defaultHead: base?.commit.sha ?? null, branches: observations });
  return observations.length;
}
try {
  const user = api('user');
  const repositoryScope = [...new Set(explicitRepositories)];
  const repositories = repositoryScope.length ? repositoryScope.map(name => {
    const repository = api(`repos/${name}`);
    if (!Number.isSafeInteger(repository.id) || repository.id <= 0 || repository.full_name?.toLowerCase() !== name ||
        repository.owner?.login?.toLowerCase() !== name.split('/')[0])
      throw new Error(`Requested repository identity changed or is invalid: ${name}`);
    return repository;
  }) : pages('user/repos?sort=full_name&affiliation=owner,organization_member,collaborator');
  const owners = [...new Set(repositoryScope.length ? repositories.map(repo => repo.owner.login)
    : explicitOwners.length ? explicitOwners : [user.login, ...pages('user/orgs').map(org => org.login)])];
  const ids = new Set(repositories.map(repo => repo.id));
  if (ids.size !== repositories.length) throw new Error('Repository listing changed during pagination; rerun');
  const selected = repositories.filter(repo => owners.includes(repo.owner.login));
  const repositoryIds = new Map(selected.map(repo => [repo.full_name.toLowerCase(), repo.id]));
  const observedIdentities = new Set();
  const stats = [];
  let branchCount = 0;
  if (checkBranches) for (const repo of selected) branchCount += observeBranches(repo);
  // A complete marker is emitted only AFTER every selected owner's pages arrive.
  // Earlier rows may be useful, but a failed process is never full coverage.
  for (const owner of owners) {
    let items = repositoryScope.length ? null : search(`is:open user:${owner}`);
    if (items === null) items = selected.filter(repo => repo.owner.login === owner).flatMap(repo => repositoryWork(repo.full_name, 'open'));
    const issues = items.filter(item => !item.pull_request);
    const pulls = items.filter(item => item.pull_request);
    let closed = closedSince ? (repositoryScope.length ? null : search(`is:closed user:${owner} updated:>=${closedSince}`)) : [];
    if (closed === null) closed = selected.filter(repo => repo.owner.login === owner).flatMap(repo => repositoryWork(repo.full_name, 'closed', closedSince));
    for (const item of [...items, ...closed]) {
      if (!Number.isSafeInteger(item.id) || item.id <= 0 || observedIdentities.has(item.id))
        throw new Error(`Repeated work identity or changed state during observation; rerun: ${item.html_url}`);
      observedIdentities.add(item.id);
    }
    const coverage = { owner, repositories: selected.filter(repo => repo.owner.login === owner).length, issues: issues.length, pulls: pulls.length, changedClosed: closed.length,
      ...(repositoryScope.length ? { scope: 'selected-repositories' } : {}) };
    stats.push(coverage);
    emit({ kind: 'github.owner-coverage', ...coverage });
    for (const item of [...items, ...closed]) {
      const repository = item.repository_url.split('/repos/')[1];
      let checks;
      if (checkPulls && item.pull_request) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const pull = api(`repos/${repository}/pulls/${item.number}`);
            const head = pull.head.sha;
            if (!/^[a-f0-9]{40}$/.test(head ?? '')) throw new Error(`Invalid pull head: ${repository}#${item.number}`);
            // Owner search can include public repositories absent from user/repos.
            // Only repository-scoped reads promise the separately selected numeric identity.
            const repositoryId = repositoryScope.length ? repositoryIds.get(repository.toLowerCase()) : undefined;
            if (repositoryScope.length && repositoryId === undefined)
              throw new Error(`Pull repository is outside the selected scope: ${repository}`);
            const target = pullTarget(pull, repository, repositoryId);
            const beforeTarget = targetBranch(target);
            const status = combinedStatus(repository, head);
            const runs = checkRuns(repository, head);
            const reviews = pullReviews(repository, item.number, head);
            const current = api(`repos/${repository}/pulls/${item.number}`);
            if (current.head?.sha !== head) throw new Error(`Pull head changed during observation: ${repository}#${item.number}`);
            if (JSON.stringify(pullTarget(current, repository, repositoryId)) !== JSON.stringify(target))
              throw new Error(`Pull target changed during observation: ${repository}#${item.number}`);
            const currentTarget = targetBranch(target);
            if (currentTarget.head !== beforeTarget.head)
              throw new Error(`Target branch changed during observation: ${repository}#${item.number}`);
            if (![true, false, null].includes(current.mergeable) || typeof current.mergeable_state !== 'string' || !current.mergeable_state ||
                !Object.hasOwn(current, 'auto_merge') || !(current.auto_merge === null || typeof current.auto_merge === 'object' && !Array.isArray(current.auto_merge)))
              throw new Error(`Incomplete pull mergeability facts: ${repository}#${item.number}`);
            checks = { head, draft: current.draft, merged: current.merged, mergeable: current.mergeable,
              mergeableState: current.mergeable_state, autoMerge: current.auto_merge,
              baseSnapshot: { repository, ref: current.base.ref, head: current.base.sha }, targetBranch: currentTarget,
              status: status.state, statuses: status.statuses.map(s => ({ context: s.context, state: s.state, url: s.target_url })),
              checkRunFilter: 'latest', checkSuiteLimit: 1000,
              runs: runs.map(run => ({ id: run.id, head: run.head_sha, name: run.name, status: run.status, conclusion: run.conclusion, url: run.html_url })),
              reviews };
            break;
          } catch (error) {
            // A merge of other work can move this same target without changing
            // the PR. Discard the whole check reading, retain the obstruction,
            // then read it again. Never reuse checks from the interrupted pass.
            // PR head/target identity, quota and invalid evidence still fail.
            if (error.message !== `Target branch changed during observation: ${repository}#${item.number}` || attempt === 3) throw error;
            emit({ kind: 'github.pull-observation-retry', repository, number: item.number, attempt,
              reason: error.message, nextAttempt: attempt + 1 });
          }
        }
      }
      if (!summaryOnly || checks) emit({ kind: item.pull_request ? 'github.pull' : 'github.issue', repository,
        number: item.number, id: item.node_id, url: item.html_url, title: item.title, state: item.state, closedAt: item.closed_at ?? null,
        author: item.user?.login, updatedAt: item.updated_at, ...(checks ? { checks } : {}) });
    }
  }
  emit({ kind: 'github.coverage-complete', observedAt: new Date().toISOString(), principal: user.login,
    ...(repositoryScope.length ? { scope: 'selected-repositories', selectedRepositories: selected.map(repo => ({ id: repo.id, repository: repo.full_name })) }
      : { accessibleRepositories: repositories.length }),
    repositories: selected.length, owners: stats,
    ...(repositoryScope.length ? {} : { unselectedOwners: [...new Set(repositories.filter(repo => !owners.includes(repo.owner.login)).map(repo => repo.owner.login))] }),
    pullChecks: checkPulls, pullReviews: checkPulls, branchHeads: checkBranches,
    ...(checkBranches ? { branches: branchCount } : {}), closedSince: closedSince ?? null });
} catch (error) {
  emit({ kind: 'github.coverage-incomplete', reason: error.message });
  process.exitCode = 1;
}

