import assert from 'node:assert/strict';
import test from 'node:test';
import { cellSetAddress, isCell, sidesOf } from '@red-cup-engineering/signcell/cell';
import { cellFromCloudEvent } from '@red-cup-engineering/signcell/cloud-events';
import {
  normalizeGitHubEvent, settleGitHubEvent, settleGitHubEnvelope, MemoryReceiptStore,
} from '../src/settler.mjs';
import { projectGitHubCells, gitHubCellCloudEvents } from '../src/github-cells.mjs';
import {
  prepareGitHubWork, readGitHubSourceDocument, receivePreparedGitHubWork, readPreparedGitHubWork,
} from '../src/native-work-receiving.mjs';

// These cases derive from provider object identity and the receiving contract,
// independently from the implementation's event dispatch and projection code.
const BEFORE = 'a'.repeat(40);
const AFTER = 'b'.repeat(40);
const ZERO = '0'.repeat(40);
const WEB = 'https://github.com/red-cup-engineering/activity-example';
const API = 'https://api.github.com/repos/red-cup-engineering/activity-example';
const repository = {
  id: 754, node_id: 'R_activity', full_name: 'red-cup-engineering/activity-example',
  private: false, html_url: WEB, updated_at: '2026-10-31T12:00:00Z',
};
const context = () => ({
  repository: { ...repository }, sender: { id: 51, login: 'operator' },
  delivery_id: 'activity-original',
});
const releaseEvent = () => ({
  ...context(), action: 'published',
  release: {
    id: 701, node_id: 'RE_activity', tag_name: 'v1.2.3', target_commitish: 'main',
    name: 'Usable source delivery', body: 'Release notes retained as source.',
    draft: false, prerelease: true,
    created_at: '2026-10-31T12:01:00Z', published_at: '2026-10-31T12:02:00Z',
    html_url: WEB + '/releases/tag/v1.2.3', url: API + '/releases/701',
    author: { id: 52, node_id: 'U_author', login: 'release-author' },
    assets: [{ id: 702, name: 'source.tgz', size: 412 }],
  },
});
const deploymentEvent = () => ({
  ...context(),
  deployment: {
    id: 801, node_id: 'D_activity', sha: AFTER, ref: 'main',
    environment: 'production', url: API + '/deployments/801',
    created_at: '2026-10-31T12:03:00Z',
  },
  deployment_status: {
    id: 802, node_id: 'DS_activity', state: 'success',
    environment: 'production', description: 'Provider observation only.',
    deployment_url: API + '/deployments/801', url: API + '/deployments/801/statuses/802',
    target_url: 'https://service.example/health',
    created_at: '2026-10-31T12:04:00Z', updated_at: '2026-10-31T12:04:00Z',
    creator: { id: 53, login: 'deployment-provider' },
  },
});
const statusEvent = () => ({
  ...context(), id: 901, node_id: 'SC_activity', sha: AFTER,
  state: 'success', context: 'source/qualification', description: 'Candidate qualified.',
  target_url: 'https://ci.example/jobs/901',
  created_at: '2026-10-31T12:05:00Z', updated_at: '2026-10-31T12:05:00Z',
  commit: { sha: AFTER, html_url: WEB + '/commit/' + AFTER },
  branches: [{ name: 'main', commit: { sha: AFTER } }],
});
const pushEvent = () => ({
  ...context(), ref: 'refs/heads/main', before: BEFORE, after: AFTER,
  created: false, deleted: false, forced: true,
  compare: WEB + '/compare/' + BEFORE + '...' + AFTER,
  pusher: { name: 'original-pusher', email: 'source@example.test' },
  head_commit: { id: AFTER, message: 'Integrate existing work', timestamp: '2026-10-31T12:06:00Z' },
  commits: [{ id: AFTER, message: 'Integrate existing work', timestamp: '2026-10-31T12:06:00Z' }],
});

function projection(event) {
  return projectGitHubCells(normalizeGitHubEvent(event));
}

function fact(projected, predicate) {
  const matches = projected.cells.filter(at =>
    at.subject === projected.observation && at.predicate === predicate);
  assert.equal(matches.length, 1, 'exactly one observation-scoped ' + predicate);
  return matches[0];
}

function boolean(projected, predicate, expected) {
  assert.deepEqual(sidesOf(fact(projected, predicate)), expected, predicate);
}

test('release material, author and symbolic target survive as native source evidence', () => {
  const event = releaseEvent();
  const envelope = normalizeGitHubEvent(event);
  assert.equal(envelope.source.objectType, 'release');
  assert.equal(envelope.source.objectId, event.release.node_id);
  assert.equal(envelope.source.author, 'release-author');
  assert.equal(envelope.source.actor, 'operator');
  assert.equal(envelope.source.url, API + '/releases/701');
  assert.deepEqual(envelope.material, event.release);
  const cells = projectGitHubCells(envelope);
  assert.equal(fact(cells, 'github.release-tag').object, 'v1.2.3');
  assert.equal(fact(cells, 'github.release-target').object, 'main');
  assert.equal(fact(cells, 'github.release-published-at').object, event.release.published_at);
  boolean(cells, 'github.release-prerelease', [true, false]);
  boolean(cells, 'github.draft', [false, true]);
  assert.equal(cells.cells.some(at => at.predicate === 'git.object-id' && at.object === 'main'), false);
});

test('editing release notes on one release preserves subject and changes observation', () => {
  const first = releaseEvent();
  const edited = releaseEvent();
  edited.release.body += ' A corrected receiving condition.';
  const a = projection(first), b = projection(edited);
  assert.equal(a.subject, b.subject);
  assert.notEqual(a.observation, b.observation);
  assert.notEqual(a.cellSetId, b.cellSetId);
  assert.notEqual(a.eventKey, b.eventKey);
});

test('deployment status remains distinct from its deployment and binds its candidate', () => {
  const event = deploymentEvent();
  const envelope = normalizeGitHubEvent(event);
  assert.equal(envelope.source.objectType, 'deployment_status');
  assert.equal(envelope.source.objectId, event.deployment_status.node_id);
  assert.deepEqual(envelope.material, event.deployment_status);
  assert.equal(envelope.source.parent.objectType, 'deployment');
  assert.equal(envelope.source.parent.objectId, event.deployment.node_id);
  assert.equal(envelope.source.parent.headSha, AFTER);
  const cells = projectGitHubCells(envelope);
  assert.equal(fact(cells, 'github.parent').object, 'github:repo:754:deployment:D_activity');
  assert.equal(fact(cells, 'github.deployment-state').object, 'success');
  assert.equal(fact(cells, 'github.deployment-target').object, AFTER);
  assert.equal(fact(cells, 'github.deployment-ref').object, 'main');
  assert.equal(fact(cells, 'github.deployment-environment').object, 'production');
  assert.equal(cells.cells.some(at => at.predicate === 'work.customer-accepted'), false);
});

test('two deployment-status records at one target are distinct source objects', () => {
  const first = deploymentEvent();
  const later = deploymentEvent();
  later.deployment_status.id = 803;
  later.deployment_status.node_id = 'DS_later';
  later.deployment_status.state = 'failure';
  later.deployment_status.url = API + '/deployments/801/statuses/803';
  const a = projection(first), b = projection(later);
  assert.notEqual(a.subject, b.subject);
  assert.equal(fact(a, 'github.parent').object, fact(b, 'github.parent').object);
  assert.equal(fact(a, 'github.deployment-target').object, fact(b, 'github.deployment-target').object);
});

test('auxiliary workflow and check objects cannot replace a deployment-status source', () => {
  const event = deploymentEvent();
  event.workflow_run = {
    id: 811, node_id: 'WFR_auxiliary', head_sha: BEFORE,
    status: 'completed', conclusion: 'success', updated_at: '2026-10-31T12:00:00Z',
  };
  event.check_run = {
    id: 812, node_id: 'CR_auxiliary', head_sha: BEFORE,
    name: 'deployment-gate', status: 'completed', conclusion: 'success',
  };
  const envelope = normalizeGitHubEvent(event);
  assert.equal(envelope.source.objectType, 'deployment_status');
  assert.equal(envelope.source.objectId, 'DS_activity');
  assert.deepEqual(envelope.material, event.deployment_status);
  assert.equal(fact(projectGitHubCells(envelope), 'github.deployment-target').object, AFTER);
});

test('deployment-status creator remains distinct from the triggering sender', () => {
  const envelope = normalizeGitHubEvent(deploymentEvent());
  assert.equal(envelope.source.author, 'deployment-provider');
  assert.equal(envelope.source.authorId, 53);
  assert.equal(envelope.source.actor, 'operator');
  assert.equal(envelope.source.actorId, 51);
  const changed = deploymentEvent();
  changed.deployment_status.creator = { id: 54, login: 'other-status-provider' };
  const a = projectGitHubCells(envelope), b = projection(changed);
  assert.equal(a.subject, b.subject);
  assert.notEqual(a.observation, b.observation);
});

test('commit-status payload retains its own identity, context and exact checked candidate', () => {
  const event = statusEvent();
  const envelope = normalizeGitHubEvent(event);
  assert.equal(envelope.source.objectType, 'status');
  assert.equal(envelope.source.objectId, event.node_id);
  assert.equal(envelope.material.sha, AFTER);
  assert.deepEqual(envelope.material.commit, event.commit);
  assert.deepEqual(envelope.material.branches, event.branches);
  assert.equal(Object.hasOwn(envelope.material, 'repository'), false);
  assert.equal(Object.hasOwn(envelope.material, 'delivery_id'), false);
  const cells = projectGitHubCells(envelope);
  assert.equal(fact(cells, 'github.status-state').object, 'success');
  assert.equal(fact(cells, 'github.status-context').object, 'source/qualification');
  assert.equal(fact(cells, 'github.status-head').object, AFTER);
  assert.equal(cells.cells.some(at => at.predicate === 'work.customer-accepted'), false);
});

test('push records retain the complete ref movement without replacing a Git ref observation', () => {
  const event = pushEvent();
  const envelope = normalizeGitHubEvent(event);
  assert.equal(envelope.source.objectType, 'push');
  assert.equal(envelope.source.objectId, event.ref);
  assert.equal(envelope.source.revision, AFTER);
  assert.deepEqual(envelope.material.commits, event.commits);
  assert.deepEqual(envelope.material.pusher, event.pusher);
  const cells = projectGitHubCells(envelope);
  assert.equal(fact(cells, 'git.ref-name').object, event.ref);
  assert.equal(fact(cells, 'git.before').object, BEFORE);
  assert.equal(fact(cells, 'git.after').object, AFTER);
  boolean(cells, 'git.created', [false, true]);
  boolean(cells, 'git.deleted', [false, true]);
  boolean(cells, 'git.forced', [true, false]);
  assert.equal(cells.cells.some(at => at.predicate === 'work.customer-accepted'), false);
});

test('push creation and deletion preserve zero targets only with the matching lifecycle evidence', () => {
  const created = pushEvent();
  created.before = ZERO;
  created.created = true;
  created.forced = false;
  const deleted = pushEvent();
  deleted.after = ZERO;
  deleted.deleted = true;
  deleted.forced = false;
  deleted.head_commit = null;
  deleted.commits = [];
  const creation = projection(created), deletion = projection(deleted);
  boolean(creation, 'git.created', [true, false]);
  boolean(deletion, 'git.deleted', [true, false]);
  assert.equal(fact(creation, 'git.before').object, ZERO);
  assert.equal(fact(deletion, 'git.after').object, ZERO);
  assert.equal(creation.subject, deletion.subject);
  assert.notEqual(creation.observation, deletion.observation);
});

test('a push transition and a polled Git ref share their stable subject without sharing an observation', () => {
  const pushed = projection(pushEvent());
  const observed = projection({ ...context(), action: 'observed', git_ref: {
    ref: 'refs/heads/main', url: API + '/git/refs/heads/main',
    object: { type: 'commit', sha: AFTER, url: API + '/git/commits/' + AFTER },
  } });
  assert.equal(pushed.subject, observed.subject);
  assert.notEqual(pushed.providerObjectKey, observed.providerObjectKey);
  assert.notEqual(pushed.observation, observed.observation);
  assert.notEqual(pushed.eventKey, observed.eventKey);
  assert.equal(fact(pushed, 'git.after').object, fact(observed, 'git.object-id').object);
});

test('an annotated-tag push retains its tag-object target separately from its head commit', () => {
  const TAG_OBJECT = 'c'.repeat(40);
  const event = pushEvent();
  event.ref = 'refs/tags/v1.2.3';
  event.before = ZERO;
  event.after = TAG_OBJECT;
  event.created = true;
  event.forced = false;
  event.compare = WEB + '/compare/' + ZERO + '...' + TAG_OBJECT;
  const envelope = normalizeGitHubEvent(event);
  const cells = projectGitHubCells(envelope);
  assert.equal(envelope.source.revision, TAG_OBJECT);
  assert.equal(envelope.material.after, TAG_OBJECT);
  assert.equal(envelope.material.head_commit.id, AFTER);
  assert.equal(fact(cells, 'git.after').object, TAG_OBJECT);
  assert.equal(fact(cells, 'github.material').object.head_commit.id, AFTER);
  const polled = projection({ ...context(), action: 'observed', git_ref: {
    ref: event.ref, url: API + '/git/refs/tags/v1.2.3',
    object: { type: 'tag', sha: TAG_OBJECT, url: API + '/git/tags/' + TAG_OBJECT },
  } });
  assert.equal(cells.subject, polled.subject);
});

test('new provider activity replays through the existing receipt owner and native CloudEvents', async () => {
  for (const makeEvent of [releaseEvent, deploymentEvent, statusEvent, pushEvent]) {
    const receiptStore = new MemoryReceiptStore();
    let calls = 0;
    const admit = async () => ({ receiptId: 'existing-receiver:' + ++calls });
    const first = await settleGitHubEvent({ event: makeEvent(), receiptStore, admit });
    const again = await settleGitHubEvent({
      event: { ...makeEvent(), delivery_id: 'transport-redelivery' }, receiptStore, admit,
    });
    assert.equal(first.state, 'RECEIVED');
    assert.equal(again.state, 'DUPLICATE_RECEIVED');
    assert.equal(calls, 1);
    assert.deepEqual(first.sourceCells, again.sourceCells);
    assert.ok(first.sourceCells.cells.every(isCell));
    const events = gitHubCellCloudEvents(first.sourceCells);
    assert.equal(cellSetAddress(events.map(cellFromCloudEvent)), first.sourceCells.cellSetId);
    assert.deepEqual(events, gitHubCellCloudEvents(again.sourceCells));
  }
});

test('malformed activity and conflicting parent or candidate evidence refuse before any durable or transport effect', async () => {
  const badStatus = statusEvent();
  badStatus.commit.sha = BEFORE;
  const badStatusSha = statusEvent();
  badStatusSha.sha = 'symbolic-main';
  const foreignDeployment = deploymentEvent();
  foreignDeployment.deployment_status.deployment_url = 'https://api.github.com/repos/foreign/repository/deployments/801';
  const otherDeployment = deploymentEvent();
  otherDeployment.deployment_status.deployment_url = API + '/deployments/999';
  const badDeploymentSha = deploymentEvent();
  badDeploymentSha.deployment.sha = 'main';
  const zeroUpdate = pushEvent();
  zeroUpdate.after = ZERO;
  const falseDeletion = pushEvent();
  falseDeletion.deleted = true;
  const falseCreation = pushEvent();
  falseCreation.created = true;
  const badRef = pushEvent();
  badRef.ref = 'refs/heads/../main';
  const incompletePush = pushEvent();
  delete incompletePush.after;
  const unknown = { ...context(), action: 'created', discussion: { id: 999, body: 'Do not erase this object.' } };
  let effects = 0;
  const receiptStore = {
    get() { effects++; return null; }, put() { effects++; },
    claim() { effects++; return { state: 'ACQUIRED', claim: { claimId: 'unexpected' } }; },
    clearClaim() { effects++; },
  };
  for (const event of [badStatus, badStatusSha, foreignDeployment, otherDeployment,
    badDeploymentSha, zeroUpdate, falseDeletion, falseCreation, badRef, incompletePush, unknown]) {
    await assert.rejects(settleGitHubEvent({ event, receiptStore,
      admit: async () => { effects++; return { receiptId: 'unexpected' }; } }));
  }
  assert.equal(effects, 0);
});

test('provider material readmission refuses a changed revision or parent locator', async () => {
  const envelopes = [normalizeGitHubEvent(statusEvent()), normalizeGitHubEvent(deploymentEvent())];
  const status = structuredClone(envelopes[0]);
  status.source.revision = BEFORE;
  const deployment = structuredClone(envelopes[1]);
  deployment.source.parent.url = API + '/deployments/999';
  let calls = 0;
  for (const envelope of [status, deployment]) {
    await assert.rejects(settleGitHubEnvelope({ envelope, receiptStore: new MemoryReceiptStore(),
      admit: async () => { calls++; return { receiptId: 'unexpected' }; } }));
  }
  assert.equal(calls, 0);
});

test('null or incomplete release material never falls through to repository receiving', async () => {
  const malformed = [null, {}, { id: 701 }, { id: 701, tag_name: 'v1.2.3' }];
  let effects = 0;
  for (const release of malformed) {
    await assert.rejects(settleGitHubEvent({
      event: { ...releaseEvent(), release },
      receiptStore: { get() { effects++; return null; }, put() { effects++; } },
      admit: async () => { effects++; return { receiptId: 'unexpected' }; },
    }));
  }
  assert.equal(effects, 0);
});

test('release source custody uses the provider release ID and never an HTML presentation URL', () => {
  const missingHtml = releaseEvent();
  delete missingHtml.release.html_url;
  const foreignHtml = releaseEvent();
  foreignHtml.release.html_url = 'https://unrelated.example/releases/tag/v1.2.3';
  for (const event of [missingHtml, foreignHtml]) {
    const envelope = normalizeGitHubEvent(event);
    assert.equal(envelope.source.url, API + '/releases/701');
    assert.deepEqual(envelope.material, event.release);
    assert.equal(projectGitHubCells(envelope).sourceUrl, API + '/releases/701');
  }
  const foreignApi = releaseEvent();
  foreignApi.release.url = 'https://api.github.com/repos/foreign/repository/releases/701';
  assert.throws(() => normalizeGitHubEvent(foreignApi));
  const changedLocator = structuredClone(normalizeGitHubEvent(releaseEvent()));
  changedLocator.source.url = WEB;
  assert.throws(() => projectGitHubCells(changedLocator));
});

test('draft or audience-unknown releases cannot enter the public-only native Work route', async () => {
  const draft = releaseEvent();
  draft.release.draft = true;
  draft.release.published_at = null;
  draft.release.html_url = WEB + '/releases/tag/untagged-draft';
  const unknown = releaseEvent();
  delete unknown.release.draft;
  for (const [event, expected] of [[draft, 'private'], [unknown, 'unknown']]) {
    const envelope = normalizeGitHubEvent(event);
    assert.equal(envelope.source.visibility, expected);
    assert.throws(() => prepareGitHubWork({ event,
      opening: { move: 'report', observation: 'Provider material requires receiving.' },
      binding: { repositoryId: repository.id, visibility: 'public', receiver: 'github-receiving',
        scope: ['service:activity-example'], as: 'held-office' },
    }), /audience|visibility/i);
    const forged = structuredClone(envelope);
    forged.source.visibility = 'public';
    let calls = 0;
    await assert.rejects(settleGitHubEnvelope({ envelope: forged, receiptStore: new MemoryReceiptStore(),
      admit: async () => { calls++; return { receiptId: 'unexpected' }; },
    }));
    assert.equal(calls, 0);
  }
});

test('deployment parent ref and environment retain unknowns but refuse nontext values', () => {
  for (const key of ['ref', 'environment']) {
    for (const value of ['', '   ', 0, {}, []]) {
      const event = deploymentEvent();
      event.deployment[key] = value;
      assert.throws(() => normalizeGitHubEvent(event));
    }
    for (const value of [null, undefined]) {
      const event = deploymentEvent();
      if (value === undefined) delete event.deployment[key];
      else event.deployment[key] = value;
      assert.equal(normalizeGitHubEvent(event).source.parent[key], null);
    }
  }
});

test('deployment-status environment uses its own observation and never inherits the parent implicitly', () => {
  const override = deploymentEvent();
  override.deployment.environment = 'staging';
  override.deployment_status.environment = 'production';
  const envelope = normalizeGitHubEvent(override);
  assert.equal(envelope.source.parent.environment, 'staging');
  assert.equal(envelope.material.environment, 'production');
  assert.equal(fact(projectGitHubCells(envelope), 'github.deployment-environment').object, 'production');
  for (const value of [null, undefined]) {
    const event = deploymentEvent();
    event.deployment.environment = 'staging';
    if (value === undefined) delete event.deployment_status.environment;
    else event.deployment_status.environment = value;
    const source = normalizeGitHubEvent(event);
    assert.equal(source.source.parent.environment, 'staging');
    assert.equal(projectGitHubCells(source).cells.some(at => at.predicate === 'github.deployment-environment'), false);
  }
});

test('supplied deployment-status environment must be nonempty text before any receiving effect', async () => {
  let effects = 0;
  for (const value of ['', '   ', 0, false, {}, []]) {
    const event = deploymentEvent();
    event.deployment_status.environment = value;
    await assert.rejects(settleGitHubEvent({ event,
      receiptStore: { get() { effects++; return null; }, put() { effects++; } },
      admit: async () => { effects++; return { receiptId: 'unexpected' }; },
    }));
  }
  assert.equal(effects, 0);
});

test('a genuine repository observation remains supported and unsupported activity is never relabeled as it', () => {
  const repoOnly = normalizeGitHubEvent({ ...context(), action: 'observed' });
  assert.equal(repoOnly.source.objectType, 'repository');
  assert.deepEqual(repoOnly.material, repository);
  for (const property of ['discussion', 'release_asset', 'security_advisory', 'deployment_protection_rule']) {
    assert.throws(() => normalizeGitHubEvent({ ...context(), action: 'created', [property]: { id: 999 } }));
  }
});

test('all four activity families reach the existing native Work reader and replay one original thread', async () => {
  for (const makeEvent of [releaseEvent, deploymentEvent, statusEvent, pushEvent]) {
    const event = makeEvent();
    const request = {
      event,
      opening: {
        move: 'report', observation: 'The original provider activity needs operational receiving.',
        context: 'Source observation alone establishes no implementation or customer acceptance.',
      },
      binding: {
        repositoryId: repository.id, visibility: 'public', receiver: 'github-receiving',
        scope: ['service:activity-example'], as: 'held-office',
      },
    };
    const prepared = prepareGitHubWork(request);
    let actual, opens = 0;
    const call = async (verb, input) => {
      if (verb === 'work-open') {
        opens++;
        actual = {
          id: 'original-native-work:' + prepared.envelope.source.objectType,
          opening: { ...structuredClone(input), by: 'held-office' },
          home: 'github-receiving', standing: 'open', deliveries: [],
        };
        return { id: actual.id };
      }
      assert.equal(verb, 'work-board');
      if (input.source && actual)
        assert.ok(actual.opening.sources.some(source => source.locator === input.source));
      if (input.thread) assert.equal(input.thread, actual.id);
      return { position: 'original-board-position', threads: actual ? [actual] : [], matched: actual ? 1 : 0 };
    };
    const first = await receivePreparedGitHubWork({ prepared, call });
    assert.equal(first.state, 'NATIVE_RECEIVED');
    assert.equal(first.replay, false);
    assert.equal(first.stages.sourceRetained, true);
    assert.equal(first.stages.routed, true);
    assert.equal(first.stages.allocated, false);
    assert.equal(first.stages.implemented, false);
    assert.equal(first.stages.accepted, false);
    assert.equal(first.sourceCells.kind, 'github.source-cells.v1');
    assert.equal(first.workCells.subject, actual.id);
    boolean(first.workCells, 'work.customer-accepted', [false, false]);
    const retained = actual.opening.sources.find(source => source.kind === 'github-source-document');
    assert.deepEqual(readGitHubSourceDocument(retained).material, prepared.envelope.material);

    const retried = prepareGitHubWork({ ...request, event: { ...makeEvent(), delivery_id: 'native-redelivery' } });
    const replay = await receivePreparedGitHubWork({ prepared: retried, call });
    assert.equal(opens, 1);
    assert.equal(replay.replay, true);
    assert.equal(replay.thread, first.thread);
    assert.equal(replay.sourceDocument, first.sourceDocument);
    assert.deepEqual(replay.sourceCells, first.sourceCells);
    assert.deepEqual(replay.workCells, first.workCells);
    const observed = await readPreparedGitHubWork({ prepared: retried, call: async (verb, input) => {
      assert.equal(verb, 'work-board', 'read-only recovery never opens work');
      return call(verb, input);
    } });
    assert.equal(observed.thread, first.thread);
    assert.equal(observed.stages.accepted, false);
  }
});
