# EscapeHatch Current State

**Verified floor:** `main` at `f46c34b8b6a842b56c9536eb2ac91a2ce80da93a` before this harness branch.

## Working

- Root governance authority exists at `AGENTS.md`.
- Governance validator exists at `scripts/validate_governance.py`.
- Governance PR #1 was merged before the Harness Infrastructure Build began.
- The harness branch adds a codebase map, workflow specs, artifact registry, completeness validator, staged-snapshot pre-commit validation, pushed-commit/range pre-push validation, scoped skill, CI workflow, Lua design constraints, and this operator report.

## Broken

- No known repository contract failure at harness construction time.

## Missing / intentionally not yet established

- Product source code and application entry point.
- Product package/dependency manifest.
- Product build command.
- Product test suite beyond repository contract validators.
- Product deployment configuration.
- Career-profile/application data schema.
- Resume-engine integration.
- Opportunity discovery implementation.
- Lua runtime, host binding, sandbox, or executable script surface.

These are product or later infrastructure concerns. Their absence must not be disguised by fabricated commands.

## Lua direction

Lua is now captured as an architectural constraint for future implementation, not installed as product code. The host must remain in control, states must be isolatable and explicitly released, host calls must be allow-listed, and script errors must be caught at protected host boundaries. See `harness/constraints/LUA_EMBEDDING.md`.

## Validation floor

Run:

```text
python scripts/validate_governance.py
python scripts/validate_harness.py
git diff --check
```

Any future product test/build/deploy command must be added to `harness/CODEBASE_MAP.md` before it can be claimed as part of the verified floor.

## Principal risks

- Introducing product architecture before durable profile/application contracts are defined.
- Treating AI-generated logic as proof without deterministic validation.
- Giving future Lua scripts ambient OS/I/O capabilities instead of explicit allow-listed host functions.
- Allowing application upgrades to own or erase user career-state data.
- Letting new manifests, schemas, or artifact paths compete with existing canonical owners.

## Next product gate after harness merge

Recover and formalize the smallest persistent EscapeHatch career-state contract (profile/opportunity/resume/application/evidence relationships) before adding scrapers, auto-apply behavior, or broad Lua scripting.
