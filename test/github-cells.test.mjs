import assert from 'node:assert/strict';
import test from 'node:test';
import {
  address, cell, cellSetAddress, isCell, knowledgeReading, mergeCellSets, sidesOf,
} from '@red-cup-engineering/signcell/cell';
import { CLAIM_EVENT_TYPE, cellFromCloudEvent } from '@red-cup-engineering/signcell/cloud-events';
import { normalizeGitHubEvent } from '../src/settler.mjs';
import { projectGitHubCells, gitHubCellCloudEvents, projectGitHubWorkCells } from '../src/github-cells.mjs';

// These cases derive from the public projection contract and GitHub lifecycle
// semantics. They do not reproduce the projection's implementation algorithm.
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const TEST_MERGE = 'c'.repeat(40);
const repository = {
  id: 561,
  full_name: 'red-cup-engineering/example',
  html_url: 'https://github.com/red-cup-engineering/example',
  private: false,
};

function issueEvent(changes = {}, eventChanges = {}) {
  return {
    action: 'edited',
    delivery_id: 'delivery-a',
    repository,
    sender: { id: 7, login: 'operator' },
    issue: {
      id: 900,
      node_id: 'I_example',
      number: 12,
      title: 'Preserve the reported requirement',
      body: 'A consumer needs its report and evidence retained.',
      state: 'open',
      updated_at: '2026-10-27T01:00:00Z',
      html_url: 'https://github.com/red-cup-engineering/example/issues/12',
      user: { id: 8, login: 'consumer' },
      labels: [{ name: 'bug' }],
      ...changes,
    },
    ...eventChanges,
  };
}

function pullEvent(changes = {}, eventChanges = {}) {
  const { issue, ...context } = issueEvent();
  return {
    ...context,
    pull_request: {
      ...issue,
      id: 901,
      node_id: 'PR_example',
      html_url: 'https://github.com/red-cup-engineering/example/pull/12',
      head: { sha: HEAD, ref: 'candidate' },
      base: { sha: BASE, ref: 'main' },
      draft: false,
      ...changes,
    },
    ...eventChanges,
  };
}

const sourceOf = event => projectGitHubCells(normalizeGitHubEvent(event));

function fact(projection, predicate, object) {
  const matches = projection.cells.filter(value =>
    value.subject === projection.observation && value.predicate === predicate &&
    (object === undefined || value.object === object));
  assert.equal(matches.length, 1, `one observation-scoped ${predicate} fact`);
  return matches[0];
}

function assertSides(projection, predicate, expected) {
  const value = fact(projection, predicate, true);
  assert.deepEqual(sidesOf(value), expected, predicate);
  assert.equal(typeof knowledgeReading(value), 'string');
  return value;
}

function nativeReceipt(source, changes = {}) {
  return {
    state: 'NATIVE_RECEIVED',
    thread: 'native-work:example:12',
    providerObjectKey: source.providerObjectKey,
    eventKey: source.eventKey,
    sourceDocument: source.observation,
    offeredSourceDocument: source.observation,
    receiver: 'receiving-service',
    expectedReceiver: 'receiving-service',
    postedBy: 'held-office',
    replay: false,
    standing: 'open',
    nativeWork: {
      kind: 'semioverse.github-native-work-reading.v1',
      opening: 'request',
      standing: 'open',
      assayerReadout: 'no-received-delivery',
      deliveries: { total: 0, accepted: 0, rejected: 0, awaitingAssayer: 0 },
      originalWorkSource: 'native-work:example:12',
      originalProviderSource: source.sourceUrl,
      independentCustomerReceiving: 'not-established-by-this-source',
      effect: 'read-only-native-source-projection',
    },
    stages: {
      sourceRetained: true, nativeAdmitted: true, routed: true,
      allocated: false, implemented: false, accepted: false,
    },
    ...changes,
  };
}

test('GitHub source projection consists of native addressable SignCells', () => {
  const envelope = normalizeGitHubEvent(issueEvent());
  const projected = projectGitHubCells(envelope);
  assert.equal(projected.kind, 'github.source-cells.v1');
  assert.equal(projected.subject, 'github:repo:561:issue:number:12');
  assert.equal(projected.providerObjectKey, envelope.providerObjectKey);
  assert.equal(projected.eventKey, envelope.eventKey);
  assert.equal(projected.repositoryId, 561);
  assert.ok(projected.cells.length > 0);
  assert.ok(projected.cells.every(isCell));
  assert.equal(new Set(projected.cells.map(address)).size, projected.cells.length);
  assert.equal(projected.cellSetId, cellSetAddress(projected.cells));
  assert.equal(fact(projected, 'github.subject').object, projected.subject);
  assert.equal(fact(projected, 'github.provider-object').object, envelope.providerObjectKey);
  assertSides(projected, 'github.open', [true, false]);
});

test('the issues and pulls API views of a PR share the work subject without conflating provider IDs', () => {
  const asIssue = sourceOf(issueEvent({
    pull_request: { url: 'https://api.github.com/repos/red-cup-engineering/example/pulls/12' },
  }));
  const asPull = sourceOf(pullEvent());
  assert.equal(asIssue.subject, 'github:repo:561:pull_request:number:12');
  assert.equal(asPull.subject, asIssue.subject);
  assert.notEqual(asIssue.providerObjectKey, asPull.providerObjectKey);
  assert.notEqual(asIssue.observation, asPull.observation);
  assert.equal(fact(asIssue, 'github.provider-object').object, asIssue.providerObjectKey);
  assert.equal(fact(asPull, 'github.provider-object').object, asPull.providerObjectKey);
});

test('a PR comment retains its typed parent across the issues API locator alias', () => {
  const projected = sourceOf(issueEvent({
    pull_request: { url: 'https://api.github.com/repos/red-cup-engineering/example/pulls/12' },
  }, { comment: {
    id: 903, node_id: 'IC_example', body: 'This candidate still needs receiving.',
    updated_at: '2026-10-27T01:01:00Z',
    html_url: 'https://github.com/red-cup-engineering/example/issues/12#issuecomment-903',
  } }));
  const parent = sourceOf(pullEvent());
  assert.notEqual(projected.subject, parent.subject);
  assert.equal(fact(projected, 'github.parent').object, parent.subject);
});

test('repository identity separates equal issue numbers and survives a repository rename', () => {
  const original = sourceOf(issueEvent());
  const otherRepository = sourceOf(issueEvent({}, { repository: { ...repository, id: 562 } }));
  const renamed = sourceOf(issueEvent({}, { repository: { ...repository, full_name: 'red-cup-engineering/renamed' } }));
  assert.notEqual(original.subject, otherRepository.subject);
  assert.equal(original.subject, renamed.subject);
  assert.notEqual(original.observation, renamed.observation, 'changed locator testimony remains distinguishable');
});

test('transport retries and JSON key order preserve observation and cell-set identity', () => {
  const original = issueEvent();
  const retry = { ...original, delivery_id: 'delivery-retry',
    issue: Object.fromEntries(Object.entries(original.issue).reverse()) };
  const before = sourceOf(original);
  const after = sourceOf(retry);
  assert.equal(before.observation, after.observation);
  assert.equal(before.cellSetId, after.cellSetId);
  assert.deepEqual(before.cells, after.cells);
  assert.deepEqual(gitHubCellCloudEvents(before), gitHubCellCloudEvents(after));
});

test('same-head PR edits and source timestamp changes retain separate observations', () => {
  const original = sourceOf(pullEvent());
  const edited = sourceOf(pullEvent({ body: 'A changed consumer acceptance condition.' }));
  const later = sourceOf(pullEvent({ updated_at: '2026-10-27T01:01:00Z' }));
  assert.equal(original.subject, edited.subject);
  assert.equal(original.subject, later.subject);
  assert.notEqual(original.observation, edited.observation);
  assert.notEqual(original.observation, later.observation);
  for (const projection of [original, edited, later]) {
    assert.equal(fact(projection, 'github.head').object, HEAD);
    assert.equal(fact(projection, 'github.base').object, BASE);
  }
});

test('late closed snapshots cannot become timeless contradictions of a reopened source', () => {
  const closed = sourceOf(issueEvent({ state: 'closed', updated_at: '2026-10-27T01:01:00Z' }));
  const reopened = sourceOf(issueEvent({ state: 'open', updated_at: '2026-10-27T01:02:00Z' }));
  const closedFact = assertSides(closed, 'github.open', [false, true]);
  const reopenedFact = assertSides(reopened, 'github.open', [true, false]);
  assert.notEqual(address(closedFact), address(reopenedFact));
  const forward = mergeCellSets(closed.cells, reopened.cells);
  const reverse = mergeCellSets(reopened.cells, closed.cells);
  assert.equal(cellSetAddress(forward), cellSetAddress(reverse));
  assert.equal(cellSetAddress(forward), cellSetAddress(mergeCellSets(forward, closed.cells)));
  assert.deepEqual(sidesOf(forward.find(value => address(value) === address(closedFact))), [false, true]);
  assert.deepEqual(sidesOf(forward.find(value => address(value) === address(reopenedFact))), [true, false]);
});

test('synthetic test merge SHA is not merged evidence and unknown stays unasserted', () => {
  const projected = sourceOf(pullEvent({ merge_commit_sha: TEST_MERGE, mergeable: null }));
  assertSides(projected, 'github.merged', [false, false]);
  assertSides(projected, 'github.mergeable', [false, false]);
  assertSides(projected, 'github.draft', [false, true]);
});

test('merge evidence preserves explicit denial, dated affirmation, and their contradiction', () => {
  const cases = [
    [{ merged: false }, [false, true]],
    [{ merged: true }, [true, false]],
    [{ merged_at: '2026-10-27T01:02:00Z' }, [true, false]],
    [{ merged: false, merged_at: '2026-10-27T01:02:00Z' }, [true, true]],
    [{ merged_at: null }, [false, true]],
  ];
  for (const [material, expected] of cases) {
    assertSides(sourceOf(pullEvent(material)), 'github.merged', expected);
  }
});

test('review observations preserve the reviewed commit and do not become PR-head approval', () => {
  const event = pullEvent({}, { review: {
    id: 77, node_id: 'PRR_77', state: 'CHANGES_REQUESTED', commit_id: HEAD,
    body: 'The acceptance condition is not met.', submitted_at: '2026-10-27T01:02:00Z',
    user: { id: 10, login: 'reviewer' },
  } });
  const projected = sourceOf(event);
  assert.equal(fact(projected, 'github.review-state').object, 'CHANGES_REQUESTED');
  assert.equal(fact(projected, 'github.review-commit').object, HEAD);
  assert.notEqual(projected.subject, sourceOf(pullEvent()).subject);
});

test('check observations preserve name, provider, execution state, and exact tested head', () => {
  const { issue, ...context } = issueEvent();
  const event = { ...context, action: 'completed', check_run: {
    id: 78, node_id: 'CR_78', name: 'required-verification', status: 'completed',
    conclusion: 'neutral', head_sha: HEAD, app: { id: 44, slug: 'trusted-ci' },
    started_at: '2026-10-27T01:02:00Z', completed_at: '2026-10-27T01:03:00Z',
  } };
  const projected = sourceOf(event);
  assert.equal(fact(projected, 'github.check-name').object, 'required-verification');
  assert.equal(fact(projected, 'github.check-status').object, 'completed');
  assert.equal(fact(projected, 'github.check-conclusion').object, 'neutral');
  assert.equal(fact(projected, 'github.check-head').object, HEAD);
  assert.ok(fact(projected, 'github.check-app').object != null);
  assert.equal(sourceOf({ ...event, delivery_id: 'check-redelivery' }).observation, projected.observation);
});

test('projection owns its retained values and leaves its source unchanged', () => {
  const envelope = normalizeGitHubEvent(issueEvent());
  const before = JSON.stringify(envelope);
  const projected = projectGitHubCells(envelope);
  assert.equal(JSON.stringify(envelope), before);
  const retained = JSON.stringify(projected);
  // The existing normalizer freezes the material record, not nested labels.
  envelope.material.labels[0].name = 'later-caller-mutation';
  assert.equal(JSON.stringify(projected), retained);
  assert.equal(cellSetAddress(projected.cells), projected.cellSetId);
  assert.ok(Object.isFrozen(projected));
  assert.ok(projected.cells.every(Object.isFrozen));
});

test('forged or corrupted normalized envelopes are refused before becoming evidence', () => {
  const envelope = normalizeGitHubEvent(issueEvent());
  const corruptions = [
    { ...envelope, schema: 'not-the-GitHub-contract' },
    { ...envelope, provider: 'unrelated-provider' },
    { ...envelope, providerObjectKey: 'github:repo:999:issue:impostor' },
    { ...envelope, eventKey: 'invented-event' },
    { ...envelope, materialIdentity: 'ni:///sha-256;invented-material' },
    { ...envelope, material: { ...envelope.material, body: 'Changed after commitment' } },
    { ...envelope, source: { ...envelope.source, repositoryId: 999 } },
  ];
  for (const corruption of corruptions) assert.throws(() => projectGitHubCells(corruption));
});

test('native claim CloudEvents round-trip every cell without adding evidence or authority', () => {
  const projected = sourceOf(pullEvent({ merged: false, merged_at: '2026-10-27T01:02:00Z' }));
  const events = gitHubCellCloudEvents(projected);
  assert.equal(events.length, projected.cells.length);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
  assert.deepEqual(events, gitHubCellCloudEvents(projected));
  const originals = new Map(projected.cells.map(value => [address(value), value]));
  for (const event of events) {
    assert.equal(event.specversion, '1.0');
    assert.equal(event.type, CLAIM_EVENT_TYPE);
    assert.equal(event.source, 'urn:github:repository:561');
    const restored = cellFromCloudEvent(event);
    assert.ok(isCell(restored));
    assert.equal(event.subject, address(restored));
    assert.deepEqual(restored, originals.get(event.subject));
  }
  assert.equal(cellSetAddress(events.map(cellFromCloudEvent)), projected.cellSetId);
});

test('a rehashed claim set cannot alter the evidence attributed to an unchanged source observation', () => {
  const source = sourceOf(pullEvent({ merged: false, state: 'closed' }));
  const withCells = cells => ({ ...source, cells, cellSetId: cellSetAddress(cells) });
  const corruptions = [
    ['changed lifecycle', withCells(source.cells.map(value => value.predicate === 'github.merged'
      ? cell(value.subject, value.predicate, true, { for: ['invented-merge-evidence'] }) : value))],
    ['changed witness', withCells(source.cells.map(value => value.predicate === 'github.subject'
      ? cell(value.subject, value.predicate, value.object, { for: ['unrelated-source'] }) : value))],
    ['missing material', withCells(source.cells.filter(value => value.predicate !== 'github.material'))],
    ['extra asserted fact', withCells([...source.cells,
      cell(source.observation, 'github.unwitnessed-assurance', true, { for: ['invented-assurance'] })])],
    ['changed source locator', { ...source, sourceUrl: 'https://github.com/red-cup-engineering/example/pull/99' }],
  ];
  for (const [label, altered] of corruptions) {
    // A valid self-hash alone proves neither derivation nor source correlation.
    assert.equal(altered.cellSetId, cellSetAddress(altered.cells), label);
    assert.throws(() => gitHubCellCloudEvents(altered), label);
    assert.throws(() => projectGitHubWorkCells({ source: altered, receipt: nativeReceipt(altered) }), label);
  }
});

test('a correlated native receipt becomes work cells scoped to receipt observation', () => {
  const source = sourceOf(issueEvent());
  const receipt = nativeReceipt(source);
  const projected = projectGitHubWorkCells({ source, receipt });
  assert.equal(projected.kind, 'github.work-cells.v1');
  assert.equal(projected.subject, receipt.thread);
  assert.equal(projected.sourceSubject, source.subject);
  assert.notEqual(projected.observation, projected.subject);
  assert.ok(projected.cells.every(isCell));
  assert.equal(projected.cellSetId, cellSetAddress(projected.cells));
  assert.equal(fact(projected, 'work.source').object, source.subject);
  assertSides(projected, 'work.source-retained', [true, false]);
  assertSides(projected, 'work.native-admitted', [true, false]);
  assertSides(projected, 'work.routed', [true, false]);
  assertSides(projected, 'work.customer-accepted', [false, false]);
  assert.equal(projected.next, 'continue-native-work');
});

test('source retention alone and uncorrelated receipts cannot claim native Work admission', () => {
  const source = sourceOf(issueEvent());
  const valid = nativeReceipt(source);
  const refused = [
    { ...valid, state: 'RECEIVED' },
    { ...valid, thread: '' },
    { ...valid, thread: null },
    { ...valid, stages: { ...valid.stages, sourceRetained: false } },
    { ...valid, stages: { ...valid.stages, nativeAdmitted: false } },
    { ...valid, stages: { ...valid.stages, nativeAdmitted: 'true' } },
    { ...valid, providerObjectKey: 'unrelated-object' },
    { ...valid, eventKey: 'unrelated-event' },
  ];
  for (const receipt of refused) assert.throws(() => projectGitHubWorkCells({ source, receipt }));
});

test('later native standing has its own observation instead of rewriting earlier work facts', () => {
  const source = sourceOf(issueEvent());
  const first = nativeReceipt(source);
  const later = { ...first, standing: 'accepted', nativeWork: {
    ...first.nativeWork, standing: 'accepted', assayerReadout: 'accepted-in-work-arena',
    deliveries: { total: 1, accepted: 1, rejected: 0, awaitingAssayer: 0 },
  } };
  const before = projectGitHubWorkCells({ source, receipt: first });
  const after = projectGitHubWorkCells({ source, receipt: later });
  assert.equal(before.subject, after.subject);
  assert.notEqual(before.observation, after.observation);
  assert.equal(fact(before, 'work.standing').object, 'open');
  assert.equal(fact(after, 'work.standing').object, 'accepted');
  assert.equal(after.next, 'receive-customer');
  assertSides(after, 'work.customer-accepted', [false, false]);
  const both = mergeCellSets(before.cells, after.cells);
  assert.equal(both.filter(value => value.predicate === 'work.standing').length, 2);
});

test('native routing and assay requirements determine the next work before source lifecycle', () => {
  const source = sourceOf(pullEvent({ merged: true, state: 'closed' }));
  const base = nativeReceipt(source);
  const cases = [
    [{ ...base, state: 'NATIVE_RECEIVED_UNROUTED', receiver: 'other-home',
      stages: { ...base.stages, routed: false } }, 'receive-routing'],
    [{ ...base, nativeWork: { ...base.nativeWork, assayerReadout: 'rejected-in-work-arena' } }, 'repair-delivery'],
    [{ ...base, nativeWork: { ...base.nativeWork, assayerReadout: 'awaiting-assayer' } }, 'receive-assay'],
    [{ ...base, nativeWork: { ...base.nativeWork, assayerReadout: 'accepted-in-work-arena' } }, 'receive-customer'],
  ];
  for (const [receipt, next] of cases) {
    const projected = projectGitHubWorkCells({ source, receipt });
    assert.equal(projected.next, next);
    assertSides(projected, 'work.customer-accepted', [false, false]);
  }
});

test('source lifecycle derives bounded continuation choices without completing the Work', () => {
  const cases = [
    [pullEvent({ merged: true, state: 'closed' }), 'receive-downstream'],
    [pullEvent({ merged: false, state: 'closed' }), 'reconcile-closed-source'],
    [pullEvent({ draft: true }), 'complete-draft'],
    [pullEvent({ draft: false, merged: false }), 'continue-native-work'],
    [issueEvent({ state: 'closed' }), 'reconcile-closed-source'],
  ];
  for (const [event, next] of cases) {
    const source = sourceOf(event);
    const projected = projectGitHubWorkCells({ source, receipt: nativeReceipt(source) });
    assert.equal(projected.next, next);
    assertSides(projected, 'work.customer-accepted', [false, false]);
  }
});

test('contradictory merge evidence calls for source reconciliation before downstream receiving', () => {
  const source = sourceOf(pullEvent({
    merged: false, merged_at: '2026-10-27T01:02:00Z', state: 'closed',
  }));
  assertSides(source, 'github.merged', [true, true]);
  const projected = projectGitHubWorkCells({ source, receipt: nativeReceipt(source) });
  assert.equal(projected.next, 'reconcile-source-evidence');
  assertSides(projected, 'work.customer-accepted', [false, false]);
});

test('even asserted stage acceptance and GitHub closure cannot manufacture customer acceptance', () => {
  const source = sourceOf(pullEvent({ merged: true, state: 'closed' }));
  const receipt = nativeReceipt(source);
  receipt.stages.accepted = true;
  receipt.nativeWork.independentCustomerReceiving = 'accepted';
  const projected = projectGitHubWorkCells({ source, receipt });
  assertSides(projected, 'work.customer-accepted', [false, false]);
});
