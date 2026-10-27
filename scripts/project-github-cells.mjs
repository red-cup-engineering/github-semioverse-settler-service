#!/usr/bin/env node
import { normalizeGitHubEvent } from '../src/settler.mjs';
import { projectGitHubCells, gitHubCellCloudEvents } from '../src/github-cells.mjs';

// The same provider payload as settle-github-event, without network or Work effects.
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--cloud-events') || args.length > 1)
    throw new TypeError('usage: project-github-cells [--cloud-events] < event.json');
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 256 * 1024) throw new RangeError('GitHub event exceeds 256 KiB');
    chunks.push(chunk);
  }
  let event;
  try { event = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new TypeError('stdin must contain one GitHub event JSON object'); }
  const sourceCells = projectGitHubCells(normalizeGitHubEvent(event));
  process.stdout.write(JSON.stringify({ sourceCells,
    ...(args.includes('--cloud-events') ? { cloudEvents: gitHubCellCloudEvents(sourceCells) } : {}) }) + '\n');
} catch (error) {
  process.stderr.write(`GitHub Cell projection failed: ${error.message}\n`);
  process.exitCode = 1;
}
