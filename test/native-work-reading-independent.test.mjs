// Independent requirement assay authored by the github_contract_assay reviewer,
// 2026-10-27. Original cases preserved; the owner import is made relative.
// Contract: specifications/github-work-reading.md, GWR-1/3/5/6/8.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sidesOf } from '@red-cup-engineering/signcell/cell';
import { prepareGitHubWork, readPreparedGitHubWork } from '../src/native-work-receiving.mjs';

function demand() {
  return {
    event: { repository: { id: 44, full_name: 'estate/component', private: false }, action: 'observed', delivery_id: 'original-delivery',
      issue: { id: 8, number: 2, user: { id: 5, login: 'author' }, title: 'Original source request', body: 'Repair this source condition',
        updated_at: '2026-10-20T10:00:00Z', html_url: 'https://github.com/estate/component/issues/2' } },
    opening: { move: 'request', need: 'Repair the original code condition', requirements: ['Preserve original semantics'], context: 'Original interpretation' },
    binding: { repositoryId: 44, visibility: 'public', receiver: 'engineering-owner', scope: ['service:component'], as: 'qualified-owner' },
  };
}
const native = prepared => ({ id: 'retained-original-work', opening: { ...structuredClone(prepared.input), by: 'qualified-owner' },
  home: 'engineering-owner', standing: 'open' });
function board(source, readback = source) {
  const calls = [];
  return { calls, async call(verb, input) {
    calls.push({ verb, input });
    assert.equal(verb, 'work-board');
    return input.source ? { position: 'fixed-source-snapshot', refused: 0, matched: source.length, threads: source } : { threads: readback, refused: [] };
  } };
}

test('independent: real journal judgment advances while original Work admission and customer acceptance stay distinct', async () => {
  const prepared = prepareGitHubWork(demand()), original = native(prepared);
  const current = { ...structuredClone(original), standing: 'accepted', deliveries: [{ verdict: 'accepted' }] };
  const port = board([original], [current]);
  const received = await readPreparedGitHubWork({ prepared, call: port.call });
  assert.equal(received.thread, original.id);
  assert.equal(received.nativeWork.assayerReadout, 'accepted-in-work-arena');
  assert.equal(received.stages.allocated, false);
  assert.equal(received.stages.implemented, false);
  assert.equal(received.stages.accepted, false);
  assert.deepEqual(sidesOf(received.workCells.cells.find(cell => cell.predicate === 'work.customer-accepted')), [false, false]);
  assert.equal(port.calls.length, 2);
});

test('independent: exact source bytes cannot excuse changed original interpretation in fresh thread readback', async () => {
  const prepared = prepareGitHubWork(demand()), original = native(prepared), crossed = structuredClone(original);
  crossed.opening.need = 'A different code-development obligation';
  const port = board([original], [crossed]);
  await assert.rejects(readPreparedGitHubWork({ prepared, call: port.call }));
  assert.equal(port.calls.length, 2);
});

test('independent: an incomplete original opening cannot mint a native-admitted WorkCell', async () => {
  const prepared = prepareGitHubWork(demand()), original = native(prepared), incomplete = structuredClone(original);
  delete incomplete.opening.move;
  const port = board([original], [incomplete]);
  await assert.rejects(readPreparedGitHubWork({ prepared, call: port.call }));
});

test('independent: corroboration readback must preserve the selected interpretation as well as source evidence', async () => {
  const first = demand();
  first.opening = { move: 'report', law: 'source-condition', subject: first.event.issue.html_url, observation: 'Original condition', context: 'Fixed report context' };
  const original = native(prepareGitHubWork(first));
  const next = structuredClone(first);
  next.event.issue.body = 'Subsequent observed source material';
  next.event.issue.updated_at = '2026-10-21T10:00:00Z';
  next.opening.observation = 'The explicit subsequently observed condition';
  const prepared = prepareGitHubWork(next);
  original.corroborations = [{ observation: prepared.input.observation, evidence: structuredClone(prepared.input.evidence), player: 'reporting-owner' }];
  const crossed = structuredClone(original);
  crossed.corroborations[0].observation = 'An unrelated interpretation';
  const port = board([original], [crossed]);
  await assert.rejects(readPreparedGitHubWork({ prepared, call: port.call }));
});

test('independent: another original interpretation produces bounded absence without effect or WorkCell', async () => {
  const prepared = prepareGitHubWork(demand()), other = native(prepared);
  other.opening.requirements = ['A different original requirement'];
  const port = board([other]);
  const result = await readPreparedGitHubWork({ prepared, call: port.call });
  assert.equal(result.state, 'NATIVE_NOT_RECEIVED');
  for (const field of ['thread', 'stages', 'workCells', 'nativeWork']) assert.equal(Object.hasOwn(result, field), false);
  assert.equal(port.calls.length, 1);
});

test('independent: caller mutation while the board is awaited cannot change the selected interpretation', async () => {
  const prepared = prepareGitHubWork(demand()), original = native(prepared);
  let reads = 0;
  const result = await readPreparedGitHubWork({ prepared, call: async (verb, input) => {
    assert.equal(verb, 'work-board'); reads++;
    prepared.input.requirements = ['Mutated after capture'];
    return input.source ? { position: 'same', refused: 0, matched: 1, threads: [original] } : { threads: [original], refused: [] };
  } });
  assert.equal(result.state, 'NATIVE_RECEIVED');
  assert.equal(result.thread, original.id);
  assert.equal(reads, 2);
});
