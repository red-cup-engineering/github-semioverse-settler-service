import { createHash } from 'node:crypto';
import { normalizeGitHubEvent } from './settler.mjs';

const MEDIA = 'data:application/json;base64,';
const MAX_MATERIAL_BYTES = 256 * 1024;
const identityOf = bytes => `ni:///sha-256;${createHash('sha256').update(bytes).digest('base64url')}`;
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

// Delivery identity belongs to transport. Every other observation field,
// including material, author, observing actor and visibility, still participates.
function observationForReplay(envelope) {
  const { deliveryId, ...source } = envelope.source ?? {};
  return { ...envelope, source };
}

function retainedReplayDocument(opening, input, envelope) {
  for (const document of opening?.sources ?? []) {
    if (document.kind !== 'github-source-document') continue;
    const recorded = readGitHubSourceDocument(document);
    if (!equal(observationForReplay(recorded), observationForReplay(envelope))) continue;
    const expected = { ...input, sources: input.sources.map(source =>
      source.kind === 'github-source-document' ? document : source) };
    // Leave interpretation and scope comparison to the same normalization as
    // exact replay. Reuse the recorded carrier; never rewrite its bytes or NI.
    if (Object.entries(expected).filter(([key]) => key !== 'as')
      .every(([key, value]) => equal(opening[key], value))) return Object.freeze({ ...document });
  }
  return undefined;
}

/** Self-contained source document: the native journal retains the evidence itself.
 * A commitment and a mutable GitHub URL alone cannot recover an earlier edit. */
export function gitHubSourceDocument(envelope) {
  const bytes = Buffer.from(JSON.stringify(envelope));
  if (bytes.length > MAX_MATERIAL_BYTES) throw new RangeError('GitHub source document exceeds 256 KiB');
  return Object.freeze({ kind: 'github-source-document', locator: MEDIA + bytes.toString('base64'), commitment: identityOf(bytes) });
}

export function readGitHubSourceDocument(source) {
  if (source?.kind !== 'github-source-document' || !source.locator?.startsWith(MEDIA)) throw new TypeError('not a GitHub source document');
  if (source.locator.length > MEDIA.length + 4 * Math.ceil(MAX_MATERIAL_BYTES / 3)) throw new RangeError('GitHub source document exceeds 256 KiB');
  const encoded = source.locator.slice(MEDIA.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_MATERIAL_BYTES || bytes.toString('base64') !== encoded) throw new TypeError('invalid source document encoding');
  if (identityOf(bytes) !== source.commitment) throw new Error('source document commitment mismatch');
  const envelope = JSON.parse(bytes.toString('utf8'));
  if (envelope.schema !== 'semioverse.github-delta.v1') throw new TypeError('unsupported source document');
  return envelope;
}

/** One explicitly interpreted source -> one native opening -> exact native readback.
 * call is the authenticated installed operation port, not a journal-writing adapter.
 * binding comes from verified custody/territory, never fields in GitHub prose.
 * Native law validates the opening, authority and receiving home. */
export function prepareGitHubWork({ event, opening, binding }) {
  const envelope = normalizeGitHubEvent(event);
  if (!binding || binding.repositoryId !== envelope.source.repositoryId) throw new Error('selected repository identity does not match the source');
  // The installed public board does not demonstrate a private receiving audience.
  if (binding.visibility !== 'public' || envelope.source.visibility !== 'public') throw new Error('private or unknown source audience is not verified for this receiving route');
  if (!Array.isArray(binding.scope) || binding.scope.length === 0 || typeof binding.receiver !== 'string' || !binding.receiver) throw new TypeError('verified native scope and receiving enterprise are required');
  if (!opening || !['aim', 'request', 'propose', 'report', 'ask'].includes(opening.move)) throw new TypeError('an explicitly interpreted native opening is required');
  for (const field of ['by', 'hand', 'at', 'id', 'officeService', 'scope', 'sources', 'as']) {
    if (Object.hasOwn(opening, field)) throw new TypeError(`source interpretation cannot supply ${field}`);
  }
  if (typeof envelope.source.url !== 'string' || !envelope.source.url.startsWith('https://github.com/')) throw new TypeError('original GitHub locator is required');
  const document = gitHubSourceDocument(envelope);
  const input = {
    ...structuredClone(opening),
    ...(binding.as === undefined ? {} : { as: binding.as }),
    scope: [...binding.scope],
    sources: [
      { kind: `github-${envelope.source.objectType.replaceAll('_', '-')}`, locator: envelope.source.url, commitment: envelope.materialIdentity },
      document,
    ],
  };
  return Object.freeze({ envelope, document, input, receiver: binding.receiver });
}

/** The effectful part has no filesystem, credentials, receipt map or provider SDK.
 * It can run in the same authenticated client that supplied the source binding. */
export async function receivePreparedGitHubWork({ prepared, call }) {
  if (typeof call !== 'function') throw new TypeError('authenticated native operation port is required');
  const { envelope, document, input, receiver } = prepared;
  // Compare the immutable offered snapshot, not nested objects a caller might
  // have mutated after prepareGitHubWork captured the source document.
  const offeredObservation = readGitHubSourceDocument(document);
  let known;
  let retainedDocument = document;
  let after;
  let position;
  const seen = new Set();
  // The board's own source index is the receiving map. No independent cursor,
  // mutable work-state mirror, or duplicate receipt database is maintained.
  for (let page = 0; page < 50; page++) {
    const selected = await call('work-board', { source: envelope.source.url, full: true, limit: 20, ...(after === undefined ? {} : { after }) });
    if (!Array.isArray(selected?.threads) || typeof selected.position !== 'string') throw new Error('native source selection is incomplete');
    if (position !== undefined && selected.position !== position) throw new Error('native source selection changed while paging');
    position = selected.position;
    for (const item of selected.threads) {
      if (typeof item.id !== 'string' || seen.has(item.id)) throw new Error('native source selection repeated or omitted a thread identity');
      seen.add(item.id);
      // If native normalization changes a field, let its own opening law judge
      // replay instead of maintaining a second normalization/schema here.
      const replayDocument = retainedReplayDocument(item.opening, input, offeredObservation);
      if (replayDocument) {
        known = item;
        retainedDocument = replayDocument;
      }
    }
    if (known || !selected.next) break;
    if (page === 49 || selected.next === after || !seen.has(selected.next)) throw new Error('native source selection exceeded its complete paging bound');
    after = selected.next;
  }
  const admitted = known ? { id: known.id } : await call('work-open', input);
  const thread = admitted?.thread ?? admitted?.id;
  if (typeof thread !== 'string' || !thread) throw new Error('native admission did not identify its thread');
  const readback = await call('work-board', { thread, full: true, limit: 1 });
  const actual = readback?.threads?.find(item => item.id === thread);
  if (!actual?.opening) throw new Error('native admission has no complete receiving readback');
  const receivedDocument = actual.opening.sources?.find(source => source.kind === retainedDocument.kind && source.commitment === retainedDocument.commitment);
  if (!receivedDocument || receivedDocument.locator !== retainedDocument.locator) throw new Error('native readback did not retain the exact source document');
  const offeredSourceRetained = receivedDocument.locator === document.locator;
  const routed = actual.home === receiver;
  return Object.freeze({
    state: routed ? 'NATIVE_RECEIVED' : 'NATIVE_RECEIVED_UNROUTED',
    thread,
    providerObjectKey: envelope.providerObjectKey,
    eventKey: envelope.eventKey,
    sourceDocument: receivedDocument.commitment,
    offeredSourceDocument: document.commitment,
    receiver: actual.home ?? null,
    expectedReceiver: receiver,
    postedBy: actual.opening.by,
    replay: known !== undefined,
    standing: actual.standing,
    // Receipt stages stay distinct: no promise, allocation, implementation or
    // customer acceptance is inferred from delivery of a source document.
    stages: Object.freeze({ sourceRetained: true, offeredSourceRetained, nativeAdmitted: true, routed, allocated: false, implemented: false, accepted: false }),
    peerHandoff: admitted.peerHandoff ?? null,
  });
}

export function receiveGitHubWork({ event, opening, binding, call }) {
  return receivePreparedGitHubWork({ prepared: prepareGitHubWork({ event, opening, binding }), call });
}
