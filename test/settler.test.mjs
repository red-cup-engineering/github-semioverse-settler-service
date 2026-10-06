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
