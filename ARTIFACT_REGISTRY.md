# EscapeHatch Artifact Registry

This file is the canonical registry for durable EscapeHatch artifacts. A plausible filename is not authoritative unless registered here.

## Naming rules

- Schemas/manifests/contracts include an explicit version, for example `*.v1.json`.
- Current human-readable state uses stable owner paths under `harness/reports/`.
- Durable Windows repository/worktree state belongs under resolved `Desktop\Dev`, never process temporary storage.
- Portable career-state, application-companion, study-guidance, and resume-presentation artifacts use explicit ownership/provenance and portable locators.
- Application question contracts store semantic IDs/aliases only; real selected answers remain user-owned local data.
- User profiles and career/application state are private by default and must not be baked into distribution artifacts or repository history.
- Resume presentation rules are tracked, but real resume text, contact details, and rendered current-user resume files remain user-owned private artifacts outside Git.
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
| Application assist session contract | `contracts/application-assist-session.v1.json` | tracked versioned product contract | update Fill Plan / policy gate / session control invariants; never add real profile values | `python tests/test_application_assist_session_contract.py` |
| Application assist extension core | `browser/application-assist/assist-core.js` | tracked product runtime | update session controls and DOM writer only through the canonical Fill Plan | `python tests/test_application_assist_session_contract.py` and `node tests/test_application_assist_session.mjs` |
| Application assist docs | `docs/APPLICATION_ASSIST_SESSION.md` | tracked operator docs | update load/control-loop instructions without real PII | `python tests/test_application_assist_session_contract.py` |
| Application assist modality contract | `contracts/application-assist-modality.v1.json` | tracked three-mode interaction contract | update mouse/keyboard/phone grammars and capability matrix without inventing a second session state machine | `python tests/test_application_assist_modality_contract.py` |
| Application assist modality adapter | `browser/application-assist/modality.js` | tracked mode adapter | route equivalent intents to shared semantic handlers; prevent touch/click double dispatch | `node tests/test_application_assist_modality.mjs` |
| Application assist presence-surface contract | `contracts/application-assist-presence-surface.v1.json` | tracked platform-neutral presentation affordance contract (EH-M1) | update affordance states/adapters/actions without forking session or EH-U1 operational presence | `python scripts/validate_application_assist_presence_surface.py` |
| Application assist presence-surface fixture | `fixtures/application-assist-presence-surface.v1.example.json` | tracked synthetic fixture | exercise handoff/session affordance without real PII | `python tests/test_application_assist_presence_surface.py` |
| Mobile Application Assist presence plan | `docs/APPLICATION_ASSIST_MOBILE_PRESENCE_PLAN.md` | tracked execution plan | update EH-M1 phases/lanes/proof ceiling | `python scripts/validate_application_assist_presence_surface.py` |
| Android assist capability matrix | `docs/APPLICATION_ASSIST_ANDROID_CAPABILITY_MATRIX.md` | tracked mechanism comparison | update Bubble/overlay/notification/handoff evidence | `python scripts/validate_application_assist_presence_surface.py` |
| Android assist presence ADR | `docs/adr/ADR-20261007-android-assist-presence-v1.md` | tracked architecture decision | change only with new spike/device evidence | `python scripts/validate_application_assist_presence_surface.py` |
| Android assist presence spike | `android/application-assist-spike/README.md` | tracked host-side + Kotlin spike entrypoint | prove handoff/session/affordance; no Play claim | `python scripts/run_android_assist_presence_spike.py` |
| Android assist presence spike receipt | `harness/reports/android-assist-presence-spike-receipt.v1.json` | tracked regenerated receipt | produced by spike runner; device APK may be BLOCKED | `python scripts/run_android_assist_presence_spike.py` |
| Android assist presence-surface validator | `scripts/validate_application_assist_presence_surface.py` | tracked contract/spike validator | fail closed on missing ADR/matrix/receipt/session-key reuse and proof inflation | `python scripts/validate_application_assist_presence_surface.py` |
| P82 evidence-class contract | `contracts/p82-evidence-class.v1.json` | tracked experiment evidence capability contract | update capabilities/decisions; rank is display-only; promotion by capability containment | `python scripts/validate_p82_evidence.py` |
| P82 evidence helper | `scripts/p82_evidence.py` | tracked capability/promotion checker | shared by spike/EH-M2 validators | `python scripts/validate_p82_evidence.py` |
| P82 evidence validator | `scripts/validate_p82_evidence.py` | tracked proof-inflation gate | fail closed when PROMOTE lacks required capabilities | `python scripts/validate_p82_evidence.py` |
| P82 proof-inflation negative fixture | `fixtures/p82-proof-inflation.negative.json` | tracked negative fixture | host simulation must not PROMOTE device claims | `python tests/test_p82_evidence.py` |
| P82 proof-inflation positive KEEP fixture | `fixtures/p82-proof-inflation.positive-keep.json` | tracked positive fixture | KEEP + promotion_allowed=false remains valid | `python tests/test_p82_evidence.py` |
| P82 NEG-1 host-cannot-prove-policy fixture | `fixtures/p82-neg-host-cannot-prove-policy.json` | tracked negative fixture | HOST_SIMULATION cannot satisfy play_policy_documentation | `python tests/test_p82_evidence.py` |
| P82 NEG-2 device-cannot-prove-browser fixture | `fixtures/p82-neg-device-cannot-prove-browser.json` | tracked negative fixture | PHYSICAL_DEVICE_OBSERVED cannot satisfy browser_integration alone | `python tests/test_p82_evidence.py` |
| P82 NEG-3 play-not-universal fixture | `fixtures/p82-neg-play-not-universal.json` | tracked negative fixture | PLAY_RELEASE_OBSERVED cannot satisfy unrelated runtime capabilities | `python tests/test_p82_evidence.py` |
| P82 NEG-4 target-not-achieved fixture | `fixtures/p82-neg-target-as-achieved.json` | tracked negative fixture | HOST_SIMULATION cannot claim achieved P2 | `python tests/test_p82_evidence.py` |
| P82 POS-1 honest blocked fixture | `fixtures/p82-pos-honest-blocked.json` | tracked positive fixture | BLOCKED + missing android_compilation remains valid | `python tests/test_p82_evidence.py` |
| P82 POS-2 combined evidence fixture | `fixtures/p82-pos-combined-evidence.json` | tracked positive fixture | composed evidence capabilities can authorize promotion | `python tests/test_p82_evidence.py` |
| EH-M1 corrected proof ledger | `harness/reports/eh-m1-corrected-proof-ledger.md` | tracked evidence reclassification | update when new Android evidence changes a row | `python scripts/validate_application_assist_presence_surface.py` |
| EH-M2 P82 plan | `docs/APPLICATION_ASSIST_MOBILE_M2_P82_PLAN.md` | tracked experiment ladder | update H1–H8 gates/proof ceiling | `python scripts/run_eh_m2_experiments.py` |
| EH-M2 Android application | `android/application-assist/README.md` | tracked Gradle Android adapter | compile/observe via EH-M2 experiments; no Play claim | `python scripts/run_eh_m2_experiments.py` |
| EH-M2 experiment runner | `scripts/run_eh_m2_experiments.py` | tracked P82 runner | emit typed evidence; BLOCKED when SDK/adb absent | `python scripts/run_eh_m2_experiments.py` |
| EH-M2 experiment receipt | `harness/reports/eh-m2-p82-experiment-receipt.v1.json` | tracked regenerated receipt | produced by EH-M2 runner | `python scripts/run_eh_m2_experiments.py` |
| Application assist CI | `.github/workflows/application-assist.yml` | tracked validation workflow | product assist-session changes | GitHub Actions |
| Resume presentation contract | `contracts/resume-presentation.v1.json` | tracked versioned quality contract | update ATS-conservative typography/layout/output/QA invariants without real resume data | `python scripts/validate_resume_presentation.py` |
| Resume presentation validator | `scripts/validate_resume_presentation.py` | tracked quality-contract validator | update fail-closed presentation regression checks | `python scripts/validate_resume_presentation.py` |
| Resume visual projection contract | `contracts/resume-presentation-visual.v1.json` | tracked optional non-ATS projection contract | update visual-only structure rules; never weaken ATS contract; never add real PII | `python scripts/validate_resume_presentation_visual.py` |
| Resume visual projection validator | `scripts/validate_resume_presentation_visual.py` | tracked visual-projection validator | fail closed on ATS submission allowance or source-mutation permission | `python scripts/validate_resume_presentation_visual.py` |
| Resume visual dynamic template (synthetic) | `templates/resume-visual-dynamic/v1/synthetic-dynamic.tex` | tracked synthetic reverse-engineer spike | edit structural markers only with synthetic content | `python scripts/validate_resume_visual_spike.py` |
| Resume visual spike validator | `scripts/validate_resume_visual_spike.py` | tracked validator | R5 marker proof; regenerates spike receipt; optional live PDF when TeX present | `python scripts/validate_resume_visual_spike.py` |
| Resume visual spike receipt | `harness/reports/resume-visual-spike-receipt.v1.json` | tracked regenerated receipt | produced by spike validator; source markers VALIDATED; live PDF may be BLOCKED | `python scripts/validate_resume_visual_spike.py` |
| Visual resume dual-track plan | `docs/plans/visual-resume-dual-track-reference.v1.md` | tracked execution plan | update when dual-track phases/proof ceiling change | `python scripts/validate_resume_presentation_visual.py` |
| Product release version authority | `VERSION` | tracked canonical SemVer product release identity | bump only through `python scripts/product_version.py bump` | `python scripts/validate_product_version.py` |
| Product release policy contract | `contracts/product-release.v1.json` | tracked versioning policy / surface classification | update scheme, bump matrix, mirrors, cutover, compatibility rules | `python scripts/validate_product_version.py` |
| Product version CLI | `scripts/product_version.py` | tracked release mechanic | show/check/next/bump/tag-plan against VERSION authority | `python tests/test_product_version.py` |
| Product version validator | `scripts/validate_product_version.py` | tracked drift/reuse gate | fail closed on mirror drift or missing CHANGELOG heading | `python scripts/validate_product_version.py` |
| Product version tests | `tests/test_product_version.py` | tracked bump/sync/tag proofs | exercise no-bump, bump, major, drift, tag reuse refusals | `python tests/test_product_version.py` |
| Repository promotion contract | `contracts/repository-promotion.v1.json` | tracked provider-agnostic promotion policy / host adapter binding | update scheme, DAG, required checks, triggers, fail-closed rules | `python scripts/validate_repository_promotion.py` |
| Promotion guard | `scripts/promotion_guard.py` | tracked provider-side merge executor companion | enforce exact candidate, required checks, reviews, stale proof, compare-and-set | `python scripts/promotion_guard.py self-test` |
| Repository promotion validator | `scripts/validate_repository_promotion.py` | tracked promotion policy + adapter validator | fail closed on missing adapter, DAG misorder, E2E substitution, check policy drift | `python scripts/validate_repository_promotion.py` |
| Promotion tests | `tests/test_repository_promotion.py` | tracked fault-injection for blocking paths | exercise green, harness/app failure, SKIP, missing, threads, stale, unauthorized, degraded | `python tests/test_repository_promotion.py` |
| Promotion workflow | `.github/workflows/promotion.yml` | tracked GitHub Actions adapter (concrete host) | promote only after exact candidate passes harness + E2E via provider API with expected_head_sha | GitHub Actions |
| Product changelog | `CHANGELOG.md` | tracked human release notes bound to VERSION | update via bump or reviewed release notes; never invent authority | `python scripts/validate_product_version.py` |
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
| Local runtime lifecycle contract | `contracts/local-runtime-lifecycle.v1.json` | tracked versioned runtime contract | update identity/state/kill/privacy rules; never add real tokens or local paths | `python scripts/validate_local_runtime_lifecycle.py` |
| Local runtime lifecycle example fixture | `fixtures/local-runtime-lifecycle.v1.example.json` | tracked synthetic ownership fixture | exercise healthy/adoptable/unhealthy plus foreign/stale/mismatch negatives without real processes | `python scripts/validate_local_runtime_lifecycle.py` |
| Local runtime lifecycle validator | `scripts/validate_local_runtime_lifecycle.py` | tracked contract validator | update fail-closed lifecycle identity/kill-policy checks | `python scripts/validate_local_runtime_lifecycle.py` |

## User-owned local artifacts

The following are intentionally **not** tracked repository artifacts:

| Local artifact | Logical owner | Persistence/transfer rule |
| --- | --- | --- |
| Application question preferences | user | local clearable state; explicit export/import; browser storage remains one valid adapter |
| Application preference export | schema `escapehatch-application-question-preferences/v1` | explicit user export; size/schema validated; never executed; do not commit by default |
| Application assist profile cache | user | browser-local `escapeHatch.applicationAssistProfile.v1`; clearable; never commit real values |
| Application assist session state | user | browser-local `escapeHatch.applicationAssistSession.v1`; origin-bound; metadata-only confirmation |
| Companion career-state store | user | local-first `escapehatch-career-state/v1` state used by browser extension, packaged app, or local web adapters; never bundled with the application |
| Google Drive synchronized career-state copy | user-selected Drive destination | optional explicit sync only; private sharing is sufficient; divergence preserves both copies until resolved |
| Companion sync receipt | user | metadata only; no profile values, application answers, resume content, provider tokens, or credentials |
| Real career-state export | user | portable contract, outside Git by default |
| Current rendered resume DOCX/PDF | user | derive from the canonical private resume, validate against `contracts/resume-presentation.v1.json`, inspect rendered pages, and preserve existing Drive IDs when replacing current projections |
| Source resume references (do not mutate) | user | operator folder `Source Resumes Not to Mutate but to Generate/` is gitignored; visual reverse-engineering reads only; generator writes elsewhere |
| Visual resume PDF (optional projection) | user | may follow `contracts/resume-presentation-visual.v1.json`; marked not-for-ATS-submission; keep under `private/` or `Outputs/resume-visual/` |
| Live ATS/application evidence | user/operator | keep local unless sanitized into an approved fixture/report |

## Validation output

Validator stdout is evidence, not a canonical tracked artifact. CI logs/operator terminal output may be cited as proof. Persistent receipts require an explicit registered output path, naming rule, producer, retention policy, and privacy review before use.

## Product artifact gate

`contracts/career-state.v1.schema.json` owns profile → opportunity → resume → application → study guidance → evidence. `contracts/application-companion.v1.json` owns how installable/local companion surfaces may consume that state: user-owned and local-first, private by default, no public website requirement, explicit optional Google Drive synchronization, conflict preservation, progress recording without submission authority, and distribution upgrades that do not erase user state. `contracts/application-assist-session.v1.json` owns the browser assist control loop: user-owned state → canonical Fill Plan → policy gate → DOM writer, with Pause/Resume/Emergency Stop/Undo and metadata-only confirmation recording. `contracts/resume-presentation.v1.json` owns the ATS-conservative visual and structural floor for master/tailored resumes and their DOCX/PDF projections without owning the private resume content itself. `VERSION` owns the human-facing product release identity; `contracts/product-release.v1.json` owns scheme, bump matrix, mirrors, cutover, and compatibility policy without replacing Git commit identity. `scripts/export_study_guidance.py` owns the typed StudySyndicate adapter.

The resume presentation contract requires single-column selectable text, the registered Trebuchet MS + Arial hierarchy, conservative navy/slate color use, a 10 pt minimum body-text floor, DOCX + text-preserving PDF outputs, rendered-page inspection, and contact/output consistency. It does not guarantee universal ATS-vendor parsing or recruiter preference. Real name, phone, email, address, and resume content stay outside this public repository.

The application harness does **not** own user answers or browser execution. `harness/contracts/application-form-taxonomy.v1.json` owns semantic question identity and `harness/contracts/application-preference-cache.v1.json` owns preference storage/privacy policy. Product code may consume those contracts but may not turn employer/page order into canonical identity or silently store real values in Git.

Unknown application questions remain blank until mapped. Sensitive demographic/accommodation values require explicit user preference. Legal/compliance facts require current per-application confirmation. Certification/attestation remains manual-only. A companion may record a submission only from explicit user action, same-session page confirmation, or user-confirmed external evidence; it may not submit on the user's behalf under this contract.

Live employer ATS behavior, recruiter preference, automatic submission/auto-apply, store packaging/publishing, live Google Drive OAuth/runtime behavior, and broad Lua runtime execution remain outside repository-contract proof until implemented and separately validated. A specific resume's visual conformance is proven only when its rendered DOCX/PDF artifacts are actually inspected against the presentation contract.
