# EscapeHatch Artifact Registry

This file is the canonical registry for durable EscapeHatch artifacts. A plausible filename is not authoritative unless registered here.

## Naming rules

- Schemas/manifests/contracts include an explicit version, for example `*.v1.json`.
- Current human-readable state uses stable owner paths under `harness/reports/`.
- Durable Windows repository/worktree state belongs under resolved `Desktop\Dev`, never process temporary storage.
- Portable career-state, application-companion, and study-guidance artifacts use explicit ownership/provenance and portable locators.
- Application question contracts store semantic IDs/aliases only; real selected answers remain user-owned local data.
- User profiles and career/application state are private by default and must not be baked into distribution artifacts or repository history.
- A public website is not required for the companion experience; local/store-delivered surfaces may consume the same user-owned state contract.
- Remote synchronization is optional and explicit. A Google Drive adapter may target only a user-selected file/folder and may not require public sharing or persist provider credentials in career state.
- Preference exports, when product support exists, use the registered versioned transfer schema and are not committed by default.
- Sanitized fixtures may contain question wording/options but must not contain the operator's real selected answers.
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
| Application preference-cache policy | `harness/contracts/application-preference-cache.v1.json` | tracked versioned harness contract | update persistence/privacy/precedence policy; never add real values | `python scripts/validate_application_harness.py` |
| Application form intake workflow | `harness/workflows/APPLICATION_FORM_INTAKE.md` | tracked workflow | update when form-mapping procedure changes | `python scripts/validate_harness.py` |
| Application mapping skill | `skills/application-form-mapping/SKILL.md` | tracked scoped skill | update repeatable question-mapping procedure | `python scripts/validate_harness.py` |
| Application automation report | `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md` | tracked operator report | update coverage/gaps without selected answers | `python scripts/validate_harness.py` |
| Application harness validator | `scripts/validate_application_harness.py` | tracked contract validator | update with taxonomy/preference safety rules | `python scripts/validate_application_harness.py` |
| Application companion contract | `contracts/application-companion.v1.json` | tracked versioned product contract | update delivery/privacy/progress/sync invariants; never add real user state | `python scripts/validate_application_companion.py` |
| Application companion example fixture | `fixtures/application-companion.v1.example.json` | tracked synthetic product fixture | exercise companion session/progress/sync semantics without real user data | `python scripts/validate_application_companion.py` |
| Application companion validator | `scripts/validate_application_companion.py` | tracked product contract validator | update fail-closed companion privacy/sync/progress rules | `python scripts/validate_application_companion.py` |
| Lua embedding constraints | `harness/constraints/LUA_EMBEDDING.md` | tracked design input | explicit architecture decision only | `python scripts/validate_harness.py` |
| Current-state report | `harness/reports/CURRENT_STATE.md` | tracked human-readable report | update verified repository state | `python scripts/validate_harness.py` |
| Harness operations skill | `skills/harness-operations/SKILL.md` | tracked scoped skill | update when harness procedure changes | `python scripts/validate_harness.py` |
| Pre-commit hook | `.githooks/pre-commit` | tracked opt-in local hook | harness sprint only | `python scripts/validate_harness.py` |
| Pre-push hook | `.githooks/pre-push` | tracked opt-in local hook | harness sprint only | `python scripts/validate_harness.py` |
| Harness CI | `.github/workflows/harness.yml` | tracked validation workflow | harness sprint only | GitHub Actions |
| Career-state schema | `contracts/career-state.v1.schema.json` | tracked versioned product contract | explicit product schema sprint | `python scripts/validate_career_state.py` |
| Career-state example fixture | `fixtures/career-state.v1.example.json` | tracked portable validation fixture | synthetic schema-compatible state only | `python scripts/validate_career_state.py` |
| Career-state validator | `scripts/validate_career_state.py` | tracked product contract validator | update with owning schema/reference rules | `python scripts/validate_career_state.py` |
| Study-guidance exporter | `scripts/export_study_guidance.py` | tracked cross-repo adapter | export user-owned career-state guidance | `python tests/test_study_guidance_export.py` |
| Study-guidance export tests | `tests/test_study_guidance_export.py` | tracked behavior test | exercise canonical synthetic fixture | `python tests/test_study_guidance_export.py` |
| Career-state CI | `.github/workflows/career-state.yml` | tracked validation workflow | product-contract changes | GitHub Actions |

## User-owned local artifacts

The following are intentionally **not** tracked repository artifacts:

| Local artifact | Logical owner | Persistence/transfer rule |
| --- | --- | --- |
| Application question preferences | user | local clearable state; explicit export/import; browser storage remains one valid adapter |
| Application preference export | schema `escapehatch-application-question-preferences/v1` | explicit user export; size/schema validated; never executed; do not commit by default |
| Companion career-state store | user | local-first `escapehatch-career-state/v1` state used by browser extension, packaged app, or local web adapters; never bundled with the application |
| Google Drive synchronized career-state copy | user-selected Drive destination | optional explicit sync only; private sharing is sufficient; divergence preserves both copies until resolved |
| Companion sync receipt | user | metadata only; no profile values, application answers, resume content, provider tokens, or credentials |
| Real career-state export | user | portable contract, outside Git by default |
| Live ATS/application evidence | user/operator | keep local unless sanitized into an approved fixture/report |

## Validation output

Validator stdout is evidence, not a canonical tracked artifact. CI logs/operator terminal output may be cited as proof. Persistent receipts require an explicit registered output path, naming rule, producer, retention policy, and privacy review before use.

## Product artifact gate

`contracts/career-state.v1.schema.json` owns profile → opportunity → resume → application → study guidance → evidence. `contracts/application-companion.v1.json` owns how installable/local companion surfaces may consume that state: user-owned and local-first, private by default, no public website requirement, explicit optional Google Drive synchronization, conflict preservation, progress recording without submission authority, and distribution upgrades that do not erase user state. `scripts/export_study_guidance.py` owns the typed StudySyndicate adapter.

The application harness does **not** own user answers or browser execution. `harness/contracts/application-form-taxonomy.v1.json` owns semantic question identity and `harness/contracts/application-preference-cache.v1.json` owns preference storage/privacy policy. Product code may consume those contracts but may not turn employer/page order into canonical identity or silently store real values in Git.

Unknown application questions remain blank until mapped. Sensitive demographic/accommodation values require explicit user preference. Legal/compliance facts require current per-application confirmation. Certification/attestation remains manual-only. A companion may record a submission only from explicit user action, same-session page confirmation, or user-confirmed external evidence; it may not submit on the user's behalf under this contract.

Resume rendering, job discovery, scraping, automatic submission/auto-apply, store packaging/publishing, live Google Drive OAuth/runtime behavior, and broad Lua runtime execution remain outside this contract proof ceiling until implemented and separately validated.
