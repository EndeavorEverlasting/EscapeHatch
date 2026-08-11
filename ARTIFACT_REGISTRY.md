# EscapeHatch Artifact Registry

This file is the canonical registry for durable EscapeHatch artifacts. An artifact is not authoritative merely because a file with a plausible name exists.

## Naming rules

- Schemas and manifests include an explicit version, for example `*.v1.json`.
- Current human-readable state uses a stable owner path such as `harness/reports/CURRENT_STATE.md`.
- Generated evidence, when introduced, must use deterministic names or timestamped receipts under a registered output directory.
- Portable career-state exports must identify artifact ownership explicitly and must not rely on machine-specific absolute paths.
- Study-guidance records remain part of user-owned career state; the exporter emits a portable StudySyndicate packet without committing private tracker state.
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
| Career-state schema | `contracts/career-state.v1.schema.json` | tracked versioned product contract | change only through an explicit schema-versioned product sprint | `python scripts/validate_career_state.py` |
| Career-state example fixture | `fixtures/career-state.v1.example.json` | tracked portable validation fixture | update with schema-compatible representative state | `python scripts/validate_career_state.py` |
| Career-state validator | `scripts/validate_career_state.py` | tracked product contract validator | update with the owning schema/reference rules | `python scripts/validate_career_state.py` |
| Study-guidance exporter | `scripts/export_study_guidance.py` | tracked cross-repo adapter | export `study_guidance` records from user-owned career state | `python tests/test_study_guidance_export.py` |
| Study-guidance export tests | `tests/test_study_guidance_export.py` | tracked behavior test | exercise the canonical example fixture | `python tests/test_study_guidance_export.py` |
| Career-state CI | `.github/workflows/career-state.yml` | tracked validation workflow | runs on product-contract changes | GitHub Actions |

## Validation output

Validator stdout is evidence, not a canonical tracked artifact. CI logs or operator-captured terminal logs may be cited as proof. If persistent validation receipts become necessary, first add their output directory, naming convention, generator, and retention policy to this registry.

## Product artifact gate

`contracts/career-state.v1.schema.json` owns the durable relationship contract for profile → opportunity → resume → application → study guidance → evidence. `study_guidance` is a backward-compatible v1 extension: legacy v1 states without that field remain readable. Once a state opts into the extension, an opportunity with recorded `requirements_gaps` must have non-superseded `requirements-gap` guidance so tracker gaps cannot become dead-end notes. Guidance linked to an application must match that application's opportunity.

Guidance resources preserve typed inputs including books, and `scripts/export_study_guidance.py` validates the complete career state before mapping records to the external `study-syndicate/study-guidance/v1` contract. The adapter preserves application/opportunity provenance, iteration number, and typed resource metadata.

The schema stores artifact references rather than claiming ownership of external files. Each artifact reference declares `owner` (`user`, `escapehatch`, or `external`), `kind`, and a portable locator; relative-path locators are rejected when absolute or parent-escaping. Real user career-state exports remain user-owned data and are not committed by default.

Resume rendering, job discovery, application submission, scraping, auto-apply behavior, and StudySyndicate runtime execution remain outside EscapeHatch product authority.
