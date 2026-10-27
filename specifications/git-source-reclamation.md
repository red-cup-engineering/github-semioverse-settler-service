# Git source reclamation through the existing Cell receiver

## Required consumer relationship

The same replay-safe GitHub intake that receives issues and pull requests must
also receive preserved branch/tag source and missed discussion edits. Archive
names must not hide useful source. A source observation must remain distinct
from an accepted change or a completed Work thread.

This integrates the original typed-ref work from PR #3, head
`82cd7748b09e5332772233a4b3ecfe583fe6fb75`, and its stacked discussion recovery
from PR #5, head `415ec9e8c9936e1eb9bb85bcc78f27e8b629a7a2`, with current native
Cell and WorkCell main `240735411ad1d099d6704306c8042903f0e82ce8`. The normalizer,
poller, CLI and native Work receiver are their existing owners. No separate
archive queue or receipt database is introduced.

## Contract and allocation

| Requirement | Owner | Receiving evidence |
| --- | --- | --- |
| Preserve exact numeric repository identity, full ref name and typed target | `github-envelope`, `settler` | Distinct heads, tags and custom archive refs; moved targets create new observations; SHA-1 and SHA-256 accepted |
| Retain annotated tag objects without inventing a peeled commit | `github-envelope`, `github-cells` | `git.object-type` and `git.object-id` native claims survive CloudEvents round trip |
| Consume the existing GHS census as typed input | `github-poll` | One selected source uses two exact-ref and two repository reads, without unrelated namespace reads |
| Preserve missed issue and inline review-comment edits | `github-poll`, `settler` | Repository-level bounded lists, exact comment/parent identities, same-time edits and source revisions |
| Preserve current native Cell qualification before any effect | `github-cells`, `settler` | Ref locator/target corruption refuses before a durable claim; replay uses the same received source Cells |
| Preserve source audience and native Work receiving | `native-work-receiving` | Private source cannot be posted through a public binding; exact native readback remains required |

For selected refs, the authenticated repository observation supplies current
visibility. A previously public caller snapshot cannot relabel a now-private
source when both fresh repository reads agree that it is private.

`git.ref-name`, `git.object-type`, and `git.object-id` are descriptive predicates
in native SignCells. Their evidence is scoped to the immutable GitHub source
observation and identifies the original material field. The provider's `ref`,
`object.type`, `object.sha`, and `node_id` remain unchanged in retained material;
industry-standard provider fields are not blindly renamed.

The source document retains the complete material commitment. These claims
can enter ordinary Cell sets, chains, graphs and downstream Craft computations
without a separate GitHub truth type. Core projection is pure; GitHub access,
file reads, durable claims and transport stay in the service's existing effect
adapters. No inference service is used in collection, normalization or replay.

## Migration and qualification

The two donor branches predate the shared `github-envelope` module. Ref-name,
target and revision validation now live there so webhook normalization,
normalized-envelope admission and Cell projection have one rule. The existing
`settler` exports preserve donor callers. Current locked dependencies and
the current workflow's `npm ci --ignore-scripts` are retained; the donor's
historical dependency-free test claim is no longer true after native Cell
adoption and is not carried into the active workflow.

Existing `test/github-poll.test.mjs` and `test/native-work-receiving.test.mjs`
carry both donors' behavioral cases. `test/git-ref-cells.test.mjs` qualifies
their composition with current native Cells, including direct CloudEvents
round trip, stable ref/moving target identities, source-census-to-receipt
replay and refusal before effects.

GitHub multi-request reads are bounded observations with net-change checks,
not an atomic snapshot. Successful collection or mocked native receipt does
not prove source integration, installed service activation, independent Work
acceptance, ref retirement or customer payment. Production installation must
select the qualified package and existing authorized audience/transport.

## Protocol sources

- [GitHub Git references REST API](https://docs.github.com/en/rest/git/refs):
  matching-prefix lists and exact-reference reads retain distinct semantics.
- [Git reference grammar](https://git-scm.com/docs/git-check-ref-format):
  qualified reference-name validation.
- [Original PR #3](https://github.com/red-cup-engineering/github-semioverse-settler-service/pull/3)
  and [PR #5](https://github.com/red-cup-engineering/github-semioverse-settler-service/pull/5):
  source provenance, consumer contracts and donor qualification history.
