import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractSenActivity, senActivityObjectBytes } from
  "@red-cup-engineering/activitypub-services-section/sen-activity";
import { FileReceiptStore } from "../src/file-receipt-store.mjs";
import { normalizeGitHubEvent, settleGitHubEvent, MemoryReceiptStore } from "../src/settler.mjs";
import { githubDeltaCloudEvent } from "../src/metroplat-http-admit.mjs";
import {
  GITHUB_DELTA_SEN_KIND, GITHUB_ACTOR_PENDING_KIND,
  createMetroplatActorSubmission, projectGitHubDeltaActivity,
} from "../src/metroplat-actor-delivery.mjs";
import { selectGitHubSemioverseTransport } from "../src/transport-selection.mjs";

const sourceEvent = () => ({
  action: "edited", delivery_id: "delivery-one",
  repository: { id: 561, full_name: "red-cup-engineering/git-services-section",
    private: false, html_url: "https://github.com/red-cup-engineering/git-services-section" },
  sender: { id: 33, login: "review-agent" },
  issue: {
    id: 7, node_id: "I_7", number: 1, body: "Original attributed customer requirement",
    title: "Source evidence", updated_at: "2026-10-19T18:00:00Z",
    user: { id: 44, login: "original-author" },
    html_url: "https://github.com/red-cup-engineering/git-services-section/issues/1",
  },
});
const actor = {
  origin: "https://bridge.561.group",
  identifier: "github-bridge",
  recipient: "https://cold-red-gate.561.group/actors/metroplat",
  inbox: "https://cold-red-gate.561.group/actors/metroplat/inbox",
  agentCard: "https://bridge.561.group/actors/github-bridge/agent-card.json",
  keyPath: "/commissioned/bridge-keys.json",
};
const sender = actor.origin + "/actors/" + actor.identifier;
const instant = "2026-10-19T20:00:00.000Z";
const deliveryReceipt = activity => ({
  type: "Accept", actor: sender,
  object: { type: "ActivityPubDeliveryReceipt", activity: activity.id,
    recipient: actor.recipient, inbox: actor.inbox, delivered: true },
});

test("an attributed GitHub delta crosses the original SEN and ActivityPub codec as a signed Actor's message", () => {
  const envelope = normalizeGitHubEvent(sourceEvent());
  const projected = projectGitHubDeltaActivity(envelope, actor, instant);
  const activity = projected.activity, source = projected.sourceEvent;
  assert.equal(activity.type, "Create");
  assert.equal(activity.actor, sender, "signed bridge identity is not a GitHub author");
  assert.equal(activity.to, actor.recipient);
  assert.equal(source.source, "urn:github:repository:561");
  assert.equal(source.data.source.author, "original-author");
  assert.equal(source.data.source.actor, "review-agent");
  assert.equal(source.data.source.deliveryId, undefined);
  const admitted = extractSenActivity(activity, {
    expectedActor: sender, expectedRecipient: actor.recipient,
    expectedAgentCard: actor.agentCard,
  });
  assert.deepEqual(Buffer.from(admitted.objectBytes), Buffer.from(
    senActivityObjectBytes({objectKind:GITHUB_DELTA_SEN_KIND,value:source})));
  assert.equal(admitted.cloudEvent.specversion, "1.0");
  assert.equal(admitted.cloudEvent.source, sender);
  assert.equal(admitted.cloudEvent.subject, actor.recipient);
  assert.equal(admitted.cloudEvent.data.transport, "A2A");
  assert.equal(admitted.cloudEvent.data.profile, "org.harmonious-union.activitypub.cloudevent.a2a-sen.v1");
  assert.match(source.id, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
  assert.equal(activity.object.mediaType, "application/sen+cbor");
});

test("one ActivityPub delivery leaves durable pending receiver readback, not a counterfeit Semioverse receipt", async t => {
  const root = mkdtempSync(join(tmpdir(), "github-actor-submission-"));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const stored = new FileReceiptStore(join(root, "receipts.json"));
  let sends=0,delivered;
  const admit = createMetroplatActorSubmission({...actor,now:()=>instant,
    deliver:async (activity,options)=> {
      sends++;delivered={activity,options};
      return deliveryReceipt(activity);
    },
  });
  assert.equal(admit.requiresDurableClaim, true);
  const first = await settleGitHubEvent({event:sourceEvent(),receiptStore:stored,admit});
  assert.equal(first.state, "PENDING_RECEIVER_READBACK");
  assert.equal(first.transport.kind, GITHUB_ACTOR_PENDING_KIND);
  assert.equal(first.transport.state, "PENDING_RECEIVER_READBACK");
  assert.equal(first.transport.senderActor, sender);
  assert.equal(first.transport.recipientActor, actor.recipient);
  assert.equal(first.transport.sourceCloudEventId, githubDeltaCloudEvent(first.envelope).id);
  assert.equal(delivered.options.keyPath, actor.keyPath);
  assert.equal(delivered.options.recipient, actor.recipient);
  assert.equal(stored.get(first.envelope.eventKey), null, "transport alone cannot become Semioverse admission");
  assert.equal(stored.getClaim(first.claim.eventKey).claimId, first.claim.claimId);
  assert.equal(first.claim.eventKey, admit.receiptKey(first.envelope));
  assert.match(first.claim.eventKey, /^activitypub:github-delta:ni:\/\/\/sha-256;/u);
  const again = await settleGitHubEvent({event:{...sourceEvent(),delivery_id:"delivery-two"},
    receiptStore:new FileReceiptStore(stored.path),admit});
  assert.equal(again.state, "PENDING_RECEIVER_READBACK");
  assert.equal(again.claim.claimId,first.claim.claimId);
  assert.equal(sends, 1, "retry cannot re-send an uncertain effect before native readback");
});

test("different triggering GitHub Actor testimony on one material revision requires a new source-NI delivery, not replay of the old claim", async t => {
  const root = mkdtempSync(join(tmpdir(), "github-actor-source-provenance-"));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const store = new FileReceiptStore(join(root,"receipts.json"));
  let deliveries=0;
  const admit = createMetroplatActorSubmission({...actor,now:()=>instant,
    deliver:async activity=>{deliveries++;return deliveryReceipt(activity);},
  });
  const first = await settleGitHubEvent({event:sourceEvent(),receiptStore:store,admit});
  const changed = sourceEvent();
  changed.sender = { id: 45, login: "other-triggering-actor" };
  const second = await settleGitHubEvent({event:changed,receiptStore:store,admit});
  assert.equal(first.envelope.eventKey,second.envelope.eventKey,
    "the historic material-only key cannot distinguish triggering actors");
  assert.notEqual(first.transport.sourceCloudEventId,second.transport.sourceCloudEventId);
  assert.notEqual(first.claim.eventKey,second.claim.eventKey,
    "native Actor transport must bind the complete original source claim");
  assert.equal(second.state,"PENDING_RECEIVER_READBACK");
  assert.equal(deliveries,2);
  const duplicate = await settleGitHubEvent({event:{...changed,delivery_id:"retry"},receiptStore:new FileReceiptStore(store.path),admit});
  assert.equal(duplicate.claim.eventKey,second.claim.eventKey);
  assert.equal(deliveries,2,"a transport retry has no new GitHub fact");
});

test("a transported activity cannot claim a different source event than the one whose exact NI was held", async t => {
  const root = mkdtempSync(join(tmpdir(), "github-actor-foreign-ni-"));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const store = new FileReceiptStore(join(root,"receipts.json"));
  const ni = "ni:///sha-256;" + "A".repeat(43);
  const foreign = "ni:///sha-256;" + "B".repeat(43);
  const admit = async envelope => ({
    kind:GITHUB_ACTOR_PENDING_KIND,state:"PENDING_RECEIVER_READBACK",
    eventKey:envelope.eventKey,sourceCloudEventId:foreign,
    activityId:"https://bridge.example/activities/forged",
    senderActor:sender,recipientActor:actor.recipient,
  });
  admit.requiresDurableClaim=true;
  admit.receiptKey=()=> "activitypub:github-delta:" + ni;
  await assert.rejects(settleGitHubEvent({event:sourceEvent(),receiptStore:store,admit}),
    /qualified pending readback/u);
  assert.equal(store.get("activitypub:github-delta:" + ni),null);
  assert.ok(store.getClaim("activitypub:github-delta:" + ni),
    "uncertain transmission remains a claim but is never marked received");
});

test("without a durable in-flight claim no signed work may be sent", async () => {
  let sent=false;
  const admit = createMetroplatActorSubmission({...actor,
    deliver:async()=>{sent=true;return {};}});
  await assert.rejects(settleGitHubEvent({event:sourceEvent(),
    receiptStore:new MemoryReceiptStore(),admit}),/durable receiver-readback claim/u);
  assert.equal(sent,false);
});

test("an ActivityPub transport receipt with substituted coordinates cannot become a pending success", async () => {
  const normalized=normalizeGitHubEvent(sourceEvent());
  const admit=createMetroplatActorSubmission({...actor,
    deliver:async activity=>({...deliveryReceipt(activity),object:{
      ...deliveryReceipt(activity).object,recipient:"https://wrong.example/actors/other",
    }}),
  });
  await assert.rejects(admit(normalized),/exact delivery receipt/u);
});

test("private or unknown GitHub audience, forged identity, and wrong recipient refused before signed delivery", () => {
  const envelope=normalizeGitHubEvent(sourceEvent());
  for(const visibility of [undefined,true]){
    const original=sourceEvent();original.repository.private=visibility;
    assert.throws(()=>projectGitHubDeltaActivity(normalizeGitHubEvent(original),actor,instant),
      /public Actor audience/u);
  }
  for(const violation of [
    {recipient:"http://cold-red-gate.561.group/actors/metroplat"},
    {recipient:"https://cold-red-gate.561.group/actors/metroplat?as=admin"},
    {inbox:"https://unrelated.example/inbox"},
    {agentCard:"http://bridge.561.group/agent-card"},
    {origin:"https://another-host.example/path"},
    {identifier:"../admin"},
    {keyPath:""},
  ]) assert.throws(()=>createMetroplatActorSubmission({...actor,...violation}),TypeError,
      JSON.stringify(violation));
  assert.equal(envelope.source.visibility,"public");
});

test("representation preflight rejects a nonpublic source before opening durable claims or any Actor transport", async t => {
  const root = mkdtempSync(join(tmpdir(), "github-actor-preflight-"));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const store = new FileReceiptStore(join(root, "receipts.json"));
  const privateEvent = sourceEvent();
  privateEvent.repository.private = true;
  let sent = 0;
  const admit = createMetroplatActorSubmission({...actor,deliver: async () => {sent++;throw new Error("must not send");}});
  assert.equal(typeof admit.preflight, "function");
  await assert.rejects(
    settleGitHubEvent({event:privateEvent,receiptStore:store,admit}),
    /public Actor audience/u,
  );
  const privateKey = normalizeGitHubEvent(privateEvent).eventKey;
  assert.equal(store.get(privateKey), null);
  assert.equal(store.getClaim(privateKey), null, "known invalid content is not a ghost pending effect");
  assert.equal(sent,0);
});

test("transport selection preserves the existing received /arrivals route and never downgrades failed Actor configuration", async () => {
  const http = await selectGitHubSemioverseTransport({
    environment:{METROPLAT_ARRIVAL_URL:"https://cold-red-gate.561.group/arrivals"},
    fetchImpl:async()=>new Response(JSON.stringify({
      kind:"metroplat.arrival.receipt",ok:true,
      cloudEventIdentity:"source#event",packetDigest:"digest",
    }),{status:202}),
  });
  const admitted=await http(normalizeGitHubEvent(sourceEvent()));
  assert.equal(admitted.receiptId,"metroplat-arrival:source#event:digest");
  const actorConfig = {
    GITHUB_SEMIOVERSE_TRANSPORT:"activitypub",
    ACTIVITYPUB_ORIGIN:actor.origin,ACTIVITYPUB_IDENTIFIER:actor.identifier,
    ACTIVITYPUB_RECIPIENT:actor.recipient,ACTIVITYPUB_RECIPIENT_INBOX:actor.inbox,
    ACTIVITYPUB_AGENT_CARD:actor.agentCard,ACTIVITYPUB_KEYS_PATH:actor.keyPath,
  };
  let calls=0;
  const actorTransport=await selectGitHubSemioverseTransport({
    environment:actorConfig,
    deliverActor:async activity=>{calls++;return deliveryReceipt(activity);},
  });
  const delta=await actorTransport(normalizeGitHubEvent(sourceEvent()));
  assert.equal(delta.kind,GITHUB_ACTOR_PENDING_KIND);
  assert.equal(calls,1);
  await assert.rejects(selectGitHubSemioverseTransport({
    environment:{...actorConfig,ACTIVITYPUB_KEYS_PATH:""},
    deliverActor:async()=>{throw new Error("network should not open");},
  }),/ACTIVITYPUB_KEYS_PATH/u);
  await assert.rejects(selectGitHubSemioverseTransport({
    environment:{...actorConfig,GITHUB_SEMIOVERSE_TRANSPORT:"fallback"},
  }),/GITHUB_SEMIOVERSE_TRANSPORT/u);
});
