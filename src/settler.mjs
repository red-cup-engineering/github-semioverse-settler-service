import { createHash } from 'node:crypto';
import { assertGitHubEnvelope, canonicalGitHubValue as canonical, revisionFor, objectIdentityFor } from './github-envelope.mjs';
import { projectGitHubCells } from './github-cells.mjs';

const REQUIRED = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value.trim();
};

const objectFor = (event) => {
  // Comments and reviews are distinct provider objects even when the webhook
  // includes their parent issue or PR. Selecting the parent loses their identity.
  if (event.comment) return [event.pull_request ? 'pull_request_review_comment' : 'issue_comment', event.comment];
  if (event.review) return ['review', event.review];
  if (event.pull_request) return ['pull_request', event.pull_request];
  if (event.issue) return ['issue', event.issue];
  if (event.workflow_run) return ['workflow_run', event.workflow_run];
  if (event.check_run) return ['check_run', event.check_run];
  if (event.check_suite) return ['check_suite', event.check_suite];
  if (event.merge_group) return ['merge_group', event.merge_group];
  if (event.deployment) return ['deployment', event.deployment];
  if (event.repository) return ['repository', event.repository];
  throw new TypeError('unsupported GitHub event object');
};

// Reuse the normalizer's canonical byte ordering for CloudEvent source identity.
export { canonical as canonicalGitHubValue };

/** Provider bytes are evidence, never an office appointment or an execution grant. */
function submissionOf(body) {
  if (typeof body !== 'string') return null;
  const fields = {};
  for (const match of body.matchAll(/^### ([^\n]+)\n+([\s\S]*?)(?=^### |$(?![\s\S]))/gm)) {
    const value = match[2].trim();
    if (value && value !== '_No response_') fields[match[1].trim()] = value;
  }
  const kind = fields['Submission type'];
  if (!['Issue', 'Complaint', 'Requirement', 'Idea', 'Question'].includes(kind)) return null;
  return Object.freeze({
    kind: kind.toLowerCase(),
    affected: fields['Affected service or resource'] ?? null,
    need: fields['What happened or what do you need?'] ?? null,
    conditions: fields['What would a satisfactory outcome look like?'] ?? null,
    evidence: fields['Context and evidence'] ?? null,
    urgency: fields['Urgency'] ?? null,
  });
}

// Source text declares proposed work coordinates, not institutional authority.
// Only an initial scalar-key preamble or complete YAML frontmatter can carry them.
// Code samples, quoted speech and paragraphs remain locutions, never routing data.
function machineFields(body = '') {
  if (typeof body !== 'string') return {};
  const wanted = new Set([
    'work_ref','correlation','causal_parents','canonical_receiver','owner','owning_office',
    'effect_class','receiver','acceptance_test','handoff_epoch','lease','visibility_class','sync_back'
  ]);
  const lines = body.replace(/^\uFEFF/u, '').split(/\r?\n/u);
  const frontmatter = lines[0]?.trim() === '---';
  let candidates;
  if (frontmatter) {
    const closing = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)$/u.test(line.trim()));
    if (closing === -1) return {}; // incomplete YAML cannot certify a declaration
    candidates = lines.slice(1, closing);
  } else {
    candidates = [];
    for (const line of lines) {
      if (!line.trim()) { candidates.push(line); continue; }
      if (!/^[A-Za-z0-9_-]+:[ \t]*.*$/u.test(line)) break;
      candidates.push(line);
    }
  }
  const observed = new Map();
  for (const line of candidates) {
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*?)[ \t]*$/u.exec(line);
    if (!match) continue; // nested YAML and multiline values are not root-level scalars
    const key = match[1].toLowerCase().replaceAll('-', '_');
    const value = match[2].trim();
    // This is an intentionally narrow scalar reader, not a YAML parser.
    // Quoted, composite, folded or commented syntax needs a qualified codec.
    if (!wanted.has(key) || !value || value === '|' || value === '>' ||
        ['"', "'", '[', '{'].some(marker => value.startsWith(marker)) || /[ \t]#/u.test(value)) continue;
    if (!observed.has(key)) observed.set(key, value);
    else if (observed.get(key) !== value) observed.set(key, null);
  }
  const out = Object.fromEntries([...observed].filter(([, value]) => value !== null));
  // Distinct declarations of an owner and owning office are competing testimony,
  // not grounds for selecting whichever spelling happens to take precedence.
  if (out.owner && out.owning_office && out.owner !== out.owning_office) {
    delete out.owner;
    delete out.owning_office;
  }
  return out;
}

export function normalizeGitHubEvent(event) {
  if (!event || typeof event !== 'object') throw new TypeError('event is required');
  const repo = event.repository;
  if (!repo || !Number.isSafeInteger(repo.id) || repo.id <= 0 || typeof repo.full_name !== 'string' || !repo.full_name.trim()) {
    throw new TypeError('repository.id and repository.full_name are required');
  }
  const [objectType, object] = objectFor(event);
  const objectId = objectIdentityFor(objectType, object);
  if (objectId === undefined || objectId === null || !String(objectId).trim()) throw new TypeError('provider object identity is required');
  const revision = revisionFor(objectType, object, event);
  if (revision === undefined || revision === null) throw new TypeError('provider revision is required');
  const action = REQUIRED(event.action ?? 'observed', 'action');
  const providerObjectKey = `github:repo:${repo.id}:${objectType}:${objectId}`;
  // A PR's exact head is necessary evidence, but does not distinguish reviews,
  // body edits, or re-run workflows on the same head. Delivery IDs are transport
  // coordinates and are deliberately excluded from the material commitment.
  const material = structuredClone(object);
  const materialIdentity = `ni:///sha-256;${createHash('sha256').update(JSON.stringify(canonical(material))).digest('base64url')}`;
  const eventKey = `${providerObjectKey}:revision:${String(revision)}:action:${action}:material:${materialIdentity}`;
  const body = object.body ?? '';
  const fields = machineFields(body);
  const occurredAt = object.updated_at ?? object.submitted_at ?? object.created_at ?? event.occurred_at ?? null;
  const parent = event.comment || event.review ? event.pull_request ?? event.issue : null;

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
      actorId: event.sender?.node_id ?? event.sender?.id ?? null,
      author: object.user?.login ?? null,
      authorId: object.user?.node_id ?? object.user?.id ?? null,
      visibility: repo.private === true ? 'private' : repo.private === false ? 'public' : 'unknown',
      occurredAt,
      deliveryId: event.delivery_id ?? null,
      url: object.html_url ?? repo.html_url ?? null,
      ...(parent ? { parent: Object.freeze({
        objectType: event.pull_request || parent.pull_request ? 'pull_request' : 'issue',
        objectId: String(parent.node_id ?? parent.id ?? parent.number),
        objectNumber: parent.number ?? null,
        url: parent.html_url ?? null,
        headSha: parent.head?.sha ?? null,
      }) } : {}),
    }),
    materialIdentity,
    material: Object.freeze(material),
    submission: submissionOf(body),
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
const pendingOutcome = (claim, transport) => Object.freeze({ kind: 'PENDING', claim,
  ...(transport === undefined ? {} : { transport }) });

function exposedResult(state, envelope, outcome, sourceCells) {
  if (outcome.kind === 'PENDING') {
    return Object.freeze({
      state: 'PENDING_RECEIVER_READBACK',
      envelope,
      sourceCells,
      claim: outcome.claim,
      ...(outcome.transport === undefined ? {} : { transport: outcome.transport }),
    });
  }
  return Object.freeze({ state, envelope, sourceCells, receipt: outcome.receipt });
}

export async function settleGitHubEvent({ event, receiptStore, admit }) {
  return settleGitHubEnvelope({ envelope: normalizeGitHubEvent(event), receiptStore, admit });
}

/** Provider snapshot already normalized by the GitHub poller.
 * Reuse the webhook intake's durable event-key receipts and claim handling. */
export async function settleGitHubEnvelope({ envelope, receiptStore, admit }) {
  envelope = assertGitHubEnvelope(envelope);
  // Qualify the native representation before any durable claim or transport.
  const sourceCells = projectGitHubCells(envelope);
  if (!receiptStore || typeof receiptStore.get !== 'function' || typeof receiptStore.put !== 'function') {
    throw new TypeError('receiptStore get/put interface is required');
  }
  if (typeof admit !== 'function') throw new TypeError('admit function is required');
  // HTTP and signed Actor ports bind their own complete source CloudEvent
  // receipt identities. Custom ports retain their original event-key fallback.
  // Old metadata-only receipts never prove newly qualified source receiving.
  const receiptKey = typeof admit.receiptKey === 'function'
    ? admit.receiptKey(envelope) : envelope.eventKey;
  if (typeof receiptKey !== 'string' || receiptKey.length > 2048 || !receiptKey)
    throw new TypeError('Semioverse receipt identity must be bounded nonempty text');
  if (admit.requiresDurableClaim === true &&
      !/^activitypub:github-delta:ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u.test(receiptKey))
    throw new TypeError('signed Actor receipt identity must name the exact source CloudEvent NI');
  const existing = receiptStore.get(receiptKey);
  if (existing) {
    clearSettledClaim(receiptStore, receiptKey);
    return Object.freeze({ state: 'DUPLICATE_RECEIVED', envelope, sourceCells, receipt: existing });
  }

  const inflight = inflightFor(receiptStore);
  const pending = inflight.get(receiptKey);
  if (pending !== undefined) {
    const outcome = await pending;
    return exposedResult('DUPLICATE_RECEIVED', envelope, outcome, sourceCells);
  }

  const durableClaims = hasDurableClaimInterface(receiptStore);
  // A signed ActivityPub delivery is an uncertain effect until the real
  // receiver's native arrival/Work readback is observed. It cannot run
  // without a durable pre-effect claim; in-memory coalescing is not enough.
  if (admit.requiresDurableClaim === true && !durableClaims)
    throw new TypeError('Actor submission requires a durable receiver-readback claim before delivery');
  if (typeof admit.preflight === 'function') {
    const preflight = admit.preflight(envelope);
    if (preflight && typeof preflight.then === 'function')
      throw new TypeError('Actor representation preflight must complete before an effect claim');
  }
  const admission = (async () => {
    let claim = null;
    if (durableClaims) {
      const claimResult = receiptStore.claim(receiptKey);
      if (!claimResult || (claimResult.state !== 'ACQUIRED' && claimResult.state !== 'EXISTS')) {
        throw new Error('receiptStore claim must return ACQUIRED or EXISTS');
      }
      if (claimResult.state === 'EXISTS') {
        const racedReceipt = receiptStore.get(receiptKey);
        if (racedReceipt) {
          clearSettledClaim(receiptStore, receiptKey);
          return receiptOutcome(racedReceipt);
        }
        return pendingOutcome(claimResult.claim);
      }
      claim = claimResult.claim;
    }

    const received = await admit(envelope);
    if (received?.kind === 'semioverse.github.actor-transport-pending.v1') {
      if (!durableClaims || claim === null || received.state !== 'PENDING_RECEIVER_READBACK' ||
          received.eventKey !== envelope.eventKey ||
          typeof received.sourceCloudEventId !== 'string' ||
          !/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u.test(received.sourceCloudEventId) ||
          receiptKey !== 'activitypub:github-delta:' + received.sourceCloudEventId ||
          typeof received.activityId !== 'string' || !received.activityId ||
          typeof received.senderActor !== 'string' || !received.senderActor ||
          typeof received.recipientActor !== 'string' || !received.recipientActor)
        throw new TypeError('signed Actor delivery is not a qualified pending readback');
      // Deliberately do NOT clear the durable claim or publish a receipt.
      // The source event remains pending until a separately evidenced
      // receiver-local admission resolves the existing claim.
      return pendingOutcome(claim, received);
    }
    if (admit.requiresDurableClaim === true)
      throw new TypeError('Actor transport cannot manufacture a Semioverse receipt');
    const receipt = checkedReceipt(received);
    try {
      receiptStore.put(receiptKey, receipt);
    } catch (error) {
      const racedReceipt = receiptStore.get(receiptKey);
      if (!racedReceipt) throw error;
    }
    const stored = receiptStore.get(receiptKey);
    if (!stored) throw new Error('Semioverse receipt was not durable after admission');

    if (claim !== null) {
      receiptStore.clearClaim(receiptKey, claim.claimId);
    }
    return receiptOutcome(stored);
  })();

  inflight.set(receiptKey, admission);
  try {
    const outcome = await admission;
    return exposedResult('RECEIVED', envelope, outcome, sourceCells);
  } finally {
    if (inflight.get(receiptKey) === admission) inflight.delete(receiptKey);
  }
}
