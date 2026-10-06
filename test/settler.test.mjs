import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryReceiptStore, normalizeGitHubEvent, settleGitHubEvent } from '../src/settler.mjs';

const issueEvent = (overrides = {}) => ({
  action: 'edited',
  delivery_id: 'delivery-1',
  repository: { id: 561, full_name: 'red-cup-engineering/git-services-section', html_url: 'https://github.com/red-cup-engineering/git-services-section' },
  sender: { login: 'agent' },
  issue: {
    id: 99,
    node_id: 'I_99',
    number: 1,
    updated_at: '2026-10-06T04:00:00Z',
    html_url: 'https://github.com/red-cup-engineering/git-services-section/issues/1',
    body: 'work_ref: git-semioverse-sync-v1\ncanonical_receiver: Semioverse\nreceiver: red-cup-engineering/git-services-section#1\nacceptance_test: receipt+idempotent replay\n',
  },
  ...overrides,
});

test('normalizes provider identity independently of repository name', () => {
  const a = normalizeGitHubEvent(issueEvent());
  const b = normalizeGitHubEvent(issueEvent({ repository: { id: 561, full_name: 'red-cup-engineering/renamed-git-services-section' } }));
  assert.equal(a.providerObjectKey, b.providerObjectKey);
  assert.equal(a.work.workRef, 'git-semioverse-sync-v1');
  assert.equal(a.work.canonicalReceiver, 'Semioverse');
});

test('unchanged replay is idempotent and does not call admit twice', async () => {
  const store = new MemoryReceiptStore();
  let calls = 0;
  const admit = async (envelope) => ({ receiptId: `semioverse:${++calls}`, eventKey: envelope.eventKey });
  const first = await settleGitHubEvent({ event: issueEvent(), receiptStore: store, admit });
  const replay = await settleGitHubEvent({ event: issueEvent(), receiptStore: store, admit });
  assert.equal(first.state, 'RECEIVED');
  assert.equal(replay.state, 'DUPLICATE_RECEIVED');
  assert.equal(calls, 1);
  assert.equal(replay.receipt.receiptId, first.receipt.receiptId);
});

test('concurrent unchanged replay coalesces to one admission in one settler process', async () => {
  const store = new MemoryReceiptStore();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const admit = async (envelope) => {
    calls += 1;
    await gate;
    return { receiptId: 'semioverse:coalesced', eventKey: envelope.eventKey };
  };

  const first = settleGitHubEvent({ event: issueEvent(), receiptStore: store, admit });
  const replay = settleGitHubEvent({ event: issueEvent(), receiptStore: store, admit });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release();

  const results = await Promise.all([first, replay]);
  assert.deepEqual(results.map((result) => result.state).sort(), ['DUPLICATE_RECEIVED', 'RECEIVED']);
  assert.equal(results[0].receipt.receiptId, results[1].receipt.receiptId);
});

test('later provider revision advances the same object identity with a new event identity', async () => {
  const store = new MemoryReceiptStore();
  let calls = 0;
  const admit = async () => ({ receiptId: `r${++calls}` });
  const first = issueEvent();
  const second = issueEvent({ issue: { ...issueEvent().issue, updated_at: '2026-10-06T04:01:00Z' } });
  const a = await settleGitHubEvent({ event: first, receiptStore: store, admit });
  const b = await settleGitHubEvent({ event: second, receiptStore: store, admit });
  assert.equal(a.envelope.providerObjectKey, b.envelope.providerObjectKey);
  assert.notEqual(a.envelope.eventKey, b.envelope.eventKey);
  assert.equal(calls, 2);
});

test('pull request revision binds exact head SHA', () => {
  const event = {
    action: 'synchronize',
    repository: { id: 561, full_name: 'red-cup-engineering/git-services-section' },
    pull_request: { id: 7, node_id: 'PR_7', number: 2, head: { sha: 'abc123' }, body: 'work_ref: spaces-ingress' },
  };
  const envelope = normalizeGitHubEvent(event);
  assert.equal(envelope.source.revision, 'abc123');
  assert.match(envelope.eventKey, /abc123/);
});

test('distinct comments on one issue retain their identity, author, material, and parent', async () => {
  const store = new MemoryReceiptStore();
  let admissions = 0;
  const event = issueEvent({ repository: { id: 561, full_name: '561-group/private-service', private: true },
    comment: { node_id: 'IC_1', body: 'This exposes client data', user: { login: 'client', id: 12 },
      updated_at: '2026-10-06T04:02:00Z' } });
  const admit = async () => ({ receiptId: `r${++admissions}` });
  const first = await settleGitHubEvent({ event, receiptStore: store, admit });
  const second = await settleGitHubEvent({ event: { ...event, comment: { ...event.comment, node_id: 'IC_2' } }, receiptStore: store, admit });
  assert.equal(admissions, 2);
  assert.notEqual(first.envelope.providerObjectKey, second.envelope.providerObjectKey);
  assert.equal(first.envelope.source.objectType, 'issue_comment');
  assert.equal(first.envelope.source.author, 'client');
  assert.equal(first.envelope.source.actor, 'agent');
  assert.equal(first.envelope.source.visibility, 'private');
  assert.equal(first.envelope.source.parent.objectId, 'I_99');
  assert.equal(first.envelope.material.body, 'This exposes client data');
  assert.match(first.envelope.materialIdentity, /^ni:\/\/\/sha-256;/u);
});

test('a review is not collapsed into the pull request carrying it', () => {
  const envelope = normalizeGitHubEvent(issueEvent({ issue: undefined,
    pull_request: { node_id: 'PR_7', number: 2, head: { sha: 'abc123' } },
    review: { node_id: 'PRR_1', body: 'The requirement is unmet', state: 'CHANGES_REQUESTED',
      submitted_at: '2026-10-06T04:03:00Z', user: { login: 'receiver' } } }));
  assert.equal(envelope.source.objectType, 'review');
  assert.equal(envelope.source.objectId, 'PRR_1');
  assert.equal(envelope.source.parent.headSha, 'abc123');
  assert.equal(envelope.source.occurredAt, '2026-10-06T04:03:00Z');
  assert.equal(envelope.material.state, 'CHANGES_REQUESTED');
});

test('PR body changes at the same head and issue changes in the same second remain distinct', () => {
  const issue = issueEvent();
  const changedIssue = { ...issue, issue: { ...issue.issue, body: 'A revised requirement' } };
  assert.notEqual(normalizeGitHubEvent(issue).eventKey, normalizeGitHubEvent(changedIssue).eventKey);
  const pull = { ...issue, issue: undefined, pull_request: { node_id: 'PR_7', head: { sha: 'abc123' }, body: 'Before' } };
  const changedPull = { ...pull, pull_request: { ...pull.pull_request, body: 'After' } };
  assert.equal(normalizeGitHubEvent(pull).source.revision, 'abc123');
  assert.notEqual(normalizeGitHubEvent(pull).eventKey, normalizeGitHubEvent(changedPull).eventKey);
});

test('delivery retries and JSON property order do not create extra material revisions', () => {
  const event = issueEvent();
  const reordered = { ...event, delivery_id: 'retry', issue: Object.fromEntries(Object.entries(event.issue).reverse()) };
  assert.equal(normalizeGitHubEvent(event).eventKey, normalizeGitHubEvent(reordered).eventKey);
});

test('the public filing form preserves a complaint and its conditions without assigning authority', () => {
  const body = '### Submission type\n\nComplaint\n\n### Affected service or resource\n\nThe public site\n\n### What happened or what do you need?\n\nThe form lost my report\n\n### What would a satisfactory outcome look like?\n\nI can see my original report and its outcome\n\n### Context and evidence\n\n_No response_\n\n### Urgency\n\nWork is blocked\n';
  const envelope = normalizeGitHubEvent(issueEvent({ issue: { ...issueEvent().issue, title: 'Lost report', body, user: { login: 'requester' } } }));
  assert.equal(envelope.submission.kind, 'complaint');
  assert.equal(envelope.submission.conditions, 'I can see my original report and its outcome');
  assert.equal(envelope.submission.urgency, 'Work is blocked');
  assert.equal(envelope.submission.evidence, null);
  assert.equal(envelope.material.body, body);
  assert.equal(envelope.work.owner, null);
  assert.equal(envelope.work.canonicalReceiver, null);
});
