# GitHub Cells source qualification

Recorded 2026-10-27 UTC for the shared GitHub-to-Cell and native Work feedback
implementation in this original service. The direct user requirement is to make
issue, pull request and merge processing repeatable across properties.

## Source and supplier custody

The source was received from default-branch commit
`859f33a1a268f080b890f6f45ce522fdec84cce0`; all 33 original blobs were checked
against their Git identities. The native Cell runtime is the issued
`@red-cup-engineering/signcell@0.13.1-dev.217`, with supplier gitHead
`cb878c7fcb77f93e68163768e9626646b88ceb5c` and package integrity
`sha512-8skWy6jfHIF8P+5YDx89G6Y0TZsuwWr0K5rqSAcLDGVli8ucVaUMqEkRpV+X2lCN5uRD6gFKIuyCodHGzK4cbg==`.

The existing exact ActivityPub0.8.4 and Git0.1.7 suppliers remain selected.
The lock was regenerated with native npm in lock-only mode with lifecycle
scripts disabled. Independent inspection found no missing declared dependency
paths or mismatched exact dependency pins. That inspection did not cover every
optional peer placement: the first clean
[CI install](https://github.com/red-cup-engineering/github-semioverse-settler-service/actions/runs/40433967387)
correctly rejected the absent `jayson` placement of `utf-8-validate@5.0.10`.
Regenerating in an empty directory with the runner's npm10.9.3 restored that
placement without changing any selected versions. Native `npm10.9.3 ci
--dry-run` and `npm11.9.0 ci --dry-run` resolver checks then passed. The full
fresh install remains the separate public CI gate. Older supplier-specific SignCell requirements retain
their own resolved placements.

## Exercised receiving paths

`npm run verify` completed under Node24.22.1 / npm11.9.0:

```text
tests 174
pass 174
fail 0
cancelled 0
skipped 0
todo 0
```

This includes the existing tests plus 22 independently derived projection
cases and 10 integration cases. The integration cases run the actual
reconciliation CLI in separate processes against a bounded provider fixture,
real local HTTP server and persistent file receipt store. The first process
receives once; the second reuses the receipt and returns the same source Cell
set without a second HTTP admission. Actual native Work API calls use test
ports, then project the source document returned by the native board.

The tests exercise unchanged replay, corrected provenance, input mutation
during admission, before-effect refusal, distinct provider identities, exact
review/check heads, missing/negative/contested merge evidence, native claim
CloudEvent roundtrip, tamper rejection, routing/assay/customer distinctions,
and a bounded projection CLI that makes no receiving claim.

The local tests used exact, previously received supplier package trees and
the original Git0.1.7 package's public integration reducer. This was not a
fresh local `npm ci`. The public PR workflow performs that frozen install
with `--ignore-scripts` and then runs the same full verification on Node22.18.

The native `npm pack --ignore-scripts` candidate was extracted into a separate
consumer directory. Its package-name exports, new projection command, native
claim events and included specification were exercised with the exact same
received runtime suppliers. This verifies package contents and module
resolution; it does not attest a newly published registry version. The
manifest retains the existing source version0.1.3 pending its release owner.

## Real provider observation

A read of this service's existing
[draft PR3](https://github.com/red-cup-engineering/github-semioverse-settler-service/pull/3)
was projected through the real CLI. The observed head was
`82cd7748b09e5332772233a4b3ecfe583fe6fb75`, and the source subject was
`github:repo:1425762868:pull_request:number:3`. The projection produced 23
native Cells and 23 native claim CloudEvents, with affirmative open/draft
evidence and explicit negative merged evidence. It did not create native Work.
The packed consumer produced the same Cell-set identity:
`ni:///sha-256;uMx6DfrNbE6ZnRR9k4vNRDQQec9tQq-y1hRoydF4M0c`.

PR3 and its stacked PR5 have separate receiving conditions and are not
integrated or accepted by this change.

## Independent source review

A separate reviewer derived tests from the contract before inspecting the
implementation and reviewed the integrated receiving paths. It identified
and verified repairs for rehashed source-projection tampering, PR comments
using an Issues API locator, and the actual reconciliation CLI adding a
top-level property forbidden by the closed source envelope. A separate
package review accepted the public exports and bounded source claims.

Reviewed source SHA-256 identities:

| File | SHA-256 |
| --- | --- |
| `src/github-cells.mjs` | `296b4df943b5cdd734880598cc94f539ce3bcf214b6222ce56574ec2c58a9303` |
| `src/github-envelope.mjs` | `d6b9e5d615fbda2adb9784c1a433de508f3af72afe78594532cb34937cc567c5` |
| `src/native-work-receiving.mjs` | `bf29f8d99367a0c3538d80e84d736c99a7a4e4c85172e3e6cf77edbf77475ff2` |
| `src/metroplat-http-admit.mjs` | `a1a48236778ad8a604cec71e5daf0df786177d1508761a260a762db8ded1e6cb` |
| `scripts/reconcile-github.mjs` | `3f7122b8e7521a4ebdcffd202463f1424104ce0488114a0ca8c57d447b20eced` |
| `scripts/project-github-cells.mjs` | `b6c4a59adc79e975f51b03ae412af193f6d11b5826928f7498b9e09c7f4f1232` |

## Meaning and remaining receiving

This record qualifies the source implementation. It does not establish an
installed cross-property release, a commissioned Actor, live native Work
admission, merge-policy satisfaction, customer acceptance or an authorized
merge actuator. The existing GitHub service and MetroPlat receiving owners
retain those duties. The standard contract and candidate next operations are
specified in [github-cells.md](github-cells.md).

The HTTP adapter now claims receipts under a complete-source CloudEvent
identity; an existing event-key-only receipt cannot prove that corrected
provenance was received. Historical receipts remain intact, and an unchanged
complete-source retry reuses its new receipt. Custom ports without a receipt
key retain their existing event-key behavior.

## 2026-10-27: archived refs and discussion recovery integrated with Cells

Source basis: canonical main `240735411ad1d099d6704306c8042903f0e82ce8`,
typed-ref donor `82cd7748b09e5332772233a4b3ecfe583fe6fb75` (PR #3), and
discussion donor `415ec9e8c9936e1eb9bb85bcc78f27e8b629a7a2` (PR #5).
GitHub comparison confirms the discussion donor contains the typed-ref donor
(9 commits ahead, 0 behind). Canonical integration preserves both histories.

The existing `npm run verify` completed on the integrated native source:
**205 tests passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**, with source
syntax checks successful. Runtime: Node **24.22.1**, npm **11.9.0**.
`npm ci --ignore-scripts --no-audit --no-fund` installed the exact unchanged
frozen lock, Git blob `1b1cc69fdf700ca0bf377dd9fde706c5bf5d6bd1`, including
`@red-cup-engineering/signcell@0.13.1-dev.217` and
`@red-cup-engineering/activitypub-services-section@0.8.4`. Installation used
an isolated RAM-backed workspace, 731 MiB installed plus 146 MiB package cache;
no lifecycle scripts or production configuration were run.

Additional integration receiving exercises the real reconciliation executable
with an original census file, a synthetic GitHub provider, a loopback HTTP
arrival receiver, and a persisted receipt file across process restart. The
second invocation reuses the receipt and sends no second arrival. This is
native executable/transport integration evidence, not deployed MetroPlat Work.

Requirement cases include current ref namespaces, annotated tag-object custody,
bounded pagination, same-time discussion edits, duplicate-source refusal,
CloudEvents round trips, current visibility overriding stale caller metadata,
and rejection before receipt claims. The coordinating agent reviewed the
source integration before canonical publication. No independent live
Work/customer acceptance is asserted.

Exact Git blob identities of executed production modules:

| File | Git blob SHA-1 |
| --- | --- |
| `scripts/reconcile-github.mjs` | `2d7a47b1736ef599f01de21600ca5bb1a39c62d9` |
| `src/github-cells.mjs` | `0e7d9cc138c9d5b1756959007110d70a9298a823` |
| `src/github-envelope.mjs` | `0408263703e7e5ed4cac52d8cc5461f42795abd7` |
| `src/github-poll.mjs` | `7a6e035bd1ea6848531c204173c9cbff770f4445` |
| `src/native-work-receiving.mjs` | `14e2ae1e925b3c88e691b8191776c2994ddab664` |
| `src/settler.mjs` | `d5652b007ca8a655435362e1b38d38472c2da567` |

A private preserved archive source was also acquired through four sequential
authenticated GitHub observations and passed through the exact native collector
and projector: 20 Cells and 20 CloudEvents. The public Work route refused
its private audience. Private source bytes remain in private receiving custody
and are not included in this public repository. The L-Space consumer receives
the same native Cell projection separately.

The selected package needs a new immutable registry version and installed
operator selection before these changes can be claimed as production
operation. Registry version 0.1.3 already exists and must not be overwritten.
