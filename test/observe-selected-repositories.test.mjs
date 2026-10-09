import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const observer = process.env.OBSERVER_UNDER_TEST ?? new URL('../scripts/observe-github.mjs', import.meta.url).pathname;
// A protected control based on PR 34's provider facts: its PR base snapshot differs
// from independently observed main, and its draft/dirty state is an intentional hold.
const head = '0623207064e121ad326e3d1edc5ae0a3caa0d5c6';
const snapshot = '66b68044140bb680dd2fd7516435ed06a27753f1';
const target = '4ca381f5b7ded7d82f1e02e059838241d4a7453a';
const provider = `#!/usr/bin/env node
const fs=require('node:fs');
const path=process.argv[3],file=process.env.OBSERVATION_STATE,mode=process.env.OBSERVATION_MODE;
const calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[],attempt=calls.filter(value=>value===path).length+1;
calls.push(path);fs.writeFileSync(file,JSON.stringify(calls));
const out=value=>{process.stdout.write(JSON.stringify(value));process.exit(0)},refuse=text=>{process.stderr.write(text);process.exit(1)};
const repository='emsenn/cold-red-gate';
const repo={id:1408796038,owner:{login:'emsenn'},full_name:repository,default_branch:'main',private:true};
const pull={id:4783163084,node_id:'PR_control',repository_url:'https://api.github.com/repos/'+repository,number:34,html_url:'https://github.com/'+repository+'/pull/34',title:'Intentional source hold',state:'open',user:{login:'emsenn'},updated_at:'2026-10-09T15:29:53Z',pull_request:{}};
if(process.argv[2]!=='api')refuse('only provider reads are allowed');
if(path==='user')out({login:'emsenn'});
if(path==='repos/'+repository){if(mode==='renamed')repo.full_name='emsenn/elsewhere';if(mode==='repo-permission')refuse('gh: HTTP 403');out(repo);}
if(path==='repos/red-cup-engineering/example')out({id:2,owner:{login:'red-cup-engineering'},full_name:'red-cup-engineering/example',default_branch:'main'});
if(path.startsWith('repos/red-cup-engineering/example/issues?'))out(mode==='transferred'&&!path.includes('state=closed')?[{...pull,pull_request:undefined,repository_url:'https://api.github.com/repos/red-cup-engineering/example',html_url:'https://github.com/red-cup-engineering/example/issues/34'}]:[]);
if(path.startsWith('user/repos?'))out(mode==='unlisted-owner'?[]:[repo]);
if(path.startsWith('search/issues?'))out({total_count:path.includes('is%3Aclosed')?0:1,incomplete_results:false,items:path.includes('is%3Aclosed')?[]:[pull]});
if(path.startsWith('repos/'+repository+'/issues?')){
 if(path.includes('state=closed'))out([]);
 if(mode==='wrong-item')pull.repository_url='https://api.github.com/repos/emsenn/elsewhere';
 const page=Number(new URL('https://provider.invalid/'+path).searchParams.get('page'));
 if(mode==='pages'||mode==='duplicate-page'){
  if(page===1)out(Array.from({length:30},(_,i)=>({...pull,id:100+i,number:i+100,node_id:'I'+i,pull_request:undefined,html_url:'https://github.com/'+repository+'/issues/'+(i+100)})));
  out(mode==='duplicate-page'?[{...pull,id:100}]:[pull]);
 }
 out(mode==='transferred'?[{...pull,pull_request:undefined}]:[pull]);
}
if(path==='repos/'+repository+'/pulls/34'){
 const value={head:{sha:'${head}'},base:{ref:mode==='slash-target'?'release/current':mode==='retargeted'&&attempt>1?'other':'main',sha:'${snapshot}',repo:{id:mode==='wrong-target-id'||mode==='replaced-target-id'&&attempt>1?2:1408796038,full_name:repository}},draft:true,merged:false,mergeable:mode==='unknown'?null:false,mergeable_state:mode==='unknown'?'unknown':'dirty',auto_merge:null};
 if(mode==='missing-facts')delete value.auto_merge;
 if(mode==='auto-merge')value.auto_merge={merge_method:'squash',enabled_by:{id:111507,login:'emsenn'}};
 out(value);
}
if(path==='repos/'+repository+'/branches/main'||path==='repos/'+repository+'/branches/release%2Fcurrent'){
 if(mode==='target-permission')refuse('gh: HTTP 403');
 out({name:mode==='slash-target'?'release/current':'main',commit:{sha:mode==='target-moved'&&attempt>1?'b'.repeat(40):mode==='bad-target'?'not-a-commit':'${target}'}});
}
if(path.includes('/commits/${head}/status?'))out({state:'pending',total_count:0,statuses:[]});
if(path.includes('/commits/${head}/check-runs?'))out({total_count:1,check_runs:[{id:113282900315,head_sha:'${head}',name:'release',status:'completed',conclusion:'failure',html_url:'https://github.com/'+repository+'/actions/runs/37768794530'}]});
if(path.startsWith('repos/'+repository+'/pulls/34/reviews?'))out([]);
refuse('unexpected or broadened provider path '+path);
`;

function observe(mode = 'held', args = ['--repository', 'emsenn/cold-red-gate']) {
  const folder = mkdtempSync(join(tmpdir(), 'github-selected-observation-'));
  try {
    writeFileSync(join(folder, 'gh'), provider, { mode: 0o755 });
    const state = join(folder, 'calls.json');
    const result = spawnSync(process.execPath, [observer, ...args, '--pull-checks', '--closed-since', '2026-10-09T00:00:00Z'], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: `${folder}:${process.env.PATH}`, OBSERVATION_STATE: state, OBSERVATION_MODE: mode },
    });
    assert.equal(result.error, undefined);
    return { ...result, rows: result.stdout.trim() ? result.stdout.trim().split('\n').map(JSON.parse) : [], calls: existsSync(state) ? JSON.parse(readFileSync(state)) : [] };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

test('explicit repository scope never enumerates other repositories or owner searches', () => {
  const result = observe('held', ['--repository', 'EMSENN/cold-red-gate', '--repository', 'emsenn/cold-red-gate', '--repository', 'red-cup-engineering/example']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter(path => path === 'repos/emsenn/cold-red-gate').length, 1);
  assert.equal(result.calls.some(path => path.startsWith('user/') || path.startsWith('search/')), false);
  const complete = result.rows.at(-1);
  assert.equal(complete.kind, 'github.coverage-complete');
  assert.equal(complete.scope, 'selected-repositories');
  assert.equal(Object.hasOwn(complete, 'accessibleRepositories'), false);
  assert.equal(Object.hasOwn(complete, 'unselectedOwners'), false);
  assert.deepEqual(complete.selectedRepositories, [{ id: 1408796038, repository: 'emsenn/cold-red-gate' }, { id: 2, repository: 'red-cup-engineering/example' }]);
  assert.equal(complete.pullReviews, true);
  assert.ok(complete.owners.every(owner => owner.scope === 'selected-repositories'));
});
test('owner scope keeps stale PR base distinct from independently observed target branch', () => {
  const result = observe('held', ['--owner', 'emsenn']);
  assert.equal(result.status, 0, result.stderr);
  const checks = result.rows.find(row => row.kind === 'github.pull').checks;
  assert.deepEqual(checks.baseSnapshot, { repository: 'emsenn/cold-red-gate', ref: 'main', head: snapshot });
  assert.deepEqual(checks.targetBranch, { repository: 'emsenn/cold-red-gate', name: 'main', head: target });
  assert.equal(checks.head, head);
  assert.equal(checks.mergeableState, 'dirty');
  assert.equal(checks.autoMerge, null);
  assert.equal(checks.draft, true);
  assert.equal(checks.mergeable, false);
  assert.equal(checks.runs[0].conclusion, 'failure');
  assert.equal(result.calls.filter(path => path.endsWith('/branches/main')).length, 2);
  assert.equal(result.rows.some(row => /action|dispatch|merge|stalled/.test(row.kind)), false);
  assert.equal(result.rows.at(-1).accessibleRepositories, 1);
  assert.equal(Object.hasOwn(result.rows.at(-1), 'selectedRepositories'), false);
});
test('owner search retains public repositories absent from the authenticated membership inventory', () => {
  const result = observe('unlisted-owner', ['--owner', 'emsenn']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.rows.find(row => row.kind === 'github.pull').checks.head, head);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-complete');
  assert.equal(result.rows.at(-1).accessibleRepositories, 0);
  assert.equal(Object.hasOwn(result.rows.at(-1), 'selectedRepositories'), false);
});
test('repository issue pagination and closed observations remain complete', () => {
  const result = observe('pages');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.rows.filter(row => row.kind === 'github.issue').length, 30);
  assert.equal(result.rows.filter(row => row.kind === 'github.pull').length, 1);
  assert.ok(result.calls.some(path => path.includes('/issues?state=open') && path.endsWith('page=2')));
  assert.ok(result.calls.some(path => path.includes('/issues?state=closed') && path.includes('since=')));
});
for (const mode of ['renamed', 'repo-permission', 'wrong-item', 'duplicate-page', 'target-moved', 'target-permission', 'bad-target', 'retargeted', 'missing-facts', 'wrong-target-id', 'replaced-target-id']) test(`${mode} refuses complete selected-repository coverage`, () => {
  const result = observe(mode);
  assert.equal(result.status, 1);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-incomplete');
  assert.equal(result.rows.some(row => row.kind === 'github.coverage-complete'), false);
  assert.equal(result.rows.some(row => row.kind === 'github.pull'), false);
});
test('one issue transferred between selected repositories cannot supply complete coverage twice', () => {
  const result = observe('transferred', ['--repository', 'emsenn/cold-red-gate', '--repository', 'red-cup-engineering/example']);
  assert.equal(result.status, 1);
  assert.equal(result.rows.at(-1).kind, 'github.coverage-incomplete');
  assert.equal(result.rows.some(row => row.kind === 'github.coverage-complete'), false);
});
test('unknown mergeability remains unknown and never becomes a stalled-work verdict', () => {
  const result = observe('unknown');
  assert.equal(result.status, 0, result.stderr);
  const checks = result.rows.find(row => row.kind === 'github.pull').checks;
  assert.equal(checks.mergeable, null);
  assert.equal(checks.mergeableState, 'unknown');
  assert.equal(Object.hasOwn(checks, 'stalled'), false);
});
test('auto-merge provider configuration is retained without treating it as authority', () => {
  const result = observe('auto-merge');
  assert.equal(result.status, 0, result.stderr);
  const checks = result.rows.find(row => row.kind === 'github.pull').checks;
  assert.deepEqual(checks.autoMerge, { merge_method: 'squash', enabled_by: { id: 111507, login: 'emsenn' } });
  assert.equal(checks.draft, true);
  assert.equal(checks.mergeable, false);
  assert.equal(Object.hasOwn(checks, 'authorized'), false);
});
test('target branch names are encoded as one provider path segment', () => {
  const result = observe('slash-target');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.rows.find(row => row.kind === 'github.pull').checks.targetBranch.name, 'release/current');
});
test('mixed owner and repository scopes refuse before provider reads', () => {
  const result = observe('held', ['--owner', 'emsenn', '--repository', 'emsenn/cold-red-gate']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /different coverage scopes/);
  assert.deepEqual(result.calls, []);
});
