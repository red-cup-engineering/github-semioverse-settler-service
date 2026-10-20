#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { FileReceiptStore } from "../src/file-receipt-store.mjs";
import { selectGitHubSemioverseTransport } from "../src/transport-selection.mjs";
import { settleGitHubEvent } from "../src/settler.mjs";

const source = readFileSync(0, "utf8");
if (source.trim() === "") throw new Error("expected one GitHub event JSON object on stdin");

const event = JSON.parse(source);
const receiptStore = new FileReceiptStore(
  process.env.GITHUB_SEMIOVERSE_RECEIPT_FILE
    ?? ".state/github-semioverse-receipts.json",
);
const admit = await selectGitHubSemioverseTransport();

const result = await settleGitHubEvent({ event, receiptStore, admit });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
