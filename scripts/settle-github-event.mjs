#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { FileReceiptStore } from "../src/file-receipt-store.mjs";
import { createMetroplatArrivalAdmit } from "../src/metroplat-http-admit.mjs";
import { settleGitHubEvent } from "../src/settler.mjs";

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

const source = readFileSync(0, "utf8");
if (source.trim() === "") throw new Error("expected one GitHub event JSON object on stdin");

const event = JSON.parse(source);
const receiptStore = new FileReceiptStore(
  process.env.GITHUB_SEMIOVERSE_RECEIPT_FILE
    ?? ".state/github-semioverse-receipts.json",
);
const admit = createMetroplatArrivalAdmit({
  url: requiredEnv("METROPLAT_ARRIVAL_URL"),
  ...(process.env.METROPLAT_AUTHORIZATION === undefined
    ? {}
    : { authorization: process.env.METROPLAT_AUTHORIZATION }),
});

const result = await settleGitHubEvent({ event, receiptStore, admit });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
