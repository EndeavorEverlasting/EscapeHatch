# EscapeHatch Artifact Registry

This file is the canonical registry for durable EscapeHatch artifacts. An artifact is not authoritative merely because a file with a plausible name exists.

## Naming rules

- Schemas and manifests include an explicit version, for example `*.v1.json`.
- Current human-readable state uses a stable owner path such as `harness/reports/CURRENT_STATE.md`.
- Generated evidence, when introduced, must use deterministic names or timestamped receipts under a registered output directory.
- Opportunity, profile, resume, and application artifacts are future product scope and must be registered here when their generators/contracts exist.
- Do not register secrets, credentials, caches, dependency trees, or disposable local output.

## Registered artifacts

| Artifact | Owner path | Type | How to produce/update | Validation |
| --- | --- | --- | --- | --- |
| Agent governance doctrine | `AGENTS.md` | tracked canonical contract | governance sprint only | `python scripts/validate_governance.py` |
| Harness manifest | `harness/manifest.v1.json` | tracked machine-readable registry | harness sprint only | `python scripts/validate_harness.py` |
| Codebase map | `harness/CODEBASE_MAP.md` | tracked operator/agent map | update when repo structure or commands change | `python scripts/validate_harness.py` |
| Workflow specs | `harness/WORKFLOWS.md` | tracked operating contract | update when validated workflow changes | `python scripts/validate_harness.py` |
| Lua embedding constraints | `harness/constraints/LUA_EMBEDDING.md` | tracked design input | update only with an explicit architecture decision | `python scripts/validate_harness.py` |
| Current-state report | `harness/reports/CURRENT_STATE.md` | tracked human-readable report | update when verified repository state materially changes | `python scripts/validate_harness.py` |

## Validation output

Validator stdout is evidence, not a canonical tracked artifact. CI logs or operator-captured terminal logs may be cited as proof. If persistent validation receipts become necessary, first add their output directory, naming convention, generator, and retention policy to this registry.

## Product artifact gate

No EscapeHatch career-profile, opportunity, resume, application, evidence, database, package, build, or deployment artifact is registered yet. Future product sprints must register each durable artifact before relying on it as canonical.
