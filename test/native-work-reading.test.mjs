import test from 'node:test';
import assert from 'node:assert/strict';
import { sidesOf, cellSetAddress } from '@red-cup-engineering/signcell/cell';
import {
  prepareGitHubWork, readGitHubSourceDocument, readGitHubWork,
  readPreparedGitHubWork, receivePreparedGitHubWork,
} from '../src/native-work-receiving.mjs';

const request = () => ({
  event: {
    repository: { id: 7, full_name: 'house/site', private: false },
    action: 'observed', delivery_id: 'original-delivery',
    issue: { id: 9, node_id: 'issue9', number: 2,
      user: { id: 3, login: 'customer' }, title: 'Complaint',
      body: 'Original customer words', updated_at: '2026-10-06T20:00:00Z',
      html_url: 'https://github.com/house/site/issues/2' },
  },
  opening: { move: 'report', observation: 'The source describes an interruption.',
    context: 'The customer report awaits independent verification.' },
  binding: { repositoryId: 7, visibility: 'public', receiver: 'receiving-service',
    scope: ['service:site'], as: 'held-office' },
});
const stored = prepared => ({
  id: 'original-native-thread', opening: { ...structuredClone(prepared.input), by: 'held-office' },
  home: 'receiving-service', standing: 'open',
});
const boardOnly = (sourceThreads, readback = sourceThreads) => {
  const calls = [];
  return { calls, call: async (verb, input) => {
    calls.push({ verb, input: structuredClone(input) });
    assert.equal(verb, 'work-board', 'GWR-1: a reader cannot perform a Work effect');
    return input.source
      ? { position: 'source-position', refused: 0, matched: sourceThreads.length, threads: sourceThreads }
      : { threads: readback, refused: [] };
  } };
};

for (const refused of [16, 1, undefined, null, false, '0', -1, 0.5, []]) {
  for (const receive of [readPreparedGitHubWork, receivePreparedGitHubWork]) {
    test(`GWR-2: ${receive.name} refuses unqualified replay ${JSON.stringify(refused)} without opening Work`, async () => {
      const prepared = prepareGitHubWork(request());
      const verbs = [];
      await assert.rejects(receive({ prepared, call: async verb => {
        verbs.push(verb);
        return { position: 'same', matched: 0, threads: [], refused };
      } }), /refused or unqualified replay/);
      assert.deepEqual(verbs, ['work-board']);
    });
  }
}

test('GWR-2: a visible exact original cannot conceal an unread duplicate in refused history', async () => {
  const prepared = prepareGitHubWork(request());
  for (const receive of [readPreparedGitHubWork, receivePreparedGitHubWork]) {
    const inputs = [];
    await assert.rejects(receive({ prepared, call: async (verb, input) => {
      inputs.push({ verb, input });
      return { position: 'same', matched: 1, refused: 1, threads: [stored(prepared)] };
    } }), /refused or unqualified replay/);
    assert.deepEqual(inputs, [{ verb: 'work-board', input: { source: prepared.envelope.source.url, full: true, limit: 20 } }]);
  }
});

test('GWR-2: a refused later page cannot select an earlier exact original or open replacement Work', async () => {
  const prepared = prepareGitHubWork(request());
  for (const receive of [readPreparedGitHubWork, receivePreparedGitHubWork]) {
    const verbs = [];
    await assert.rejects(receive({ prepared, call: async (verb, input) => {
      verbs.push(verb);
      return input.after === undefined
        ? { position: 'same', matched: 2, refused: 0, threads: [stored(prepared)], next: 'original-native-thread' }
        : { position: 'same', matched: 2, refused: 1, threads: [{ ...stored(prepared), id: 'other' }] };
    } }), /refused or unqualified replay/);
    assert.deepEqual(verbs, ['work-board', 'work-board']);
  }
});

test('GWR-1/4: absent original Work is an observation with source Cells and no receiving or Work claim', async () => {
  const input = request();
  const prepared = prepareGitHubWork(input);
  const board = boardOnly([]);
  const result = await readGitHubWork({ ...input, call: board.call });
  assert.equal(result.state, 'NATIVE_NOT_RECEIVED');
  assert.equal(result.reason, 'no-exact-original-work');
  assert.equal(result.providerObjectKey, prepared.envelope.providerObjectKey);
  assert.equal(result.eventKey, prepared.envelope.eventKey);
  assert.equal(result.offeredSourceDocument, prepared.document.commitment);
  assert.equal(result.expectedReceiver, input.binding.receiver);
  assert.equal(result.sourceCells.cellSetId, prepared.sourceCells.cellSetId);
  for (const key of ['thread', 'workCells', 'nativeWork', 'stages', 'peerHandoff'])
    assert.equal(Object.hasOwn(result, key), false, `absence must not fabricate ${key}`);
  assert.equal(board.calls.length, 1);
});

for (const variant of ['material', 'author', 'scope', 'interpretation', 'removed requirement']) {
  test(`GWR-3/4: changed ${variant} does not borrow an existing Work receipt`, async () => {
    const original = request();
    if (variant === 'removed requirement') original.opening = {
      move: 'request', need: 'Preserve the source.', requirements: ['Retain exact original evidence.'],
    };
    const thread = stored(prepareGitHubWork(original));
    const changed = structuredClone(original);
    if (variant === 'material') changed.event.issue.body = 'A different complaint';
    if (variant === 'author') changed.event.issue.user = { id: 4, login: 'other-customer' };
    if (variant === 'scope') changed.binding.scope = ['service:other'];
    if (variant === 'interpretation') changed.opening.observation = 'Another interpretation';
    if (variant === 'removed requirement') delete changed.opening.requirements;
    const board = boardOnly([thread]);
    const result = await readGitHubWork({ ...changed, call: board.call });
    assert.equal(result.state, 'NATIVE_NOT_RECEIVED');
    assert.equal(Object.hasOwn(result, 'workCells'), false);
    assert.equal(board.calls.length, 1);
  });
}

test('GWR-3/6: exact original receipt and native Cell identity agree with effectful replay', async () => {
  const prepared = prepareGitHubWork(request());
  const actual = stored(prepared);
  const unrelated = { ...stored(prepared), id: 'other-interpretation',
    opening: { ...actual.opening, observation: 'Another interpretation' } };
  for (const threads of [[unrelated, actual], [actual, unrelated]]) {
    const reader = boardOnly(threads);
    const receiver = boardOnly(threads);
    const reading = await readPreparedGitHubWork({ prepared, call: reader.call });
    const replay = await receivePreparedGitHubWork({ prepared, call: receiver.call });
    assert.deepEqual(reading, replay);
    assert.equal(reading.thread, actual.id);
    assert.equal(reading.replay, true);
    assert.equal(reading.workCells.cellSetId, cellSetAddress(reading.workCells.cells));
    assert.deepEqual(reader.calls.map(({ input }) => input), [
      { source: prepared.envelope.source.url, full: true, limit: 20 },
      { thread: actual.id, full: true, limit: 1 },
    ]);
  }
});

for (const variant of ['delivery ID', 'JSON property order']) {
  test(`GWR-3/6: ${variant} retries read the original retained carrier and Cells`, async () => {
    const input = request();
    const first = prepareGitHubWork(input);
    const actual = stored(first);
    const offered = structuredClone(input);
    if (variant === 'delivery ID') offered.event.delivery_id = 'retry-delivery';
    else offered.event.issue = Object.fromEntries(Object.entries(offered.event.issue).reverse());
    const prepared = prepareGitHubWork(offered);
    assert.notEqual(prepared.document.commitment, first.document.commitment);
    const result = await readPreparedGitHubWork({ prepared, call: boardOnly([actual]).call });
    assert.equal(result.sourceDocument, first.document.commitment);
    assert.equal(result.offeredSourceDocument, prepared.document.commitment);
    assert.equal(result.stages.offeredSourceRetained, false);
    assert.equal(result.sourceCells.cellSetId, first.sourceCells.cellSetId);
    assert.equal(readGitHubSourceDocument(actual.opening.sources[1]).source.deliveryId, 'original-delivery');
  });
}

test('GWR-3: ambiguity refuses in either board ordering and never chooses a first match', async () => {
  const prepared = prepareGitHubWork(request());
  const first = stored(prepared);
  const second = { ...stored(prepared), id: 'another-exact-native-thread' };
  for (const threads of [[first, second], [second, first]]) {
    const board = boardOnly(threads);
    await assert.rejects(readPreparedGitHubWork({ prepared, call: board.call }), /ambiguous exact receiving threads/);
    assert.equal(board.calls.length, 1);
  }
});

test('GWR-3: same-condition report with changed fixed interpretation refuses rather than corroborates', async () => {
  const input = request();
  input.opening.law = 'github-issue-open';
  input.opening.subject = input.event.issue.html_url;
  const actual = stored(prepareGitHubWork(input));
  input.opening.context = 'Changed fixed interpretation';
  const board = boardOnly([actual]);
  await assert.rejects(readGitHubWork({ ...input, call: board.call }), /cannot retain changed interpretation/);
  assert.equal(board.calls.length, 1);
});

for (const [label, alter] of [
  ['missing count', page => { delete page.matched; }],
  ['truncated terminal page', page => { page.matched = 2; }],
  ['unrelated source', page => { page.threads[0].opening.sources = []; }],
  ['invalid continuation', page => { page.matched = 2; page.next = 'wrong-cursor'; }],
]) test(`GWR-2: ${label} cannot establish absence or receiving`, async () => {
  const prepared = prepareGitHubWork(request());
  const page = { position: 'one', refused: 0, matched: 1, threads: [stored(prepared)] };
  alter(page);
  await assert.rejects(readPreparedGitHubWork({ prepared, call: async verb => {
    assert.equal(verb, 'work-board');
    return page;
  } }), /source selection/);
});

test('GWR-2: changing source position refuses before any thread receipt', async () => {
  const prepared = prepareGitHubWork(request());
  let pages = 0;
  await assert.rejects(readPreparedGitHubWork({ prepared, call: async verb => {
    assert.equal(verb, 'work-board');
    pages++;
    return pages === 1
      ? { position: 'first', refused: 0, matched: 2, threads: [stored(prepared)], next: 'original-native-thread' }
      : { position: 'changed', refused: 0, matched: 2, threads: [{ ...stored(prepared), id: 'second' }] };
  } }), /changed while paging/);
  assert.equal(pages, 2);
});

test('GWR-2/3: a complete later page can select the exact original Work', async () => {
  const prepared = prepareGitHubWork(request());
  const actual = stored(prepared);
  const unrelated = { ...stored(prepared), id: 'earlier-thread',
    opening: { ...actual.opening, observation: 'An earlier interpretation' } };
  const calls = [];
  const result = await readPreparedGitHubWork({ prepared, call: async (verb, input) => {
    assert.equal(verb, 'work-board');
    calls.push(input);
    if (input.thread) return { threads: [actual], refused: [] };
    if (input.after === undefined)
      return { position: 'same', refused: 0, matched: 2, threads: [unrelated], next: unrelated.id };
    assert.equal(input.after, unrelated.id);
    return { position: 'same', refused: 0, matched: 2, threads: [actual] };
  } });
  assert.equal(result.thread, actual.id);
  assert.equal(calls.length, 3);
});

test('GWR-2: the bounded source scan cannot declare absence at its paging limit', async () => {
  const prepared = prepareGitHubWork(request());
  let pages = 0;
  await assert.rejects(readPreparedGitHubWork({ prepared, call: async (verb, input) => {
    assert.equal(verb, 'work-board');
    assert.equal(input.limit, 20);
    const threads = Array.from({ length: 20 }, (_, index) => ({
      id: `nonmatching-${pages * 20 + index}`,
      opening: { sources: [{ locator: prepared.envelope.source.url }] },
    }));
    pages++;
    return { position: 'same', refused: 0, matched: 1001, threads, next: threads.at(-1).id };
  } }), /exceeded its complete paging bound/);
  assert.equal(pages, 50);
});

test('GWR-5: a corrupt original document refuses without a receiving claim', async () => {
  const prepared = prepareGitHubWork(request());
  const actual = stored(prepared);
  actual.opening.sources[1].commitment = 'corrupt';
  const board = boardOnly([actual]);
  await assert.rejects(readPreparedGitHubWork({ prepared, call: board.call }), /commitment mismatch/);
  assert.equal(board.calls.length, 1);
});

test('GWR-5: fresh thread readback must retain the selected original bytes', async () => {
  const first = prepareGitHubWork(request());
  const next = request();
  next.event.delivery_id = 'retry-delivery';
  const prepared = prepareGitHubWork(next);
  const board = boardOnly([stored(first)], [stored(prepared)]);
  await assert.rejects(readPreparedGitHubWork({ prepared, call: board.call }), /did not retain the exact source document/);
  assert.equal(board.calls.length, 2);
});

test('GWR-5: missing original thread readback does not become a receipt or absence', async () => {
  const prepared = prepareGitHubWork(request());
  const board = boardOnly([stored(prepared)], []);
  await assert.rejects(readPreparedGitHubWork({ prepared, call: board.call }), /complete receiving readback/);
  assert.equal(board.calls.length, 2);
});

for (const [label, change] of [
  ['changed need', opening => { opening.need = 'A different original obligation'; }],
  ['missing native move', opening => { delete opening.move; }],
]) test(`GWR-5: exact retained source bytes cannot excuse ${label} in fresh original Work readback`, async () => {
  const input = request();
  input.opening = { move: 'request', need: 'Preserve the original receiving terms',
    requirements: ['Keep the original source and interpretation together'] };
  const prepared = prepareGitHubWork(input);
  const original = stored(prepared);
  const changed = structuredClone(original);
  change(changed.opening);
  for (const receive of [readPreparedGitHubWork, receivePreparedGitHubWork]) {
    const board = boardOnly([original], [changed]);
    await assert.rejects(receive({ prepared, call: board.call }), /exact source interpretation/);
    assert.equal(board.calls.length, 2);
  }
});

test('GWR-6: the immutable document controls provider identity after a copied envelope changes', async () => {
  const prepared = structuredClone(prepareGitHubWork(request()));
  const actual = stored(prepared);
  const expected = readGitHubSourceDocument(prepared.document);
  prepared.envelope.source.url = 'https://github.com/other/repo/issues/999';
  prepared.envelope.source.author = 'forged-author';
  prepared.envelope.material.body = 'Later mutable bytes';
  const board = boardOnly([actual]);
  const result = await readPreparedGitHubWork({ prepared, call: board.call });
  assert.equal(board.calls[0].input.source, expected.source.url);
  assert.equal(result.nativeWork.originalProviderSource, expected.source.url);
  assert.equal(result.providerObjectKey, expected.providerObjectKey);
  assert.equal(result.sourceDocument, prepared.document.commitment);
});

test('GWR-6: a pending reader keeps its offered interpretation through caller mutation', async () => {
  const prepared = prepareGitHubWork(request());
  const actual = stored(prepared);
  const result = await readPreparedGitHubWork({ prepared, call: async (verb, input) => {
    assert.equal(verb, 'work-board');
    if (input.source) {
      prepared.input.observation = 'Mutated while waiting for the board';
      prepared.input.scope.push('service:another');
      prepared.input.evidence.length = 0;
    }
    return { position: 'same', refused: 0, matched: 1, threads: [actual] };
  } });
  assert.equal(result.state, 'NATIVE_RECEIVED');
  assert.equal(result.sourceDocument, prepared.document.commitment);
  assert.equal(result.sourceEvidence.length, 1);
});

test('GWR-3/5: a repeated report reads its exact corroboration evidence from the original thread', async () => {
  const original = request();
  original.opening.law = 'github-issue-open';
  original.opening.subject = original.event.issue.html_url;
  const initial = prepareGitHubWork(original);
  const later = structuredClone(original);
  later.event.issue.body = 'Later source material retained by the arena';
  later.event.issue.updated_at = '2026-10-07T20:00:00Z';
  later.opening.observation = 'Later explicit source observation';
  const prepared = prepareGitHubWork(later);
  const actual = { ...stored(initial), corroborations: [{
    observation: prepared.input.observation, evidence: prepared.input.evidence,
    player: 'corroborating-native-actor',
  }] };
  const reading = await readPreparedGitHubWork({ prepared, call: boardOnly([actual]).call });
  const receiving = await receivePreparedGitHubWork({ prepared, call: boardOnly([actual]).call });
  assert.deepEqual(reading, receiving);
  assert.equal(reading.thread, actual.id);
  assert.equal(reading.sourceDocument, prepared.document.commitment);
  assert.equal(reading.postedBy, 'corroborating-native-actor');
  assert.equal(reading.sourceCells.cellSetId, prepared.sourceCells.cellSetId);
  const dropped = { ...actual, corroborations: [] };
  await assert.rejects(readPreparedGitHubWork({ prepared, call: boardOnly([actual], [dropped]).call }), /did not retain the exact source document/);
});

test('GWR-5: retained corroboration source and evidence cannot excuse a changed interpretation', async () => {
  const input = request();
  input.opening.law = 'github-issue-open';
  input.opening.subject = input.event.issue.html_url;
  const original = stored(prepareGitHubWork(input));
  input.event.issue.body = 'Subsequent original source observation';
  input.event.issue.updated_at = '2026-10-07T20:00:00Z';
  input.opening.observation = 'The explicit subsequent condition';
  const prepared = prepareGitHubWork(input);
  original.corroborations = [{ observation: prepared.input.observation,
    evidence: [...prepared.input.evidence], player: 'corroborating-native-actor' }];
  for (const change of [
    thread => { thread.corroborations[0].observation = 'A different condition'; },
    thread => { thread.opening.tags = ['new-authored-term']; },
  ]) {
    const changed = structuredClone(original);
    change(changed);
    for (const receive of [readPreparedGitHubWork, receivePreparedGitHubWork])
      await assert.rejects(receive({ prepared, call: boardOnly([original], [changed]).call }), /exact source interpretation/);
  }
});

test('GWR-7: a different observed home stays explicitly unrouted', async () => {
  const prepared = prepareGitHubWork(request());
  const actual = { ...stored(prepared), home: 'another-receiver' };
  const result = await readPreparedGitHubWork({ prepared, call: boardOnly([actual]).call });
  assert.equal(result.state, 'NATIVE_RECEIVED_UNROUTED');
  assert.equal(result.receiver, actual.home);
  assert.equal(result.expectedReceiver, prepared.receiver);
  assert.equal(result.stages.routed, false);
  assert.equal(result.workCells.next, 'receive-routing');
});

test('GWR-8: original Work judgments update without Work writes or customer-acceptance authority', async () => {
  const prepared = prepareGitHubWork(request());
  for (const [deliveries, standing, expected] of [
    [undefined, 'open', 'unavailable'],
    [[], 'accepted', 'no-received-delivery'],
    [[{ verdict: undefined }], 'delivered', 'awaiting-assayer'],
    [[{ verdict: 'rejected' }], 'open', 'rejected-in-work-arena'],
    [[{ verdict: 'accepted' }], 'accepted', 'accepted-in-work-arena'],
  ]) {
    const actual = { ...stored(prepared), standing, ...(deliveries === undefined ? {} : { deliveries }) };
    const reading = await readPreparedGitHubWork({ prepared, call: boardOnly([actual]).call });
    assert.equal(reading.nativeWork.assayerReadout, expected);
    assert.equal(reading.nativeWork.originalWorkSource, actual.id);
    assert.equal(reading.nativeWork.independentCustomerReceiving, 'not-established-by-this-source');
    for (const stage of ['allocated', 'implemented', 'accepted']) assert.equal(reading.stages[stage], false);
    const acceptance = reading.workCells.cells.find(value => value.predicate === 'work.customer-accepted');
    assert.deepEqual(sidesOf(acceptance), [false, false]);
  }
});
