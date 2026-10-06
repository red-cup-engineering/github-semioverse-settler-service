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

## Observe the actual GitHub estate

Run `node scripts/observe-github.mjs` with authenticated `gh`. It discovers the
current account, its organizations, and accessible repositories from paginated
GitHub APIs, then reads every open issue and PR in those owner namespaces.
`--owner NAME` may be repeated to select explicit namespaces; `--summary`
prints coverage counts only. `--pull-checks` additionally reads the exact PR
head, commit statuses, and check runs. Fetch the issue/PR, comments, and reviews
at their returned URLs when evaluating or acting on an obligation.

Rows are JSON lines on stdout, not another inventory or work-state database.
Only `github.coverage-complete` proves the selected enumeration completed;
partial searches, pagination drift, API errors, and size/time bounds produce
`github.coverage-incomplete` and exit 1. Search results beyond GitHub's 1,000
result limit fall back to paginated repository issue endpoints. Calls run
serially with bounded response sizes. Discovery includes archived repositories
so unresolved original obligations are not erased by an archive flag.

It deliberately does **not** make GitHub canonical, infer authority from repository names, or call an LLM on the happy path.

## Executable receiving edge

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
