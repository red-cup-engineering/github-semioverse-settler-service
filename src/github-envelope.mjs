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
  if (type === 'git_ref') return object.object?.sha;
  if (type === 'push') return object.after;
  if (type === 'status') return object.sha;
  if (type === 'pull_request') return object.head?.sha ?? object.updated_at ?? event.delivery_id;
  if (['workflow_run', 'check_run', 'check_suite', 'merge_group'].includes(type))
    return object.head_sha ?? object.updated_at ?? event.delivery_id;
  return object.updated_at ?? object.submitted_at ?? object.created_at ?? object.sha ?? event.delivery_id;
};

export const objectIdentityFor = (type, object) => ['git_ref', 'push'].includes(type) ? object.ref : object.node_id ?? object.id ?? object.number ??
  (type === 'merge_group' ? object.head_sha : undefined);

/** Git's full reference name is the source identity, not its moving target. */
export function admitGitHubRefName(ref) {
  if (typeof ref !== 'string' || !/^refs\/(?:(?:heads|tags)\/.+|archive(?:\/.+)?)$/u.test(ref) ||
      ref.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock')) ||
      ref.endsWith('.') || ref.includes('..') ||
      ['~', '^', ':', '?', '*', '[', '\\', '@{'].some(bad => ref.includes(bad)) ||
      /[\u0000-\u0020\u007F]/u.test(ref))
    throw new TypeError('GitHub Git ref requires a valid heads/, tags/ or archive/ refname');
  return ref;
}

/** Provider-standard locator; immutable material retains the observed target. */
export function gitHubRefLocator(repositoryFullName, ref) {
  if (typeof repositoryFullName !== 'string' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repositoryFullName))
    throw new TypeError('GitHub ref locator requires an exact owner/repository name');
  admitGitHubRefName(ref);
  return 'https://api.github.com/repos/' + repositoryFullName + '/git/refs/' +
    ref.slice('refs/'.length).split('/').map(encodeURIComponent).join('/');
}

export function admitGitHubRefMaterial(material) {
  admitGitHubRefName(material?.ref);
  if (!['commit', 'tag', 'tree', 'blob'].includes(material?.object?.type) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(material?.object?.sha ?? ''))
    throw new TypeError('GitHub Git ref requires an exact typed SHA-1 or SHA-256 target');
  if (material.ref.startsWith('refs/heads/') && material.object.type !== 'commit')
    throw new TypeError('Git branch references must target a commit');
  return material;
}

const activityTypes = new Set(['release', 'deployment_status', 'status', 'push']);
const sha = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);
const zero = value => /^0+$/u.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const positiveId = value => Number.isSafeInteger(value) && value > 0;

function repositoryApi(repositoryFullName) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repositoryFullName ?? ''))
    throw new TypeError('GitHub activity requires an exact owner/repository name');
  return `https://api.github.com/repos/${repositoryFullName}`;
}

/** Provider coordinates shared by normalization, envelope readmission and Work.
 * A status collection locates the provider source; the retained material and
 * provider ID identify its exact record. It is not an invented status-by-ID API.
 * A deleted ref's locator identifies the observed ref, not its current presence.
 */
export function gitHubActivityLocator(type, material, repositoryFullName) {
  if (!activityTypes.has(type)) return null;
  const api = repositoryApi(repositoryFullName);
  if (type === 'release') return `${api}/releases/${material.id}`;
  if (type === 'push') return gitHubRefLocator(repositoryFullName, material.ref);
  if (type === 'status') return `${api}/commits/${material.sha}/statuses`;
  if (type === 'deployment_status') return `${material.deployment_url}/statuses/${material.id}`;
  return null;
}

/** Validate the new provider families at every route into the existing v1
 * envelope. This establishes correspondence, never source authentication.
 */
export function admitGitHubActivityMaterial(type, material, { repositoryFullName, parent, visibility } = {}) {
  if (!activityTypes.has(type)) return material;
  if (!record(material)) throw new TypeError(`GitHub ${type} material must be an object`);
  const api = repositoryApi(repositoryFullName);
  if (type !== 'push' && (!positiveId(material.id) ||
      Object.hasOwn(material, 'node_id') && !text(material.node_id)))
    throw new TypeError(`GitHub ${type} requires its original provider identity`);
  if (type === 'release') {
    if (!text(material.tag_name) || !text(material.target_commitish))
      throw new TypeError('GitHub release requires its tag and declared target');
    // target_commitish can be a branch name. Never promote it to a resolved SHA.
    for (const key of ['draft', 'prerelease'])
      if (Object.hasOwn(material, key) && typeof material[key] !== 'boolean')
        throw new TypeError(`GitHub release ${key} must be Boolean when supplied`);
    if (Object.hasOwn(material, 'url') && material.url !== gitHubActivityLocator(type, material, repositoryFullName))
      throw new TypeError('GitHub release API locator differs from its repository and provider identity');
    if (visibility === 'public' && material.draft !== false)
      throw new TypeError('GitHub draft or unknown release visibility cannot establish a public source audience');
  }
  if (type === 'status') {
    if (!sha(material.sha) || zero(material.sha) || !text(material.context) ||
        !['error', 'failure', 'pending', 'success'].includes(material.state) ||
        Object.hasOwn(material, 'commit') && (!record(material.commit) || material.commit.sha !== material.sha))
      throw new TypeError('GitHub commit status requires one exact candidate, context and state');
  }
  if (type === 'push') {
    admitGitHubRefName(material.ref);
    if (!sha(material.before) || !sha(material.after) || material.before.length !== material.after.length ||
        ['created', 'deleted', 'forced'].some(key => typeof material[key] !== 'boolean') ||
        material.created !== zero(material.before) || material.deleted !== zero(material.after) ||
        material.created && material.deleted || !Array.isArray(material.commits) ||
        !Object.hasOwn(material, 'head_commit') ||
        material.head_commit !== null && !record(material.head_commit))
      throw new TypeError('GitHub push requires exact before/after targets and matching creation/deletion evidence');
    // An annotated tag can point through a tag object to head_commit. Preserve
    // both observations without claiming that head_commit.id equals after.
  }
  if (type === 'deployment_status') {
    const prefix = `${api}/deployments/`;
    const deploymentId = typeof material.deployment_url === 'string' && material.deployment_url.startsWith(prefix)
      ? material.deployment_url.slice(prefix.length) : '';
    if (!/^[1-9][0-9]*$/u.test(deploymentId) || !positiveId(Number(deploymentId)) ||
        !['error', 'failure', 'inactive', 'in_progress', 'queued', 'pending', 'success'].includes(material.state) ||
        material.environment !== undefined && material.environment !== null && !text(material.environment) ||
        !record(parent) || parent.objectType !== 'deployment' || !text(parent.objectId) ||
        parent.url !== material.deployment_url || !sha(parent.headSha) || zero(parent.headSha) ||
        ['ref', 'environment'].some(key => parent[key] !== undefined && parent[key] !== null && !text(parent[key])) ||
        material.url !== gitHubActivityLocator(type, material, repositoryFullName))
      throw new TypeError('GitHub deployment status requires its exact same-repository deployment and candidate');
  }
  return material;
}

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
  if (envelope.source.objectType === 'git_ref') {
    admitGitHubRefMaterial(envelope.material);
    if (envelope.source.url !== gitHubRefLocator(envelope.source.repositoryFullName, envelope.material.ref))
      throw new TypeError('Git ref source locator differs from its exact provider coordinates');
  }
  admitGitHubActivityMaterial(envelope.source.objectType, envelope.material, envelope.source);
  const activityLocator = gitHubActivityLocator(envelope.source.objectType, envelope.material,
    envelope.source.repositoryFullName);
  if (activityLocator !== null && envelope.source.url !== activityLocator)
    throw new TypeError('GitHub activity source locator differs from its exact provider coordinates');
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
