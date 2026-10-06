const REQUIRED = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value.trim();
};

const objectFor = (event) => {
  if (event.pull_request) return ['pull_request', event.pull_request];
  if (event.issue) return ['issue', event.issue];
  if (event.workflow_run) return ['workflow_run', event.workflow_run];
  if (event.review) return ['review', event.review];
  if (event.deployment) return ['deployment', event.deployment];
  if (event.repository) return ['repository', event.repository];
  throw new TypeError('unsupported GitHub event object');
};

function machineFields(body = '') {
  if (typeof body !== 'string') return {};
  const wanted = new Set([
    'work_ref','correlation','causal_parents','canonical_receiver','owner','owning_office',
    'effect_class','receiver','acceptance_test','handoff_epoch','lease','visibility_class','sync_back'
  ]);
  const out = {};
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase().replaceAll('-', '_');
    if (wanted.has(key) && match[2] !== '') out[key] = match[2];
  }
  return out;
}

const revisionFor = (type, object, event) => {
  if (type === 'pull_request') return object.head?.sha ?? object.updated_at ?? event.delivery_id;
  if (type === 'workflow_run') return object.head_sha ?? object.updated_at ?? event.delivery_id;
  return object.updated_at ?? object.sha ?? event.delivery_id;
};

export function normalizeGitHubEvent(event) {
  if (!event || typeof event !== 'object') throw new TypeError('event is required');
  const repo = event.repository;
  if (!repo || !Number.isInteger(repo.id) || typeof repo.full_name !== 'string') {
    throw new TypeError('repository.id and repository.full_name are required');
  }
  const [objectType, object] = objectFor(event);
  const objectId = object.node_id ?? object.id ?? object.number;
  if (objectId === undefined || objectId === null) throw new TypeError('provider object identity is required');
  const revision = revisionFor(objectType, object, event);
  if (revision === undefined || revision === null) throw new TypeError('provider revision is required');
  const action = REQUIRED(event.action ?? 'observed', 'action');
  const providerObjectKey = `github:repo:${repo.id}:${objectType}:${objectId}`;
  const eventKey = `${providerObjectKey}:revision:${String(revision)}:action:${action}`;
  const body = object.body ?? '';
  const fields = machineFields(body);
  const occurredAt = object.updated_at ?? object.created_at ?? event.occurred_at ?? null;

  return Object.freeze({
    schema: 'semioverse.github-delta.v1',
    provider: 'github',
    providerObjectKey,
    eventKey,
    action,
    source: Object.freeze({
      repositoryId: repo.id,
      repositoryFullName: repo.full_name,
      objectType,
      objectId: String(objectId),
      objectNumber: Number.isInteger(object.number) ? object.number : null,
      revision: String(revision),
      actor: event.sender?.login ?? null,
      occurredAt,
      deliveryId: event.delivery_id ?? null,
      url: object.html_url ?? repo.html_url ?? null,
    }),
    work: Object.freeze({
      workRef: fields.work_ref ?? null,
      correlation: fields.correlation ?? null,
      causalParents: fields.causal_parents ?? null,
      owner: fields.owning_office ?? fields.owner ?? null,
      effectClass: fields.effect_class ?? null,
      canonicalReceiver: fields.canonical_receiver ?? null,
      receiver: fields.receiver ?? null,
      acceptanceTest: fields.acceptance_test ?? null,
      handoffEpoch: fields.handoff_epoch ?? null,
      lease: fields.lease ?? null,
      visibilityClass: fields.visibility_class ?? null,
      syncBack: fields.sync_back ?? null,
    })
  });
}

export class MemoryReceiptStore {
  #map = new Map();
  get(eventKey) { return this.#map.get(eventKey) ?? null; }
  put(eventKey, receipt) {
    if (this.#map.has(eventKey)) throw new Error('receipt already exists for eventKey');
    this.#map.set(eventKey, Object.freeze({ ...receipt }));
  }
}

const inflightByReceiptStore = new WeakMap();

function inflightFor(receiptStore) {
  let inflight = inflightByReceiptStore.get(receiptStore);
  if (inflight === undefined) {
    inflight = new Map();
    inflightByReceiptStore.set(receiptStore, inflight);
  }
  return inflight;
}

function checkedReceipt(receipt) {
  if (!receipt || typeof receipt.receiptId !== 'string' || receipt.receiptId.trim() === '') {
    throw new Error('Semioverse admission must return receiptId');
  }
  return receipt;
}

function hasDurableClaimInterface(receiptStore) {
  const claim = typeof receiptStore.claim === 'function';
  const clearClaim = typeof receiptStore.clearClaim === 'function';
  if (claim !== clearClaim) {
    throw new TypeError('receiptStore durable claim interface requires claim and clearClaim together');
  }
  return claim;
}

function clearSettledClaim(receiptStore, eventKey) {
  if (typeof receiptStore.getClaim !== 'function' || typeof receiptStore.clearClaim !== 'function') return;
  const claim = receiptStore.getClaim(eventKey);
  if (claim?.claimId) receiptStore.clearClaim(eventKey, claim.claimId);
}

const receiptOutcome = (receipt) => Object.freeze({ kind: 'RECEIPT', receipt });
const pendingOutcome = (claim) => Object.freeze({ kind: 'PENDING', claim });

function exposedResult(state, envelope, outcome) {
  if (outcome.kind === 'PENDING') {
    return Object.freeze({
      state: 'PENDING_RECEIVER_READBACK',
      envelope,
      claim: outcome.claim,
    });
  }
  return Object.freeze({ state, envelope, receipt: outcome.receipt });
}

export async function settleGitHubEvent({ event, receiptStore, admit }) {
  if (!receiptStore || typeof receiptStore.get !== 'function' || typeof receiptStore.put !== 'function') {
    throw new TypeError('receiptStore get/put interface is required');
  }
  if (typeof admit !== 'function') throw new TypeError('admit function is required');
  const envelope = normalizeGitHubEvent(event);
  const existing = receiptStore.get(envelope.eventKey);
  if (existing) {
    clearSettledClaim(receiptStore, envelope.eventKey);
    return Object.freeze({ state: 'DUPLICATE_RECEIVED', envelope, receipt: existing });
  }

  const inflight = inflightFor(receiptStore);
  const pending = inflight.get(envelope.eventKey);
  if (pending !== undefined) {
    const outcome = await pending;
    return exposedResult('DUPLICATE_RECEIVED', envelope, outcome);
  }

  const durableClaims = hasDurableClaimInterface(receiptStore);
  const admission = (async () => {
    let claim = null;
    if (durableClaims) {
      const claimResult = receiptStore.claim(envelope.eventKey);
      if (!claimResult || (claimResult.state !== 'ACQUIRED' && claimResult.state !== 'EXISTS')) {
        throw new Error('receiptStore claim must return ACQUIRED or EXISTS');
      }
      if (claimResult.state === 'EXISTS') {
        const racedReceipt = receiptStore.get(envelope.eventKey);
        if (racedReceipt) {
          clearSettledClaim(receiptStore, envelope.eventKey);
          return receiptOutcome(racedReceipt);
        }
        return pendingOutcome(claimResult.claim);
      }
      claim = claimResult.claim;
    }

    const receipt = checkedReceipt(await admit(envelope));
    try {
      receiptStore.put(envelope.eventKey, receipt);
    } catch (error) {
      const racedReceipt = receiptStore.get(envelope.eventKey);
      if (!racedReceipt) throw error;
    }
    const stored = receiptStore.get(envelope.eventKey);
    if (!stored) throw new Error('Semioverse receipt was not durable after admission');

    if (claim !== null) {
      receiptStore.clearClaim(envelope.eventKey, claim.claimId);
    }
    return receiptOutcome(stored);
  })();

  inflight.set(envelope.eventKey, admission);
  try {
    const outcome = await admission;
    return exposedResult('RECEIVED', envelope, outcome);
  } finally {
    if (inflight.get(envelope.eventKey) === admission) inflight.delete(envelope.eventKey);
  }
}
