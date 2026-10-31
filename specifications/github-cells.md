# GitHub source Cells and native WorkCells

## Required outcome and owners

The 561 Group's properties need one repeatable interpretation of GitHub issues,
pull requests, reviews, checks and merges. The existing GitHub settler owns
provider normalization and receiving; SignCell owns native claims, identities,
evidence and CloudEvents; MetroPlat's Work arena owns admission, moves and
acceptance. This refinement connects those owners without a second mutable task
board. It continues Git Engineering federation work #1 and MetroPlat intake #25.

The world requirement is that a later duty shift can recover the same source
and native obligation, distinguish what changed, and choose the next receiving
operation without reconstructing those rules per repository. The machine
guarantees below assume that the caller supplies authenticated source material
and the native port supplies its actual readback. Pure projection is not source
authentication or effect authorization.

## Information and identity

| Coordinate | Meaning |
| --- | --- |
| Source subject | Repository ID, issue/PR kind and number; other objects retain provider identity |
| Provider object key | Existing API object identity, retained even when another API provides an alias |
| Source observation | Native semantic identity of the full normalized snapshot except transport delivery ID |
| Material commitment | Existing v1 provider JSON commitment, preserved for historical source custody |
| Cell address | SignCell's native address of one subject/predicate/object triple |
| Cell-set ID | SignCell's identity of the complete, evidence-bearing canonical set |
| Work subject | Actual native thread returned and read back by the existing board |
| Work observation | Native identity of one correlated receiving state |

GitHub Issues responses include PRs, but those issue IDs differ from the PR IDs.
The `pull_request` marker therefore normalizes a subject to PR kind plus number.
Typed PR parents may legitimately use an `/issues/N` locator. Comment and review
objects retain distinct identities linked to the parent. Neither API spelling
nor repository owner/name is the canonical stable issue/PR coordinate.

## Invariants and acceptance

| ID | Required behavior | Verification oracle |
| --- | --- | --- |
| GH-CELL-01 | The same issue/PR across API routes or repository rename has one stable subject; different repositories remain distinct. | Cross-API, rename and equal-number tests |
| GH-CELL-02 | Same normalized source revision with another transport delivery ID has the same observation and Cell set; changed material or provenance has a different observation. The legacy sparse-input fallback can itself derive the revision from a delivery ID. | Replay, same-head edit and mutation tests |
| GH-CELL-03 | Different observations keep their changing facts separate. Joining their native Cells is commutative and idempotent. | Reopened/late-closed case and native Cell join identities |
| GH-CELL-04 | Missing, affirmative, negative and contradictory Boolean evidence remain distinguishable. | Native evidence-side tuples, including synthetic merge SHA |
| GH-CELL-05 | A source projection exported as claim events or consumed as Work evidence must equal a fresh derivation from its retained source. | Rehashed altered evidence, added/missing claims and changed metadata refuse |
| GH-CELL-06 | Check and review facts retain their actual tested/reviewed candidate. | Check run, check suite, review and merge-group fixtures |
| GH-CELL-07 | WorkCells bind the original thread, source, native receipt and receiving home; arrival alone is insufficient. | Actual receiving-function fixture and correlation refusals |
| GH-CELL-08 | GitHub closure, merge and native assay do not establish customer acceptance. | Unknown customer-acceptance Cell and distinct next receiving step |
| GH-CELL-09 | Representation qualification occurs before a durable claim, native opening or transport effect. | Invalid source causes zero effects; pending port receives immutable snapshot |
| GH-CELL-10 | HTTP deduplication binds complete source provenance; legacy metadata receipts keep their original meaning. | Changed actor reaches HTTP once, unchanged retry reuses it, old receipt remains |
| GH-CELL-11 | Export uses the existing SignCell CloudEvents codec and deterministic occurrence identities. | Decode every native claim and recover the original Cell-set identity |
| GH-CELL-12 | Release, deployment-status, commit-status and push activity retain their own provider identity and material; repository and related parent/check/workflow context cannot replace the changed object. | Realistic provider-shape fixtures and unchanged-repository/changed-release case |
| GH-CELL-13 | A push transition and a polled ref share the repository-ID/full-ref subject while retaining distinct source observations. Before/after IDs and creation/deletion/force testimony remain explicit. | Cross-route subject equality; create/delete zero-ID controls; annotated tag case |
| GH-CELL-14 | Commit status retains the exact candidate and context. Deployment status retains its same-repository parent relation and observed candidate; its environment comes from the status, with omission unknown. A release's symbolic target is not a resolved commit. | Conflicting candidate, foreign/changed parent locator, changed/missing status environment and symbolic target cases |
| GH-CELL-15 | Unknown activity refuses before any durable or transport effect; only repository-only provider context can select a repository observation. | Unsupported and incomplete event inputs with a zero-effect oracle |
| GH-CELL-16 | These activity families use the original native Work opening, readback and read-only recovery; replay resolves the original thread. API locators must match admitted provider coordinates. | Source → Cells → existing Work receiver → WorkCells → replay/read-only recovery for each family |
| GH-CELL-17 | Public repository visibility does not expose draft releases. Known drafts are private, missing draft evidence leaves audience unknown, and neither admits public native Work. | Public-repository draft and absent-draft cases; forged-public envelope refusal |

## Refinement and effect allocation

`github-envelope.mjs` owns the existing closed v1 transport shape and its original
material/key/revision correspondence. It uses SignCell's retained carrier to
own the immutable input. `github-cells.mjs` projects source and receipt evidence
through native Cell constructors and derives the next receiving candidate.
Before a projection is consumed, its retained source/material claims reconstruct
the normalized source and the same projector derives the expected complete set.
A caller's recomputed hash is insufficient to alter the meaning of a source.

The original settler returns these Cells on first receipt, replay and pending
transport outcomes. Native Work preparation qualifies the source projection
before opening. Native receiving projects the document actually retained by the
board; the board's existing journal remains the durable store. Neither an
in-memory reading nor a standard claim event admits another Work thread.

The next operation follows the README's ordered decision table. It is a pure
candidate, with no side effects. Incomplete reviews, missing required checks,
merge policy, queue eligibility and permission continue to belong to their
existing owners. This component does not derive permission to merge from a
green check or from any text in an issue.

## Compatibility and migration

The raw `semioverse.github-delta.v1` source envelope and the two native opening
sources remain the persisted carriers. Existing receipt and journal data are
not rewritten. Result objects gain `sourceCells`; verified native receipts also
gain `workCells`. The projection API and CLI are additional public exports.

New check-run, check-suite and merge-group event kinds preserve their own
provider/candidate identity. Parent observations now retain explicit issue/PR
kind; old source documents retain the evidence they actually carried.

Release, deployment-status, commit-status and push observations extend the same
v1 envelope. Their source-specific material admission is shared by webhook
normalization and envelope readmission. A deployment-status parent retains
observed provenance; matching coordinates do not authenticate that parent or
prove installation. The same exact provider locator derivation is used by the
native Work boundary, including the release-by-ID route, commit-status collection and historical
deleted-ref locators. These source observations do not expand native Work's
public-audience admission or grant an effect. Old repository/deployment-only
receipts preserve what they observed; they are not receipts for previously
discarded release, status or push material.

HTTP receipt keys use `cloudevent:github-delta:<full-source-NI>`. Existing raw
event-key receipts remain stored but cannot establish receipt of complete or
corrected provenance. The first upgraded HTTP use may therefore create one new
arrival receipt. Native Work deduplication still reads original source/thread
evidence. Signed Actor receipts keep their existing namespace. Custom admission
ports without a receipt-key function retain their original explicit behavior.

The source package pins issued SignCell `0.13.1-dev.217`; earlier issued
`0.13.1-dev.0` does not supply the required CloudEvents export. The npm lock is
generated by the native package manager. Source qualification, independent
frozen installation, publication and installed duty-shift use are separate
receiving conditions.

## Primary external semantics

- [GitHub issues API](https://docs.github.com/en/rest/issues/issues): PR markers and differing issue/PR IDs.
- [GitHub pull requests API](https://docs.github.com/en/rest/pulls/pulls): merge facts and synthetic pre-merge commit identity.
- [GitHub webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks): event/action selection and redelivery identity.
- [GitHub merge queues](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue): candidate-specific merge-group checks.
- [GitHub webhook payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads): release, deployment-status, top-level commit-status and push object shapes and related context.
- [GitHub commit statuses](https://docs.github.com/en/rest/commits/statuses): candidate-scoped status collection, state and context.
- [GitHub releases](https://docs.github.com/en/rest/releases/releases): release-by-ID identity and restricted draft visibility.
- [GitHub deployment statuses](https://docs.github.com/en/rest/deployments/statuses): status-specific environment changes and inheritance.
- [CloudEvents specification](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md): occurrence identity and standard structured event context; implemented by the selected SignCell owner.
