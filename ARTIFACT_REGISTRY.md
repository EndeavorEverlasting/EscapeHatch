# EscapeHatch Artifact Registry

This file is the canonical registry for durable EscapeHatch artifacts. A plausible filename is not authoritative unless registered here.

## Naming rules

- Schemas/manifests/contracts include an explicit version, for example `*.v1.json`.
- Current human-readable state uses stable owner paths under `harness/reports/`.
- Durable Windows repository/worktree state belongs under resolved `Desktop\Dev`, never process temporary storage.
- Portable career-state and study-guidance artifacts use explicit ownership/provenance and portable locators.
- Application question contracts store semantic IDs/aliases only; real selected answers remain user-owned browser-local data.
- Preference/autofill exports use registered versioned transfer schemas and are not committed by default.
- Sanitized fixtures may contain question wording/options but must not contain the operator's real selected answers.
- Professional claim contracts may preserve evidence rules and semantic option meaning, never unsupported personal claims.
- Do not register secrets, credentials, caches, dependency trees, browser-local PII, crash dumps, or disposable local output.

## Registered artifacts

| Artifact | Owner path | Type | How to produce/update | Validation |
| --- | --- | --- | --- | --- |
| Agent governance doctrine | `AGENTS.md` | tracked canonical contract | governance sprint only | `python scripts/validate_governance.py` |
| Harness manifest | `harness/manifest.v1.json` | tracked machine-readable registry | harness sprint only | `python scripts/validate_harness.py` |
| Codebase map | `harness/CODEBASE_MAP.md` | tracked operator/agent map | update when structure/commands change | `python scripts/validate_harness.py` |
| Workflow specs | `harness/WORKFLOWS.md` | tracked operating contract | update when validated workflow changes | `python scripts/validate_harness.py` |
| Windows repo resolver | `scripts/resolve_repo.ps1` | tracked harness acquisition helper | update with durable Windows checkout policy | `python scripts/validate_harness.py` plus Windows CI |
| Application form taxonomy | `harness/contracts/application-form-taxonomy.v1.json` | tracked versioned harness contract | add/reuse semantic question IDs and generic aliases only | `python scripts/validate_application_harness.py` |
| Application preference-cache policy | `harness/contracts/application-preference-cache.v1.json` | tracked versioned harness contract | update persistence/privacy/claim policy; never add real values | `python scripts/validate_application_harness.py` |
| Application form intake workflow | `harness/workflows/APPLICATION_FORM_INTAKE.md` | tracked workflow | update when form-mapping or claim-preflight procedure changes | `python scripts/validate_harness.py` |
| Application mapping skill | `skills/application-form-mapping/SKILL.md` | tracked scoped skill | update repeatable question/claim mapping procedure | `python scripts/validate_harness.py` |
| Application automation report | `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md` | tracked operator report | update coverage/gaps without selected answers | `python scripts/validate_harness.py` |
| Application harness validator | `scripts/validate_application_harness.py` | tracked contract validator | update taxonomy/preference/claim safety rules | `python scripts/validate_application_harness.py` |
| Application autofill contract | `contracts/application-autofill.v1.json` | tracked browser-product contract | update fill/privacy/safety boundary | `python tests/test_application_autofill_contract.py` |
| Application autofill extension manifest | `browser/application-autofill/manifest.json` | tracked browser entrypoint | update browser permissions/version only with contract review | `python tests/test_application_autofill_contract.py` |
| Application autofill documentation | `docs/APPLICATION_AUTOFILL.md` | tracked operator guide | update when verified product behavior changes | `python tests/test_application_autofill_contract.py` plus runtime test |
| Lua embedding constraints | `harness/constraints/LUA_EMBEDDING.md` | tracked design input | explicit architecture decision only | `python scripts/validate_harness.py` |
| Current-state report | `harness/reports/CURRENT_STATE.md` | tracked human-readable report | update verified repository state | `python scripts/validate_harness.py` |
| Harness operations skill | `skills/harness-operations/SKILL.md` | tracked scoped skill | update when harness procedure changes | `python scripts/validate_harness.py` |
| Pre-commit hook | `.githooks/pre-commit` | tracked opt-in local hook | harness sprint only | `python scripts/validate_harness.py` |
| Pre-push hook | `.githooks/pre-push` | tracked opt-in local hook | harness sprint only | `python scripts/validate_harness.py` |
| Harness CI | `.github/workflows/harness.yml` | tracked validation workflow | harness sprint only | GitHub Actions |
| Career-state schema | `contracts/career-state.v1.schema.json` | tracked versioned product contract | explicit backward-compatible product schema sprint | `python scripts/validate_career_state.py` |
| Career-state example fixture | `fixtures/career-state.v1.example.json` | tracked portable validation fixture | synthetic schema-compatible state only | `python scripts/validate_career_state.py` |
| Career-state validator | `scripts/validate_career_state.py` | tracked product contract validator | update with owning schema/reference/trajectory rules | `python scripts/validate_career_state.py` |
| Study-guidance exporter | `scripts/export_study_guidance.py` | tracked cross-repo adapter | export user-owned career-state guidance | `python tests/test_study_guidance_export.py` |
| Study-guidance export tests | `tests/test_study_guidance_export.py` | tracked behavior test | exercise canonical synthetic fixture | `python tests/test_study_guidance_export.py` |
| Career-state CI | `.github/workflows/career-state.yml` | tracked validation workflow | product-contract changes | GitHub Actions |

## User-owned local artifacts

The following are intentionally **not** tracked repository artifacts:

| Local artifact | Logical owner | Persistence/transfer rule |
| --- | --- | --- |
| Application question preferences | browser storage key `escapeHatch.applicationQuestionPreferences.v1` | user-owned browser-local state; explicit export/import; full clear removes the storage key |
| Application preference export | schema `escapehatch-application-question-preferences/v1` | explicit user export; size/schema validated; never executed; do not commit by default |
| Application autofill profile | browser storage key `escapeHatch.applicationAutofillProfile.v1` | user-owned browser-local identity/contact state; explicit export/import; never commit real values |
| Application autofill profile export | schema `escapehatch-application-autofill-profile/v1` | explicit user export; bounded/schema-checked/whitelisted; never execute |
| Real career-state export | user | portable contract, outside Git by default; may include trajectory and opportunity classifications |
| Live ATS/application evidence | user/operator | keep local unless sanitized into an approved fixture/report |

## Validation output

Validator stdout is evidence, not a canonical tracked artifact. CI logs/operator terminal output may be cited as proof. Persistent receipts require an explicit registered output path, naming rule, producer, retention policy, and privacy review before use.

## Product artifact gate

`contracts/career-state.v1.schema.json` owns profile → trajectory → opportunity → resume → application → study guidance → evidence. `profile.trajectory` and opportunity trajectory metadata are optional backward-compatible v1 extensions: old v1 states remain valid, while opted-in states can preserve target titles/activities and distinguish primary, adjacent, stretch, safety, and off-trajectory opportunities.

`scripts/export_study_guidance.py` owns the typed StudySyndicate adapter. The application harness does **not** own user answers. `harness/contracts/application-form-taxonomy.v1.json` owns semantic question identity and evidence-backed claim policy; `harness/contracts/application-preference-cache.v1.json` owns preference storage/privacy/reuse rules.

Unknown application questions remain blank until mapped. Professional self-ratings must remain evidence-backed. Sensitive demographic/accommodation values require explicit user preference. Legal/compliance and current credential-pursuit facts require appropriate current confirmation. Certification/attestation remains manual-only.

Browser autofill owns only user-invoked identity/contact filling. Resume rendering, job discovery, scraping, automatic submission/auto-apply, and broad Lua runtime execution remain outside this authority.
