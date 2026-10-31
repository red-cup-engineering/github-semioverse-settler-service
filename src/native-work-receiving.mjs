import { createHash } from 'node:crypto';
import { gitHubRefLocator, normalizeGitHubEvent } from './settler.mjs';
import { gitHubActivityLocator } from './github-envelope.mjs';
import { projectGitHubCells, projectGitHubWorkCells } from './github-cells.mjs';

const MEDIA = 'data:application/json;base64,';
const MAX_MATERIAL_BYTES = 256 * 1024;
const identityOf = bytes => `ni:///sha-256;${createHash('sha256').update(bytes).digest('base64url')}`;
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
// The native arena treats evidence as a set of locators (deduplicated/sorted).
const evidenceEqual = (left, right) => retainedGitHubEvidence(left ?? [],right ?? []) !== undefined;
const setFields = new Set(['scope','tags','serves','after','supersedes','relates']);
const openingFieldEqual = (key,left,right) => key==='evidence' ? evidenceEqual(left,right) : setFields.has(key) ? equal([...new Set(left??[])].sort(),[...new Set(right??[])].sort()) : equal(left,right);

// Delivery identity belongs to transport. Every other observation field,
// including material, author, triggering actor and visibility, still participates.
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
      source.kind === 'github-source-document' ? document : source),
      ...(input.evidence === undefined ? {} : {evidence: input.evidence.map(value => value === input.sources.find(source => source.kind === 'github-source-document')?.locator ? document.locator : value)}) };
    // A native opening also contains board-owned identity, actor and edition.
    // Compare BOTH directions for all caller-authored semantic fields: if
    // an original requirement, condition, tag, source or receiving term was
    // deleted from the new interpretation it is not an exact replay.
    const boardOwned = new Set(['as','id','by','hand','at','edition','decidedBy']);
    const authored = new Set([...Object.keys(expected),...Object.keys(opening)]);
    if ([...authored].filter(key => !boardOwned.has(key))
      .every(key => openingFieldEqual(key,opening[key],expected[key])))
      return Object.freeze({ ...document });
  }
  return undefined;
}

// The existing arena retains repeated reports as corroborations/restatements.
// Those moves carry evidence and observation, not new opening sources/context.
// A complete source document therefore travels as an evidence locator too.
function evidenceDocument(locator) {
  if (typeof locator !== 'string' || !locator.startsWith(MEDIA)) return undefined;
  if (locator.length > MEDIA.length + 4 * Math.ceil(MAX_MATERIAL_BYTES / 3)) throw new RangeError('GitHub source document exceeds 256 KiB');
  const bytes = Buffer.from(locator.slice(MEDIA.length), 'base64');
  let parsed;try { parsed = JSON.parse(bytes.toString('utf8')); } catch { return undefined; }
  if (parsed?.schema !== 'semioverse.github-delta.v1') return undefined;
  const document = {kind:'github-source-document',locator,commitment:identityOf(bytes)};
  return {document,envelope:readGitHubSourceDocument(document)};
}
/** Compare native evidence sets while preserving the actual recorded carriers.
 * Only GitHub documents receive the same transport-equivalence law as the
 * primary source; unrelated evidence remains an exact locator. */
export function retainedGitHubEvidence(offered, retained) {
  const read=values=>{
    const documents=values.map(evidenceDocument).filter(Boolean);
    const carriers=new Set(documents.flatMap(({document})=>[document.locator,document.commitment]));
    const plain=[...new Set(values.filter(value=>!carriers.has(value)))].sort();
    const keys=[...new Set(documents.map(({envelope})=>JSON.stringify(canonical(observationForReplay(envelope)))))].sort();
    return {plain,keys,documents};
  };
  const left=read(offered),right=read(retained);
  if(!equal(left.plain,right.plain)||!equal(left.keys,right.keys))return undefined;
  return left.documents.map(({document,envelope})=>({offered:document,retained:right.documents.find(candidate=>equal(observationForReplay(candidate.envelope),observationForReplay(envelope))).document}));
}
function reportEvidenceDocuments(thread) {
  if (thread?.opening?.move !== 'report') return [];
  return [...(thread.corroborations ?? []), ...(thread.restatements ?? [])].flatMap(entry =>
    (entry.evidence ?? []).map(evidenceDocument).filter(Boolean).map(value=>({entry,...value})));
}
function reportInterpretationEqual(opening, input) {
  const fixed = [...new Set([...Object.keys(input), ...Object.keys(opening)])]
    .filter(key => !['as','sources','evidence','observation','by','at','id','hand','edition','decidedBy'].includes(key));
  return fixed.every(key => openingFieldEqual(key, opening[key], input[key]));
}
function retainedReportReplay(thread, input, offered) {
  if (input.move !== 'report' || thread?.opening?.move !== 'report') return undefined;
  if (!reportInterpretationEqual(thread.opening, input)) return undefined;
  for (const candidate of reportEvidenceDocuments(thread)) {
    if (!equal(observationForReplay(candidate.envelope), observationForReplay(offered))) continue;
    const offeredLocator = input.sources.find(source => source.kind === 'github-source-document')?.locator;
    const evidence = input.evidence.map(value => value === offeredLocator ? candidate.document.locator : value);
    if (candidate.entry.observation === input.observation && evidenceEqual(candidate.entry.evidence,evidence)) return candidate.document;
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
  const locator = envelope.source.url;
  const exactRefLocator = envelope.source.objectType === 'git_ref' &&
    locator === gitHubRefLocator(envelope.source.repositoryFullName, envelope.source.objectId);
  const activityLocator = gitHubActivityLocator(envelope.source.objectType, envelope.material,
    envelope.source.repositoryFullName);
  const exactActivityLocator = activityLocator !== null && locator === activityLocator;
  if (typeof locator !== 'string' || !(locator.startsWith('https://github.com/') || exactRefLocator || exactActivityLocator))
    throw new TypeError('original GitHub locator is required');
  const document = gitHubSourceDocument(envelope);
  const sourceCells = projectGitHubCells(envelope);
  const input = {
    ...structuredClone(opening),
    ...(binding.as === undefined ? {} : { as: binding.as }),
    scope: [...binding.scope],
    sources: [
      { kind: `github-${envelope.source.objectType.replaceAll('_', '-')}`, locator: envelope.source.url, commitment: envelope.materialIdentity },
      document,
    ],
  };
  if (input.move === 'report') input.evidence = [...(input.evidence ?? []), document.locator];
  return Object.freeze({ envelope, document, sourceCells, input, receiver: binding.receiver });
}

/** Complete canonical source selection, reused by arrival and closure receiving. */
export async function readGitHubSourceThreads(call, source) {
  let after, position, expected; const seen = new Set(), threads = [];
  for (let page = 0; page < 50; page++) {
    const selected = await call('work-board', { source, full: true, limit: 20, ...(after === undefined ? {} : { after }) });
    // A refused native move can hide the original source thread. Neither a
    // matching row nor matched:0 proves complete receiving while replay is
    // incomplete. Require the original source-page refusal count on EVERY page;
    // missing/malformed evidence is unknown, never permission to open again.
    if (selected?.refused !== 0) throw new Error('native source selection has refused or unqualified replay; original Work reconciliation is required');
    if (!Array.isArray(selected?.threads) || selected.threads.length > 20 || typeof selected.position !== 'string' || !Number.isSafeInteger(selected.matched) || selected.matched < 0) throw new Error('native source selection is incomplete');
    if (position !== undefined && (selected.position !== position || selected.matched !== expected)) throw new Error('native source selection changed while paging');
    position = selected.position; expected = selected.matched;
    for (const item of selected.threads) {
      if (typeof item.id !== 'string' || !item.id || seen.has(item.id)) throw new Error('native source selection repeated or omitted a thread identity');
      if (!Array.isArray(item.opening?.sources) || !item.opening.sources.some(value => value.locator === source)) throw new Error('native source selection returned unrelated or incomplete thread evidence');
      seen.add(item.id); threads.push(item);
    }
    if (selected.next === undefined) {
      if (threads.length !== expected) throw new Error('native source selection ended before complete receiving readback');
      return threads;
    }
    if (page === 49 || !selected.threads.length || selected.next !== selected.threads.at(-1).id || selected.next === after || threads.length >= expected) throw new Error('native source selection exceeded its complete paging bound');
    after = selected.next;
  }
}

// Both readers and receivers select the same original Work under one replay law.
// Snapshot the offered source and interpretation before asynchronous board reads.
async function selectPreparedGitHubWork(prepared, call) {
  if (typeof call !== 'function') throw new TypeError('authenticated native operation port is required');
  const document = Object.freeze({ ...prepared.document });
  const input = structuredClone(prepared.input);
  const receiver = prepared.receiver;
  // Compare the immutable offered snapshot, not nested objects a caller might
  // have mutated after prepareGitHubWork captured the source document.
  const envelope = readGitHubSourceDocument(document);
  // Admit the recoverable Cell representation before an opening can occur.
  const sourceCells = projectGitHubCells(envelope);
  let known;
  let retainedDocument = document;
  let evidenceCarriers = retainedGitHubEvidence(input.evidence ?? [], input.evidence ?? []) ?? [];
  for (const item of await readGitHubSourceThreads(call, envelope.source.url)) {
    if (input.move === 'report' && item.opening?.move === 'report' &&
        typeof input.law === 'string' && typeof input.subject === 'string' &&
        item.opening.law === input.law && item.opening.subject === input.subject) {
      if (!reportInterpretationEqual(item.opening, input))
        throw new Error('existing report cannot retain changed interpretation fields; no corroboration attempted');
    }

    const replayDocument = retainedReplayDocument(item.opening, input, envelope) ?? retainedReportReplay(item, input, envelope);
    if (replayDocument) {
      // Two distinct accepted openings asserting exact replay are a source
      // divergence, not a reason to pick the last Work thread returned.
      if (known !== undefined && known.id !== item.id)
        throw new Error('native source selection has ambiguous exact receiving threads');
      known = item; retainedDocument = replayDocument;
      const sayings=[item.opening,...(item.corroborations??[]),...(item.restatements??[])];
      const selected=sayings.map(saying=>retainedGitHubEvidence(input.evidence??[],saying.evidence??[])).find(value=>value!==undefined);
      if(selected===undefined)throw new Error('native source selection omitted exact evidence carriers');
      evidenceCarriers=structuredClone(selected);
    }
  }
  return { envelope, document, input, receiver, sourceCells, known, retainedDocument, evidenceCarriers };
}

// A receiving receipt is always reconstructed from the original thread's fresh
// exact-carrier readback, regardless of whether the caller can admit new Work.
async function readSelectedGitHubWork({ selection, admitted, call }) {
  const { envelope, document, input, receiver, known, retainedDocument, evidenceCarriers } = selection;
  const thread = admitted?.thread ?? admitted?.id;
  if (typeof thread !== 'string' || !thread) throw new Error('native admission did not identify its thread');
  const readback = await call('work-board', { thread, full: true, limit: 1 });
  const actual = readback?.threads?.find(item => item.id === thread);
  if (!actual?.opening) throw new Error('native admission has no complete receiving readback');
  const receivedEvidence = reportEvidenceDocuments(actual).find(({document: source,entry}) => source.commitment === retainedDocument.commitment && source.locator === retainedDocument.locator && evidenceEqual(input.evidence, entry.evidence));
  const receivedDocument = actual.opening.sources?.find(source => source.kind === retainedDocument.kind && source.commitment === retainedDocument.commitment) ?? receivedEvidence?.document;
  if (!receivedDocument || receivedDocument.locator !== retainedDocument.locator) throw new Error('native readback did not retain the exact source document');
  if (evidenceCarriers.length) {
    const sayings=[actual.opening,...(actual.corroborations??[]),...(actual.restatements??[])];
    if(!sayings.some(saying=>evidenceCarriers.every(({retained})=>(saying.evidence??[]).includes(retained.locator))))
      throw new Error('native readback did not retain the exact selected evidence carriers');
  }
  // The native journal may advance standing and deliveries, but the selected
  // original interpretation must still hold. Exact source bytes alone cannot
  // excuse a changed opening or a different corroboration observation.
  const readbackDocument = retainedReplayDocument(actual.opening, input, envelope) ?? retainedReportReplay(actual, input, envelope);
  if (!readbackDocument || readbackDocument.commitment !== retainedDocument.commitment || readbackDocument.locator !== retainedDocument.locator)
    throw new Error('native readback did not retain the exact source interpretation');
  const offeredSourceRetained = receivedDocument.locator === document.locator;
  const routed = actual.home === receiver;
  // Re-evaluate the SAME original Work at each observed source readback.
  // Opening admission is only a source-custody effect, whereas the later
  // Work assayer's verdict and an external beneficiary's acceptance are
  // different events. Missing delivered evidence must remain unknown, not 0.
  const deliveries = Array.isArray(actual.deliveries) ? actual.deliveries : null;
  const counted = deliveries === null ? null : Object.freeze({
    total: deliveries.length,
    accepted: deliveries.filter(item => item?.verdict === 'accepted').length,
    rejected: deliveries.filter(item => item?.verdict === 'rejected').length,
    awaitingAssayer: deliveries.filter(item => item?.verdict === undefined).length,
  });
  const nativeWork = Object.freeze({
    kind: 'semioverse.github-native-work-reading.v1',
    opening: actual.opening.move,
    standing: typeof actual.standing === 'string' ? actual.standing : null,
    assayerReadout: deliveries === null ? 'unavailable' :
      counted.accepted > 0 && actual.standing === 'accepted' ? 'accepted-in-work-arena' :
      counted.rejected > 0 ? 'rejected-in-work-arena' :
      counted.awaitingAssayer > 0 ? 'awaiting-assayer' : 'no-received-delivery',
    deliveries: counted,
    originalWorkSource: thread,
    originalProviderSource: envelope.source.url,
    independentCustomerReceiving: 'not-established-by-this-source',
    effect: 'read-only-native-source-projection',
  });
  const receipt = Object.freeze({
    state: routed ? 'NATIVE_RECEIVED' : 'NATIVE_RECEIVED_UNROUTED',
    thread,
    providerObjectKey: envelope.providerObjectKey,
    eventKey: envelope.eventKey,
    sourceDocument: receivedDocument.commitment,
    sourceEvidence: evidenceCarriers.map(({offered,retained})=>({offered:offered.commitment,retained:retained.commitment,offeredSourceRetained:offered.locator===retained.locator})),
    offeredSourceDocument: document.commitment,
    receiver: actual.home ?? null,
    expectedReceiver: receiver,
    postedBy: receivedEvidence?.entry.player ?? actual.opening.by,
    replay: known !== undefined,
    standing: actual.standing,
    nativeWork,
    // Receipt stages stay distinct: no promise, allocation, implementation or
    // customer acceptance is inferred from delivery of a source document.
    stages: Object.freeze({ sourceRetained: true, offeredSourceRetained, nativeAdmitted: true, routed, allocated: false, implemented: false, accepted: false }),
    peerHandoff: admitted.peerHandoff ?? null,
  });
  // Read Cells from the document actually retained by this native thread.
  // The arena journal remains the durable owner; no second mutable board.
  const sourceCells = projectGitHubCells(readGitHubSourceDocument(receivedDocument));
  return Object.freeze({ ...receipt, sourceCells,
    workCells: projectGitHubWorkCells({ source: sourceCells, receipt }) });
}

/** Guaranteed read-only original Work projection: only work-board is invoked.
 * Absence is scoped to a complete exact-replay source selection, not a negative
 * admission fact or authority to open, route, allocate or advance any Work. */
export async function readPreparedGitHubWork({ prepared, call }) {
  const selection = await selectPreparedGitHubWork(prepared, call);
  if (selection.known === undefined) {
    const { envelope, document, receiver, sourceCells } = selection;
    return Object.freeze({
      state: 'NATIVE_NOT_RECEIVED',
      reason: 'no-exact-original-work',
      providerObjectKey: envelope.providerObjectKey,
      eventKey: envelope.eventKey,
      offeredSourceDocument: document.commitment,
      expectedReceiver: receiver,
      sourceCells,
    });
  }
  return readSelectedGitHubWork({ selection, admitted: { id: selection.known.id }, call });
}

/** The effectful part has no filesystem, credentials, receipt map or provider SDK.
 * It can run in the same authenticated client that supplied the source binding. */
export async function receivePreparedGitHubWork({ prepared, call }) {
  const selection = await selectPreparedGitHubWork(prepared, call);
  const admitted = selection.known ? { id: selection.known.id } : await call('work-open', selection.input);
  return readSelectedGitHubWork({ selection, admitted, call });
}

export function readGitHubWork({ event, opening, binding, call }) {
  return readPreparedGitHubWork({ prepared: prepareGitHubWork({ event, opening, binding }), call });
}

export function receiveGitHubWork({ event, opening, binding, call }) {
  return receivePreparedGitHubWork({ prepared: prepareGitHubWork({ event, opening, binding }), call });
}
