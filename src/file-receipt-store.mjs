import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function readStore(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("receipt store must contain one JSON object");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function readJsonOrNull(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("settlement claim must contain one JSON object");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function withLock(lockPath, action) {
  mkdirSync(lockPath);
  try {
    return action();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function claimName(eventKey) {
  return `${createHash("sha256").update(eventKey, "utf8").digest("hex")}.json`;
}

export class FileReceiptStore {
  constructor(path) {
    if (typeof path !== "string" || path.trim() === "") {
      throw new TypeError("receipt store path is required");
    }
    this.path = resolve(path);
    this.lockPath = `${this.path}.lock`;
    this.claimDirectory = `${this.path}.claims`;
  }

  get(eventKey) {
    if (typeof eventKey !== "string" || eventKey === "") return null;
    return readStore(this.path)[eventKey] ?? null;
  }

  put(eventKey, receipt) {
    if (typeof eventKey !== "string" || eventKey === "") {
      throw new TypeError("eventKey is required");
    }
    if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
      throw new TypeError("receipt must be an object");
    }

    mkdirSync(dirname(this.path), { recursive: true });
    return withLock(this.lockPath, () => {
      const current = readStore(this.path);
      if (Object.hasOwn(current, eventKey)) {
        throw new Error("receipt already exists for eventKey");
      }
      const next = { ...current, [eventKey]: receipt };
      const temporary = `${this.path}.${process.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(temporary, this.path);
      return receipt;
    });
  }

  claim(eventKey) {
    if (typeof eventKey !== "string" || eventKey === "") {
      throw new TypeError("eventKey is required");
    }

    mkdirSync(this.claimDirectory, { recursive: true });
    const claimPath = join(this.claimDirectory, claimName(eventKey));
    const claim = Object.freeze({
      claimId: randomUUID(),
      eventKey,
      claimedAt: new Date().toISOString(),
      pid: process.pid,
    });

    try {
      writeFileSync(claimPath, `${JSON.stringify(claim, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      return Object.freeze({ state: "ACQUIRED", claim });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = readJsonOrNull(claimPath);
      if (existing === null) return this.claim(eventKey);
      if (existing.eventKey !== eventKey) {
        throw new Error("settlement claim identity mismatch");
      }
      return Object.freeze({ state: "EXISTS", claim: Object.freeze(existing) });
    }
  }

  getClaim(eventKey) {
    if (typeof eventKey !== "string" || eventKey === "") return null;
    const claimPath = join(this.claimDirectory, claimName(eventKey));
    const claim = readJsonOrNull(claimPath);
    if (claim === null) return null;
    if (claim.eventKey !== eventKey) throw new Error("settlement claim identity mismatch");
    return Object.freeze(claim);
  }

  clearClaim(eventKey, claimId) {
    if (typeof eventKey !== "string" || eventKey === "") {
      throw new TypeError("eventKey is required");
    }
    if (typeof claimId !== "string" || claimId === "") {
      throw new TypeError("claimId is required");
    }
    const claimPath = join(this.claimDirectory, claimName(eventKey));
    const claim = readJsonOrNull(claimPath);
    if (claim === null) return false;
    if (claim.eventKey !== eventKey || claim.claimId !== claimId) {
      throw new Error("settlement claim ownership mismatch");
    }
    rmSync(claimPath, { force: true });
    return true;
  }
}
