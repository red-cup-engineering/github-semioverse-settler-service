# GitHub Semioverse settler service

Deterministic GitHub→MetroPlat receiving core for `red-cup-engineering/git-services-section#1`.

This package keeps GitHub provider identity distinct from organizational truth. It normalizes selected material GitHub deltas into typed envelopes, preserves repository ID plus observed owner/name, binds exact provider revision, extracts machine-addressable WorkUnit fields when present, and provides replay-safe settlement through a durable receipt store.

Issue comments, PR review comments, and reviews retain their own provider
identities and parent links. The arrival retains the exact object material,
original author, observing actor, repository visibility, and an NI commitment.
Material edits on an unchanged PR head and workflow reruns remain distinct;
transport retries converge. `submission` extracts the Group's public filing
form fields as testimony, including complaint/requirement/idea distinctions
and the requester's satisfaction conditions. It grants no effect authority.

The former normalizer discarded this material and keyed some deltas only by
the parent/head. Its receipts cannot prove reception of the content it dropped.
The material-bearing event keys deliberately require a new receiving receipt;
do not migrate old metadata-only receipts as evidence of complete admission.

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
observer, action, revision and NI commitment regardless of whether a work
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
node scripts/observe-github.mjs --repository emsenn/cold-red-gate --pull-checks
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
that observation. Calls run
serially with bounded response sizes. Discovery includes archived repositories
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
the transport-only delivery ID. Material, original author, observing actor,
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
3. POSTs an unseen envelope to MetroPlat's generic HTTP arrival boundary;
4. requires a successful `metroplat.arrival.receipt`;
5. persists the receipt mapping;
6. returns `DUPLICATE_RECEIVED` without a second network effect on unchanged replay.

Current MetroPlat source admits generic HTTP material at the **mounted root POST**. The older `/arrivals` description is stale; the adapter refuses a non-root URL so that drift cannot be silently normalized.

Environment:

- `METROPLAT_ARRIVAL_URL` — required mounted-root URL, for example `http://host:port/`.
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

The focused service tests cover stable provider identity across repository rename, exact PR-head revision binding, persistent replay suppression, and the MetroPlat root-admission contract.


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
