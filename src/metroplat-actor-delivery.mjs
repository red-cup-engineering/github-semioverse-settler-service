import { deliverFromEnvironment } from "@red-cup-engineering/activitypub-services-section/deliver";
import {
  projectSenActivity, senActivityObjectBytes,
} from "@red-cup-engineering/activitypub-services-section/sen-activity";
import { githubDeltaCloudEvent } from "./metroplat-http-admit.mjs";

// GitHub is an observed source, never the ActivityPub signer. A separately
// commissioned bridge Actor signs the actual inter-service delivery. The
// retained SEN body names GitHub's observed author and triggering sender
// separately, without inventing their office standing or consent.
export const GITHUB_DELTA_SEN_KIND = "semioverse.github-delta.v1";
export const GITHUB_ACTOR_PENDING_KIND = "semioverse.github.actor-transport-pending.v1";

function actorUri(value, label) {
  if (typeof value !== "string") throw new TypeError(label + " must be an Actor URI");
  let url;
  try { url = new URL(value); }
  catch { throw new TypeError(label + " must be an Actor URI"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !/^\/actors\/[a-z0-9][a-z0-9._-]*$/u.test(url.pathname))
    throw new TypeError(label + " must be an exact HTTPS ActivityPub Actor URI");
  return url.href;
}

function validatedIdentity({ origin, identifier, recipient, inbox, agentCard, keyPath }) {
  let originUrl, inboxUrl, cardUrl;
  try {
    originUrl = new URL(origin);
    inboxUrl = new URL(inbox);
    cardUrl = new URL(agentCard);
  } catch { throw new TypeError("commissioned Actor origin, recipient inbox and Agent Card URLs are required"); }
  if (originUrl.protocol !== "https:" || originUrl.pathname !== "/" || originUrl.search || originUrl.hash ||
      originUrl.username || originUrl.password)
    throw new TypeError("signed bridge Actor needs one exact HTTPS origin");
  if (typeof identifier !== "string" || !/^[a-z0-9][a-z0-9._-]*$/u.test(identifier))
    throw new TypeError("signed bridge Actor needs its commissioned identifier");
  const sender = actorUri(new URL("/actors/" + identifier, originUrl).href, "sender");
  const target = actorUri(recipient, "recipient");
  if (sender === target) throw new TypeError("the GitHub bridge cannot deliver to itself");
  if (inboxUrl.protocol !== "https:" || inboxUrl.username || inboxUrl.password || inboxUrl.search ||
      inboxUrl.hash || inboxUrl.href !== target + "/inbox")
    throw new TypeError("the exact receiving Actor inbox is required; do not guess another endpoint");
  if (cardUrl.protocol !== "https:" || cardUrl.username || cardUrl.password ||
      cardUrl.search || cardUrl.hash || cardUrl.origin !== originUrl.origin)
    throw new TypeError("sender Agent Card must belong to the commissioned HTTPS origin");
  if (typeof keyPath !== "string" || !keyPath.trim())
    throw new TypeError("the existing commissioned bridge Actor key path is required");
  return Object.freeze({ origin: originUrl.origin, identifier, sender,
    recipient: target, inbox: inboxUrl.href, agentCard: cardUrl.href, keyPath });
}

/** Publish only source material whose audience is positively known public.
 * This is an ordinary signed ActivityStreams Create carrying the already-owned
 * CloudEvents GitHub observation in the canonical SEN/A2A part. We do not
 * reimplement any Sign codec, JSON-LD, HTTP signatures, recipient resolution
 * or ActivityPub delivery.
 */
export function projectGitHubDeltaActivity(envelope, identity, eventTime = new Date().toISOString()) {
  if (envelope?.source?.visibility !== "public")
    throw new TypeError("private or unverified GitHub material has no authorized public Actor audience");
  if (typeof eventTime !== "string" || !Number.isFinite(Date.parse(eventTime)) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(eventTime))
    throw new TypeError("ActivityPub delivery event time must be an actual RFC 3339 UTC instant");
  const sourceEvent = githubDeltaCloudEvent(envelope);
  const bytes = senActivityObjectBytes({ objectKind: GITHUB_DELTA_SEN_KIND, value: sourceEvent });
  const activity = projectSenActivity({
    type: "Create", origin: identity.origin, identifier: identity.identifier,
    recipient: identity.recipient, objectBytes: bytes, agentCard: identity.agentCard,
    eventTime,
  });
  return Object.freeze({ sourceEvent, activity });
}

/** Original ActivityPub publisher owns the signing key and delivery.
 * Until the receiving Actor's actual /arrivals/Work readback exists, an HTTP
 * / ActivityPub delivery acknowledgment is only TRANSPORT, not admission.
 * The unchanged durable claim remains held so replay cannot silently deliver
 * a second uncertain effect.
 */
export function createMetroplatActorSubmission({
  origin, identifier, recipient, inbox, agentCard, keyPath,
  deliver = deliverFromEnvironment,
  now = () => new Date().toISOString(),
} = {}) {
  const identity = validatedIdentity({ origin, identifier, recipient, inbox, agentCard, keyPath });
  if (typeof deliver !== "function" || typeof now !== "function")
    throw new TypeError("Actor delivery and clock must be functions");
  const admit = async (envelope) => {
    const {sourceEvent, activity} = projectGitHubDeltaActivity(envelope, identity, now());
    const transport = await deliver(activity, {
      origin: identity.origin, identifier: identity.identifier,
      keyPath: identity.keyPath, recipient: identity.recipient, inbox: identity.inbox,
    });
    // This is the upstream delivery-only receipt, not receiver processing.
    if (transport?.type !== "Accept" || transport.actor !== identity.sender ||
        transport.object?.type !== "ActivityPubDeliveryReceipt" ||
        transport.object?.activity !== activity.id ||
        transport.object?.recipient !== identity.recipient ||
        transport.object?.inbox !== identity.inbox ||
        transport.object?.delivered !== true)
      throw new TypeError("signed ActivityPub transport did not produce its exact delivery receipt");
    return Object.freeze({
      kind: GITHUB_ACTOR_PENDING_KIND,
      state: "PENDING_RECEIVER_READBACK",
      eventKey: envelope.eventKey,
      sourceCloudEventId: sourceEvent.id,
      senderActor: identity.sender,
      recipientActor: identity.recipient,
      activityId: activity.id,
    });
  };
  // The existing settler must obtain its durable in-flight claim *before*
  // calling the effect port. A successful transport may never be put into
  // the Semioverse admission receipt store.
  Object.defineProperty(admit, "requiresDurableClaim", { value: true });
  // Reject deterministic representation/audience defects before claiming a
  // durable in-flight effect. The delivered activity is independently formed
  // under the real send instant; preflight itself cannot issue a message.
  Object.defineProperty(admit, "preflight", {
    value: envelope => projectGitHubDeltaActivity(envelope, identity, now()).sourceEvent.id,
  });
  return admit;
}
