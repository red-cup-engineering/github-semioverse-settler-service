import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { sidesOf, cellSetAddress } from '@red-cup-engineering/signcell/cell';
import { cellFromCloudEvent } from '@red-cup-engineering/signcell/cloud-events';
import { normalizeGitHubEvent, settleGitHubEnvelope, settleGitHubEvent, MemoryReceiptStore } from '../src/settler.mjs';
import { prepareGitHubWork, receivePreparedGitHubWork } from '../src/native-work-receiving.mjs';
import { createMetroplatArrivalAdmit } from '../src/metroplat-http-admit.mjs';

const event = () => ({
  repository: { id: 561, full_name: 'house/service', private: false },
  action: 'opened', delivery_id: 'delivery-one',
  issue: { id: 71, node_id: 'I_71', number: 7, title: 'Restore the endpoint',
    body: 'The endpoint must retain the original request after a retry.',
    state: 'open', updated_at: '2026-10-27T01:00:00Z',
    html_url: 'https://github.com/house/service/issues/7' },
});
const request = source => ({ event: source,
  opening: { move: 'request', purpose: 'Restore the named endpoint.' },
  binding: { repositoryId: 561, visibility: 'public', receiver: 'service-operations', scope: ['service:endpoint'] },
});
const nativeThread = prepared => ({ id: 'native-existing-work',
  opening: { ...prepared.input, by: 'native-actor' }, home: 'service-operations', standing: 'open' });

test('ordinary webhook and replay settlement expose the same native Cells without a second effect', async () => {
  const receiptStore = new MemoryReceiptStore();
  let calls = 0;
  const admit = async () => ({ receiptId: `native-arrival:${++calls}` });
  const first = await settleGitHubEvent({ event: event(), receiptStore, admit });
  const replay = await settleGitHubEvent({ event: { ...event(), delivery_id: 'delivery-two' }, receiptStore, admit });
  assert.equal(first.state, 'RECEIVED');
  assert.equal(replay.state, 'DUPLICATE_RECEIVED');
  assert.equal(calls, 1);
  assert.equal(first.sourceCells.cellSetId, replay.sourceCells.cellSetId);
  assert.equal(first.sourceCells.cellSetId, cellSetAddress(first.sourceCells.cells));
  assert.equal(Object.hasOwn(first, 'workCells'), false, 'arrival is not native Work admission');
});

test('forged object coordinates refuse before a durable claim or admission', async () => {
  const envelope = structuredClone(normalizeGitHubEvent(event()));
  envelope.source.objectId = 'I_another';
  envelope.providerObjectKey = 'github:repo:561:issue:I_another';
  envelope.eventKey = `${envelope.providerObjectKey}:revision:${envelope.source.revision}:action:${envelope.action}:material:${envelope.materialIdentity}`;
  let effects = 0;
  await assert.rejects(settleGitHubEnvelope({ envelope,
    receiptStore: { get: () => null, put: () => effects++, claim: () => { effects++; return { state: 'ACQUIRED' }; }, clearClaim() {} },
    admit: async () => { effects++; return { receiptId: 'wrong' }; },
  }), /does not bind/);
  assert.equal(effects, 0);
});

test('HTTP receipts distinguish corrected provenance and preserve historical receipt meaning', async () => {
  const old = event();
  old.sender = { login: 'earlier-actor', id: 5 };
  const corrected = { ...old, sender: { login: 'current-actor', id: 6 } };
  const oldEnvelope = normalizeGitHubEvent(old);
  const receiptStore = new MemoryReceiptStore();
  const historical = { receiptId: 'historical-event-key-receipt' };
  receiptStore.put(oldEnvelope.eventKey, historical);
  let arrivals = 0;
  const admit = createMetroplatArrivalAdmit({ url: 'https://metroplat.example/arrivals', fetchImpl: async () => {
    arrivals++;
    return { ok: true, text: async () => JSON.stringify({ kind: 'metroplat.arrival.receipt', ok: true,
      cloudEventIdentity: `source-${arrivals}`, packetDigest: `packet-${arrivals}` }) };
  } });
  const first = await settleGitHubEvent({ event: corrected, receiptStore, admit });
  const replay = await settleGitHubEvent({ event: { ...corrected, delivery_id: 'another-delivery' }, receiptStore, admit });
  assert.equal(first.state, 'RECEIVED');
  assert.equal(replay.state, 'DUPLICATE_RECEIVED');
  assert.equal(arrivals, 1);
  assert.deepEqual(receiptStore.get(oldEnvelope.eventKey), historical);
  assert.notEqual(admit.receiptKey(oldEnvelope), admit.receiptKey(first.envelope));
  assert.equal(oldEnvelope.eventKey, first.envelope.eventKey, 'historical key cannot distinguish provenance');
});

test('a pending admission sees the same immutable snapshot as its source Cells', async () => {
  const supplied = event();
  supplied.issue.user = { login: 'original-author', id: 9 };
  const envelope = normalizeGitHubEvent(supplied);
  let resume;
  const ready = new Promise(resolve => { resume = resolve; });
  const result = settleGitHubEnvelope({ envelope, receiptStore: new MemoryReceiptStore(), admit: async source => {
    await ready;
    assert.equal(source.material.user.login, 'original-author');
    return { receiptId: 'same-snapshot' };
  } });
  envelope.material.user.login = 'mutation-after-selection';
  resume();
  const received = await result;
  assert.equal(received.envelope.material.user.login, 'original-author');
});

test('checks and merge groups keep their tested candidate instead of becoming repository updates', () => {
  const repository = event().repository;
  for (const type of ['check_run', 'check_suite', 'merge_group']) {
    const payload = { head_sha: 'a'.repeat(40), base_sha: 'b'.repeat(40), status: 'completed', conclusion: 'success',
      ...(type === 'merge_group' ? {} : { id: 89, node_id: `${type}_89`, name: 'native qualification', app: { id: 45 } }) };
    const envelope = normalizeGitHubEvent({ repository, action: 'completed', [type]: payload });
    assert.equal(envelope.source.objectType, type);
    assert.equal(envelope.source.revision, payload.head_sha);
    assert.equal(envelope.material.head_sha, payload.head_sha);
  }
});

test('the original native opening keeps its journal contract and returns Cells from actual readback', async () => {
  const prepared = prepareGitHubWork(request(event()));
  assert.equal(prepared.input.sources.length, 2);
  assert.equal(Object.hasOwn(prepared.input, 'sourceCells'), false);
  assert.equal(prepared.sourceCells.subject, 'github:repo:561:issue:number:7');
  let opened = 0;
  let actual;
  const receipt = await receivePreparedGitHubWork({ prepared, call: async (verb, args) => {
    if (verb === 'work-open') { opened++; actual = nativeThread(prepared); return { id: actual.id }; }
    if (args.source) return { position: 'before', threads: [], refused: 0, matched: 0 };
    return { threads: [actual] };
  } });
  assert.equal(opened, 1);
  assert.equal(receipt.workCells.subject, actual.id);
  assert.equal(receipt.workCells.sourceSubject, prepared.sourceCells.subject);
  assert.equal(receipt.workCells.sourceObservation, receipt.sourceCells.observation);
  assert.equal(receipt.workCells.next, 'continue-native-work');
  const acceptance = receipt.workCells.cells.find(at => at.predicate === 'work.customer-accepted');
  assert.deepEqual(sidesOf(acceptance), [false, false]);
});

test('native replay reconstructs the retained source Cells without writing another Work record', async () => {
  const first = prepareGitHubWork(request(event()));
  const actual = nativeThread(first);
  const call = async verb => {
    assert.equal(verb, 'work-board');
    return { position: 'same', threads: [actual], refused: 0, matched: 1 };
  };
  const before = await receivePreparedGitHubWork({ prepared: first, call });
  const again = prepareGitHubWork(request({ ...event(), delivery_id: 'redelivery' }));
  const after = await receivePreparedGitHubWork({ prepared: again, call });
  assert.equal(after.replay, true);
  assert.equal(after.stages.offeredSourceRetained, false);
  assert.equal(before.sourceCells.cellSetId, after.sourceCells.cellSetId);
  assert.equal(before.workCells.cellSetId, after.workCells.cellSetId);
  assert.equal(after.sourceDocument, before.sourceDocument);
});

test('the installed-command source path emits native claim CloudEvents with no receiving claim', () => {
  const result = spawnSync(process.execPath, [new URL('../scripts/project-github-cells.mjs', import.meta.url).pathname, '--cloud-events'],
    { input: JSON.stringify(event()), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.sourceCells.subject, 'github:repo:561:issue:number:7');
  assert.equal(output.cloudEvents.length, output.sourceCells.cells.length);
  assert.equal(cellSetAddress(output.cloudEvents.map(cellFromCloudEvent)), output.sourceCells.cellSetId);
  assert.equal(Object.hasOwn(output, 'receipt'), false);
});

test('the projection command rejects an overbound event without partial output', () => {
  const result = spawnSync(process.execPath, [new URL('../scripts/project-github-cells.mjs', import.meta.url).pathname],
    { input: ' '.repeat(256 * 1024 + 1), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /exceeds 256 KiB/);
});

test('the real reconcile CLI carries polled Cells through HTTP receipt and restart replay', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'github-cell-reconcile-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const source = event();
  const repository = { ...source.repository, owner: { login: 'house' } };
  writeFileSync(join(folder, 'gh'), `#!/usr/bin/env node
const path = process.argv[3];
if (path.startsWith('user/repos?')) process.stdout.write(JSON.stringify(${JSON.stringify([repository])}));
else if (path.startsWith('repos/house/service/issues?')) process.stdout.write(JSON.stringify(${JSON.stringify([source.issue])}));
else { process.stderr.write('unexpected fixture provider path'); process.exitCode = 1; }
`, { mode: 0o755 });
  let arrivals = 0;
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks)));
    arrivals++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ kind: 'metroplat.arrival.receipt', ok: true,
      cloudEventIdentity: `source-${arrivals}`, packetDigest: `packet-${arrivals}` }));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const execute = () => promisify(execFile)(process.execPath,
    [new URL('../scripts/reconcile-github.mjs', import.meta.url).pathname], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: `${folder}:${process.env.PATH}`,
        GITHUB_SETTLER_OWNERS: 'house', GITHUB_SETTLER_STATE: 'open',
        GITHUB_SETTLER_SINCE: '2026-10-26T00:00:00Z',
        GITHUB_SEMIOVERSE_TRANSPORT: 'cloudevents-http',
        GITHUB_SEMIOVERSE_RECEIPT_FILE: join(folder, 'receipts.json'),
        METROPLAT_ARRIVAL_URL: `http://127.0.0.1:${server.address().port}/arrivals`,
        METROPLAT_AUTHORIZATION: 'fixture-only',
      },
    });
  const first = JSON.parse((await execute()).stdout);
  const second = JSON.parse((await execute()).stdout);
  assert.equal(first.newlyReceived, 1);
  assert.equal(second.replayed, 1);
  assert.equal(arrivals, 1);
  assert.equal(first.results[0].sourceCells.subject, 'github:repo:561:issue:number:7');
  assert.equal(first.results[0].sourceCells.cellSetId, second.results[0].sourceCells.cellSetId);
  assert.equal(received[0].data.material.body, source.issue.body);
  assert.equal(Object.hasOwn(received[0].data, 'revision'), false, 'poll metadata does not change the closed source envelope');
});

test('the real reconcile CLI consumes archive census JSON into native Cells and replays without another arrival', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'github-ref-cells-cli-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const repository = { id: 561, full_name: 'house/service', owner: { login: 'house' },
    default_branch: 'main', private: false };
  const refName = 'refs/tags/archive/preserved';
  const objectSha = 'a'.repeat(40);
  const ref = { ref: refName, object: { type: 'tag', sha: objectSha } };
  const census = { recordKind: 'github.archive-ref-census/v1',
    repositoryId: repository.id, repositoryFullName: repository.full_name,
    defaultBranch: 'main', defaultHeadSha: 'b'.repeat(40),
    sourceCoverage: 'complete-exact-archive-ref-list-at-two-reads',
    prefix: 'refs/tags/archive', count: 1, effectsPerformed: false,
    refs: [{ recordKind: 'github.archive-ref-observation/v1', refName, objectSha,
      objectType: 'tag', sourceConsumerReceiving: 'not-observed', automaticRefRetirementAllowed: false }] };
  const censusPath = join(folder, 'census.json');
  writeFileSync(censusPath, JSON.stringify({ sourceRefAssays: [census] }));
  writeFileSync(join(folder, 'gh'), '#!/usr/bin/env node\n' +
    'const args = process.argv.slice(2);\n' +
    'if (args[0] !== "api") process.exit(21);\n' +
    `if (args[1] === "repos/house/service") process.stdout.write(${JSON.stringify(JSON.stringify(repository))});\n` +
    `else if (args[1] === "repos/house/service/git/ref/tags/archive/preserved") process.stdout.write(${JSON.stringify(JSON.stringify(ref))});\n` +
    'else { process.stderr.write("Unselected source: " + args[1]); process.exit(22); }\n',
    { mode: 0o755 });
  const received = [];
  const server = createServer(async (req, res) => {
    assert.equal(req.url, '/arrivals');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks)));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ kind: 'metroplat.arrival.receipt', ok: true,
      cloudEventIdentity: 'archive-source-arrival', packetDigest: 'archive-source-packet' }));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const env = { ...process.env, PATH: `${folder}:${process.env.PATH}`,
    GITHUB_SETTLER_OWNERS: 'house', GITHUB_SETTLER_STATE: 'open',
    GITHUB_SETTLER_ARCHIVE_CENSUS_FILE: censusPath,
    GITHUB_SETTLER_ARCHIVE_SELECTED_REFS: JSON.stringify([refName]),
    GITHUB_SETTLER_INCLUDE_REFS: '0', GITHUB_SETTLER_INCLUDE_DISCUSSION: '0',
    GITHUB_SEMIOVERSE_TRANSPORT: 'cloudevents-http',
    GITHUB_SEMIOVERSE_RECEIPT_FILE: join(folder, 'receipts.json'),
    METROPLAT_ARRIVAL_URL: `http://127.0.0.1:${server.address().port}/arrivals`,
    METROPLAT_AUTHORIZATION: 'fixture-only',
  };
  delete env.GITHUB_SETTLER_SINCE;
  delete env.GITHUB_SETTLER_ARCHIVE_REF_SELECTIONS;
  const execute = async () => JSON.parse((await promisify(execFile)(process.execPath,
    [new URL('../scripts/reconcile-github.mjs', import.meta.url).pathname], {
      encoding: 'utf8', timeout: 15000, env,
    })).stdout);
  const first = await execute(), replay = await execute();
  assert.equal(first.newlyReceived, 1);
  assert.equal(replay.replayed, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].data.source.objectId, refName);
  assert.equal(received[0].data.source.objectType, 'git_ref');
  assert.equal(received[0].data.material.object.type, 'tag');
  const projection = first.results[0].sourceCells;
  assert.equal(projection.cells.find(value => value.predicate === 'git.object-id').object, objectSha);
  assert.equal(projection.cellSetId, replay.results[0].sourceCells.cellSetId);
});
