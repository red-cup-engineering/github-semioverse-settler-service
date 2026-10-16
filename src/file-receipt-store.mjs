import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// A paused live writer never loses its lock merely because time passed.

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

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function lockError(code, message) {
  const error = new Error(message); error.code = code; return error;
}

function acquireLock(lockPath) {
  const owner = Object.freeze({ lockId: randomUUID(), pid: process.pid,
    acquiredAt: new Date().toISOString() });
  try { mkdirSync(lockPath, { mode: 0o700 }); }
  catch (error) {
    if (error?.code !== "EEXIST") throw error;
    // Never rename/delete a lock based on a prior observation: there is no
    // atomic compare-and-rename in this portable filesystem protocol. Another
    // contender could have replaced a dead owner between the read and rename.
    let held;
    try { held = readJsonOrNull(join(lockPath, "owner.json")); }
    catch { throw lockError("RECEIPT_STORE_LOCK_RECOVERY_REQUIRED", "receipt lock owner is unreadable; exclusive owner recovery required"); }
    if (held && processIsAlive(held.pid))
      throw lockError("RECEIPT_STORE_LOCK_HELD", "receipt store lock is already held; live locks do not expire");
    throw lockError("RECEIPT_STORE_LOCK_RECOVERY_REQUIRED", "receipt lock has no verified live owner; exclusive owner recovery required");
  }
  const identity = statSync(lockPath);
  const sameDirectory = () => {
    try { const current = statSync(lockPath); return current.dev === identity.dev && current.ino === identity.ino; }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  };
  try {
    writeFileSync(join(lockPath, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, {
      encoding: "utf8", mode: 0o600, flag: "wx",
    });
  } catch (error) {
    // Leave ambiguous/incomplete ownership for exclusive recovery. Never
    // recursively remove an unverified lock while another owner might exist.
    throw error;
  }
  const owns = () => {
    if (!sameDirectory()) return false;
    try { return readJsonOrNull(join(lockPath, "owner.json"))?.lockId === owner.lockId; }
    catch { return false; }
  };
  const assertOwned = () => {
    if (!owns()) throw lockError("RECEIPT_STORE_LOCK_LOST", "receipt store lock ownership changed; refusing publication");
  };
  return { owns, assertOwned };
}

function withLock(lockPath, action) {
  const lock = acquireLock(lockPath);
  try {
    lock.assertOwned();
    return action(lock.assertOwned);
  } finally {
    if (lock.owns()) rmSync(lockPath, { recursive: true, force: true });
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
    return withLock(this.lockPath, (assertOwned) => {
      const current = readStore(this.path);
      if (Object.hasOwn(current, eventKey)) {
        throw new Error("receipt already exists for eventKey");
      }
      const next = { ...current, [eventKey]: receipt };
      const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      try {
        assertOwned();
        renameSync(temporary, this.path);
        assertOwned();
        return receipt;
      } finally {
        rmSync(temporary, { force: true });
      }
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
