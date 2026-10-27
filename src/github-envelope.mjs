import { createHash } from 'node:crypto';
import { retainedCarrier } from '@red-cup-engineering/signcell/cell';

const ENVELOPE_KEYS = ['schema', 'provider', 'providerObjectKey', 'eventKey', 'action',
  'source', 'materialIdentity', 'material', 'submission', 'work'].sort().join();

/** The existing provider-material commitment, shared by all GitHub readers.
 * This is the v1 transport contract; native Cell identities belong to SignCell. */
export function canonicalGitHubValue(value) {
  if (Array.isArray(value)) return value.map(canonicalGitHubValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalGitHubValue(value[key])]));
  }
  return value;
}

export const revisionFor = (type, object, event) => {
  if (type === 'pull_request') return object.head?.sha ?? object.updated_at ?? event.delivery_id;
  if (['workflow_run', 'check_run', 'check_suite', 'merge_group'].includes(type))
    return object.head_sha ?? object.updated_at ?? event.delivery_id;
  return object.updated_at ?? object.submitted_at ?? object.created_at ?? object.sha ?? event.delivery_id;
};

export const objectIdentityFor = (type, object) => object.node_id ?? object.id ?? object.number ??
  (type === 'merge_group' ? object.head_sha : undefined);

/** Read the same material-bound v1 envelope before a projection or effect.
 * Admission establishes internal correspondence, not GitHub authentication. */
export function assertGitHubEnvelope(input) {
  const envelope = retainedCarrier(input);
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).sort().join() !== ENVELOPE_KEYS ||
      envelope.schema !== 'semioverse.github-delta.v1' || envelope.provider !== 'github' ||
      typeof envelope.providerObjectKey !== 'string' || typeof envelope.eventKey !== 'string' ||
      !Number.isSafeInteger(envelope.source?.repositoryId) || envelope.source.repositoryId <= 0 ||
      typeof envelope.source.repositoryFullName !== 'string' || !envelope.source.repositoryFullName.trim() ||
      typeof envelope.source.objectType !== 'string' || typeof envelope.source.objectId !== 'string' ||
      typeof envelope.source.revision !== 'string' || typeof envelope.action !== 'string' ||
      !envelope.material || typeof envelope.material !== 'object' || Array.isArray(envelope.material) ||
      !envelope.work || typeof envelope.work !== 'object' || Array.isArray(envelope.work) ||
      (envelope.submission !== null && (typeof envelope.submission !== 'object' || Array.isArray(envelope.submission))))
    throw new TypeError('complete normalized GitHub observation required');
  const materialIdentity = 'ni:///sha-256;' + createHash('sha256')
    .update(JSON.stringify(canonicalGitHubValue(envelope.material))).digest('base64url');
  const providerKey = 'github:repo:' + envelope.source.repositoryId + ':' +
    envelope.source.objectType + ':' + envelope.source.objectId;
  const eventKey = providerKey + ':revision:' + envelope.source.revision +
    ':action:' + envelope.action + ':material:' + materialIdentity;
  const objectId = objectIdentityFor(envelope.source.objectType, envelope.material);
  if (materialIdentity !== envelope.materialIdentity || providerKey !== envelope.providerObjectKey ||
      eventKey !== envelope.eventKey || String(revisionFor(envelope.source.objectType,
        envelope.material, { delivery_id: envelope.source.deliveryId })) !== envelope.source.revision ||
      objectId === undefined || objectId === null || !String(objectId).trim() ||
      String(objectId) !== envelope.source.objectId ||
      (Number.isInteger(envelope.material.number) && envelope.source.objectNumber !== envelope.material.number))
    throw new Error('normalized GitHub event identity does not bind its provider material');
  return envelope;
}
