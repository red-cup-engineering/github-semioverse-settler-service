# Read-only original GitHub Work receiving

## Requirement and ownership

The GitHub-to-Cells consumer must be able to recover the receiving evidence and
current native Work reading for an explicitly interpreted GitHub observation
without admitting, allocating, advancing, or delivering Work. The native arena
owns the original Work journal, actor, home, standing and assayer observations.
This settler owns exact provider-source retention and its projection to the
existing native source Cells and WorkCells.

The baseline is `44af0d6553f84296617f4a608653446f2d505f51`. Its
`receivePreparedGitHubWork` already performs the relevant source selection and
readback, but opens new Work when no exact replay exists. Its
`readGitHubSourceThreads` is a complete bounded source reader. The change adds a
read-only consumer of those same laws, not another Work store or interpretation.

The environment must provide an authenticated native `call(verb, input)` port
whose `work-board` operation reports complete source pages, and the caller must
retain its explicitly interpreted opening and verified repository/receiver
binding. The reader cannot establish other boards' contents or future state.
Publication and uptake in an installed consumer require their own evidence.

## Contract

`readPreparedGitHubWork({ prepared, call })` accepts the existing value returned
by `prepareGitHubWork`. `readGitHubWork({ event, opening, binding, call })` is the
convenience composition of prepare and read. Existing preparation requirements
continue to apply: verified public repository identity, explicit interpretation,
verified native scope and expected receiver, and at most 256 KiB of recoverable
provider source. Provider prose does not choose any authority.

| Clause | Required behavior | Independent receiving scenario |
| --- | --- | --- |
| GWR-1 | The reader shall invoke only `work-board`; all success, absence and refusal paths shall make zero Work writes. | Supply a port that throws on any other verb; exercise every outcome. |
| GWR-2 | The reader shall use complete canonical source selection, with the existing 20-thread page and 50-page bounds, stable position/count, unique identities and exact source membership. Incomplete or moving selection shall refuse, not report absence. | Missing count, truncated terminal page, unrelated source, changing position and exhausted bound all refuse. |
| GWR-3 | Exact original Work selection shall obey the existing replay law: ignore only source delivery ID and JSON object-key order; retain authored-field and evidence-set semantics. Two exact original threads shall refuse as ambiguous. | Reordered retry selects the original carrier; changed material or removed interpretation terms do not inherit its receipt; duplicate originals refuse independent of order. |
| GWR-4 | No exact match in a complete source selection shall return `NATIVE_NOT_RECEIVED`, with reason `no-exact-original-work`, the offered provider/event/document identities, expected receiver and offered source Cells. It shall omit `thread`, `workCells`, `nativeWork` and receipt `stages`. | Empty selection and nonempty selection with different source material return this explicit observation without opening Work. |
| GWR-5 | A selected original Work shall receive a fresh full thread readback. The exact retained source document, selected evidence carriers and original interpretation must still satisfy the same replay law; equivalent replacement bytes or changed authored terms are insufficient. Corrupt commitments shall refuse. | A retry selects an earlier document; replacing it, changing the original opening, omitting its move, or changing a corroboration observation during readback refuses. |
| GWR-6 | A received result shall have the same receipt and native Cell projection as `receivePreparedGitHubWork` replay against the same original Work readback. Its source Cells shall derive from the retained document, not the offered retry bytes or mutable caller envelope. | Compare complete received objects and native Cell addresses between the two operations. Mutating a caller's nested envelope does not change source identity. |
| GWR-7 | The expected receiver shall remain explicit. A different observed home shall return `NATIVE_RECEIVED_UNROUTED`; reading shall not route Work. | Original source is retained in a different home; routing remains false. |
| GWR-8 | Native standing and observed delivery judgments shall remain observations of that same original Work. Missing delivery data shall remain unavailable. Native assayer acceptance shall not establish external customer acceptance, allocation, implementation, or Work-to-Requirement authority. | Evolving deliveries update the native reading; customer-acceptance Cell remains unknown and receipt effect stages remain unestablished. |

`NATIVE_NOT_RECEIVED` is bounded to this complete source selection and exact
interpretation. It is not evidence that no related Work exists, that the source
was rejected, that a negative native admission Cell should be created, or that a
consumer may open or dispatch anything. A subsequent read may observe a match.

Received states remain `NATIVE_RECEIVED` and `NATIVE_RECEIVED_UNROUTED`, using
the existing receipt fields and `semioverse.github-native-work-reading.v1`.
An existing thread read is a replay (`replay: true`), and has no new peer handoff.
The offered and actually retained source-document commitments remain distinct.
No package dependency, native journal schema, binding rule, Cell schema or
effectful receiving operation is replaced.

## Qualification scope

Acceptance cases are in `test/native-work-reading.test.mjs` and the independently
authored `test/native-work-reading-independent.test.mjs`; the existing
receiving and GitHub Cell integration suites remain regression evidence for the
shared selection and projection. Run with the exact locked SignCell supplier.
These bounded fixtures qualify the source behavior, not live board availability,
installed runtime uptake, or customer delivery. Record executed counts and
supplier identity with the resulting change.

### Executed qualification, 2026-10-27 UTC

The following maintained repository suite passed **99 tests, zero failures and
zero skips** on Node `v24.22.1`: 29 new reader cases, six independently authored
reader cases and 64 existing native receiving, native Cell and CLI integration
cases. It uses ordinary owner imports with no fixture or import-loader
substitution.

```sh
node --test --test-isolation=none --test-reporter=tap \
  test/native-work-reading.test.mjs test/native-work-reading-independent.test.mjs \
  test/native-work-receiving.test.mjs \
  test/github-cells.test.mjs test/github-cells-integration.test.mjs
```

The independently derived cases exposed contradictory fresh readbacks that retained
source bytes while changing the opening need, omitting its native move or
changing the selected corroboration observation. Those cases now refuse under
the same original interpretation law; three retained repository regression
cases also cover these paths and additional authored report terms. Legitimate
standing and delivery-assayer changes continue to pass. The independent cases
are retained verbatim except for a relative owner import and an attribution and
clause-binding header. Their original assay source SHA-256 is
`4b92d082dad1d2372b6325901e8cee3d3d87c1232514584fbe92b8c5fa5182c2`;
the portable retained test SHA-256 is
`fa0351e3e2aa7ff615ea3720e96bc9c98e3a071a51451bb59ca19d3661e4498a`.

The actual supplier was `@red-cup-engineering/signcell@0.13.1-dev.217`, source
`cb878c7fcb77f93e68163768e9626646b88ceb5c`, with original lock integrity
`sha512-8skWy6jfHIF8P+5YDx89G6Y0TZsuwWr0K5rqSAcLDGVli8ucVaUMqEkRpV+X2lCN5uRD6gFKIuyCodHGzK4cbg==`.
All 54 packages in its transitive dependency closure were acquired from the
original lock, verified against their recorded archive integrity and placed in
an isolated memory-backed qualification directory with their locked nested
versions. This was a bounded native-path qualification, not a full application
install. No dependency, lock, package version or supplier source was changed.

The lock SHA-256 was
`5542ea9168c07f580fd1dbeed03486fca65212afb7535832c807b72cc8da8881`.
The exact final native TAP transcript SHA-256 was
`c064f50a0e4c133e89d1032f6aae4b1562e94758f1ccf709d3b5cad95bc3da50`.
All three changed JavaScript files passed native syntax checks; the source diff
passed whitespace/error checks. These results establish source qualification
only; release publication, installed consumer uptake and live original-Work
receiving are not established by these fixtures.
