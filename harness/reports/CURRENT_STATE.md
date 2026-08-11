# EscapeHatch Current State

**Verified product branch floor before this sprint:** `feat/harness-infrastructure-20260810` at `ebb0593ba20815aabb09a07bf28405886a0201b2`; PR #2 open against `main`.

## Working

- Root governance authority exists at `AGENTS.md`.
- Governance and harness validators exist and the harness branch is the verified operational floor.
- `contracts/career-state.v1.schema.json` now defines the first product persistence contract connecting profile → opportunity → resume → application → evidence.
- Career-state entities use stable IDs and explicit references; resume/application/evidence relationships are checked for dangling links.
- Artifact references declare ownership (`user`, `escapehatch`, or `external`) and portable locator type rather than letting application installation state implicitly own career data.
- `scripts/validate_career_state.py` validates the representative fixture and three negative fixtures for dangling profile linkage, dangling resume linkage, and parent-escaping relative paths.

## Broken

- No known contract failure in the bounded career-state slice at authoring time.

## Missing / intentionally not yet established

- Executable product application/runtime and UI.
- Resume rendering or Resume Matcher integration.
- Opportunity discovery implementation or scraper.
- Application submission or auto-apply behavior.
- Persistent database/storage adapter for real user career-state exports.
- Import/export UX beyond the portable JSON contract.
- Product build/deployment configuration.
- Lua runtime, host binding, sandbox, or executable script surface.

These remain later product concerns. The contract floor must be preserved before those surfaces are introduced.

## Lua direction

Lua remains an architectural constraint only. This sprint introduces no Lua runtime or script execution capability. See `harness/constraints/LUA_EMBEDDING.md`.

## Validation floor

Run:

```text
python scripts/validate_governance.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
git diff --check
```

## Principal risks

- Expanding the v1 persistence contract prematurely to mirror one job board, ATS, or resume generator.
- Treating external URLs/files as application-owned data and breaking portability or upgrade safety.
- Adding scraping/auto-apply before opportunity/application evidence semantics are proven in real operator use.
- Introducing Lua before a host runtime and capability boundary are selected and tested.
- Committing real personal career-state data or credentials instead of keeping repository fixtures synthetic.

## Next product gate after this sprint

Build the smallest import/export persistence adapter around the v1 contract, preserving user ownership and round-trip fidelity, before adding discovery, resume generation, ATS automation, or Lua execution.
