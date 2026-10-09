import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const observer = new URL('../scripts/observe-github.mjs', import.meta.url).pathname;
const head = 'a'.repeat(40);
const provider = `#!/usr/bin/env node
const fs=require('node:fs');
const path=process.argv[3],file=process.env.OBSERVATION_STATE,mode=process.env.OBSERVATION_MODE;
const calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{},attempt=calls[path]=(calls[path]??0)+1;fs.writeFileSync(file,JSON.stringify(calls));
const out=value=>{process.stdout.write(JSON.stringify(value));process.exit(0)},refuse=status=>{process.stderr.write(status);process.exit(1)};
const item={id:1,node_id:'PR_example',repository_url:'https://api.github.com/repos/emsenn/example',number:1,html_url:'https://github.com/emsenn/example/pull/1',title:'Example',state:'open',user:{login:'emsenn'},updated_at:'2026-10-07T00:00:00Z',pull_request:{}};
if(path==='user')out({login:'emsenn'});
if(path.startsWith('user/repos?'))out([{id:1,owner:{login:'emsenn'},full_name:'emsenn/example',default_branch:'main'}]);
if(path.startsWith('repos/emsenn/example/branches?')){
 const page=Number(new URL('https://api.github.test/'+path).searchParams.get('page'));
 if(page===2&&mode==='branch-permission')refuse('gh: Resource not accessible by integration (HTTP 403)');
 const all=Array.from({length:31},(_,i)=>({name:i===0?'main':i===1?'feature/retained':'branch-'+i,commit:{sha:i===1?'b'.repeat(40):'${head}'},protected:i===0}));
 if(mode==='branch-duplicate')all[30]=all[0];
 out(all.slice((page-1)*30,page*30));
}
if(path==='repos/emsenn/example/compare/${head}...'+ 'b'.repeat(40)+'?per_page=1'){
 if(mode==='branch-unrelated')refuse('gh: No common ancestor between ${head} and '+ 'b'.repeat(40)+'. (HTTP 404)');
 if(mode==='branch-not-found')refuse('gh: Not Found (HTTP 404)');
 out({base_commit:{sha:mode==='branch-base'?'c'.repeat(40):'${head}'},status:'diverged',ahead_by:2,behind_by:3});
}
if(path.startsWith('search/issues?')){
 if(mode==='quota')refuse('gh: API rate limit exceeded (HTTP 403)');
 out({total_count:path.includes('is%3Aclosed')?0:1,incomplete_results:false,items:path.includes('is%3Aclosed')?[]:[item]});
}
if(path.startsWith('repos/emsenn/example/issues?'))out(path.includes('state=closed')?[]:[item]);
if(path==='repos/emsenn/example/pulls/1')out({head:{sha:mode==='head-moved'&&attempt>1?'b'.repeat(40):'${head}'},base:{ref:'main',sha:'${head}',repo:{id:1,full_name:'emsenn/example'}},draft:false,merged:false,mergeable:true,mergeable_state:'clean',auto_merge:null});
if(path==='repos/emsenn/example/branches/main')out({name:'main',commit:{sha:'${head}'}});
if(path.startsWith('repos/emsenn/example/pulls/1/reviews?')){
 const page=Number(new URL('https://api.github.test/'+path).searchParams.get('page'));
 if(mode==='review-permission')refuse('gh: Resource not accessible by integration (HTTP 403)');
 const states=['APPROVED','DISMISSED','CHANGES_REQUESTED','COMMENTED','PENDING'];
 const all=Array.from({length:31},(_,i)=>({id:100+i,user:{id:10+i,login:'reviewer-'+i},state:states[i%5],commit_id:i%2?'b'.repeat(40):'${head}',submitted_at:i%5===4?null:'2026-10-07T00:00:00Z',html_url:'https://github.com/emsenn/example/pull/1#pullrequestreview-'+(100+i)}));
 if(mode==='review-duplicate')all[30]=all[0];
 if(mode==='review-malformed')all[0].id=null;
 if(mode==='review-state')all[0].state='UNKNOWN';
 if(mode==='review-null'){all[0].user=null;all[0].commit_id=null;}
 if(mode==='empty')out([]);
 out(all.slice((page-1)*30,page*30));
}
if(path.includes('/commits/${head}/status?')){
 const page=Number(new URL('https://api.github.test/'+path).searchParams.get('page'));
 if(page===2 && (mode==='exhausted'||mode==='transient'&&attempt===1))refuse('gh: HTTP 500');
 if(page===2 && mode==='malformed')out({state:'success',total_count:31,statuses:null});
 const all=Array.from({length:31},(_,id)=>({id:id+1,context:'status-'+id,state:'success',target_url:null}));out({state:'success',total_count:31,statuses:all.slice((page-1)*30,page*30)});
}
if(path.includes('/commits/${head}/check-runs?')){
 if(mode==='permission')refuse('gh: Resource not accessible by integration (HTTP 403)');
 const page=Number(new URL('https://api.github.test/'+path).searchParams.get('page'));const all=Array.from({length:31},(_,id)=>({id:id+1,head_sha:'${head}',name:'check-'+id,status:'completed',conclusion:'success',html_url:null}));
 if(mode==='check-duplicate')all[30]=all[0];
 if(mode==='check-head')all[30].head_sha='b'.repeat(40);
 if(mode==='check-malformed')all[0].id=null;
 if(mode==='empty')out({total_count:0,check_runs:[]});
 if(mode==='check-excess')out({total_count:0,check_runs:all.slice(0,1)});
 out({total_count:mode==='check-count'&&page===2?32:mode==='check-premature'?32:31,check_runs:all.slice((page-1)*30,page*30)});
}
refuse('unexpected provider path '+path);
`;

function observe(mode, branches = false) {
  const folder = mkdtempSync(join(tmpdir(), 'github-provider-recovery-'));
  try {
    writeFileSync(join(folder, 'gh'), provider, { mode: 0o755 });
    const state = join(folder, 'calls.json');
    const result = spawnSync(process.execPath, [observer, '--owner', 'emsenn', '--pull-checks', ...(branches ? ['--branches'] : []), '--closed-since', '2026-10-06T00:00:00Z'], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: `${folder}:${process.env.PATH}`, OBSERVATION_STATE: state, OBSERVATION_MODE: mode },
    });
    assert.equal(result.error, undefined);
    return { ...result, rows: result.stdout.trim().split('\n').map(JSON.parse), calls: JSON.parse(readFileSync(state)) };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}
const pageTwo = `repos/emsenn/example/commits/${head}/status?per_page=30&page=2`;

test('a transient provider failure retains the same PR head and all status/check pages', () => {
  const result = observe('transient');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls[pageTwo], 2);
  const pull = result.rows.find(row => row.kind === 'github.pull');
  assert.equal(pull.checks.head, head);
  assert.equal(pull.checks.statuses.length, 31);
  assert.equal(pull.checks.runs.length, 31);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-complete');
});
test('review facts retain source identities, stale heads, dismissals and pending state without deriving approval', () => {
  const result = observe('reviews');
  assert.equal(result.status, 0, result.stderr);
  const checks = result.rows.find(row => row.kind === 'github.pull').checks;
  assert.equal(checks.reviews.length, 31);
  assert.deepEqual(checks.reviews[0], { id: 100, author: 'reviewer-0', authorId: 10,
    state: 'APPROVED', commit: head, matchesHead: true, submittedAt: '2026-10-07T00:00:00Z',
    url: 'https://github.com/emsenn/example/pull/1#pullrequestreview-100' });
  assert.equal(checks.reviews[1].state, 'DISMISSED');
  assert.equal(checks.reviews[1].matchesHead, false);
  assert.equal(checks.reviews[4].state, 'PENDING');
  assert.equal(checks.reviews[4].submittedAt, null);
  assert.equal(checks.checkRunFilter, 'latest');
  assert.equal(checks.checkSuiteLimit, 1000);
  assert.equal(Object.hasOwn(checks, 'approved'), false);
  assert.equal(result.calls['repos/emsenn/example/pulls/1/reviews?per_page=30&page=2'], 1);
  assert.equal(result.calls['repos/emsenn/example/pulls/1'], 2);
  assert.equal(result.rows.at(-1).pullReviews, true);
});
for (const mode of ['check-count', 'check-premature', 'check-duplicate', 'check-head', 'check-malformed', 'check-excess',
  'review-duplicate', 'review-malformed', 'review-state', 'review-permission', 'head-moved']) test(`${mode} cannot supply complete review/check evidence`, () => {
  const result = observe(mode);
  assert.equal(result.status, 1);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-incomplete');
  assert.equal(result.rows.some(row => row.kind === 'github.coverage-complete'), false);
  assert.equal(result.rows.some(row => row.kind === 'github.pull'), false);
});
test('empty provider evidence stays empty rather than becoming approval', () => {
  const result = observe('empty');
  assert.equal(result.status, 0, result.stderr);
  const checks = result.rows.find(row => row.kind === 'github.pull').checks;
  assert.deepEqual(checks.runs, []);
  assert.deepEqual(checks.reviews, []);
  assert.equal(Object.hasOwn(checks, 'approved'), false);
});
test('absent review author and commit stay unknown, never exact-head approval', () => {
  const result = observe('review-null');
  assert.equal(result.status, 0, result.stderr);
  const review = result.rows.find(row => row.kind === 'github.pull').checks.reviews[0];
  assert.equal(review.author, null);
  assert.equal(review.authorId, null);
  assert.equal(review.commit, null);
  assert.equal(review.matchesHead, false);
});
test('server failure exhaustion remains an incomplete observation after three attempts', () => {
  const result = observe('exhausted');
  assert.equal(result.status, 1);
  assert.equal(result.calls[pageTwo], 3);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-incomplete');
  assert.equal(result.rows.some(row => row.kind === 'github.coverage-complete'), false);
});
test('search quota switches to discovered repositories without retrying search', () => {
  const result = observe('quota');
  assert.equal(result.status, 0, result.stderr);
  const searches = Object.entries(result.calls).filter(([path]) => path.startsWith('search/issues?'));
  assert.equal(searches.length, 1);
  assert.equal(searches[0][1], 1);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-complete');
});
for (const mode of ['permission', 'malformed']) test(`${mode} failure is never retried or called complete`, () => {
  const result = observe(mode);
  assert.equal(result.status, 1);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-incomplete');
  assert.equal(result.rows.some(row => row.kind === 'github.coverage-complete'), false);
  assert.equal(Math.max(...Object.values(result.calls)), 1);
});

test('all branch pages retain exact heads and compare immutable commits rather than moving names', () => {
  const result = observe('branches', true);
  assert.equal(result.status, 0, result.stderr);
  const row = result.rows.find(value => value.kind === 'github.repository-branches');
  assert.equal(row.branches.length, 31);
  assert.equal(row.defaultHead, head);
  assert.deepEqual(row.branches[1], { name: 'feature/retained', head: 'b'.repeat(40), protected: false, status: 'diverged', ahead: 2, behind: 3 });
  assert.equal(result.calls['repos/emsenn/example/branches?per_page=30&page=2'], 1);
  assert.equal(result.calls[`repos/emsenn/example/compare/${head}...${'b'.repeat(40)}?per_page=1`], 1);
  assert.equal(result.rows.at(-1).branchHeads, true);
  assert.equal(result.rows.at(-1).branches, 31);
});
test('observed independent histories remain visible without fabricated ahead/behind counts', () => {
  const result = observe('branch-unrelated', true);
  assert.equal(result.status, 0, result.stderr);
  const row = result.rows.find(value => value.kind === 'github.repository-branches');
  assert.deepEqual(row.branches[1], { name: 'feature/retained', head: 'b'.repeat(40), protected: false, status: 'unrelated', ahead: null, behind: null });
  assert.equal(result.rows.at(-1).branchHeads, true);
});
for (const mode of ['branch-permission', 'branch-duplicate', 'branch-base', 'branch-not-found']) test(`${mode} refuses branch coverage without a complete marker`, () => {
  const result = observe(mode, true);
  assert.equal(result.status, 1);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-incomplete');
  assert.equal(result.rows.some(row => row.kind === 'github.coverage-complete'), false);
});

