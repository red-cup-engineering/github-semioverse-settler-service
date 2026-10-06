#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

// Read-only live discovery. No maintained repository inventory, private copy of
// the work board, background worker, or persisted polling cursor.
const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const checkPulls = args.includes('--pull-checks');
const explicitOwners = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--owner' && /^[A-Za-z0-9-]+$/.test(args[i + 1] ?? '')) explicitOwners.push(args[++i]);
  else if (!['--summary', '--pull-checks'].includes(args[i])) throw new TypeError(`Unknown argument: ${args[i]}`);
}
const PAGE_SIZE = 30;
function api(path) {
  return JSON.parse(execFileSync('gh', ['api', path], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
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
function search(query) {
  const result = [];
  const seen = new Set();
  let expected;
  for (let page = 1; page <= Math.ceil(1000 / PAGE_SIZE); page++) {
    const batch = api(`search/issues?q=${encodeURIComponent(query)}&sort=created&order=asc&per_page=${PAGE_SIZE}&page=${page}`);
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
function openWork(repository) {
  const issues = pages(`repos/${repository}/issues?state=open&sort=created&direction=asc`);
  return issues;
}
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
try {
  const user = api('user');
  const owners = [...new Set(explicitOwners.length ? explicitOwners : [user.login, ...pages('user/orgs').map(org => org.login)])];
  const repositories = pages('user/repos?sort=full_name&affiliation=owner,organization_member,collaborator');
  const ids = new Set(repositories.map(repo => repo.id));
  if (ids.size !== repositories.length) throw new Error('Repository listing changed during pagination; rerun');
  const selected = repositories.filter(repo => owners.includes(repo.owner.login));
  const stats = [];
  // A complete marker is emitted only AFTER every selected owner's pages arrive.
  // Earlier rows may be useful, but a failed process is never full coverage.
  for (const owner of owners) {
    let items = search(`is:open user:${owner}`);
    if (items === null) items = selected.filter(repo => repo.owner.login === owner).flatMap(repo => openWork(repo.full_name));
    const issues = items.filter(item => !item.pull_request);
    const pulls = items.filter(item => item.pull_request);
    const coverage = { owner, repositories: selected.filter(repo => repo.owner.login === owner).length, issues: issues.length, pulls: pulls.length };
    stats.push(coverage);
    emit({ kind: 'github.owner-coverage', ...coverage });
    for (const item of items) {
      const repository = item.repository_url.split('/repos/')[1];
      let checks;
      if (checkPulls && item.pull_request) {
        const pull = api(`repos/${repository}/pulls/${item.number}`);
        const head = pull.head.sha;
        const status = api(`repos/${repository}/commits/${head}/status`);
        const runs = pages(`repos/${repository}/commits/${head}/check-runs`, 'check_runs');
        checks = { head, draft: pull.draft, merged: pull.merged, mergeable: pull.mergeable,
          status: status.state, statuses: status.statuses.map(s => ({ context: s.context, state: s.state, url: s.target_url })),
          runs: runs.map(run => ({ name: run.name, status: run.status, conclusion: run.conclusion, url: run.html_url })) };
      }
      if (!summaryOnly || checks) emit({ kind: item.pull_request ? 'github.pull' : 'github.issue', repository,
        number: item.number, id: item.node_id, url: item.html_url, title: item.title,
        author: item.user?.login, updatedAt: item.updated_at, ...(checks ? { checks } : {}) });
    }
  }
  emit({ kind: 'github.coverage-complete', observedAt: new Date().toISOString(), principal: user.login,
    accessibleRepositories: repositories.length, repositories: selected.length, owners: stats,
    unselectedOwners: [...new Set(repositories.filter(repo => !owners.includes(repo.owner.login)).map(repo => repo.owner.login))],
    pullChecks: checkPulls });
} catch (error) {
  emit({ kind: 'github.coverage-incomplete', reason: error.message });
  process.exitCode = 1;
}
