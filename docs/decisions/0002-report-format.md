# 0002 — Report format: versioned JSON validated with zod on both sides

- **Status:** Accepted (revised)
- **Date:** 2026-06-14 (revised 2026-06-15)

## Context

The scanner (producer) and the viewer (consumer) need a stable contract. We also
want to guarantee that a malformed, partial, or tampered report is never written
**and** never rendered as if valid.

## Decision

The report is a single versioned `report.json` defined as a `zod` schema in
`@vibecheck/report-schema`. The schema is the single source of truth; TypeScript
types are inferred from it.

- The **producer** validates the report with `parseReport` before the temporary
  run directory is atomically renamed into place.
- The **consumer** (viewer) also runs `parseReport` after fetching and rejects
  invalid data with an explicit error state — it never type-casts JSON.

Screenshots are stored alongside as PNGs referenced by **relative** paths, which
the schema validates (no absolute/`..`/backslash) on both sides.

### Schema version 1.1.0

Added `securityFindings` (egress/policy blocks), `issueGroups` (deterministic
unique-issue grouping), and a restructured `summary` that separates raw
`observations` from `uniqueIssues`. The version was bumped from `1.0.0` to
`1.1.0`; the viewer rejects any other version.

## Consequences

- Reports are self-describing, diffable and reproducible.
- The producer↔consumer contract is real (both validate), not just documented.
- Breaking changes require a `schemaVersion` bump.
- A small runtime dependency (`zod`) is used by both the schema package and the
  viewer (via re-export).
