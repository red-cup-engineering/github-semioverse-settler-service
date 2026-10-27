# GitHub Semioverse settler service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Deterministic GitHub→MetroPlat receiving core for `red-cup-engineering/git-engineering-services-section#1`.

This package keeps GitHub provider identity distinct from organizational truth. It normalizes selected material GitHub deltas into typed envelopes, produces native SignCell evidence from those observations, preserves repository ID plus observed owner/name, binds exact provider revision, and provides replay-safe settlement through a durable receipt store. Verified native Work readback also produces Cells about the existing thread and a deterministic next receiving action.

Issue comments, PR review comments, and reviews retain their own provider
identities and parent links. The arrival retains the exact object material,
original author, triggering actor, repository visibility, and an NI commitment.
Material edits on an unchanged PR head and workflow reruns remain distinct;
transport retries converge. `submission` extracts the Group's public filing
form fields as testimony, including complaint/requirement/idea distinctions
and the requester's satisfaction conditions. It grants no effect authority.

The former normalizer discarded this material and keyed some deltas only by
the parent/head. Its receipts cannot prove reception of the content it dropped.
The material-bearing event keys deliberately require a new receiving receipt;
do not migrate old metadata-only receipts as evidence of complete admission.

## Source provenance contract

For issue #1's provider provenance requirement, `source.author`/`authorId`
identify the material's `object.user`. `source.actor`/`actorId` identify only
the supplied webhook `sender`, the triggering actor. A repository snapshot
does not identify who triggered the observed change: polling omits `sender`,
so both actor fields remain null. The authenticated polling observer is a
different principal and is not substituted into either source role. Missing
triggering-actor evidence does not prohibit native admission; the existing
verified binding, public audience and authenticated native operation port
continue to govern receiving.

`github-poll.mjs` passes complete issue/PR material and exact PR heads to the
existing normalizer. No actor inference, new gate or transport is introduced.
`test/github-poll.test.mjs` covers snapshot attribution and provider identity;
`test/settler.test.mjs` covers real sender separation and historical receipts;
`test/native-work-receiving.test.mjs` covers absent-sender admission, exact
readback/replay, changed provenance/interpretation and audience refusals.

The envelope's historical `eventKey` still binds material, object, revision and
action. It does not bind every provenance field. The HTTP adapter now selects a
`cloudevent:github-delta:<NI>` receipt key from the complete source CloudEvent,
including author, triggering actor, visibility and parent type. Corrected source
provenance therefore requires its own receipt; unchanged transport retries reuse
that receipt. The signed Actor transport retains its separate existing key.
Custom admission ports without `receiptKey` retain their explicit historical
event-key behavior.

Existing metadata-only event-key receipts are preserved unchanged. They are not
upgraded into proof of complete source receiving and do not suppress the first
qualified HTTP admission. This requires one new receipt for an already observed
source when the upgraded HTTP path is first used; reconcile actual native Work
through its original retained source/thread as before. No receipt is deleted or
relabelled, and the change does not repair previously lost source evidence.

## Reconciliation preserves each observed source revision

The reconciler passes every material-bound provider event to the existing
durable settler and its selected transport receipt identity. Git SHAs are opaque identifiers, not ordered clocks;
two edits can also have the same timestamp. No lexicographic/numeric/timestamp
high-water can prove an earlier event was already received. The misleading
high-water store and its skip rule have been retired.

The poller passes normalized GitHub snapshots to `settleGitHubEnvelope`, the
same durable receipt and replay mechanism used for webhook intake. Exact replay
reuses the retained receipt. Different material receives a distinct event
identity even when a head SHA or timestamp is unchanged. Pending source
admission is never called settled. Reconciliation exposes `newlyReceived`,
`replayed` and `pending` separately.

This change cannot reconstruct past edits that GitHub no longer serves;
webhook retention, runtime installation and the Semioverse receiver's own
readback remain separate work. Cold Red Gate's outage is not resolved by this
source correction.

## Use MetroPlat's supplied-CloudEvent arrival boundary

The GitHub delta's eventKey already binds observed material, provider object
identity, revision and action. The ingress adapter projects that existing
event into standard CloudEvents 1.0 with a canonical SHA-256 NI event ID,
stable numeric GitHub repository source, GitHub delta type and the original
provenance-bearing observation as data. Only the transport delivery ID is
excluded from source identity, so retries of an unchanged normalized revision are byte-identical while
distinct repository aliases or actors cannot collide under one CloudEvent ID.
The original eventKey remains inside the typed observation. This is source custody, **not** a new Semiotic Lineage Control
format or an institutional authority claim.

Configure METROPLAT_ARRIVAL_URL to the genuine /arrivals path on the receiving
MetroPlat service. **Do not configure /**: root POST records an HTTP transport
observation of the request; it does not admit the enclosed GitHub event as a
supplied CloudEvent. The adapter rejects root and unrelated paths outright.
The receiver's native /arrivals route validates the supplied CloudEvent.

The returned MetroPlat receipt proves arrival custody only. Work Arena
admission, owner and office selection, interpretation of typed locutions,
semantics, production installation and downstream customer receiving remain
separate. The receipt does not discharge a duty. This alpha migration requires
correction of prior root-URL configuration, with no silent compatibility shim.

## Work coordinate reading is not work admission

`normalizeGitHubEvent` preserves the complete source material, author,
triggering actor, action, revision and NI commitment regardless of whether a work
coordinate can be interpreted. Its existing `work` projection accepts
scalar declarations only in a complete leading YAML frontmatter envelope or
an initial sequence of unindented `key: value` lines. It reads the retained
WorkUnit vocabulary (`work_ref`, `owning_office`, `owner`, `receiver`,
`acceptance_test`, causal links and coordination fields). The projection
does **not** parse nested YAML as operative office law.

A quoted statement, example fence, indented code, prose paragraph, Markdown
heading, incomplete frontmatter, or later body occurrence of `owner:`
is a **locution in source evidence**, not an instruction naming an office.
Repeated equivalent keys may corroborate a value; conflicting declarations
of one normalized key, or incompatible `owner`/`owning_office`, refuse
that selected coordinate. Both readings remain in `material.body` and
in the content-addressed provider observation; no part is deleted or
silently settled by string order.

This protects GitHub-to-Work intake, not institutional semantics. The
source's `work.owner` is untrusted testimony until an authenticated
Work Arena/Coesite/Group receiver independently qualifies the principal,
jurisdiction, office duty, authority, original obligation and receiving
condition. It cannot appoint an agent or admit a contract. This reflects
[L-Space's current SAS](https://github.com/lenticule-science/linguistics-services-section/blob/main/specifications/l-space-semantic-architecture.md)
and [Red Cup's existing HLD/LLD](https://github.com/red-cup-engineering/capability-cell-fabrication-engineering-services-section/blob/main/specifications/l-space-lld.md),
which distinguish attributed words, illocutionary force, formal evidence and
received institutional effects. `test/settler.test.mjs` now includes the
corresponding positive, contradiction and quotation/refusal cases.

## Observe the actual GitHub estate

Run `node scripts/observe-github.mjs` with authenticated `gh`. It discovers the
current account, its organizations, and accessible repositories from paginated
GitHub APIs, then reads every open issue and PR in those owner namespaces.
`--owner NAME` may be repeated to select explicit namespaces; `--summary`
prints coverage counts only. `--pull-checks` additionally reads the exact PR
head, commit statuses, check runs, and review facts. Fetch the issue/PR, comments, and reviews
at their returned URLs when evaluating or acting on an obligation.

For a bounded assignment, repeat `--repository OWNER/NAME` instead of `--owner`.
This reads the authenticated principal and exactly those repository records and
issue endpoints, without listing accessible repositories, organizations, or
searching whole owner namespaces. Names are case-insensitively deduplicated;
an unexpected repository identity, wrong-repository item, repeated issue identity
(including an issue transferred between selected repositories during the scan),
or failed page refuses complete coverage. Owner and repository selectors cannot
be mixed. For example, from this service directory:

```sh
node scripts/observe-github.mjs --repository red-cup-engineering/github-semioverse-settler-service --pull-checks
```

Repository-scoped completion and owner-count rows explicitly name
`scope: "selected-repositories"`. Completion retains the selected repository IDs
and observed names, and deliberately omits `accessibleRepositories`: this run
did not enumerate the account's wider estate. Existing owner-scoped coverage
remains an owner enumeration. `--branches` and `--closed-since` operate within
the selected scope in either mode.

`--branches` also paginates every selected repository's branch heads and
compares each distinct head with the exact observed default commit. Its rows
retain ahead/behind counts and archived status; unmerged commits require
capability and source review, not automatic merging. Completion explicitly
records `branchHeads: true`; an issue/PR-only scan does not cover branches.

With `--pull-checks`, check-run pages must retain a stable total count, unique
positive identities and the exact selected commit. Every review page is read;
rows preserve review identity, reviewer identity, state, source commit, submitted
time and locator. `matchesHead` reports commit equality only. Stale approvals,
dismissed reviews and pending reviews remain visible; no approval, independence,
required-review satisfaction or merge authority is inferred. The original PR is
read again after collection; a moved head refuses complete evidence. Completion
records `pullReviews: true` only when this observation was selected.

`--pull-checks` also preserves the provider's `mergeableState` and `autoMerge`
facts. `baseSnapshot` is the base commit returned by the PR API; it is never
presented as the current branch head. `targetBranch` is independently read from
the PR's named target repository and branch before and after collection. A moved
head, changed target, moved target branch, malformed branch response, or missing
mergeability fact refuses complete evidence. Branch names are encoded as one API
path segment. In repository-scoped mode, both PR reads must retain the selected
repository's numeric ID; the same owner/name on a different repository cannot
reuse that identity. Owner search retains its existing ability to observe public
repositories outside the authenticated account's membership inventory and does
not claim that separately selected numeric identity. The target may be a
non-default branch.

These are observations, not scheduling or merge instructions. Unknown
mergeability stays unknown; a draft, dirty branch, failed check, absent auto-merge,
or old update timestamp does not by itself mean abandoned work. Preserve an
owner's deliberate hold and unresolved prerequisites. Before intervention, read
the current source discussion and receiving instructions. The observer neither
posts a comment nor dispatches Codex, creates a timer, widens an audience, or
authorizes a merge. Two equal endpoint observations do not prove there was no
intervening movement or change after the observation.

This is bounded provider enumeration, not an atomic snapshot or an action-time
integration decision. Same-head reviews and checks can change after they are
read. Existing source review and receiving rules still govern the next action.
The existing check-run endpoint uses GitHub's `latest` filter and covers at most
the 1,000 most recent check suites. Rows name that provider scope explicitly as
`checkRunFilter` and `checkSuiteLimit`; completeness does not claim older suites
or all historical reruns. Reviews use the provider's chronological list.

`--closed-since YYYY-MM-DDTHH:MM:SSZ` adds issues and PRs whose closed state
changed since the supplied UTC boundary, while still observing every open
item. This catches recently merged, rejected or closed work that an open-only
scan misses. The rows retain provider state and closure time; closure alone
does not establish customer acceptance. Commit status contexts are paginated
with identity/count checks rather than stopping at the first response page.

Rows are JSON lines on stdout, not another inventory or work-state database.
Only `github.coverage-complete` proves the selected enumeration completed;
partial searches, pagination drift, API errors, and size/time bounds produce
`github.coverage-incomplete` and exit 1. Search results beyond GitHub's 1,000
result limit, or an explicitly exhausted search quota, fall back to paginated
repository issue endpoints. An exhausted search quota is not retried during
that observation. Search requests use 100 items per page, with at most ten pages for the
provider's 1,000-result ceiling; ordinary repository, branch, status, check and
review endpoints retain their existing 30-item pages. The larger Search page
reduces calls against its separate quota without changing scope or treating
partial results as complete. A changed Search total restarts only that query;
repeated identities, premature pages and incomplete provider results still
refuse coverage. Calls run serially with bounded response sizes. Discovery includes archived repositories
so unresolved original obligations are not erased by an archive flag.

It deliberately does **not** make GitHub canonical, infer authority from repository names, or call an LLM on the happy path.

## Shared GitHub Cells and WorkCells

`./github-cells` provides one pure projection for all properties. The runtime
supplier is the issued `@red-cup-engineering/signcell@0.13.1-dev.217`, including
its actual Cell constructor, evidence joins, content addresses and CloudEvents
codec. These are native Cells, with their existing FOUR readings; no GitHub-only
Cell class or alternate truth algebra is introduced.

- `projectGitHubCells(envelope)` returns `sourceCells`: stable subject identity,
  immutable observation identity, canonical native Cells and their Cell-set ID.
- `gitHubCellCloudEvents(sourceCells)` carries those exact claims through
  SignCell's standard claim profile. It checks the complete projection against
  its retained source before exporting any event.
- `projectGitHubWorkCells({ source: sourceCells, receipt })` requires the original
  native receiver's correlated receipt and produces `workCells` under the actual
  thread ID. It does not create a thread or authenticate an arbitrary receipt.

An issue or PR subject is
`github:repo:<repository-id>:<issue|pull_request>:number:<number>`. GitHub's
Issues API also returns PRs with a different provider ID; the PR marker selects
the same stable subject as the Pull Requests API. Each original provider ID is
retained as an alias claim. Repository renames preserve subjects. Comments and
reviews keep their own identities and link to their correctly typed parent.

Changing facts belong to an observation, not timelessly to that subject.
Consequently an older closed snapshot and a newer reopened snapshot coexist
without being mistaken for contradictory simultaneous states. Material edits
on the same head remain distinct. Delivery IDs do not alter an unchanged
normalized observation; the existing sparse-input fallback can itself use a
delivery ID as the revision when provider revision material is absent.
Reviews keep the reviewed commit; check runs/suites keep tested commit, status,
conclusion and app; merge groups keep their own candidate head and base. These
facts do not decide review policy, complete check coverage or merge authority.

The native Boolean claim is `(observation, predicate, true)`. Positive and
negative evidence occupy its two existing sides. Missing facts have neither;
contradictory facts keep both. In particular, a synthetic `merge_commit_sha`
does not prove merging. Explicit `merged: false` or `merged_at: null` is negative
merge evidence; `merged: true` or a valid non-null merge timestamp is positive.

Every `settleGitHubEvent`/`settleGitHubEnvelope` result now includes `sourceCells`,
including replay and pending transport results. Cell construction and source
admission occur before a durable claim or external effect. `prepareGitHubWork`
includes the same projection while preserving its original two-source native
opening. `receivePreparedGitHubWork` reconstructs Cells from the source document
actually retained by the board and returns `sourceCells` plus `workCells`.
Historical journal documents remain readable; no duplicate Work database or
Cell migration is needed to derive these readings.

WorkCell facts have a new `observation` for each changed native readback and a
separate `sourceObservation`. The actual thread is `subject`. Source retention,
native admission, routing, standing and the arena's assay remain independent
claims. `work.customer-accepted` stays unknown: neither a GitHub merge nor an
arena verdict supplies the customer's own receiving evidence.

`workCells.next` standardizes the next bounded receiving step:

| Observed condition, in order | Next step |
| --- | --- |
| Wrong receiving home | `receive-routing` |
| Native assay rejected | `repair-delivery` |
| Delivery awaits assay | `receive-assay` |
| Native arena accepted | `receive-customer` |
| Conflicting lifecycle evidence | `reconcile-source-evidence` |
| Established merge | `receive-downstream` |
| Closed source without an established merge | `reconcile-closed-source` |
| Draft candidate | `complete-draft` |
| Remaining native work | `continue-native-work` |

These are deterministic candidates for the existing duty processor. They grant
no merge, closure, deletion or execution authority. Existing policy and native
operations still govern effects. Source projection does not assert that an
upgraded package has been installed on any property.

For read-only intake and standard claim export, the package supplies:

```sh
project-github-cells --cloud-events < github-event.json
```

It accepts one provider event of at most 256 KiB, prints `sourceCells` and the
optional standard claim events, and performs no network or Work effect. The
existing receiving path remains the route for actual native Work. See
[the shared contract](specifications/github-cells.md) for identity, invariant,
verification and migration details.

## Native work receiving

`./native-work-receiving` exports `receiveGitHubWork({ event, opening, binding,
call })`. Supply the actual provider event, an explicitly interpreted native
opening, a verified repository-ID/public-visibility/receiving-enterprise/section binding, and the
authenticated installed operation port `call(verb, input)`. Native work law
validates authority, requirements, proposal relationships and actor selection.
The source's prose never selects its office or receiving authority.

The board retains both the original GitHub locator and a self-contained JSON
source document as a `data:` document locator. Its NI commitment protects the
exact snapshot; `readGitHubSourceDocument(source)` recovers and verifies it,
including original author, provider identity, revision, material and form type.
Source documents are bounded to 256 KiB. Larger documents are refused.

Receiving uses the board's existing source selection and full thread readback.
Identical replay reads the existing native record without a new opening or a
separate receipt database. A receipt requires the exact source document to be
present and reports `NATIVE_RECEIVED_UNROUTED` if the board's derived home does
not match the selected receiver. Receipt stages distinguish native admission,
routing, allocation, implementation and acceptance. Receiving alone proves
neither staffing nor customer acceptance.

For observation without any Work effect, use
`readGitHubWork({ event, opening, binding, call })`, or
`readPreparedGitHubWork({ prepared, call })` after `prepareGitHubWork`. These
operations invoke only `work-board`. They use the same complete source selection,
exact replay law and fresh retained-document and interpretation readback as receiving, returning
the same receipt, source Cells and WorkCells for an existing exact original Work.
If no exact original is observed, they return `NATIVE_NOT_RECEIVED` with reason
`no-exact-original-work`, offered source identities and source Cells, with no
`thread`, `nativeWork`, `workCells` or receipt `stages`. This is an observation
bounded to that complete source selection, not a rejection, a negative admission
Cell, or permission to open or dispatch Work. Incomplete, moving, ambiguous or
corrupt source selection refuses. See the
[read-only Work contract](specifications/github-work-reading.md).

Replay comparison verifies the recorded source document and compares its full
observation and supplied native interpretation fields, ignoring only JSON object-key order and
the transport-only delivery ID. Material, original author, triggering actor,
visibility, scope, and interpretation remain distinct. A transport retry reuses
the original recorded document without changing its bytes or NI commitment.
The receipt names that actual carrier in `sourceDocument` and the offered
carrier in `offeredSourceDocument`; `stages.offeredSourceRetained` is false when
only the earlier equivalent carrier is retained. It does not claim that the
later transport observation was separately persisted. Exact retained-carrier
readback is still required, and corrupt source evidence refuses before opening.

This route currently accepts verified **public** repository material only.
Private or unknown visibility is refused because the installed public board
does not establish a private receiving audience. Source interpretation is
explicit: a complaint, idea or question is not silently made an executable
requirement. No generic daemon, directory-name routing rule, or automatic
GitHub comment is introduced.

The public intake delivery PR (`561-group/561-group-site#3`) was received on
Cold Red Gate at native thread
`ni:///sha-256;mcpdsKVCR1jsDgOIs9i_JSCmM71P3-PNX7FgFIPgi20`, with its full
provider source document, original author and `group-operations` home. The
installed port queued the peer handoff. Read-only replay returned that same
thread using two board reads and no opening. The authenticated relay was the
existing Chief Information Officer office; this is not evidence of this Codex
session's CTO incumbency, peer receipt, actuator execution or customer acceptance.

## Raw HTTP arrival receiving

`settle-github-event` reads one GitHub event JSON object on stdin and:

1. normalizes it as `semioverse.github-delta.v1`;
2. checks the persistent complete-source CloudEvent-key→receipt store;
3. POSTs an unseen envelope as a supplied CloudEvent to MetroPlat's `/arrivals` boundary;
4. requires a successful `metroplat.arrival.receipt`;
5. persists the receipt mapping;
6. returns `DUPLICATE_RECEIVED` without a second network effect on unchanged replay.

The adapter requires the existing `/arrivals` endpoint. Root POST records an HTTP request observation rather than admitting the supplied CloudEvent; root and unrelated URLs remain refused.

Environment:

- `METROPLAT_ARRIVAL_URL` — required supplied-CloudEvent URL, for example `http://host:port/arrivals`.
- `METROPLAT_AUTHORIZATION` — optional Authorization header value supplied by the deployment secret boundary.
- `GITHUB_SEMIOVERSE_RECEIPT_FILE` — optional durable receipt map path; defaults to `.state/github-semioverse-receipts.json`.

No credential value is persisted in the receipt store.

## What the receipt means

A successful adapter call proves that MetroPlat admitted the exact HTTP arrival carrying the typed GitHub delta and returned a durable arrival identity/digest. It does **not** by itself prove that downstream organizational semantics, authority, or conflict resolution accepted every field in the delta.

The next runtime slice still owns:

- webhook/event intake plus bounded reconciliation/poll fallback;
- authenticated deployment configuration for the real MetroPlat endpoint;
- conflict/authority quarantine;
- backlog/dead-letter/lag metrics;
- automatic SYNC_BACK after receiver outage;
- downstream semantic projection/readback beyond raw arrival admission.

The focused service tests cover stable provider identity across repository rename, exact PR-head revision binding, persistent replay suppression, and the MetroPlat `/arrivals` contract and root-endpoint refusal.


## Receipt writer exclusion and recovery

A live FileReceiptStore writer keeps its lock regardless of age. A competing
writer receives `RECEIPT_STORE_LOCK_HELD`; it must retain its uncommitted event,
not report receiving. The writer verifies its directory identity and owner token
before publishing the new receipt map and never cleans up a replacement lock.
Dead, missing or unreadable owners yield `RECEIPT_STORE_LOCK_RECOVERY_REQUIRED`.
No automatic stale-lock rename/removal remains: portable filesystem operations
do not provide atomic compare-and-rename, so competing reclaimers could remove
a new live owner's lock. Recovery requires exclusive owner quiescence and receipt
reconciliation before removing the inspected abandoned lock. No recovery actuator
is supplied here. This is local-process exclusion, not distributed fencing or
power-loss durability; all cooperating writers must use the same protocol.


## Signed Actor-to-Actor GitHub delta transport (candidate, not installed)

GitHub observations previously crossed the host boundary only as a direct
`application/cloudevents+json` POST to MetroPlat's `/arrivals` URI. That is a
valid CloudEvents JSON representation but **not** an addressed or signed
ActivityPub Actor delivery. The alternative `activitypub` transport now consumes
the original `normalizeGitHubEvent` / `githubDeltaCloudEvent` observations,
projects the event using the original ActivityPub provider's
`senActivityObjectBytes` and `projectSenActivity` codecs, and calls its signed
`deliverFromEnvironment` publisher. It does not duplicate JSON-LD, SEN CBOR,
CloudEvents-over-A2A, recipient signatures, key stores or transport retries.

The ActivityPub `Create` is from an **already commissioned bridge Actor**,
not the GitHub repository, GitHub author or triggering GitHub user. Its
`application/sen+cbor` Document bears a GitHub-delta typed content object;
that object contains the unchanged original CloudEvent with its stable RFC 6920
NI identity, repository identity, retained GitHub author and triggering actor,
revision, action and material. An ordinary signed receiver inbox can retain
that as a native ActivityPub/CloudEvents arrival, without granting it Work or
office authority.

### Selection by actual available capabilities

The original `settle-github-event` and `reconcile-github` commands share one
`selectGitHubSemioverseTransport` selector:

- `GITHUB_SEMIOVERSE_TRANSPORT=cloudevents-http` (default): require
  `METROPLAT_ARRIVAL_URL` ending exactly in `/arrivals`, optionally
  `METROPLAT_AUTHORIZATION`. This original route only calls something received
  when it gets the native `metroplat.arrival.receipt` with source identity and
  packet digest. It does **not** attest independent Work acceptance.
- `GITHUB_SEMIOVERSE_TRANSPORT=activitypub`: require
  `ACTIVITYPUB_ORIGIN`, `ACTIVITYPUB_IDENTIFIER`,
  `ACTIVITYPUB_KEYS_PATH`, `ACTIVITYPUB_AGENT_CARD`,
  `ACTIVITYPUB_RECIPIENT` and `ACTIVITYPUB_RECIPIENT_INBOX`.
  The preexisting key file must belong to an explicitly commissioned Actor
  **already served under that origin**; this service does not mint one. The
  recipient must be an exact HTTPS `/actors/<identifier>` URI and its
  canonical `/inbox`; the source Agent Card must be on the signed Actor's
  origin. The issuer Actor must be authorized at the receiving node if any
  downstream operation is to run.
- Any other transport spelling, absent signer, off-origin Agent Card,
  wrong inbox or private/unknown GitHub audience refuses. The Actor path never
  silently retries as an unsigned HTTP POST after a denial or uncertain effect.

### Distinguish transport custody from native work

The upstream ActivityPub `deliverActivity` result with
`ActivityPubDeliveryReceipt.delivered=true` establishes only its **transport
submission**, not receiver Work admission. The source-owned
`FileReceiptStore.claim` is acquired before sending and keyed by the **complete
source CloudEvent NI**, namespaced for the Actor route, rather than by the
legacy material-only GitHub `eventKey`. The original key does not distinguish
a change to the triggering GitHub actor, repository alias or visibility;
using its old HTTP receipt would silently suppress distinct source testimony.
The explicit Actor namespace preserves every original HTTP receipt as
historical evidence without upgrading it to signed-Actor proof. The Actor transport
returns `PENDING_RECEIVER_READBACK` and retains the claim instead of inserting
a fake `receiptId`. The initial result exposes the source event NI, sender and
recipient Actor URIs and Activity ID; a subsequent run sees the same held claim
and does not resubmit the uncertain act. The original `/arrivals` adapter
continues to receive its original native arrival receipt shape. Its complete-source
receipt key is described above; the two transports keep separate namespaces.

The next source-owned receiving step is to return a signed,
request-correlated **native arrival receipt** from the instance Actor (or read
the exact retained arrival through an explicitly authorized read port), then
settle this *existing* in-flight claim only after verifying its source event
identity, audience, signer and receiver's durable status. Do not take an
ActivityPub HTTP success, queue status, or a bridged CloudEvent as proof of
semantic admission, Work taking, settlement, customer satisfaction, or a
downstream resource effect. There is no production Actor provisioning,
receiver receipt adapter, deployment, CI execution or independent external
consumer receipt claimed by this source candidate.

For now the source boundary exercises an actual producer-side
`Create` projection, the upstream signed delivery port and a durable
pending/readback distinction. The existing FeltOS
`createActivityPubNodeArrivalHandler` already admits signed SEN activities
into its native arrival store; it does not yet return the specialized
authenticated business readback this bridge needs.

**Native receiving:** run `npm run verify` and both transport fixture suites
against the exact frozen upstream ActivityPub package. Then independently
receive a signed activity from the commissioned bridge Actor into the
installed MetroPlat instance, read the native source identity, demonstrate
idempotent recovery and the separated receiver-owned acceptance decision, and
only then consider changing a live host's selection. Signed delivery is not
automatically authority to originate Work.

## Standalone source qualification

The receipt-store concurrency tests exercise the real Git integration reducer
through its declared public package export. Its exact Git0.1.7 development
dependency belongs to source qualification; it is not part of this service's
production ActivityPub transport dependency. The tests and child processes
resolve that same installed export independently of the checkout's parent
directory. Preserve the live-writer pause, stale-lock fencing, conflicting
stream and dead-owner refusal cases when receiving this standalone repository.

Version0.1.2 is a deliberate successor: registry0.1.1 was already occupied
when this candidate was received. Native tests, published bytes, signed Actor
delivery, receiver-correlated admission and useful Work remain distinct
receiving stages. Existing pending claims require reconciliation before resend.

The repository projects the original Computer Operations0.1.2 issue/PR form
family, including ANT (Autonomous National Territory), Sovereign Service
Enterprise, and native Message/Work receiving continuity. These fields retain
source testimony and return addresses; the native receiver verifies authority.


## Reclaim preserved Git sources and recover discussions

The existing poller, normalizer, Cell projector and durable receipt path now
receive branches, tags, custom archive refs, issue comments and inline review
comments. The original PR #3 and stacked PR #5 have been reconciled with the
current native Cell implementation; their source lineage and receiving
contract are in [Git source reclamation](specifications/git-source-reclamation.md).

All normalized observations produce native SignCells. Git refs add descriptive
`git.ref-name`, `git.object-type`, and `git.object-id` claims with exact material
field witnesses. The stable subject is repository ID plus full ref name;
observing a different target creates a new immutable observation. An annotated
tag retains its tag-object identity until a separate authenticated tag-object
reader actually peels it. Retained provider material keeps GitHub's own keys.
The same Cells round-trip through the existing CloudEvents codec.

### Select the observation scope

| Setting | Behavior |
| --- | --- |
| `GITHUB_SETTLER_INCLUDE_REFS=1` | Add current heads and tags; read each bounded `matching-refs` family twice and reject changed material |
| `GITHUB_SETTLER_INCLUDE_DISCUSSION=1` | Recover issue-conversation and inline review-comment snapshots through two repository-level lists |
| `GITHUB_SETTLER_SINCE=<UTC timestamp>` | Read changed lifecycle state, including closed/merged items by default |
| `GITHUB_SETTLER_STATE=open\|closed\|all` | Explicitly select a narrower or full lifecycle view |
| `GITHUB_SETTLER_DISCUSSION_MAX_PAGES=10` | Bound each discussion list; accepted range 1–20 |
| `GITHUB_SETTLER_ARCHIVE_REF_SELECTIONS=<JSON>` | Select 1–8 exact archive-ref objects in ordinary reconciliation |
| `GITHUB_SETTLER_ARCHIVE_CENSUS_FILE=<path>` and `GITHUB_SETTLER_ARCHIVE_SELECTED_REFS=<JSON>` | Consume an original GHS census and observe only its selected sources |

The original `reconcile-github` executable uses these settings with its existing
configured owners, transport and receipt file. Omitted options preserve ordinary
issue/PR polling. No inference service is called during any of these operations.

### Consume existing archive census JSON

`projectArchiveRefSelectionsFromCensus` reads the existing GitHub Engineering
`github.archive-ref-census/v1`, either alone or in a report's single
`sourceRefAssays` entry. Its `github.archive-ref-observation/v1` rows identify
exact `repositoryId`, `repositoryFullName`, `refName`, `objectType`, and
`objectSha` coordinates. Both `refs/tags/archive/*` and `refs/archive/*` are
supported as distinct namespaces. This input is now consumed by the real
reconciler rather than retained as an unconnected report.

```sh
GITHUB_SETTLER_OWNERS=red-cup-engineering \
GITHUB_SETTLER_ARCHIVE_CENSUS_FILE=/path/to/ghs-report.json \
GITHUB_SETTLER_ARCHIVE_SELECTED_REFS='["refs/archive/held-work"]' \
  node scripts/reconcile-github.mjs
```

Census mode reads only the selected repository and exact refs. The collector
makes two exact-ref reads plus two repository-identity reads for one selection;
the executable first authenticates the selected repository against configured
owners. It does not fetch unrelated issues or traverse a large archive family.
Changed object targets, malformed identities, unknown selection fields,
nonregular or oversized census files, and mixed observation scopes refuse
before admission. The input file ceiling is 1 MiB.

### Recover missed discussion edits

The two repository-level comment lists retain comment identity, parent source,
author, original body and observed timestamps. They avoid a request per issue
or pull request. Distinct body edits remain distinct even with equal timestamps;
an unchanged replay reuses the existing receipt. Duplicate entries, exhausted
pagination, unavailable source permissions or foreign parent identities prevent
a partial lot from being reported as complete. These lists cannot reconstruct
edits GitHub no longer serves.

GitHub reads are bounded observations with net-change checks, not an atomic
snapshot. Archive naming and source custody do not establish acceptance of the
contained code. The original native Work receiver still verifies actual
readback and audience; a private source cannot enter its public route.
