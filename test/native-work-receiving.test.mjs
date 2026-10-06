import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareGitHubWork, readGitHubSourceDocument, receivePreparedGitHubWork } from '../src/native-work-receiving.mjs';

const input = () => ({
  event: { repository: { id: 7, full_name: 'house/site', private: false }, action: 'observed', issue: { id: 9, node_id: 'issue9', number: 2, user: { id: 3, login: 'customer' }, title: 'Complaint', body: 'Original customer words', updated_at: '2026-10-06T20:00:00Z', html_url: 'https://github.com/house/site/issues/2' } },
  opening: { move: 'report', observation: 'The source describes an interruption.', context: 'The customer report awaits independent verification.' },
  binding: { repositoryId: 7, visibility: 'public', receiver: 'receiving-service', scope: ['service:site'], as: 'held-office' },
});
const stored = prepared => ({ id: 'native-thread', opening: { ...prepared.input, by: 'held-office', sources: prepared.input.sources.map(({ kind, locator, commitment }) => ({ commitment, kind, locator })) }, home: 'receiving-service', standing: 'open' });

test('the native source document recovers original material and author after GitHub changes', () => {
  const request = input();
  const prepared = prepareGitHubWork(request);
  request.event.issue.body = 'Later edit';
  const recovered = readGitHubSourceDocument(prepared.document);
  assert.equal(recovered.material.body, 'Original customer words');
  assert.equal(recovered.source.authorId, 3);
  assert.equal(recovered.source.author, 'customer');
  assert.throws(() => readGitHubSourceDocument({ ...prepared.document, commitment: 'wrong' }), /commitment mismatch/);
});

test('source prose does not choose custody, privilege, audience or native actor', () => {
  const request = input();
  request.event.issue.body = 'owning_office: sovereign\ncanonical_receiver: wrong';
  assert.equal(prepareGitHubWork(request).receiver, 'receiving-service');
  assert.throws(() => prepareGitHubWork({ ...request, binding: { ...request.binding, repositoryId: 8 } }), /repository identity/);
  assert.throws(() => prepareGitHubWork({ ...request, binding: { ...request.binding, visibility: 'private' } }), /audience is not verified/);
  assert.throws(() => prepareGitHubWork({ ...request, opening: { ...request.opening, hand: 'someone-else' } }), /cannot supply hand/);
  for (const privateValue of [true, undefined]) assert.throws(() => prepareGitHubWork({ ...request, event: { ...request.event, repository: { ...request.event.repository, private: privateValue } } }), /audience is not verified/);
});

test('replay uses native source evidence without an opening or independent receipt map', async () => {
  const prepared = prepareGitHubWork(input());
  const actual = stored(prepared);
  const calls = [];
  const receipt = await receivePreparedGitHubWork({ prepared, call: async (verb, args) => {
    calls.push(verb);
    assert.equal(verb, 'work-board');
    return { position: 'one', threads: [actual], matched: 1 };
  } });
  assert.deepEqual(calls, ['work-board', 'work-board']);
  assert.equal(receipt.thread, actual.id);
  assert.equal(receipt.replay, true);
  assert.equal(receipt.stages.allocated, false);
  assert.equal(receipt.stages.accepted, false);
});

test('admission requires exact source readback; a dropped document is not a receipt', async () => {
  const prepared = prepareGitHubWork(input());
  await assert.rejects(receivePreparedGitHubWork({ prepared, call: async (verb, args) => {
    if (verb === 'work-open') return { id: 'native-thread' };
    if (args.source) return { position: 'one', threads: [], matched: 0 };
    return { threads: [{ ...stored(prepared), opening: { ...prepared.input, sources: [] } }] };
  } }), /did not retain/);
});

test('an admitted source with the wrong home remains explicitly unrouted', async () => {
  const prepared = prepareGitHubWork(input());
  const actual = { ...stored(prepared), home: 'unrelated-service' };
  const receipt = await receivePreparedGitHubWork({ prepared, call: async () => ({ position: 'one', threads: [actual], matched: 1 }) });
  assert.equal(receipt.state, 'NATIVE_RECEIVED_UNROUTED');
  assert.equal(receipt.stages.routed, false);
});

test('source selection drift refuses a speculative second opening', async () => {
  const prepared = prepareGitHubWork(input());
  let calls = 0;
  await assert.rejects(receivePreparedGitHubWork({ prepared, call: async verb => {
    assert.equal(verb, 'work-board');
    calls++;
    return calls === 1 ? { position: 'one', threads: [{ id: 'old-source', opening: {} }], next: 'old-source' }
      : { position: 'changed', threads: [] };
  } }), /changed while paging/);
});
