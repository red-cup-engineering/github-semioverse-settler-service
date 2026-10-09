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
if(path==='repos/emsenn/example/compare/${head}...'+ 'b'.repeat(40)+'?per_page=1')out({base_commit:{sha:mode==='branch-base'?'c'.repeat(40):'${head}'},status:'diverged',ahead_by:2,behind_by:3});
if(path.startsWith('search/issues?')){
 if(mode==='quota')refuse('gh: API rate limit exceeded (HTTP 403)');
 out({total_count:path.includes('is%3Aclosed')?0:1,incomplete_results:false,items:path.includes('is%3Aclosed')?[]:[item]});
}
if(path.startsWith('repos/emsenn/example/issues?'))out(path.includes('state=closed')?[]:[item]);
if(path==='repos/emsenn/example/pulls/1')out({head:{sha:'${head}'},draft:false,merged:false,mergeable:true});
if(path.includes('/commits/${head}/status?')){
 const page=Number(new URL('https://api.github.test/'+path).searchParams.get('page'));
 if(page===2 && (mode==='exhausted'||mode==='transient'&&attempt===1))refuse('gh: HTTP 500');
 if(page===2 && mode==='malformed')out({state:'success',total_count:31,statuses:null});
 const all=Array.from({length:31},(_,id)=>({id:id+1,context:'status-'+id,state:'success',target_url:null}));out({state:'success',total_count:31,statuses:all.slice((page-1)*30,page*30)});
}
if(path.includes('/commits/${head}/check-runs?')){
 if(mode==='permission')refuse('gh: Resource not accessible by integration (HTTP 403)');
 const page=Number(new URL('https://api.github.test/'+path).searchParams.get('page'));const all=Array.from({length:31},(_,id)=>({id:id+1,name:'check-'+id,status:'completed',conclusion:'success',html_url:null}));out({check_runs:all.slice((page-1)*30,page*30)});
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
for (const mode of ['branch-permission', 'branch-duplicate', 'branch-base']) test(`${mode} refuses branch coverage without a complete marker`, () => {
  const result = observe(mode, true);
  assert.equal(result.status, 1);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-incomplete');
  assert.equal(result.rows.some(row => row.kind === 'github.coverage-complete'), false);
});
