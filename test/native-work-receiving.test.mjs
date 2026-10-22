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
    return calls === 1 ? { position: 'one', matched: 2, threads: [{ id: 'old-source', opening: {sources:[{locator:prepared.envelope.source.url}]} }], next: 'old-source' }
      : { position: 'changed', matched: 2, threads: [] };
  } }), /changed while paging/);
});

for (const variant of ['property order', 'delivery retry']) {
  test(`native replay retains the original source document across ${variant}`, async () => {
    const original = input();
    original.event.delivery_id = 'delivery-1';
    const first = prepareGitHubWork(original);
    const actual = stored(first);
    const retried = structuredClone(original);
    if (variant === 'property order') retried.event.issue = Object.fromEntries(Object.entries(retried.event.issue).reverse());
    else retried.event.delivery_id = 'delivery-2';
    const next = prepareGitHubWork(retried);
    assert.equal(next.envelope.eventKey, first.envelope.eventKey);
    assert.notEqual(next.document.commitment, first.document.commitment);
    const originalLocator = actual.opening.sources[1].locator;
    const receipt = await receivePreparedGitHubWork({ prepared: next, call: async verb => {
      assert.equal(verb, 'work-board', 'unchanged provider observation must not create another native opening');
      return { position: 'one', threads: [actual], matched: 1 };
    } });
    assert.equal(receipt.replay, true);
    assert.equal(receipt.sourceDocument, first.document.commitment);
    assert.equal(receipt.offeredSourceDocument, next.document.commitment);
    assert.equal(receipt.stages.sourceRetained, true);
    assert.equal(receipt.stages.offeredSourceRetained, false);
    assert.equal(actual.opening.sources[1].locator, originalLocator);
    assert.equal(readGitHubSourceDocument(actual.opening.sources[1]).source.deliveryId, 'delivery-1');
  });
}

for (const variant of ['material', 'author', 'triggering actor', 'scope', 'interpretation']) {
  test(`native replay does not collapse changed ${variant}`, async () => {
    const original = input();
    const first = prepareGitHubWork(original);
    const prior = stored(first);
    const changed = structuredClone(original);
    if (variant === 'material') changed.event.issue.body = 'A materially different complaint';
    if (variant === 'author') changed.event.issue.user = { id: 4, login: 'different-author' };
    if (variant === 'triggering actor') changed.event.sender = { id: 5, login: 'different-triggering-actor' };
    if (variant === 'scope') changed.binding.scope = ['service:other'];
    if (variant === 'interpretation') changed.opening.observation = 'A different explicit interpretation';
    const next = prepareGitHubWork(changed);
    const admitted = { ...stored(next), id: 'new-thread' };
    let opens = 0;
    const receipt = await receivePreparedGitHubWork({ prepared: next, call: async (verb, args) => {
      if (verb === 'work-open') { opens++; return { id: admitted.id }; }
      return args.source ? { position: 'one', threads: [prior], matched: 1 } : { threads: [admitted] };
    } });
    assert.equal(opens, 1);
    assert.equal(receipt.replay, false);
    assert.equal(receipt.sourceDocument, next.document.commitment);
    assert.equal(receipt.stages.offeredSourceRetained, true);
    assert.equal(receipt.stages.accepted, false);
  });
}

test('native replay refuses corrupted stored evidence before a speculative opening', async () => {
  const prepared = prepareGitHubWork(input());
  const actual = stored(prepared);
  actual.opening.sources[1].commitment = 'wrong';
  await assert.rejects(receivePreparedGitHubWork({ prepared, call: async verb => {
    assert.equal(verb, 'work-board');
    return { position: 'one', threads: [actual], matched: 1 };
  } }), /commitment mismatch/);
});

test('native replay still requires exact readback of the original retained carrier', async () => {
  const original = input();
  original.event.delivery_id = 'delivery-1';
  const first = prepareGitHubWork(original);
  const prior = stored(first);
  const next = prepareGitHubWork({ ...original, event: { ...original.event, delivery_id: 'delivery-2' } });
  const substituted = stored(next);
  await assert.rejects(receivePreparedGitHubWork({ prepared: next, call: async (verb, args) => {
    assert.equal(verb, 'work-board');
    return args.source ? { position: 'one', threads: [prior], matched: 1 } : { threads: [substituted] };
  } }), /did not retain the exact source document/);
});

test('native replay compares the offered document snapshot after nested input mutation', async () => {
  const prepared = prepareGitHubWork(input());
  const actual = stored(prepared);
  prepared.envelope.material.user.login = 'mutated-after-prepare';
  const receipt = await receivePreparedGitHubWork({ prepared, call: async verb => {
    assert.equal(verb, 'work-board');
    return { position: 'one', threads: [actual], matched: 1 };
  } });
  assert.equal(receipt.replay, true);
  assert.equal(readGitHubSourceDocument(actual.opening.sources[1]).material.user.login, 'customer');
});

test('native replay snapshots retained carrier identity before asynchronous readback', async () => {
  const prepared = prepareGitHubWork(input());
  const actual = stored(prepared);
  const changed = input();
  changed.event.issue.body = 'Different material';
  const substituted = prepareGitHubWork(changed).document;
  await assert.rejects(receivePreparedGitHubWork({ prepared, call: async (verb, args) => {
    assert.equal(verb, 'work-board');
    if (!args.source) Object.assign(actual.opening.sources[1], substituted);
    return { position: 'one', threads: [actual], matched: 1 };
  } }), /did not retain the exact source document/);
});

for (const [label, alter] of [
  ['missing matched count', page=>{delete page.matched}],
  ['truncated terminal page', page=>{page.matched=2}],
  ['unrelated source', page=>{page.threads[0].opening.sources=[]}],
  ['invalid continuation', page=>{page.matched=2;page.next='other'}],
]) test(`source selection refuses ${label} before opening`,async()=>{
  const prepared=prepareGitHubWork(input());let writes=0;
  const page={position:'one',matched:1,threads:[stored(prepared)]};alter(page);
  await assert.rejects(receivePreparedGitHubWork({prepared,call:async verb=>{if(verb!=='work-board')writes++;return page;}}),/source selection/);
  assert.equal(writes,0);
});
test('native set normalization of scope preserves unchanged replay',async()=>{
 const request=input();request.binding.scope=['service:z','section:services/engineering'];
 const prepared=prepareGitHubWork(request),actual=stored(prepared);actual.opening.scope=[...actual.opening.scope].sort();let writes=0;
 const receipt=await receivePreparedGitHubWork({prepared,call:async verb=>{if(verb!=='work-board')writes++;return {position:'one',matched:1,threads:[actual]};}});
 assert.equal(receipt.replay,true);assert.equal(writes,0);
});
test('same-condition report cannot pretend changed context was retained by corroboration',async()=>{
 const request=input();request.opening={...request.opening,law:'github-issue-open',subject:request.event.issue.html_url,context:'Original interpretation'};
 const prior=stored(prepareGitHubWork(request));request.opening.context='Changed interpretation';const prepared=prepareGitHubWork(request);let writes=0;
 await assert.rejects(receivePreparedGitHubWork({prepared,call:async verb=>{if(verb!=='work-board')writes++;return {position:'one',matched:1,threads:[prior]};}}),/cannot retain changed interpretation/);
 assert.equal(writes,0);
});
for(const field of ['context','tags'])test(`same-condition report cannot silently remove fixed ${field}`,async()=>{
 const request=input();request.opening={...request.opening,law:'github-issue-open',subject:request.event.issue.html_url,context:'Original context',tags:['original']};const prior=stored(prepareGitHubWork(request));delete request.opening[field];const prepared=prepareGitHubWork(request);let writes=0;
 await assert.rejects(receivePreparedGitHubWork({prepared,call:async verb=>{if(verb!=='work-board')writes++;return {position:'one',matched:1,threads:[prior]};}}),/cannot retain changed interpretation/);assert.equal(writes,0);
});

test('a snapshot without a sender is admitted and exact replay does not open again', async () => {
  const prepared = prepareGitHubWork(input());
  assert.equal(prepared.envelope.source.actor, null);
  assert.equal(prepared.envelope.source.actorId, null);
  assert.equal(prepared.envelope.source.author, 'customer');
  let actual;
  let opens = 0;
  const call = async (verb, args) => {
    if (verb === 'work-open') {
      opens++;
      actual = stored(prepared);
      return { id: actual.id };
    }
    assert.equal(verb, 'work-board');
    return { position: 'one', threads: actual ? [actual] : [], matched: actual ? 1 : 0 };
  };
  const admitted = await receivePreparedGitHubWork({ prepared, call });
  assert.equal(admitted.replay, false);
  assert.equal(admitted.stages.sourceRetained, true);
  const replay = await receivePreparedGitHubWork({ prepared: prepareGitHubWork(input()), call });
  assert.equal(opens, 1);
  assert.equal(replay.replay, true);
  assert.equal(replay.thread, admitted.thread);
  assert.equal(replay.sourceDocument, admitted.sourceDocument);
  const recovered = readGitHubSourceDocument(actual.opening.sources[1]);
  assert.equal(recovered.source.actor, null);
  assert.equal(recovered.source.actorId, null);
  assert.equal(recovered.source.author, 'customer');
  assert.equal(recovered.material.body, 'Original customer words');
});

test('branch and tag source selectors retain distinct GitHub ref identities in native Work', () => {
  const sample = input();
  const repository = { ...sample.event.repository, html_url: 'https://github.com/house/site' };
  const opening = { move: 'ask', question: 'Which original Work, if any, does this ref affect?' };
  const prepare = ref => prepareGitHubWork({
    event: {
      repository, action: 'observed',
      git_ref: {
        ref, object: { type: 'commit', sha: 'a'.repeat(40) },
        // The source locator is derived from authenticated provider coordinates,
        // not a mutable or incorrectly attributed object URL.
        url: 'https://example.invalid/forged-ref'
      }
    },
    binding: sample.binding, opening
  });
  const branch = prepare('refs/heads/feat/an#issue');
  const tag = prepare('refs/tags/feat/an#issue');
  assert.equal(branch.envelope.source.url,
    'https://api.github.com/repos/house/site/git/refs/heads/feat/an%23issue');
  assert.equal(tag.envelope.source.url,
    'https://api.github.com/repos/house/site/git/refs/tags/feat/an%23issue');
  assert.notEqual(branch.input.sources[0].locator, tag.input.sources[0].locator);
  assert.equal(branch.input.sources[0].kind, 'github-git-ref');
  assert.equal(readGitHubSourceDocument(branch.document).source.objectId,
    'refs/heads/feat/an#issue');
  assert.equal(branch.input.sources[1].kind, 'github-source-document');
});
