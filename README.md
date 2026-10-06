# GitHub Semioverse settler service

Deterministic core for `red-cup-engineering/git-services-section#1`.

This package keeps GitHub provider identity distinct from organizational truth. It normalizes selected material GitHub deltas into typed envelopes, preserves repository ID plus observed owner/name, binds exact provider revision, extracts machine-addressable WorkUnit fields when present, and provides replay-safe settlement through a caller-supplied durable receipt store and Semioverse admission function.

It deliberately does **not** make GitHub canonical, infer authority from repository names, or call an LLM on the happy path.

## Runtime boundary

A deployed adapter still must provide:
- webhook/event or bounded reconciliation intake;
- durable receipt/high-water storage;
- authenticated Semioverse admission and independent receipt readback;
- conflict/dead-letter handling;
- automatic sync-back after Semioverse outage.

The core's tests prove stable provider-object identity across repository rename, duplicate-free replay, revision advancement, and exact PR-head binding. Deployment/provider receipt remains separate.
