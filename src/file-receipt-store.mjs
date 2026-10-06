import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

function withLock(lockPath, action) {
  mkdirSync(lockPath);
  try {
    return action();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export class FileReceiptStore {
  constructor(path) {
    if (typeof path !== "string" || path.trim() === "") {
      throw new TypeError("receipt store path is required");
    }
    this.path = resolve(path);
    this.lockPath = `${this.path}.lock`;
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
}
