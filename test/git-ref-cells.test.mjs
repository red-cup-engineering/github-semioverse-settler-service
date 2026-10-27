import assert from 'node:assert/strict';
import test from 'node:test';
import { isCell, sidesOf, cellSetAddress } from '@red-cup-engineering/signcell/cell';
import { cellFromCloudEvent } from '@red-cup-engineering/signcell/cloud-events';
import { normalizeGitHubEvent, settleGitHubEnvelope, MemoryReceiptStore } from '../src/settler.mjs';
import { projectGitHubCells, gitHubCellCloudEvents } from '../src/github-cells.mjs';
import { collectGitHubRepositories, projectArchiveRefSelectionsFromCensus } from '../src/github-poll.mjs';

const repository = { id: 561, full_name: 'house/engineering', private: false, default_branch: 'main' };
const sha = 'a'.repeat(40);
const source = (ref = 'refs/tags/archive/unreceived', type = 'tag', target = sha) => ({
  repository, action: 'observed',
  git_ref: { ref, node_id: 'provider-ref-node', object: { type, sha: target } },
});
const fact = (projection, predicate) => {
  const values = projection.cells.filter(value => value.predicate === predicate);
  assert.equal(values.length, 1);
  assert.equal(values[0].subject, projection.observation);
  return values[0];
};

test('archive ref targets have explicit native claims and preserve annotated tag identity through CloudEvents', () => {
  const envelope = normalizeGitHubEvent(source());
  const projection = projectGitHubCells(envelope);
  assert.ok(projection.cells.every(isCell));
  assert.equal(fact(projection, 'git.ref-name').object, 'refs/tags/archive/unreceived');
  assert.equal(fact(projection, 'git.object-type').object, 'tag');
  assert.equal(fact(projection, 'git.object-id').object, sha);
  assert.deepEqual(sidesOf(fact(projection, 'git.object-id')), [true, false]);
  assert.deepEqual(sidesOf(fact(projection, 'github.merged')), [false, false]);
  assert.equal(cellSetAddress(gitHubCellCloudEvents(projection).map(cellFromCloudEvent)), projection.cellSetId);
});

test('Git ref subject follows repository and full namespace while each moved target has a new observation', () => {
  const project = event => projectGitHubCells(normalizeGitHubEvent(event));
  const tag = project(source());
  const custom = project(source('refs/archive/unreceived'));
  const moved = project(source(undefined, 'tag', 'b'.repeat(40)));
  const retry = project({ ...source(), delivery_id: 'another-transport-attempt' });
  assert.notEqual(tag.subject, custom.subject);
  assert.equal(tag.subject, moved.subject);
  assert.notEqual(tag.observation, moved.observation);
  assert.equal(tag.cellSetId, retry.cellSetId);
  assert.equal(fact(tag, 'git.object-id').object, sha, 'later movement does not rewrite retained source');
});

test('archive census consumption reaches native Cells and the same durable receipt path', async () => {
  const refName = 'refs/tags/archive/unreceived';
  const census = { recordKind: 'github.archive-ref-census/v1',
    repositoryId: repository.id, repositoryFullName: repository.full_name,
    defaultBranch: 'main', defaultHeadSha: 'c'.repeat(40),
    sourceCoverage: 'complete-exact-archive-ref-list-at-two-reads',
    prefix: 'refs/tags/archive', count: 1, effectsPerformed: false,
    refs: [{ recordKind: 'github.archive-ref-observation/v1', refName,
      objectType: 'tag', objectSha: sha,
      sourceConsumerReceiving: 'not-observed', automaticRefRetirementAllowed: false }] };
  const requests = [];
  const [envelope] = await collectGitHubRepositories({ repositories: [repository], sourceOnly: true,
    archiveRefSelections: projectArchiveRefSelectionsFromCensus(census, [refName]),
    getJson: async path => {
      requests.push(path);
      if (path === 'repos/house/engineering') return repository;
      assert.equal(path, 'repos/house/engineering/git/ref/tags/archive/unreceived');
      return source().git_ref;
    } });
  assert.equal(requests.length, 4, 'selected source uses two identity and two exact ref reads');
  const receiptStore = new MemoryReceiptStore(); let admissions = 0;
  const admit = async () => ({ receiptId: 'source-arrival:' + ++admissions });
  const first = await settleGitHubEnvelope({ envelope, receiptStore, admit });
  const replay = await settleGitHubEnvelope({ envelope, receiptStore, admit });
  assert.equal(first.state, 'RECEIVED');
  assert.equal(replay.state, 'DUPLICATE_RECEIVED');
  assert.equal(first.sourceCells.cellSetId, replay.sourceCells.cellSetId);
  assert.equal(fact(first.sourceCells, 'git.object-type').object, 'tag');
  assert.equal(admissions, 1);
  assert.equal(Object.hasOwn(first, 'workCells'), false, 'transport custody does not invent native Work receiving');
});

test('typed ref validation applies before any receipt claim, including a forged material-bound envelope', async () => {
  assert.throws(() => normalizeGitHubEvent(source('refs/heads/candidate', 'tag')), /target a commit/);
  assert.throws(() => normalizeGitHubEvent(source('refs/tags/archive/../candidate')), /refname/);
  assert.throws(() => normalizeGitHubEvent(source(undefined, 'tag', 'bad-sha')), /typed SHA/);
  const envelope = structuredClone(normalizeGitHubEvent(source()));
  envelope.source.url = 'https://api.github.com/repos/foreign/repository/git/refs/tags/archive/unreceived';
  let effects = 0;
  await assert.rejects(settleGitHubEnvelope({ envelope,
    receiptStore: { get: () => null, put: () => effects++, claim: () => { effects++; return { state: 'ACQUIRED' }; }, clearClaim() {} },
    admit: async () => { effects++; return { receiptId: 'unqualified' }; },
  }), /exact provider coordinates/);
  assert.equal(effects, 0);
});

test('selected archive source uses authenticated current visibility rather than stale caller metadata', async () => {
  const actual = { ...repository, private: true };
  const ref = source().git_ref;
  const [envelope] = await collectGitHubRepositories({ repositories: [repository], sourceOnly: true,
    archiveRefSelections: [{ repositoryFullName: repository.full_name, repositoryId: repository.id,
      refName: ref.ref, objectType: ref.object.type, objectSha: ref.object.sha }],
    getJson: async path => path === 'repos/house/engineering' ? actual : ref,
  });
  assert.equal(repository.private, false, 'the stale caller snapshot is unchanged');
  assert.equal(envelope.source.visibility, 'private');
  assert.equal(fact(projectGitHubCells(envelope), 'github.visibility').object, 'private');
});
