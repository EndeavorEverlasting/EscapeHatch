# Replit → GitHub transfer ledger — 2026-09-20

## Authority and donor

- GitHub `main` is the repository authority and migration destination.
- Replit donor commit: `b01f62860a27081418877069f599dbc6aa510b8e`.
- The donor Git graph is independent and is harvested as content; it is not force-pushed over GitHub history.

## Included

- Portable local-first cockpit under `artifacts/escape-hatch/`.
- Recovered generated plan mirror #001–#120 plus `docs/plans/recovered-task-export.v1.json`.
- The donor plan-sync generator/test under `scripts/replit-plan-sync/`.
- Transfer validator and CI ownership for the new surface.

## Excluded

`.replit`, `.replitignore`, `replit.md`, `.agents/`, `.conversation/`, `attached_assets/`, screenshots, private resume content, provider-only plugins, build output, TypeScript build caches, and raw Replit Git history.

## Board completeness

The donor contains task plans #001–#120. Screenshots supplied during migration show the live Replit board reached at least #125 and 58 Drafts. Complete machine-readable bodies for #121–#125 are absent from the donor; they are intentionally **not fabricated**. Screenshot-confirmed titles retained as continuity evidence:

- #123 — Verify the existing plan mirror migrates without broken task links
- #124 — Make large plan previews easier to review
- #125 — Catch preview command regressions before release

#121 and #122 remain unknown until a newer authoritative board export is recovered.

## Product boundary

The cockpit is a backward-compatible user-visible product surface. Migration class: **MINOR** from 1.0.0 to 1.1.0. The canonical browser extension remains the owner of DOM-writing assist behavior and preserves the no-auto-submit/no-auto-navigation/no-attestation boundary.
