# EH-A6 Sanitized Acceptance Receipt — Batch Apply Wave + Presence + Progression

**Lane:** EH-A6 — Live acceptance, release classification, and durable closeout  
**Plan owner:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md` Section EH-A6 + manifest lane `EH-A6`  
**Original branch:** `feat/eh-a6-20260923@d3767a6b43f1f192897dfca6adfe157cb53d500c`  
**Recovery branch:** `recovery/eh-crash-align-20260924` / PR #29  
**Repaired integration floor:** `e5cc7b5a7204e318e243f91d4badda46f6489253`  
**Recovery candidate at reconstruction:** `61cea014518ee56f3c7fd4ccb0d9de8ebec7b82f`  
**Date:** 2026-09-23; recovery reconciliation 2026-09-24  
**Worktree:** local isolated worktree; machine-local path intentionally omitted  
**Disposition:** sanitized repository proof only — no profile values, credentials, PII, or live ATS data.

---

### Recovery provenance note

The validation commands recorded below are historical evidence for the original EH-A6 head, not automatic proof for the later recovery merge. The 2026-09-24 recovery candidate replays the pushed A5/Q2/A6 work onto the stronger faithfulness-repaired integration floor, so proof-relevant browser/account/progression inputs changed. Exact-head provider validation for PR #29 is required before integration. The original live-workstation limitation remains unchanged: this receipt does not prove compatibility with a real employer ATS or live provider.

## 1. Executive summary

This receipt closes the Batch Apply + Presence + Progression wave (EH-A0 → {EH-A1||EH-A2||EH-A3||EH-A4||EH-U1} → EH-A5 → {EH-Q1, EH-Q2} integration under `feat/eh-a6-20260923`) as a **MINOR** product release `1.0.0 → 1.1.0`.

All durable product surfaces were classified center-merged on this branch and passed local synthetic validators. No synthetic fixture auto-activated final Submit/Apply/attestation/CAPTCHA/MFA; no generated secret appeared in tracked artifacts; no `FILLED` or `LIVE_VERIFIED` was promoted to `SUBMITTED` without qualifying evidence; redirection through progression and batch routing obeyed typed gates.

Live workstation browser proof against real ATS sites is **not** claimed here — that remains an explicit gated observation on the operator workstation (Section 7). This receipt therefore records **synthetic browser acceptance** only and declares the compatibility ceiling plainly.

---

## 2. Release identity and classification

| Field | Value |
| --- | --- |
| Canonical authority | `VERSION` |
| Previous release | `1.0.0` (2026-09-11 cutover, ratified from `browser/application-assist/manifest.json`) |
| New release | `1.1.0` |
| Scheme | `semver` per `contracts/product-release.v1.json` |
| Bump aggregation | `highest_wins` over `EH-A0..EH-Q2` classifications |
| Judged bump | `minor` — `user_visible_compatible_feature` |
| Why not `patch` | Content exceeds a compatible fix: multiple additive, user-visible capabilities (progression gate, account-bootstrap, profile sync seam, presence beacon, queue/evidence freshness, provider reconciliation, batch coordinator) |
| Why not `major` | No breaking `installable_behavior/config/cli/required_migration`; public schema/protocol contracts remain `escapehatch-*/v1` with additive optional fields; product SemVer MAJOR reserved per contract `breaking_change_requirements` was not triggered |
| Mirrored surface | `browser/application-assist/manifest.json#/version` synced to `1.1.0` via `python scripts/product_version.py bump` |
| CHANGELOG heading | `## [1.1.0]` prepended via canonical `product_version.py` (no hand-edit of VERSION) |
| Tag plan | `v1.1.0` via `python scripts/product_version.py tag-plan` (tag creation gated until promotion; tag must point at exact validated commit) |

Mechanic evidence: `python scripts/product_version.py check` and `python scripts/validate_product_version.py` both PASS on this commit (see Section 6).

---

## 3. What shipped in this wave (sanitized, no real data)

All fixtures/tests below use synthetic placeholders only; contract `never_commit/never_log/never_export` invariants for generated secrets were held.

- **EH-A0 floor:** typed progression/account-flow contract floor in `contracts/application-assist-session.v1.json` (12-gate `allowed_when` / `terminal_forbidden` / `loop_guard` / `final_submit_boundary`) and split state machines for progression (`escapehatch/application-progression/v1`) and account bootstrap (`escapehatch/application-account-bootstrap/v1`).

- **EH-A1:** safe intermediate progression engine `browser/application-assist/progression.js` — archetype detection, unique intermediate control classification (Next/Continue/Save & Continue), live re-scan/re-gate immediately before action, validation-error and unresolved-required-field detection, loop/duplicate-advance guard, stable page-transition observation, navigation only through `progression_gate → navigation_adapter`.

- **EH-A2:** deterministic profile bootstrap `browser/application-assist/profile-sync.js` (+ `popup.js` Sync from EscapeHatch) — `activeTab + scripting + storage` active-tab bridge reading cockpit keys (`escape-hatch-profile`, `escape-hatch-assist-profile`, `escape-hatch-workspace`), `sanitizeProfile` with 64 KiB cap, `acceptOnlyKnownProfileKeys` field whitelist, `phone_authority` whitelisting, legacy schema acceptance, projection into `escapeHatch.applicationAssistProfile.v1` / `escapeHatch.applicationQuestionPreferences.v1`; generated-output hygiene `Outputs/application-assist/` registered in `ARTIFACT_REGISTRY.md`. Node proof: `tests/test_profile_sync.mjs` (includes 64 KiB, whitelist, phone-authority cases).

- **EH-A3:** account bootstrap & temporary credential lifecycle — classifiers (`account-classifier.js`), state machine (`account-flow.js`), high-entropy generator (`credential-generator.js`, generation only in `ACCOUNT_CREATION`, session-scoped `session-secret.js` with reveal/copy handoff). Fixtures in `fixtures/account-bootstrap/*.json` use synthetic placeholders; Node proof: `tests/test_account_bootstrap.mjs`.

- **EH-A4:** adversarial validator floor — 12 multi-page synthetic fixtures in `fixtures/application-assist-adversarial/*.json` (01 email-probe→login→create-account, 02 account creation with synthetic temporary password, 03 deterministic identity page, 04 safe intermediate Next, 05 visible validation error, 06 unknown-required-field mismatch, 07 file-upload/manual gate, 08 captcha/mfa/manual gate, 09 legal/attestation/manual gate, 10 final review Submit never auto, 11 SPA transition loop guard, 12 user-edited preservation) + `tests/test_application_assist_adversarial_fixtures.py` gating (terminal forbidden never AUTO_ADVANCE_SAFE, mismatch triggers REVIEW_REQUIRED).

- **EH-U1:** ambient companion presence — `contracts/application-assist-presence.v1.json` (12 states: dormant/ready/observing/working_fill/working_account/working_advance/waiting_user/blocked/paused/step_complete/error/stopped, copy ≤48 chars, hard rule no timer promotion, only UI preference persists), `browser/application-assist/presence.{js,css}` Shadow DOM beacon, anchor fallback `lower-right → lower-left → mid-right → mid-left` with sticky-widget collision, peek/details progressive disclosure, reduced-motion/phone/44px/safe-area/keyboard/aria-live semantics. Proofs: `tests/test_application_assist_presence_contract.py` + `tests/test_application_assist_presence.mjs`, synthetic fixture `fixtures/application-assist-presence-demo.html`.

- **EH-Q0:** career-state queue & evidence contract floor — `contracts/career-state.v1.schema.json` with backward-compatible opportunity freshness (`SNAPSHOT/LIVE_VERIFIED/STALE/CLOSED/BLOCKED/UNKNOWN`) and application execution (`READY_TO_APPLY/FILLED/AWAITING_OPERATOR/BLOCKED/SUBMITTED`) + typed channel (`web_form/email/external_provider`), no-promotion invariants (`FILLED != SUBMITTED`, stale/closed deactivates without history deletion), 31 negative fixtures. Proof: `python scripts/validate_career_state.py`.

- **EH-Q1:** external tracker/provider reconciliation adapter — provider-agnostic `contracts/application-companion.v1.json` semantics plus `scripts/companion_reconciliation.py` (and .ts/.mjs) enforcing provider read-back before sync claim, live-verified promotion, stale/closed deactivation, local-edit-remains-local, auth-failure→BLOCKED/AWAITING_OPERATOR, draft-not-sent, idempotent conflict preservation (7 fixtures in `fixtures/application-companion-reconciliation/`). Proofs: `python scripts/validate_application_companion.py` + `tests/test_application_companion_reconciliation.{py,mjs}`.

- **EH-Q2:** batch application coordinator & evidence close loop — single dependency-ready queue-item selection by priority, freshness re-verification before fill, stale/closed retirement without history deletion, routing `web_form` through progression and `email/external_provider` through authorized adapters or `AWAITING_OPERATOR/BLOCKED`, `FILLED vs AWAITING_OPERATOR vs SUBMITTED` distinctions, per-transition receipt and companion reconciliation hooks (`scripts/batch_coordinator.{py,ts,mjs}`, `artifacts/escape-hatch/src/lib/batch-coordinator.*`, 8 fixtures in `fixtures/batch-coordinator/`). Proofs: `tests/test_batch_coordinator.{py,mjs}` with channel-routing negatives.

- **Convergence:** EH-A5 (presence + progression + account + profile + adversarial integration into `popup.html/js`, `content.js`, cockpit) and EH-Q2 (career-state + companion + batch) both merged ahead of this branch HEAD `5c626fa` (pre-bump) and re-anchored through the EH-A6 bump to `1.1.0`.

No alternate extension sources were introduced; `Outputs/application-assist/` remains the sole generated distributable root, never a second source of truth. No broad host permissions or page-runtime network requests were added.

---

## 4. Synthetic browser acceptance — enumerated scenarios

Each scenario was exercised synthetically through local validators and Node/Browser fixtures. No live employer ATS site was exercised in this receipt; therefore language is deliberately synthetic-only.

### 4.1 Scenario matrix

| # | Required scenario (EH-A6) | Synthetic representative | What was demonstrated | Evidence owner |
| --- | --- | --- | --- | --- |
| 1 | Known-email first page | `fixtures/application-assist-adversarial/03-deterministic-identity-page.json` + `tests/test_profile_sync.mjs` Sync from EscapeHatch projection | Reviewed cockpit profile (synthetic) projects deterministic identity fields incl. email via `sanitizeProfile`/`projectProfileToPreferenceStore` into extension store without file archaeology or agent; re-import cap 64 KiB enforced | `profile-sync.js`, `popup.js#syncFromCockpit`, `test_profile_sync.mjs` |
| 2 | Login / create-account branch (email-probe → login → create-account choice → account creation → form) | `fixtures/application-assist-adversarial/01-email-probe-login-create-account.json`, `fixtures/account-bootstrap/{email-probe,login,create-account-choice,account-creation,verification-required}.json`, `contracts/application-assist-session.v1.json#account_bootstrap.transitions` | Email-first routing is expected not exceptional; branch `EXISTING_ACCOUNT_LOGIN` vs `CREATE_ACCOUNT_CHOICE` vs `ACCOUNT_CREATION` typed; `VERIFICATION_REQUIRED` recognized as manual gate; duplicate-account ambiguity yields `AUTH_MISMATCH/REVIEW_REQUIRED` not silent second account | `account-classifier.js`, `account-flow.js`, `account_bootstrap` contract, `test_account_bootstrap.mjs` |
| 3 | Intermediate page auto-advance (deterministic, gated) | `fixtures/application-assist-adversarial/04-safe-intermediate-next.json` + `browser/application-assist/progression.js` + `tests/test_progression.mjs` | `progression_gate` proves `AUTO_ADVANCE_SAFE` only when all 12 `allowed_when` gates pass (session active, archetype recognized, candidate uniquely intermediate, not terminal, fill stable after live re-scan, no validation error, no unresolved required/unknown, no off-state password, no file/captcha/mfa/legal gate, identity unchanged, budget/loop guard, transition matches permit). Intermediate Next/Continue executed through gated `navigation_adapter`; ambiguous → `REVIEW_REQUIRED` | `progression.js`, `test_progression.mjs`, `test_application_assist_adversarial_fixtures.py::test_progression_gates_use_allowed_when_and_terminal_forbidden` |
| 4 | Mismatch stop → resume | `fixtures/application-assist-adversarial/06-unknown-required-field-mismatch.json`, `05-visible-validation-error.json`, `12-user-edited-field-preserved.json`, presence `waiting_user`/`blocked` | Unknown-required control, visible validation error, file-upload, captcha/mfa, attestation each force `REVIEW_REQUIRED`/`blocked` with typed reason (`unknown_control`, `validation_error_present`, `manual_gate_present` ...); operator edit preserved across progression; session can Resume after resolve while preserving user edits; undo only touches EscapeHatch-inserted untouched values | `assist-core.js`, `progression.js`, `presence.js#blocked/waiting_user`, `test_application_assist_session_contract.py`, adversarial tests |
| 5 | Final-submit hard stop | `fixtures/application-assist-adversarial/10-final-review-submit-never-auto.json` | `terminal_forbidden` includes `submit/apply/finish/send/certify/sign/accept/attestation/captcha/mfa/otp/verification/unknown/manual`; `final_submit_boundary.never_auto_submit=true`, `require_operator_confirmation=true`; page runtime statically tested to contain no auto-click of Submit; presence maps final review to `waiting_user` not `working_advance` | `contracts/application-assist-session.v1.json#progression.terminal_forbidden`, `browser/application-assist/assist-core.js`, `tests/test_application_assist_session_contract.py::test_page_runtime_never_automates_final_submit` |
| 6 | Crash / reload recovery (presence + session) | `contracts/application-assist-presence.v1.json#state_projection.persistence`, `tests/test_application_assist_presence_contract.py::test_persistence_only_ui_preference`, `browser/application-assist/presence.js` reload reconstruction | Transient `working_*` not persisted separately; on reload presence reconstructs from canonical session/runtime state; only `presentationPreference` (`quiet/dot_only/hidden_for_session`) and `sidePreference` survive via browser storage; `hidden_for_session` survives ordinary state changes; session remains origin-bound and pauses on cross-origin transitions | `presence.js`, `presence.css`, `assist-core.js` session keys `escapeHatch.applicationAssistSession.v1` |

### 4.2 Batch / provider nuance exercised synthetically

- **Freshness re-verification:** `fixtures/batch-coordinator/02-live-web-form-routed.json` → `LIVE_VERIFIED` + `READY_TO_APPLY` only when live source proves application entry; stale fixture `03-stale-closed-retired.json` deactivates active routing while preserving evidence; covered by `tests/test_batch_coordinator.py::test_live_item_selected_stale_retired_without_history_deletion`.

- **Channel routing:** `04-blocked-auth-failure.json`, `07-channel-routing-negative-cases.json`, `08-email-draft-vs-sent.json` prove `web_form` routes through progression, `email`/`external_provider` require sent/outbox/provider confirmation or operator-confirmed evidence — draft ≠ sent, provider-auth-failure → `BLOCKED`/`AWAITING_OPERATOR` never `SUBMITTED` (see `test_batch_coordinator` suite).

- **Evidence invariant:** `05-manual-gate-awaiting-operator.json`, `06-submitted-with-confirmation.json` prove `FILLED` ≠ `SUBMITTED`, `LIVE_VERIFIED` ≠ `SUBMITTED`, no silent overwrite — submission requires qualifying evidence bound to same application (`tests/test_batch_coordinator.py` + `tests/test_application_companion_reconciliation.py`).

### 4.3 Browser harness detail

- Validators run headless in CI-equivalent fashion where available:
  - `python scripts/validate_application_harness.py` — taxonomy/preference-cache sanity (27 questions, 6 archetypes, 6 negatives).
  - `python scripts/validate_career_state.py` — career-state schema + 31 negatives.
  - `python scripts/validate_application_companion.py` — companion + career fixture binding, 15 negatives.
  - `python tests/test_application_assist_session_contract.py` — Fill Plan gate, progression gate machine-defined, final-submit never, phone-authority fail-closed, presence-contract interplay.
  - `node tests/test_progression.mjs`, `tests/test_profile_sync.mjs`, `tests/test_application_assist_presence.mjs`, `tests/test_account_bootstrap.mjs` — JS runtime semantics.
  - `node tests/test_application_companion_reconciliation.mjs`, `tests/test_batch_coordinator.mjs` — provider/batch JS adapters.
- Synthetic Playwright/browser contexts were **not** opened against live employer domains in this receipt; geometry/collision assertions (presence anchor fallback against fake sticky/footer/chat widgets) were proven against `fixtures/application-assist-presence-demo.html` under deterministic layout, not against the open web. Where Chrome/Edge headless was used for fixture DOM evaluation (jsdom / synthetic), it is noted as synthetic, not employer-site compatibility.

All scenario evidence uses synthetic non-secret placeholders; no employer-specific question text, profile values, temporary passwords, tokens, or resume content appear in any tracked file cited here.

---

## 5. Compatibility and support boundary

### 5.1 What is **supported** by this release

- Extension loaded as unpacked `browser/application-assist` in Chrome and Edge via `chrome://extensions` / `edge://extensions` (Developer mode) — `manifest_version: 3`, permissions `activeTab + scripting + storage` only.
- Cockpit at `artifacts/escape-hatch` (local) supplies reviewed profile consumed via one-action Sync from EscapeHatch; fallback remained backup JSON import/export capped at 64 KiB.

### 5.2 What is **not claimed** (ceiling)

- No claim of correct fill, progression, account bootstrap, or companion-beacon compatibility across arbitrary ATS sites/vendors/versions. Each vendor ships distinct DOM, sticky layers, validation logic, CAPTCHA/MFA providers, and account implementations; only synthetic fixtures enumerated above were exercised.
- No claim of physical-phone ergonomics, live employer account creation, email-verification secret handling, payment, file-upload success, or hiring outcome. Legal/compliance facts, demographic/accommodation decisions, certifications, and attestation remain manual.
- Third-party stores (Chrome Web Store, Microsoft Store, Play Store) and live Google Drive/mail/provider OAuth/runtime remain **downstream credential/environment gates** per `contracts/product-release.v1.json` `publication_boundary` and per `contracts/application-companion.v1.json` explicit opt-in. Local validation PASS does not prove a published store listing nor live provider synchronization.
- `Windows runtime lifecycle` (`docs/WINDOWS_RUNTIME_LIFECYCLE.md`, contract `contracts/local-runtime-lifecycle.v1.json`) remains the separate owner for process identity, receipts, `OWNED_HEALTHY`/`OWNED_ADOPTABLE`/`OWNED_UNHEALTHY`/`FOREIGN_CONFLICT` states, and destructive fallbacks; this lane did not mutate those surfaces.

### 5.3 Required reading before claiming wider compatibility

Claiming ATS- or provider-wide compatibility requires the operator to have completed the workstation-gated live observation described in Section 7 and attached that observed evidence — not merely re-citing this synthetic receipt.

---

## 6. Validation for release/promotion (actual local runs on EH-A6 HEAD)

All commands were run in the `feat/eh-a6-20260923` worktree on Windows (`pwsh`). Exit codes shown are the observed values at receipt generation; full console logs are available as CI/terminal evidence, not as tracked repo artifacts.

| Command | Result | Notes |
| --- | --- | --- |
| `python scripts/product_version.py check` | PASS (`release=1.1.0 tag=v1.1.0`) | VERSION mirrors `browser/application-assist/manifest.json#/version` |
| `python scripts/validate_product_version.py` | PASS | Authority `VERSION`, scheme `semver`, `mirrors=1`, `CHANGELOG.md` heading `## [1.1.0]` present |
| `python scripts/product_version.py show` | `release=1.1.0 authority=VERSION scheme=semver tag=v1.1.0` | Commit binds to exact HEAD (see Section 8) |
| `python scripts/validate_application_harness.py` | PASS | `taxonomy=harness/contracts/application-form-taxonomy.v1.json` `questions=27 page_archetypes=6` `negative_fixtures=6` |
| `python scripts/validate_career_state.py` | PASS | `schema=contracts/career-state.v1.schema.json` `negative_fixtures=31` `legacy_v1_without_guidance/verification PASS` |
| `python scripts/validate_application_companion.py` | PASS | `contract=contracts/application-companion.v1.json` `negative_fixtures=15` `silent_overwrite=FORBIDDEN submission_boundary=USER` |
| `python scripts/validate_repository_promotion.py` | PASS | `contract=contracts/repository-promotion.v1.json adapter=.github/workflows/promotion.yml required_check_policy_version=1 destinations=2 dag_gates=17` |
| `python scripts/promotion_guard.py self-test` | PASS | 11 prototype blocking paths prove green exact-head → READY, plus harness/app E2E failure, SKIP/missing, unresolved threads, stale/unauthorized, duplicate idempotent, degraded provider |
| `python -m pytest tests/test_application_assist_session_contract.py` | 11 passed | Includes `progression_gate_machine_defined`, `page_runtime_never_automates_final_submit`, `phone_authority_popup_fails_closed`, `account_bootstrap_states_and_secret_handling` |
| `python -m pytest tests/test_product_version.py` | 4 passed | Drift/sync-repairs, no-bump/aggregation idempotent, tag-plan exact SHA + reuse refusal |
| `python -m pytest tests/ -k "presence or progression or batch or career or companion"` | 34 passed + subtests | Adversarial, presence contract, companion reconciliation, batch coordinator suites |
| `git diff --check` | PASS (no whitespace errors) | Enforced before commit |

A representative promotion-guard check for the candidate at publish time has form:

```
python scripts/promotion_guard.py check --candidate-sha <HEAD_SHA> --base-sha <base_SHA> --target main --harness success --app-e2e success
```

Mutation is provider-side and remains blocked on `PROVIDER_UNAVAILABLE` in local runs (expected: no `GITHUB_TOKEN`); local harness receipt validity is preserved per `provider-unavailable` path, which is correct — it does not imply a successful provider merge.

---

## 7. Proof ceiling and remaining workstation observed proof

### 7.1 Ceiling of this receipt

- Repository contract/schema proof ✓
- Local validator proof (career-state, companion, harness) ✓
- Synthetic JS/runtime fixture proof (progression, profile sync, account, presence, batch, companion) ✓
- Manifest/VERSION mirror consistency ✓
- Adversarial negative-fixture proof that Submit/Apply/attestation/CAPTCHA/MFA/unknown never auto-advance ✓
- Synthetic geometry/collision fixture for presence anchor fallback ✓
- **Not included:** real ATS site fill, real account creation with vendor identity providers, real file uploads, CAPTCHA/MFA solving, legal attestation, email-verification secret handling, third-party provider OAuth round-trips, or store publication.

Therefore this receipt **cannot** be cited as proof of compatibility with any specific employer site. It proves only that the bounded product controls have a machine-defined contract and that synthetic negatives reject unsafe automation.

### 7.2 Remaining workstation-observed proof (EH-A6 gate before claiming live acceptance)

The operator workstation must observe at least one real unpacked-extension run end-to-end and record supplementary sanitized notes (no secrets/PII) covering:

1. Load `browser/application-assist` unpacked in Chrome (or Edge) from this exact commit; start EscapeHatch cockpit; use one-action **Sync from EscapeHatch** to propagate known email — confirm no file-system discovery or agent required.
2. Visit one controlled application entry point (generic — not named here) and observe:
   - email-probe / login / create-account branch behavior;
   - deterministic identity fields filling without overwriting operator edits;
   - a safe intermediate page auto-advancing through the gated progression path (single Next);
   - an intentional manual gate (e.g., file upload or unknown-required field) causing `waiting_user`/`blocked` with typed reason and absence of automatic navigation;
   - final review page presenting Submit for human review and never activating automatically;
   - presence beacon staying ambient (compact, slow pulse only while working) and requiring intentional click to expand details.
3. Exercise mismatch: introduce a visible validation error or an intentional mismatch, confirm progression stops and resume is available after correction.
4. Exercise crash/reload: reload the page or restart the extension popup and confirm session recovery reconstructs presence/state correctly and does not re-trigger spurious auto-advance.
5. Observe that generated temporary credential (if the site reached `ACCOUNT_CREATION`) remained session-scoped and never appeared in export JSON, log, screenshot, or receipt — synthetic confirmation only.

That workstation evidence must reference its browser/site class in generic terms, respect the public-hosting classification, and remain private/sanitized. Until it is produced, downstream claims must carry the ceiling statement:

> Tested synthetic fixtures only; no universal ATS compatibility is claimed. Only the browsers/sites actually observed on the workstation are attested; everything else remains unproven.

---

## 8. Promotion evidence and integration readiness

- Branch `feat/eh-a6-20260923` is **ahead of** `upstream/integration/replit-donor-b01f628-20260921` by the Batch Apply wave commits plus the EH-A6 release bump (pre-bump merge ancestor `b884b42`, pre-bump HEAD `5c626fa`, new HEAD with `1.1.0` as the commit reported in the accompanying PR/terminal output).
- `CHANGELOG.md` heading, `VERSION`, and mirrored `manifest.json` are mutually consistent per `validate_product_version.py`.
- `contracts/product-release.v1.json` is unchanged except through its declared mechanics (`VERSION` + mirrors + CHANGELOG); no independent schema/protocol `v1` bump was construed as a product release.
- `contracts/repository-promotion.v1.json` binding remains `active_adapter=github-actions`, `promotion.yml` present, DAG gates 17, required checks policy_version 1, promotion_guard self-test PASS. Actual provider merge remains a **provider-side** step that must re-read exact candidate SHA against provider truth (`expected_head_sha`) and must not be emulated by local success.
- This branch is **ready to merge into `integration`** via its owning promotion owner, then into `main` via the same repository policy. No force-push to `main` is performed from this lane; promotion is left to the coordinator as required.

Git freshness is the commit SHA (and any tag `v1.1.0` pointing at that exact validated commit). `CHANGELOG.md` is not freshness proof.

---

## 9. Sanitization attestation

- No profile values, contact data, resume content, employer names, application answers, file uploads, or real tracker data are embedded in this receipt or in any tracked file mutated by this lane.
- No temporary passwords, tokens, OTPs, CAPTCHA bypasses, or other secrets appear here or in `fixtures/`; the only secret-adjacent fixtures use synthetic placeholders such as `TempPass-SYNTHETIC-…` or masked synthetic values, which are never treated as real credentials.
- No PII-containing screenshots, logs, HAR files, or provider exports are committed.
- The repository remains `public` per existing provider metadata notes; therefore keeping sanitized proof is a privacy obligation, not optional.

---

## 10. Limitations and non-goals

- This lane does not create universal ATS compatibility, provider hosting, or store-submission proof.
- It does not rebind the generic dispatch target `Outputs/prompt-parallel-dispatch/manifest.json` reserved by the Windows lifecycle graph; application-assist dispatch evidence remains at `Outputs/prompt-parallel-dispatch/runs/escapehatch-application-assist-autopilot-20260923/manifest.json` as a durable artifact, not as a redefinition of the canonical target.
- It does not implement a new skill to hold domain logic; reusable mapping guidance stays in `skills/application-form-mapping/SKILL.md`.

---

## 11. Next executable step

Advance promotion only through the canonical promotion owner — the next actionable operator command after satifying the workstation-observed proof in Section 7 is:

```
python scripts/promotion_guard.py check --candidate-sha <new_HEAD_SHA> --base-sha <integration_SHA> --target main --harness success --app-e2e success
# on green exact-head provider truth, provider-side merge executes with compare-and-set expected_head_sha=<new_HEAD_SHA>
```

Until the workstation live observation is recorded, the promotion ceiling remains **synthetic fixture only**.

