/**
 * GitHub's provider-specific evidence projected through the existing SignCell
 * owner. A source observation, a stable GitHub subject and an admitted native
 * Work thread have different identities. None of these projections grants an
 * effect, opens a Work thread or turns provider closure into acceptance.
 */
import {
  address, cell, cellSet, cellSetAddress, retainedCarrier, semanticId, sidesOf,
} from '@red-cup-engineering/signcell/cell';
import { cellToCloudEvent } from '@red-cup-engineering/signcell/cloud-events';
import { observedTimeUnixNano } from '@red-cup-engineering/signcell/observability';
import { assertGitHubEnvelope, revisionFor } from './github-envelope.mjs';

export const GITHUB_CELL_PREDICATES = Object.freeze({
  subject: 'github.subject', providerObject: 'github.provider-object',
  event: 'github.event', material: 'github.material', materialIdentity: 'github.material-identity',
  repository: 'github.repository', revision: 'github.revision', source: 'github.source',
  action: 'github.action', objectType: 'github.object-type',
  author: 'github.author', actor: 'github.actor', visibility: 'github.visibility',
  url: 'github.url', updatedAt: 'github.updated-at', parent: 'github.parent',
  head: 'github.head', base: 'github.base', open: 'github.open', draft: 'github.draft',
  merged: 'github.merged', mergeable: 'github.mergeable',
  reviewState: 'github.review-state', reviewCommit: 'github.review-commit',
  checkName: 'github.check-name', checkStatus: 'github.check-status',
  checkConclusion: 'github.check-conclusion', checkHead: 'github.check-head',
  checkApp: 'github.check-app',
  refName: 'git.ref-name', gitObjectType: 'git.object-type', gitObjectId: 'git.object-id',
});

export const WORK_CELL_PREDICATES = Object.freeze({
  subject: 'work.subject', observation: 'work.observation', source: 'work.source',
  sourceObservation: 'work.source-observation', sourceRetained: 'work.source-retained',
  nativeAdmitted: 'work.native-admitted', routed: 'work.routed', home: 'work.home',
  standing: 'work.standing', assayer: 'work.assayer', customerAccepted: 'work.customer-accepted',
});

const P = GITHUB_CELL_PREDICATES;
const W = WORK_CELL_PREDICATES;
const MAX_SOURCE_BYTES = 256 * 1024;
const present = value => value !== undefined && value !== null;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const issueOrPull = type => type === 'issue' || type === 'pull_request';
const numberSubject = (repository, type, number) => `github:repo:${repository}:${type}:number:${number}`;
const providerTimestamp = value => {
  try { observedTimeUnixNano(value); return true; } catch { return false; }
};

function primarySubject(envelope) {
  const { source, material } = envelope;
  if (!issueOrPull(source.objectType)) return envelope.providerObjectKey;
  const number = source.objectNumber ?? material.number;
  if (!positiveInteger(number) || (present(material.number) && material.number !== number))
    throw new TypeError('GitHub issue and pull Cells require one positive, matching source number');
  const type = source.objectType === 'pull_request' ||
    material.pull_request && typeof material.pull_request === 'object' ? 'pull_request' : 'issue';
  return numberSubject(source.repositoryId, type, number);
}

// A parent is a relation, never the identity of its comment/review. Only native
// parent coordinates or an exact same-repository provider locator are read.
function parentSubject(envelope) {
  const { source, material } = envelope;
  const parent = source.parent;
  const locator = parent?.url ?? material.pull_request_url ?? material.issue_url;
  let fromUrl;
  if (typeof locator === 'string') {
    let parsed;
    try { parsed = new URL(locator); } catch { /* raw source remains in its Cell */ }
    if (parsed && !parsed.username && !parsed.password && parsed.protocol === 'https:') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const paths = parsed.hostname === 'github.com' ? parts :
        parsed.hostname === 'api.github.com' && parts[0] === 'repos' ? parts.slice(1) : [];
      if (paths.length === 4 && `${paths[0]}/${paths[1]}`.toLowerCase() === source.repositoryFullName.toLowerCase() &&
          ['pull', 'pulls', 'issues'].includes(paths[2]) && /^[1-9][0-9]*$/u.test(paths[3])) {
        const number = Number(paths[3]);
        if (positiveInteger(number)) fromUrl = { number, type: paths[2] === 'issues' ? 'issue' : 'pull_request' };
      }
    }
  }
  const number = parent?.objectNumber ?? fromUrl?.number;
  if (!positiveInteger(number)) return null;
  if (fromUrl && fromUrl.number !== number) throw new TypeError('GitHub parent number and locator disagree');
  const review = ['review', 'pull_request_review_comment'].includes(source.objectType);
  const type = issueOrPull(parent?.objectType) ? parent.objectType : review ? 'pull_request' : fromUrl?.type;
  if (!type) return null;
  // The Issues API addresses pull requests too. A typed PR parent can carry
  // its /issues/N locator; the opposite substitution is not justified.
  if (fromUrl && fromUrl.type !== type && !(type === 'pull_request' && fromUrl.type === 'issue'))
    throw new TypeError('GitHub parent kind and locator disagree');
  return numberSubject(source.repositoryId, type, number);
}

/**
 * Real native Cells for one complete normalized source snapshot. Boolean
 * claims keep positive, negative and missing testimony separate. All changing
 * facts belong to the immutable observation, so a closed/open history is not
 * falsely interpreted as simultaneous contradiction at the stable subject.
 */
export function projectGitHubCells(input) {
  // The owner snapshots opaque nested carriers without invoking source getters.
  const envelope = retainedCarrier(input);
  assertGitHubEnvelope(envelope);
  if (Buffer.byteLength(JSON.stringify(envelope)) > MAX_SOURCE_BYTES)
    throw new RangeError('GitHub Cell source exceeds 256 KiB');
  const { deliveryId, ...source } = envelope.source;
  const snapshot = retainedCarrier({ ...envelope, source });
  const observation = semanticId(snapshot);
  const subject = primarySubject(envelope);
  const material = envelope.material;
  const witness = retainedCarrier({ kind: 'github.source-witness.v1', observation,
    providerObjectKey: envelope.providerObjectKey, materialIdentity: envelope.materialIdentity,
    revision: source.revision, url: source.url ?? null });
  const cells = [];
  const fact = (predicate, value, field = predicate) => {
    if (present(value)) cells.push(cell(observation, predicate, value, {
      for: [{ ...witness, field }],
    }));
  };
  const boolean = (predicate, claims) => cells.push(cell(observation, predicate, true, {
    for: claims.filter(([, value]) => value === true).map(([field, value]) => ({ ...witness, field, value })),
    against: claims.filter(([, value]) => value === false).map(([field, value]) => ({ ...witness, field, value })),
  }));
  fact(P.subject, subject);
  fact(P.providerObject, envelope.providerObjectKey);
  fact(P.event, envelope.eventKey);
  fact(P.material, material);
  fact(P.materialIdentity, envelope.materialIdentity);
  fact(P.repository, source.repositoryId);
  fact(P.source, source);
  fact(P.revision, source.revision);
  fact(P.action, envelope.action);
  fact(P.objectType, source.objectType);
  fact(P.visibility, source.visibility);
  fact(P.url, source.url);
  fact(P.updatedAt, material.updated_at, 'material.updated_at');
  if (source.objectType === 'git_ref') {
    fact(P.refName, material.ref, 'material.ref');
    fact(P.gitObjectType, material.object.type, 'material.object.type');
    fact(P.gitObjectId, material.object.sha, 'material.object.sha');
  }
  if (present(source.author) || present(source.authorId))
    fact(P.author, { login: source.author ?? null, id: source.authorId ?? null });
  if (present(source.actor) || present(source.actorId))
    fact(P.actor, { login: source.actor ?? null, id: source.actorId ?? null });
  fact(P.parent, parentSubject(envelope));
  fact('github.parent-source', source.parent);
  fact('github.submission', envelope.submission);
  fact('github.proposed-work', envelope.work);

  const lifecycle = issueOrPull(source.objectType);
  const pull = source.objectType === 'pull_request' ||
    source.objectType === 'issue' && material.pull_request && typeof material.pull_request === 'object';
  boolean(P.open, lifecycle && ['open', 'closed'].includes(material.state)
    ? [['material.state', material.state === 'open']] : []);
  boolean(P.draft, pull ? [['material.draft', material.draft]] : []);
  boolean(P.mergeable, pull ? [['material.mergeable', material.mergeable]] : []);
  const merged = [];
  if (pull) {
    if (typeof material.merged === 'boolean') merged.push(['material.merged', material.merged]);
    for (const [path, owner] of [['material', material], ['material.pull_request', material.pull_request]]) {
      if (owner && Object.hasOwn(owner, 'merged_at')) {
        if (owner.merged_at === null) merged.push([`${path}.merged_at`, false]);
        else if (providerTimestamp(owner.merged_at))
          merged.push([`${path}.merged_at`, true]);
      }
    }
  }
  boolean(P.merged, merged);
  // A synthetic pre-merge commit is kept as source, without a merged inference.
  fact('github.merge-commit', material.merge_commit_sha, 'material.merge_commit_sha');
  fact(P.head, material.head?.sha ?? (source.objectType === 'merge_group' ? material.head_sha : undefined), 'material.head');
  fact(P.base, material.base?.sha ?? (source.objectType === 'merge_group' ? material.base_sha : undefined), 'material.base');
  if (source.objectType === 'review') {
    fact(P.reviewState, material.state, 'material.state');
    fact(P.reviewCommit, material.commit_id, 'material.commit_id');
  }
  if (['check_run', 'check_suite', 'workflow_run'].includes(source.objectType)) {
    fact(P.checkName, material.name, 'material.name');
    fact(P.checkStatus, material.status, 'material.status');
    fact(P.checkConclusion, material.conclusion, 'material.conclusion');
    fact(P.checkHead, material.head_sha, 'material.head_sha');
    fact(P.checkApp, material.app?.id, 'material.app.id');
  }
  const selected = cellSet(cells);
  return retainedCarrier({ kind: 'github.source-cells.v1', subject, observation,
    providerObjectKey: envelope.providerObjectKey, eventKey: envelope.eventKey,
    repositoryId: source.repositoryId, sourceUrl: source.url ?? null,
    cloudEventSource: `urn:github:repository:${source.repositoryId}`,
    cells: selected, cellSetId: cellSetAddress(selected) });
}

function sourceProjection(input) {
  const source = retainedCarrier(input);
  if (source?.kind !== 'github.source-cells.v1' || !nonempty(source.subject) ||
      !nonempty(source.observation) || !positiveInteger(source.repositoryId) ||
      !nonempty(source.providerObjectKey) || !nonempty(source.eventKey) ||
      source.cloudEventSource !== `urn:github:repository:${source.repositoryId}` ||
      !Array.isArray(source.cells) || source.cellSetId !== cellSetAddress(source.cells) ||
      source.cells.some(value => value.subject !== source.observation))
    throw new TypeError('complete source-bound GitHub Cell projection required');
  const held = (predicate, optional = false) => {
    const matches = source.cells.filter(at => at.predicate === predicate);
    if (optional && matches.length === 0) return null;
    if (matches.length !== 1 || !sidesOf(matches[0])[0] || sidesOf(matches[0])[1])
      throw new TypeError('GitHub Cell projection requires one held source value per coordinate');
    return matches[0].object;
  };
  const observedSource = held(P.source);
  if (!observedSource || typeof observedSource !== 'object' || Array.isArray(observedSource))
    throw new TypeError('GitHub Cell projection omitted its original source coordinates');
  // A self-consistent hash does not establish that the derived lifecycle
  // follows the retained material. Reconstruct the original closed v1 source
  // and apply the SAME projector, including every witness and unknown Cell.
  // Restore the transport coordinate only for the old protocol's revision
  // fallback. Otherwise leave it absent, so an invented delivery spelling
  // cannot inflate a previously admitted source past its byte bound.
  const material = held(P.material);
  const materialRevision = revisionFor(observedSource.objectType, material, {});
  const restoredSource = materialRevision === undefined || materialRevision === null
    ? { ...observedSource, deliveryId: observedSource.revision } : observedSource;
  const expected = projectGitHubCells({
    schema: 'semioverse.github-delta.v1', provider: 'github',
    providerObjectKey: source.providerObjectKey, eventKey: source.eventKey,
    action: held(P.action), source: restoredSource,
    materialIdentity: held(P.materialIdentity), material,
    submission: held('github.submission', true), work: held('github.proposed-work', true),
  });
  for (const coordinate of ['subject', 'observation', 'providerObjectKey', 'eventKey',
    'repositoryId', 'sourceUrl', 'cloudEventSource', 'cellSetId'])
    if (source[coordinate] !== expected[coordinate])
      throw new TypeError('GitHub Cell projection differs from its retained source material');
  return source;
}

/** Standard SignCell claim events; reception adds no new testimony. */
export function gitHubCellCloudEvents(input) {
  const projection = sourceProjection(input);
  return Object.freeze(cellSet(projection.cells).map(at => cellToCloudEvent(at, {
    id: semanticId({ observation: projection.observation, cell: address(at) }),
    source: projection.cloudEventSource,
  })));
}

function booleanReading(source, predicate) {
  const selected = source.cells.filter(at => at.subject === source.observation &&
    at.predicate === predicate && at.object === true);
  if (selected.length !== 1) return 'unknown';
  const [positive, negative] = sidesOf(selected[0]);
  return positive && negative ? 'contested' : positive ? 'affirmed' : negative ? 'denied' : 'unknown';
}

function nextReceiving(source, receipt) {
  if (!receipt.stages.routed) return 'receive-routing';
  const assay = receipt.nativeWork.assayerReadout;
  if (assay === 'rejected-in-work-arena') return 'repair-delivery';
  if (assay === 'awaiting-assayer') return 'receive-assay';
  if (assay === 'accepted-in-work-arena') return 'receive-customer';
  const [merged, open, draft] = [P.merged, P.open, P.draft].map(predicate => booleanReading(source, predicate));
  if ([merged, open, draft].includes('contested') || merged === 'affirmed' && open === 'affirmed')
    return 'reconcile-source-evidence';
  if (merged === 'affirmed') return 'receive-downstream';
  if (open === 'denied') return 'reconcile-closed-source';
  if (draft === 'affirmed') return 'complete-draft';
  return 'continue-native-work';
}

/**
 * Project the existing receiver's verified readback, without a second board.
 * Work facts belong to a receipt observation. The stable thread merely links
 * that observation; later receipts do not erase earlier receiving evidence.
 * This pure reader cannot authenticate an arbitrary caller-supplied receipt.
 */
export function projectGitHubWorkCells({ source: input, receipt } = {}) {
  const source = sourceProjection(input);
  if (!receipt || !['NATIVE_RECEIVED', 'NATIVE_RECEIVED_UNROUTED'].includes(receipt.state) ||
      !nonempty(receipt.thread) || !nonempty(receipt.sourceDocument) ||
      receipt.providerObjectKey !== source.providerObjectKey || receipt.eventKey !== source.eventKey ||
      receipt.stages?.sourceRetained !== true || receipt.stages?.nativeAdmitted !== true ||
      typeof receipt.stages.routed !== 'boolean' || !nonempty(receipt.expectedReceiver) ||
      (receipt.receiver !== null && !nonempty(receipt.receiver)) ||
      receipt.stages.routed !== (receipt.receiver === receipt.expectedReceiver) ||
      (receipt.state === 'NATIVE_RECEIVED') !== receipt.stages.routed ||
      receipt.nativeWork?.kind !== 'semioverse.github-native-work-reading.v1' ||
      receipt.nativeWork.originalWorkSource !== receipt.thread ||
      receipt.nativeWork.originalProviderSource !== source.sourceUrl ||
      !['unavailable', 'accepted-in-work-arena', 'rejected-in-work-arena',
        'awaiting-assayer', 'no-received-delivery'].includes(receipt.nativeWork.assayerReadout))
    throw new TypeError('matching, verified native GitHub Work receipt required');

  // Readback identity omits offer/replay/transport bookkeeping. A retry that
  // retained the same source and native state therefore names the same reading.
  const retained = retainedCarrier({ kind: 'github.native-work-observation.v1',
    thread: receipt.thread, sourceObservation: source.observation,
    sourceDocument: receipt.sourceDocument, receiver: receipt.receiver,
    expectedReceiver: receipt.expectedReceiver, nativeWork: receipt.nativeWork,
    stages: { sourceRetained: true, nativeAdmitted: true, routed: receipt.stages.routed } });
  const receiptObservation = semanticId(retained);
  const witness = { kind: 'github.native-work-witness.v1', observation: receiptObservation,
    thread: receipt.thread, sourceDocument: receipt.sourceDocument };
  const cells = [];
  const fact = (predicate, value) => {
    if (present(value)) cells.push(cell(receiptObservation, predicate, value, { for: [witness] }));
  };
  const boolean = (predicate, value) => cells.push(cell(receiptObservation, predicate, true,
    value === true ? { for: [witness] } : value === false ? { against: [witness] } : {}));
  cells.push(cell(receipt.thread, W.observation, receiptObservation, { for: [witness] }));
  fact(W.subject, receipt.thread);
  fact(W.source, source.subject);
  fact(W.sourceObservation, source.observation);
  fact('work.native-reading', retained);
  fact(W.home, receipt.receiver);
  fact(W.standing, receipt.nativeWork.standing);
  fact(W.assayer, receipt.nativeWork.assayerReadout);
  boolean(W.sourceRetained, true);
  boolean(W.nativeAdmitted, true);
  boolean(W.routed, receipt.stages.routed);
  // Neither GitHub's lifecycle nor the arena's assay establishes independent
  // customer acceptance. In particular stages.accepted:false is not a denial.
  boolean(W.customerAccepted, undefined);
  const selected = cellSet(cells);
  return retainedCarrier({ kind: 'github.work-cells.v1', subject: receipt.thread,
    sourceSubject: source.subject, sourceObservation: source.observation, observation: receiptObservation,
    cells: selected, cellSetId: cellSetAddress(selected), next: nextReceiving(source, receipt) });
}
