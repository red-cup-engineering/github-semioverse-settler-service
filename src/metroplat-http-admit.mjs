function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} is required`);
  }
  return value.trim();
}

function arrivalReceiptId(receipt) {
  const identity = requiredText(receipt.cloudEventIdentity, "MetroPlat cloudEventIdentity");
  const digest = requiredText(receipt.packetDigest, "MetroPlat packetDigest");
  return `metroplat-arrival:${identity}:${digest}`;
}

export function createMetroplatArrivalAdmit({
  url,
  authorization = undefined,
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoint = new URL(requiredText(url, "MetroPlat arrival URL"));
  if (endpoint.pathname !== "/" && endpoint.pathname !== "") {
    throw new TypeError("MetroPlat generic arrival URL must target the mounted root");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");

  return async function admit(envelope) {
    if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
      throw new TypeError("GitHub delta envelope must be an object");
    }

    const headers = {
      accept: "application/json",
      "content-type": "application/json",
    };
    if (authorization !== undefined) {
      headers.authorization = requiredText(authorization, "MetroPlat authorization");
    }

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(envelope),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`MetroPlat arrival admission failed (${response.status}): ${text.slice(0, 500)}`);
    }

    let receipt;
    try {
      receipt = JSON.parse(text);
    } catch {
      throw new Error("MetroPlat arrival response was not JSON");
    }
    if (
      receipt === null
      || typeof receipt !== "object"
      || receipt.kind !== "metroplat.arrival.receipt"
      || receipt.ok !== true
    ) {
      throw new Error("MetroPlat did not return a successful arrival receipt");
    }

    return Object.freeze({
      receiptId: arrivalReceiptId(receipt),
      cloudEventIdentity: receipt.cloudEventIdentity,
      packetDigest: receipt.packetDigest,
      ...(typeof receipt.packetPath === "string" ? { packetPath: receipt.packetPath } : {}),
      ...(typeof receipt.admission?.artifact?.path === "string"
        ? { logPath: receipt.admission.artifact.path }
        : {}),
    });
  };
}
