import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileReceiptStore } from "../src/file-receipt-store.mjs";

test("aged live receipt-store write lock never expires", () => {
  const dir = mkdtempSync(join(tmpdir(), "receipt-lock-"));
  try {
    const path = join(dir, "receipts.json");
    const lockPath = `${path}.lock`;
    mkdirSync(lockPath);
    writeFileSync(join(lockPath, "owner.json"), JSON.stringify({
      lockId: "stale",
      pid: process.pid,
      acquiredAt: "2000-01-01T00:00:00.000Z",
    }));
    const store = new FileReceiptStore(path);
    assert.throws(() => store.put("event:1", { receiptId: "semioverse:1" }),
      error => error.code === "RECEIPT_STORE_LOCK_HELD");
    assert.equal(store.get("event:1"), null);
    assert.equal(existsSync(lockPath), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live receipt-store write lock is not stolen", () => {
  const dir = mkdtempSync(join(tmpdir(), "receipt-lock-"));
  try {
    const path = join(dir, "receipts.json");
    const lockPath = `${path}.lock`;
    mkdirSync(lockPath);
    writeFileSync(join(lockPath, "owner.json"), JSON.stringify({
      lockId: "live",
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    }));
    const store = new FileReceiptStore(path);
    assert.throws(
      () => store.put("event:1", { receiptId: "semioverse:1" }),
      (error) => error?.code === "RECEIPT_STORE_LOCK_HELD",
    );
    assert.equal(existsSync(lockPath), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
