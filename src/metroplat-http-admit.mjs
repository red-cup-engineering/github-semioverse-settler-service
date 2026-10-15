import { createHash } from 'node:crypto';
import { canonicalGitHubValue } from './settler.mjs';

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} is required`);
  return value.trim();
}

/** Native CloudEvents v1.0 projection of an immutable GitHub source observation.
 * The source material remains testimony; this is arrival custody, not work admission. */
export function githubDeltaCloudEvent(envelope) {
  if (envelope?.schema !== 'semioverse.github-delta.v1' ||
      !Number.isSafeInteger(envelope.source?.repositoryId) || envelope.source.repositoryId <= 0 ||
      typeof envelope.eventKey !== 'string' || envelope.eventKey.length === 0 ||
      typeof envelope.providerObjectKey !== 'string' || envelope.providerObjectKey.length === 0)
    throw new TypeError('a normalized, repository-qualified GitHub observation is required');
  // Delivery IDs identify transport attempts, not the observed provider fact.
  // Bind the CloudEvent ID to every retained provenance field so unchanged
  // replay is byte-for-byte stable but a changed alias/actor never collides.
  const {deliveryId, ...qualifiedSource} = envelope.source;
  const observation = {...envelope, source: qualifiedSource};
  const eventId = 'ni:///sha-256;' + createHash('sha256')
    .update(JSON.stringify(canonicalGitHubValue(observation))).digest('base64url');
  return Object.freeze({
    specversion: '1.0',
    id: eventId,
    source: `urn:github:repository:${envelope.source.repositoryId}`,
    type: 'org.561group.semioverse.github-delta.v1',
    datacontenttype: 'application/json',
    data: observation,
  });
}

function arrivalReceiptId(receipt) {
  const identity = requiredText(receipt.cloudEventIdentity, 'MetroPlat cloudEventIdentity');
  const digest = requiredText(receipt.packetDigest, 'MetroPlat packetDigest');
  return `metroplat-arrival:${identity}:${digest}`;
}

/** Send a supplied CloudEvent to MetroPlat's native arrival receiver.
 * POST / is an observation of the HTTP request, NOT admission of that event. */
export function createMetroplatArrivalAdmit({url,authorization = undefined,fetchImpl = globalThis.fetch} = {}) {
  const endpoint = new URL(requiredText(url, 'MetroPlat arrival URL'));
  if (endpoint.pathname !== '/arrivals' || endpoint.search || endpoint.hash)
    throw new TypeError('MetroPlat supplied CloudEvent admission requires the /arrivals endpoint');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  return async function admit(envelope) {
    const event = githubDeltaCloudEvent(envelope);
    const headers = {accept:'application/json','content-type':'application/cloudevents+json'};
    if (authorization !== undefined) headers.authorization = requiredText(authorization,'MetroPlat authorization');
    const response = await fetchImpl(endpoint, {method:'POST',headers,body:JSON.stringify(event)});
    const body = await response.text();
    if (!response.ok) throw new Error(`MetroPlat arrival admission failed (${response.status}): ${body.slice(0,500)}`);
    let receipt;
    try {receipt=JSON.parse(body)} catch {throw new Error('MetroPlat arrival response was not JSON')}
    if (!receipt || typeof receipt !== 'object' || receipt.kind !== 'metroplat.arrival.receipt' || receipt.ok !== true)
      throw new Error('MetroPlat did not return a successful arrival receipt');
    return Object.freeze({
      receiptId:arrivalReceiptId(receipt),
      cloudEventIdentity:receipt.cloudEventIdentity,
      packetDigest:receipt.packetDigest,
      ...(typeof receipt.packetPath === 'string' ? {packetPath:receipt.packetPath} : {}),
      ...(typeof receipt.admission?.artifact?.path === 'string' ? {logPath:receipt.admission.artifact.path} : {}),
    });
  };
}
