# GitHub Semioverse settler service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Deterministic GitHub→MetroPlat receiving core for `red-cup-engineering/git-services-section#1`.

This package keeps GitHub provider identity distinct from organizational truth. It normalizes selected material GitHub deltas into typed envelopes, preserves repository ID plus observed owner/name, binds exact provider revision, extracts machine-addressable WorkUnit fields when present, and provides replay-safe settlement through a durable receipt store.

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

This source correction does not repair historical records. The HTTP settler's
`eventKey` excludes the triggering actor, although the CloudEvent ID includes
it. An existing durable event-key receipt can therefore suppress the corrected
snapshot before transport even when its CloudEvent ID changes. Do not delete,
relabel or reinterpret those receipts as proof of corrected receiving. Native
work replay compares the full retained observation, including triggering actor;
that separate comparison must not be confused with HTTP receipt deduplication.
Historical correction and independently verified receiving remain separate work.

## Reconciliation preserves each observed source revision

The reconciler now passes every material-bound provider event to the existing
durable event-key settler. Git SHAs are opaque identifiers, not ordered clocks;
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
excluded from source identity, so two retries are byte-identical while
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
and [Red Cup's existing HLD/LLD](https://github.com/red-cup-engineering/capability-cell-fabrication-services-section/blob/main/specifications/l-space-lld.md),
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
2. checks a persistent event-key→receipt store;
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
continues to receive and store its original native receipt, without changing
its behavior.

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


## First-class Git branch and tag observations

Set `GITHUB_SETTLER_INCLUDE_REFS=1` when running the original
`reconcile-github` executable to add authenticated, fully paginated
`refs/heads/*` and `refs/tags/*` observations to the existing issue/PR
delta stream. This is opt-in because repository-wide ref enumeration has
additional provider cost. The selected GitHub `git/matching-refs` responses
retain the **complete refname**, stable numeric repository ID, exact SHA-1
(or SHA-256) *object target* and its type: an annotated tag pointing at a
tag object is not falsely reported as a commit. The normalizer gives each
`git_ref` a stable `providerObjectKey` based on repository ID and refname;
moving the ref changes the material-bound event identity. Each branch/tag
now also projects its own qualified GitHub REST ref locator
(`https://api.github.com/repos/OWNER/REPO/git/refs/heads/NAME` or `tags/NAME`),
not the shared repository homepage. That locator is a current provider-read
address, never proof that an earlier ref target is still present: the exact
observed refname, target type/SHA, GitHub numeric repository identity and
material commitment remain in the immutable source document. The original
native Work source reader permits this ref-specific API locator only when
it matches the derived provider coordinates; existing browser issue/PR
locators and public-audience/authority guards are unchanged. Existing durable
settlement/readback and authorization policy are reused, with no new Work
registry or receipt database.

### Receive one original custom Git archive source, not an ambient backlog

A separate **native Git custom-ref namespace** `refs/archive/*` holds
historical agent work. It is not `refs/tags/archive/*` and does not confer an
archive receipt. GitHub's `git/matching-refs/archive` endpoint was observed
returning the **same 504 references for both `page=1` and `page=2`**;
the ordinary paginated head/tag loop is **incorrect** for this endpoint.
The original `github-poll` adapter therefore performs two whole-response
reads at the same exact GitHub API address, validates complete source
identity with a 512-ref bound, and emits **only explicitly selected** ref
events into the *existing* `normalizeGitHubEvent` and durable native
Work receiver. There is no new archive queue, receipt store or data source.

The original `reconcile-github` executable accepts one typed environment
value to specify at most eight selections under repositories already
admitted by the authenticated original owner inventory:

```sh
GITHUB_SETTLER_ARCHIVE_REF_SELECTIONS='[{"repository":"red-cup-engineering/git-services-section","refName":"refs/archive/2026-10-09/codex/github-closed-work-observation"}]' \
  node scripts/reconcile-github.mjs
```

Absent this variable, ordinary issue/PR scanning and optional
`GITHUB_SETTLER_INCLUDE_REFS=1` head/tag polling remain unchanged.
The native `github:repo:<ID>:git_ref:<FULL_GIT_REF>` identity,
original SHA/object type, material digest and
`https://api.github.com/repos/OWNER/REPO/git/refs/archive/...` locator
flow into the existing native Work source document; a replay of unchanged
source uses the original receipt. A relocated or retargeted Git object is a
new *observation*, not permission to integrate or retire history.

The separate
[GitHub Engineering estate source reader](https://github.com/red-cup-engineering/github-engineering-services-section/pull/113)
owns exact historical source-tree differences and the source/issue/consumer
receiving gesture. The [original Coesite receiving method](https://github.com/coesite-operations/operations-services-section/blob/main/lib/agency/skills/receive-repository-integration/SKILL.md)
owns independent acceptance. This settler carries a truthful selected provider
signal into native Work; it does not infer that all 504 old refs require
504 new Work assignments, receive them automatically, delete custom refs or
mint authority from a name.

These are **snapshots of currently observed refs**. Their lack of a GitHub
change timestamp is preserved; a later missing ref is not automatically
a deletion receipt. Polling does not decide to merge, close a PR, delete an
archive tag, rename/transfer a repository, or adopt a standard. Use the
original Work receiving path with an independently verified account, scope,
authority, source identity and acceptance conditions before such actions.
`GITHUB_SETTLER_INCLUDE_REFS` absent or other than `1` leaves ordinary
issue/PR polling unchanged. Native tests exercise distinct annotated tags,
head updates, idempotent replay and malformed/duplicate-ref refusals.
