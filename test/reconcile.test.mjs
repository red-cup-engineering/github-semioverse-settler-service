import assert from "node:assert/strict";
import test from "node:test";
import { reconcileGitHubDeltas } from "../src/reconcile.mjs";

const delta = (revision, eventKey = "event:" + revision) => ({
  providerObjectKey: "github:repo:561:issue:I_99", revision, eventKey,
});

function receiptSettler() {
  const receipts = new Map(), admitted = [];
  return {admitted,settle: async object => {
    if (receipts.has(object.eventKey)) return {state:"DUPLICATE_RECEIVED",receipt:receipts.get(object.eventKey)};
    const receipt = {receiptId:"receipt:" + object.eventKey};
    admitted.push(object.eventKey); receipts.set(object.eventKey,receipt);
    return {state:"RECEIVED",receipt};
  }};
}

test("nonchronological Git SHAs are all received, including a lexically earlier new head",async()=>{
  const sink=receiptSettler();
  const first=await reconcileGitHubDeltas({list:async()=>[delta("f".repeat(40))],settle:sink.settle});
  const next=await reconcileGitHubDeltas({list:async()=>[delta("0".repeat(40))],settle:sink.settle});
  assert.equal(first.newlyReceived,1);assert.equal(next.newlyReceived,1);
  assert.deepEqual(sink.admitted,["event:"+"f".repeat(40),"event:"+"0".repeat(40)]);
});

test("late older update and different material at the same revision are retained",async()=>{
  const sink=receiptSettler();
  await reconcileGitHubDeltas({list:async()=>[delta("2026-10-14T23:20:00Z","newer")],settle:sink.settle});
  const r=await reconcileGitHubDeltas({list:async()=>[
    delta("2026-10-14T23:10:00Z","older"),delta("2026-10-14T23:20:00Z","material-a"),delta("2026-10-14T23:20:00Z","material-b")
  ],settle:sink.settle});
  assert.deepEqual(sink.admitted.sort(),["newer","older","material-a","material-b"].sort());
  assert.equal(r.newlyReceived,3);assert.equal(r.pending,0);
});

test("exact event replay yields no second admission, including duplicate observations within a batch",async()=>{
  const sink=receiptSettler(),list=async()=>[delta("same"),delta("same")];
  const first=await reconcileGitHubDeltas({list,settle:sink.settle});
  const again=await reconcileGitHubDeltas({list,settle:sink.settle});
  assert.equal(first.newlyReceived,1);assert.equal(first.replayed,1);
  assert.equal(again.newlyReceived,0);assert.equal(again.replayed,2);
  assert.deepEqual(sink.admitted,["event:same"]);
});

test("unreceived events remain eligible for later independent receipt",async()=>{
  const sink=receiptSettler();let pending=true;
  const settle=async row=>pending?{state:"PENDING_RECEIVER_READBACK"}:sink.settle(row);
  const first=await reconcileGitHubDeltas({list:async()=>[delta("pending")],settle});
  assert.equal(first.pending,1);pending=false;
  const next=await reconcileGitHubDeltas({list:async()=>[delta("pending")],settle});
  assert.equal(next.newlyReceived,1);
});

test("one event key cannot be bound to contradictory provider coordinates",async()=>{
  let calls=0;
  await assert.rejects(reconcileGitHubDeltas({
    list:async()=>[delta("head-a","same-key"),delta("head-b","same-key")],
    settle:async()=>{calls++;return {state:"RECEIVED"}},
  }),/conflicting source/);
  assert.equal(calls,0);
});
