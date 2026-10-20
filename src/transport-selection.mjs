import { createMetroplatArrivalAdmit } from "./metroplat-http-admit.mjs";

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(name + " is required by the selected transport");
  return value.trim();
}

/** Choose an actually available transport by declared preconditions.
 * The existing /arrivals CloudEvents-HTTP admission preserves its true
 * receiver receipt. The ActivityPub path requires an already commissioned
 * signer and named receiving Actor; it never downgrades itself to unsigned
 * HTTP after an Actor denial or uncertain signed delivery.
 */
export async function selectGitHubSemioverseTransport({
  environment = process.env, fetchImpl, deliverActor,
} = {}) {
  const selected = environment.GITHUB_SEMIOVERSE_TRANSPORT ?? "cloudevents-http";
  if (selected === "cloudevents-http") {
    return createMetroplatArrivalAdmit({
      url: required(environment, "METROPLAT_ARRIVAL_URL"),
      ...(environment.METROPLAT_AUTHORIZATION === undefined ? {} :
        { authorization: environment.METROPLAT_AUTHORIZATION }),
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
  }
  if (selected === "activitypub") {
    // Keep the legacy HTTP process independent of optional federation
    // installation. Never let unavailable Actor custody select an unsigned
    // fallback without the caller changing its source-owned configuration.
    const { createMetroplatActorSubmission } =
      await import("./metroplat-actor-delivery.mjs");
    return createMetroplatActorSubmission({
      origin: required(environment, "ACTIVITYPUB_ORIGIN"),
      identifier: required(environment, "ACTIVITYPUB_IDENTIFIER"),
      recipient: required(environment, "ACTIVITYPUB_RECIPIENT"),
      inbox: required(environment, "ACTIVITYPUB_RECIPIENT_INBOX"),
      agentCard: required(environment, "ACTIVITYPUB_AGENT_CARD"),
      keyPath: required(environment, "ACTIVITYPUB_KEYS_PATH"),
      ...(deliverActor === undefined ? {} : { deliver: deliverActor }),
    });
  }
  throw new TypeError("GITHUB_SEMIOVERSE_TRANSPORT must be activitypub or cloudevents-http");
}
