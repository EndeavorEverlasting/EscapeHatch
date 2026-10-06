# EscapeHatch Application Assist Autopilot Plan

**Canonical plan owner:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`
**Plan date:** 2026-09-23
**Planning floor:** `integration/replit-donor-b01f628-20260921@be4a4c41403d700285084f941f2725a95a9877b5`
**Planning branch:** `plan/application-assist-autopilot-20260923`
**Disposition:** planning / handoff durability only; no product-runtime implementation is authorized by this planning pass.
**Run-scoped dispatch manifest:** `Outputs/prompt-parallel-dispatch/runs/escapehatch-application-assist-autopilot-20260923/manifest.json`
**Generic dispatch target:** reserved by the active Windows lifecycle graph; this plan does not rebind it.

## 1. Execution frame

- **Repository:** `EndeavorEverlasting/EscapeHatch`
- **Historical primary local path:** `C:\Users\pa_rperez26\OneDrive - Northwell Health\OG Laptop Backup\Desktop\dev\EscapeHatch`; local agent must revalidate before mutation.
- **Current provider default:** `main@0824535b9dc1341def885a79a098d297df770ac8`
- **Current provider integration floor:** `integration/replit-donor-b01f628-20260921@be4a4c41403d700285084f941f2725a95a9877b5`, 48 commits ahead / 0 behind `main`.
- **Review reconciliation:** `be4a4c41403d700285084f941f2725a95a9877b5` is 21 commits ahead of `da6d2e40f348d7e7f59fb9ba998b54a9fa663656` with no commits behind; the later `be4a4c` floor is intentional.
- **Recent center of gravity:** Replit donor convergence plus Windows local-runtime lifecycle. PRs #18-#21 are merged into the integration branch.
- **Application-assist owner surfaces already present:** `contracts/application-assist-session.v1.json`, `browser/application-assist/*`, `docs/APPLICATION_ASSIST_SESSION.md`, application taxonomy/preference contracts, assist tests/workflow.
- **Plan collision to avoid:** the existing Windows lifecycle plan remains separately owned; this plan must not rewrite lifecycle/process-control semantics.
- **Privacy floor:** provider metadata currently reports the repository as public. No real profile values, generated credentials, authentication tokens, resume content, or live application answers may be committed to repository history.

## 2. Live-run evidence that opens this plan

The 2026-09-23 job-application run exposed five product failures that must be treated as acceptance evidence, not rediscovered by the next agent:

1. **Progression friction:** the current safety posture fills but refuses to advance ordinary intermediate application pages. This suppresses application throughput. The desired product posture is now: automate intermediate progression when the page is deterministically safe to advance; **never auto-submit the final application**; stop and flag pages that do not satisfy the progression contract.
2. **Account bootstrap missing:** application sites commonly require a site account. EscapeHatch needs a deterministic account-creation lane that can generate temporary credentials so account setup does not become a manual side quest. The user remains responsible for replacing/saving the temporary password later.
3. **Email-first / login / create-account routing missing:** a common flow is email probe -> login page -> create-account choice -> account creation -> application. This must be an expected state machine, not an exceptional workflow.
4. **Profile/email bootstrap is operationally broken:** deterministic identity data such as email required manual export/import/path discovery and effectively required a local agent. A normal user must not need an agent or file-system archaeology to populate known profile fields.
5. **Path/output hygiene is fragmented:** source extension location, generated extension/distribution output, profile import/export recovery files, and other EscapeHatch outputs do not present one coherent ownership model or discoverable layout.
6. **Tracker truth and exported snapshots are different authorities:** a local spreadsheet/export can support continuity but cannot prove that the canonical external tracker was updated. The run required provider-side read-back before a synchronization claim was valid.
7. **Posting freshness is an execution state:** a queued opportunity must be reverified against its live source before application effort is spent. Stale/closed opportunities must be removed from the active queue without consuming fill/application effort.
8. **Application progress needs typed evidence states:** `READY_TO_APPLY`, `FILLED`, `AWAITING_OPERATOR`, `BLOCKED`, and `SUBMITTED` are materially different states. Field population or a live posting must never be promoted to submission.
9. **Application channel authorization can fail independently:** a role can remain live while an email/provider channel is unavailable or unauthorized. That transition must preserve `AWAITING_OPERATOR`/ `BLOCKED` rather than silently claiming send/submission success.

These nine incidents are the primary product acceptance input for this plan. They are recorded generically; real employer records, profile values, application answers, and provider credentials remain outside this public repository.

## 3. Product-policy revision

The current `application-assist-session/v1` contract intentionally says:

- operator navigates manually;
- `click_next_or_continue` is forbidden;
- page runtime is statically tested to contain no `.click(`.

That policy no longer matches the intended product.

### New invariant

> **EscapeHatch may advance an intermediate application/account page only through a typed Progression Plan whose live gate proves that the destination action is non-terminal, expected for the recognized page archetype, and the current page has no unresolved blocking mismatch. Final submission, certification, attestation, CAPTCHA, MFA/verification secrets, and ambiguous progression remain manual.**

The canonical write pipeline becomes:

`user-owned state -> page classification -> Fill Plan -> field policy gate -> DOM writer -> Progression Plan -> progression policy gate -> navigation adapter`

No navigation action may bypass the Progression Plan.

### “Makes sense” must be executable, not subjective

An intermediate page is **AUTO_ADVANCE_SAFE** only when all applicable gates pass:

- the assist session is active and not emergency-stopped;
- the current page archetype is recognized;
- the candidate control is uniquely identified as an intermediate action such as Next/Continue/Save & Continue;
- the candidate is not Submit/Apply/Finish/Certify/Sign/Accept/attestation;
- all deterministic fill operations for the page have completed and remained stable after live re-scan;
- no visible validation error is present;
- no required unknown/manual-review control remains unresolved;
- no password is being requested outside the explicit account-bootstrap state;
- no file upload, CAPTCHA, MFA/OTP, legal/compliance confirmation, attestation, demographic/accommodation decision, or other policy-sensitive gate is unresolved;
- the action has not changed identity between plan construction and execution;
- an advance budget / loop guard has not been exceeded;
- the next observed page transition matches a permitted state transition.

Anything else is **REVIEW_REQUIRED** and stops automated progression with a precise reason.

### Final-submit boundary remains hard

The following stay manual-only:

- final Apply / Submit Application / Finish / Send / certification action;
- truth/accuracy attestation;
- legal/compliance certification;
- CAPTCHA and bot challenges;
- MFA/OTP or email-verification secret entry unless a separately approved provider integration owns that operation;
- unknown or ambiguous controls.

The goal is **high-throughput assisted completion**, not blind auto-apply.

## 4. Account bootstrap state machine

Account setup is application logic, not prompt logic.

Canonical states:

`APPLICATION_ENTRY`
-> `EMAIL_PROBE`
-> one of:
- `EXISTING_ACCOUNT_LOGIN`
- `CREATE_ACCOUNT_CHOICE`
- `ACCOUNT_CREATION`
-> optional `VERIFICATION_REQUIRED`
-> `APPLICATION_FORM`

Additional terminal/manual states:
- `AUTH_MISMATCH`
- `CAPTCHA_REQUIRED`
- `MFA_REQUIRED`
- `REVIEW_REQUIRED`

### Temporary credential rules

- Use the user-owned canonical application email when the site treats email as the username.
- Generate a distinct username only when the page actually supports/requires one.
- Generate a high-entropy temporary password only inside the recognized `ACCOUNT_CREATION` state.
- Generated secrets must never be committed, exported with the ordinary profile/workspace JSON, written to logs, test artifacts, screenshots, telemetry, or progress receipts.
- V1 secret persistence target: extension/browser **session-scoped secret storage** only, with a user-visible copy/reveal action and explicit “change/save this password” handoff after account creation.
- Repository fixtures use synthetic non-secret placeholders only.
- Account creation may advance ordinary account-setup pages under the Progression Plan; CAPTCHA/MFA/email-verification secrets remain manual gates.
- The runtime must distinguish “account exists” from “account created in this session” and avoid creating duplicate accounts when the site exposes a reliable login path.

A future secure OS credential-store adapter may replace session-scoped storage, but it is not required to unblock the first deterministic account-bootstrap implementation.

## 5. Profile bootstrap and no-agent requirement

Manual JSON import/export remains a **recovery** feature, not the normal path.

### Target normal path

1. EscapeHatch cockpit owns the canonical reviewed profile.
2. The extension exposes a one-action **Sync from EscapeHatch** path.
3. The sync uses the existing `activeTab + scripting + storage` permission model to read the validated EscapeHatch profile from the active local cockpit tab when possible, instead of forcing file shuttling.
4. The profile is validated and projected into the extension's local profile/preference store.
5. Subsequent application pages can fill email and other deterministic identity fields immediately without a local agent.
6. JSON import/export stays available for backup/recovery and cross-machine portability.

This design intentionally avoids introducing broad host permissions or page-runtime network access merely to solve profile bootstrap.

If implementation proves the active-tab bridge infeasible for a required browser distribution target, the successor design review may choose a narrowly authenticated loopback bridge. That is a fallback architecture decision, not permission to add broad network/host access silently.

## 6. Directory and artifact hygiene

Keep **source**, **generated distribution**, **user state**, and **recovery exports** distinct instead of mixing them.

Canonical ownership target:

- Extension source: `browser/application-assist/`
- Cockpit source/runtime: `artifacts/escape-hatch/`
- Generated distributable extension/package artifacts: one registered output root, proposed `Outputs/application-assist/`
- Machine-readable parallel dispatch: `Outputs/prompt-parallel-dispatch/`
- User profile / preferences / credentials: browser-local or approved user-local state; never repository source/output
- Recovery exports: user-visible export flow with deterministic EscapeHatch filename prefix and documented default destination; not treated as build artifacts
- Live ATS evidence: user-owned/local unless explicitly sanitized

No duplicate extension copies should become alternate sources of truth.


## 6A. Batch application queue and evidence model

The current career-state contract is behind the observed application workflow. It can represent broad opportunity/application lifecycle states, but it cannot express the execution/freshness distinctions needed by Batch Apply without overloading existing fields.

### Ownership rule

- Career queue, freshness, application transition, and submission evidence semantics belong in the career-state/application-companion product contracts and application code.
- Browser page classification, fill, progression, and account bootstrap remain owned by Application Assist.
- Google Drive, mail, ATS, and other providers are adapters. They do not become the canonical domain model.
- Prompt/skill text may guide execution but must never be the only implementation of these state transitions.

### Required semantic states

Preserve existing backward-compatible lifecycle fields and add an explicit execution/freshness layer rather than reinterpreting old values.

**Opportunity verification semantics**
- `SNAPSHOT` — historical/imported evidence only;
- `LIVE_VERIFIED` — live source re-observed at a recorded time;
- `STALE` — prior source evidence is no longer fresh enough for active use;
- `CLOSED` — source proves applications are no longer accepted;
- `BLOCKED` / `UNKNOWN` — freshness cannot currently be established.

**Application execution semantics**
- `READY_TO_APPLY` — posting is live and application entry is available;
- `FILLED` — deterministic fields were populated, but no submission evidence exists;
- `AWAITING_OPERATOR` — manual answer/upload/verification/attestation/final-submit/send action is required;
- `BLOCKED` — an exact runtime/provider dependency prevents safe progress;
- `SUBMITTED` — qualifying on-page, sent-mail, provider, or explicitly operator-confirmed evidence exists.

### No-promotion invariants

- `FILLED != SUBMITTED`.
- `LIVE_VERIFIED != SUBMITTED`.
- A local/exported tracker mutation != provider synchronization.
- Mail composition/draft != sent application.
- Provider authentication failure cannot produce a stronger application state.
- Submission state requires both a timestamp/reference and qualifying evidence bound to the same application.
- Stale/closed verification removes an item from active Batch Apply routing without deleting historical evidence.

### Channel model

Batch Apply must route through a typed application channel such as `web_form`, `email`, or `external_provider`. Each channel owns its own confirmation evidence while sharing the same no-promotion rules.

## 7. Dependency graph and bounded sprints

Graph:

`EH-A0 -> { EH-A1 || EH-A2 || EH-A3 || EH-A4 || EH-U1 } -> EH-A5`
`EH-Q0 -> EH-Q1`
`{ EH-A5 + EH-Q1 } -> EH-Q2 -> EH-A6`

Immediately after explicit implementation authorization, graph width is **2**: EH-A0 and EH-Q0 own independent contract floors. Maximum meaningful width later is **6** (EH-A1/A2/A3/A4/U1 plus EH-Q1), subject to refreshed file-collision inspection.

### EH-A0 — Progression & account-flow contract floor

**Type:** harness spine + application contract
**Goal:** convert the live-run corrections into typed contracts before implementation.

**Owned scope**
- `contracts/application-assist-session.v1.json`
- a new typed progression/account-flow contract if separation is clearer than overloading v1
- `docs/APPLICATION_ASSIST_SESSION.md`
- application-form taxonomy additions for page/action archetypes only where the taxonomy is the correct owner
- focused contract validators/tests
- this canonical plan status

**Forbidden scope**
- DOM/navigation implementation
- generated passwords or real profile values
- broad host permissions
- final-submit automation
- Windows runtime lifecycle

**Acceptance**
- intermediate navigation is no longer globally forbidden;
- final submit/attestation remains forbidden;
- `AUTO_ADVANCE_SAFE`, `REVIEW_REQUIRED`, and terminal/manual reasons are machine-defined;
- account states and secret-handling invariants are versioned;
- negative fixtures prove Submit/Apply/attestation/CAPTCHA/MFA/unknown controls cannot be auto-advanced.

**Proof ceiling:** repository contract/validator proof.

### EH-A1 — Safe intermediate progression engine

**Type:** conventional application logic
**Dependencies:** EH-A0
**Goal:** implement typed page classification and Progression Plan execution.

**Owned scope**
- new progression module under `browser/application-assist/`
- content/runtime integration required to observe page state and execute a single gated intermediate navigation action
- progression-focused synthetic fixtures/tests

**Forbidden scope**
- profile sync/import/export architecture
- credential generation/storage
- final-submit automation
- unrelated cockpit UI redesign

**Required behavior**
- page archetype detection;
- deterministic intermediate control classification;
- re-scan/re-gate immediately before action;
- validation-error and unresolved-required-field detection;
- loop/duplicate-advance protection;
- stable page-transition observation and mismatch reporting;
- no generalized “click whatever looks like Next.”

**Proof ceiling:** synthetic DOM/browser proof; no universal ATS claim.

### EH-A2 — Deterministic profile bootstrap + path hygiene

**Type:** integration seam + cleanup
**Dependencies:** EH-A0
**Goal:** remove local-agent/file-shuttling dependency for known identity fields and establish one coherent artifact/output ownership model.

**Owned scope**
- cockpit-to-extension explicit sync seam
- profile schema adapter/validation
- extension profile/preference bootstrap
- generated extension/distribution output root and documentation
- import/export recovery naming/destination guidance
- migration/compatibility behavior for existing browser-local profile data

**Forbidden scope**
- page progression implementation
- password generation
- final submission
- moving unrelated source trees merely for aesthetics

**Acceptance**
- a user with a reviewed cockpit profile can make email available to the extension without locating secret directories or manually exporting/importing JSON;
- normal application startup does not require a local agent;
- one canonical generated-output root is documented/registered;
- legacy recovery import/export remains usable.

**Proof ceiling:** repository + synthetic browser integration; physical-browser UX remains later proof.

### EH-A3 — Account bootstrap & temporary credential lifecycle

**Type:** conventional application logic + security boundary
**Dependencies:** EH-A0
**Goal:** make email-probe/login/create-account flows first-class and deterministic.

**Owned scope**
- account-flow state machine
- account-page classification
- temporary username/password generator
- session-scoped secret handling
- account-specific fill policy
- manual verification/CAPTCHA/MFA gates
- sanitized synthetic fixtures

**Forbidden scope**
- general password autofill outside recognized account creation
- repository/export/log persistence of generated secrets
- bypassing CAPTCHA/MFA
- final job-application submission

**Acceptance**
- email-first flow is expected, not exceptional;
- login/create-account branch is explicit;
- generated temporary password survives normal same-browser page transitions for the session;
- user can reveal/copy it for later replacement;
- secret values never appear in repository proof artifacts;
- duplicate-account ambiguity stops for review.

**Proof ceiling:** synthetic account-flow/browser proof; no claim against every employer identity provider.

### EH-A4 — Adversarial application-flow fixtures and validator floor

**Type:** validation
**Dependencies:** EH-A0
**Goal:** encode the exact live failures as permanent regression cases before convergence.

**Owned scope**
- new sanitized multi-page fixtures
- focused validator/test files
- CI wiring that does not collide with production implementation files

**Required fixtures**
1. email probe -> login -> create account;
2. account creation with temporary password;
3. deterministic identity page;
4. safe intermediate Next;
5. visible validation error;
6. unknown required field mismatch;
7. file upload/manual gate;
8. CAPTCHA/MFA/manual gate;
9. legal/attestation/manual gate;
10. final review page with Submit/Apply that must never auto-activate;
11. SPA transition / repeated-page loop guard;
12. user-edited field preserved across progression.

**Proof ceiling:** deterministic repository/browser-harness proof.


### EH-Q0 — Career-state queue & evidence contract floor

**Type:** conventional application logic contract + validation
**Dependencies:** explicit implementation authorization
**Goal:** make Batch Apply freshness and application transitions first-class without weakening the existing no-promotion evidence model.

**Owned scope**
- `contracts/career-state.v1.schema.json`
- `fixtures/career-state.v1.example.json`
- `scripts/validate_career_state.py`
- focused synthetic negative/positive fixtures or tests if repository convention requires them
- this canonical plan status

**Forbidden scope**
- real employer records, profile/contact values, application answers, or private tracker exports
- browser DOM/navigation implementation
- provider-specific Google Drive or mail implementation
- final-submit automation

**Acceptance**
- backward-compatible explicit opportunity freshness/verification semantics;
- explicit application execution semantics for ready/filled/awaiting-operator/blocked/submitted;
- typed application channel without embedding provider-specific behavior in the state model;
- submission promotion requires qualifying evidence bound to the application;
- negative fixtures reject filled-without-submission-proof and provider-blocked-to-submitted promotion.

**Validation**
- `python scripts/validate_career_state.py`
- focused career-state negative/positive cases
- `git diff --check`

**Proof ceiling:** repository schema/validator proof; no live provider synchronization claim.

### EH-Q1 — External tracker/provider reconciliation adapter

**Type:** integration seam + conventional application logic
**Dependencies:** EH-Q0
**Goal:** reconcile queue freshness and application progress with external provider state without treating exports, local edits, drafts, or authentication failures as stronger proof.

**Owned scope**
- `contracts/application-companion.v1.json` provider-agnostic reconciliation semantics
- smallest existing companion/sync adapter surface identified after refreshed code inspection
- sanitized reconciliation fixtures/tests
- relevant application-companion workflow/documentation
- no provider credential or real job data

**Forbidden scope**
- Application Assist DOM/progression implementation
- provider secrets/tokens or real tracker contents
- provider-specific domain states that duplicate career-state authority
- auto-submit/attestation

**Acceptance**
- provider read-back is required before claiming provider synchronization;
- live posting verification can promote freshness to `LIVE_VERIFIED`; stale/closed evidence deactivates queue execution without erasing history;
- local/export mutations remain typed as local evidence until reconciled;
- provider authorization failure produces `BLOCKED` or `AWAITING_OPERATOR`, never `SUBMITTED`;
- email/draft paths require sent/outbox/provider confirmation or operator-confirmed evidence before submission promotion;
- reconciliation is idempotent and preserves conflicts rather than silently overwriting stronger evidence.

**Validation**
- application-companion validator/tests
- synthetic provider reconciliation positive/negative cases
- career-state validator
- `git diff --check`

**Proof ceiling:** repository + synthetic adapter proof. Live Google Drive/mail/provider proof requires separately authorized connected-provider execution.

### EH-U1 — Ambient Companion Presence

**Type:** UX polish + integration adapter
**Dependencies:** EH-A0
**Canonical detailed plan:** `docs/APPLICATION_ASSIST_AMBIENT_COMPANION_PLAN.md`
**Goal:** make EscapeHatch's active participation continuously legible without turning the product into an intrusive popup.

**Owned scope**
- versioned presence-state projection contract;
- isolated in-page Shadow DOM companion beacon;
- working/waiting/blocked/paused/completed visual semantics;
- quiet/dot-only/hidden-for-session presentation preference;
- phone-native and reduced-motion behavior;
- dedicated synthetic presence fixtures/tests;
- OSS-pattern-derived implementation guidance.

**Forbidden scope**
- independent workflow/page/account state machine;
- final-submit authority;
- profile or credential rendering;
- network/telemetry work;
- shared popup/content/App integration while A1/A2/A3 own overlapping files.

**Required behavior**
- compact ambient beacon on the work page;
- pulse only for canonical working states;
- `working` and `waiting on you` are distinct;
- state changes may briefly widen the beacon but never auto-open a modal/details panel;
- details open only on intentional click/tap/keyboard activation;
- EscapeHatch must avoid common fixed chat/sticky-CTA regions using deterministic anchor fallback;
- reduced-motion, keyboard, coarse-pointer, safe-area, and no-focus-theft rules are tested;
- the presence layer projects canonical state and cannot invent progress.

**Proof ceiling:** contract/module/synthetic-browser proof. Physical-phone ergonomics and live ATS layout compatibility remain EH-A6 observed proof.

### EH-A5 — Product convergence: one continuous application run

**Type:** integration seam + UI
**Dependencies:** EH-A1, EH-A2, EH-A3, EH-A4, EH-U1
**Goal:** integrate progression, profile bootstrap, account bootstrap, and ambient presence into one coherent extension/cockpit experience.

**Owned scope**
- shared session state integration
- popup/cockpit user controls and status
- account + application progression handoff
- collision resolution in existing `popup.js`, `content.js`, `assist-core.js`, and cockpit UI as required
- clear mismatch messaging and resume path
- combined tests

**Desired user journey**
- launch EscapeHatch;
- start/open an application;
- known email/profile data is already available;
- EscapeHatch fills deterministic fields;
- if an account is required, it routes login/create-account and generates temporary credentials when needed;
- safe intermediate pages advance automatically;
- the first ambiguous/manual-sensitive page stops with an exact reason;
- after the user resolves that page, continuation resumes;
- the final application Submit/Apply action is presented for human review and is never executed automatically.

**Proof ceiling:** integrated synthetic/browser proof plus local unpacked-extension observation.


### EH-Q2 — Batch application coordinator & evidence close loop

**Type:** integration seam + runtime orchestration
**Dependencies:** EH-A5, EH-Q1
**Goal:** coordinate one prioritized application at a time across web-form/email/external-provider channels while preserving freshness, manual gates, and submission evidence.

**Owned scope**
- smallest existing application-companion/batch orchestration surface selected after refreshed code inspection
- queue item selection and channel routing
- transition receipts/status projection
- reconciliation hooks into career-state/application-companion
- combined sanitized tests and fixtures
- status/control integration needed for a continuous Batch Apply run

**Forbidden scope**
- scraping unrelated job boards
- real application data in Git/logs/fixtures
- bypassing CAPTCHA/MFA/legal/EEO/attestation/manual upload gates
- automatic final submission
- inventing provider success when auth/send/read-back is unavailable

**Required behavior**
- select one dependency-ready queue item according to existing priority policy;
- reverify freshness before fill/application effort;
- immediately retire stale/closed items from active routing while preserving evidence;
- route web forms through the converged Application Assist session;
- route email/external channels through authorized adapters or stop as `AWAITING_OPERATOR`/`BLOCKED`;
- distinguish `FILLED`, `AWAITING_OPERATOR`, and `SUBMITTED`;
- after each evidence-changing transition, persist/reconcile the smallest safe receipt and require qualifying confirmation before submission promotion;
- never let a provider failure or local tracker mutation masquerade as cloud/provider completion.

**Validation**
- combined career-state + companion + Application Assist tests
- synthetic multi-item batch with live/stale/blocked/manual/submitted paths
- channel-routing negative cases
- `git diff --check`

**Proof ceiling:** integrated synthetic/browser/provider-adapter proof; no universal ATS or provider claim.

### EH-A6 — Live acceptance, release classification, and durable closeout

**Type:** runtime proof + docs/reporting + release hygiene
**Dependencies:** EH-A5
**Goal:** prove the workflow under controlled live use, document compatibility limits, and promote through repository policy.

**Owned scope**
- workstation/browser acceptance checklist
- sanitized evidence receipt with no profile values or credentials
- docs and support boundary
- release/version classification under existing product-release contract
- integration/promotion through the canonical repository promotion owner

**Live acceptance scenarios**
- known-email first page;
- login/create-account branch;
- intermediate page auto-advance;
- mismatch stop/resume;
- final-submit hard stop;
- crash/reload session recovery where supported.

**Proof ceiling:** only observed browsers/sites actually exercised. No universal ATS compatibility claim.

## 8. Collision map

- `contracts/application-assist-session.v1.json` and `docs/APPLICATION_ASSIST_SESSION.md`: **EH-A0 only** until integrated.
- `browser/application-assist/assist-core.js`, `content.js`, `popup.js`: convergence hotspots. A1/A2/A3 should prefer new modules and focused adapters; EH-A5 owns shared-file integration.
- `harness/contracts/application-form-taxonomy.v1.json`: semantic question identity remains its owner; do not put account-navigation product logic in the taxonomy.
- `harness/contracts/application-preference-cache.v1.json`: user preference/value policy only; generated passwords do not belong here.
- `skills/application-form-mapping/SKILL.md`: mapping guidance only; no product runtime state machine.
- `.github/workflows/application-assist.yml`: EH-A4 may extend validation after EH-A0 contract ownership is stable; final combined wiring belongs to EH-A5/A6 if collisions arise.
- Windows lifecycle surfaces and `docs/WINDOWS_RUNTIME_LIFECYCLE_PLAN.md`: forbidden to these lanes unless a narrow test dependency must be read.

## 9. Harness factoring

### Existing skill

`skills/application-form-mapping/SKILL.md` — **KEEP**, but keep it scoped to reusable semantic field/question mapping. It may document how a new page/question is classified and sanitized for fixtures; it must not become the implementation of navigation or account behavior.

### Capabilities

No separate, canonical capability registry is evidenced on the refreshed integration floor for this product behavior. Do **not** invent one merely to satisfy a taxonomy. Reusable operations belong in application modules:

- classify page archetype;
- build Fill Plan;
- build Progression Plan;
- gate field write;
- gate intermediate advance;
- classify account state;
- generate session credential;
- sync validated profile.

If a later repository capability registry exists after refresh, bind these operations there as adapters without moving the behavior out of application code.

### Triggers

No separate agent-trigger registry is currently evidenced as the canonical owner. Runtime triggers belong in the product state machine:

- `page_observed`
- `fill_stable`
- `validation_error_observed`
- `safe_progression_candidate`
- `account_gate_detected`
- `verification_gate_detected`
- `mismatch_detected`
- `final_review_detected`
- `page_transition_observed`
- `emergency_stop`

Trigger conditions, inputs, outputs, and negative cases must be deterministic and tested.


### Batch Apply capability/trigger factoring

Do not create a new skill merely to hold domain logic. Keep the existing application-form mapping skill for reusable mapping guidance. Implement behavior in contracts/application code first; introduce a new skill only when a repeatable human/agent workflow remains after those owners exist.

Planned reusable capabilities:
- `verify_posting_freshness` — input opportunity source + prior freshness; output typed verification evidence/state.
- `reconcile_application_queue` — input canonical career-state + provider snapshot; output conflict-preserving reconciliation result.
- `route_application_channel` — input application channel + authorization availability; output bounded web/email/external execution route or manual/block reason.
- `record_application_transition` — input prior state + qualifying evidence; output a no-promotion-validated transition receipt.

Planned deterministic triggers:
- `queue_item_selected` -> freshness verification before application work.
- `posting_live_verified` -> permit `READY_TO_APPLY` only when application entry is available.
- `posting_stale_or_closed` -> deactivate active routing while preserving history.
- `provider_auth_blocked` -> `BLOCKED` / `AWAITING_OPERATOR`; never submit.
- `form_filled` -> `FILLED`; never submit.
- `operator_gate_reached` -> `AWAITING_OPERATOR`.
- `submission_confirmation_observed` -> submission transition only after evidence validation.

Each capability/trigger must define typed inputs/outputs, preconditions, guardrails, canonical owner, tests, and proof ceiling in EH-Q0/Q1/Q2. Prompts are routing/help surfaces, not the implementation.

## 10. Application-logic factoring

- **Domain services:** profile validation/projection, account credential generation, progression decisioning, opportunity freshness verification, application transition validation, queue reconciliation, channel routing.
- **State machines:** assist session; account bootstrap; page progression; opportunity freshness; batch-application execution/evidence.
- **Adapters:** DOM descriptor adapter; navigation adapter; cockpit-to-extension profile sync; browser session-secret store; external tracker/mail/provider reconciliation adapters behind provider-agnostic contracts.
- **Persistence:** existing user-owned profile/preferences; session-only generated secret state; no Git persistence for live values.
- **UI:** extension popup / modality adapter; cockpit sync/status surface; mismatch/final-review status.
- **Launchers:** existing Windows lifecycle remains separate.
- **Jobs/CI:** focused application-assist contract/runtime/browser suites.
- **Deployment/promotion:** existing product-release and repository-promotion contracts.

## 11. Validation order

Each implementation lane should run its focused checks first, then convergence runs:

1. progression/account contract validators and career-state queue/evidence validator;
2. existing application harness + application companion validators;
3. assist session contract tests;
4. assist runtime tests;
5. new progression/account synthetic tests;
6. browser fixture tests + synthetic queue/provider reconciliation tests;
7. application-assist and career-state/companion CI;
8. `git diff --check`;
9. local unpacked-extension observed flow;
10. controlled live ATS observation;
11. release/promotion validators after exact candidate refresh.

A passing synthetic fixture never proves live ATS compatibility. A successful intermediate advance never proves final submission, which remains deliberately manual.

## 12. Regression invariants created from this incident

These are permanent product regressions if they recur:

- deterministic email requires local-agent help or manual file shuttling;
- an email-first/login/create-account flow is treated as unexpected;
- the extension refuses a clearly safe intermediate progression solely because of the legacy global prohibition;
- a generated temporary credential appears in Git, export JSON, logs, screenshots, or receipts;
- EscapeHatch auto-activates final Submit/Apply/certification;
- unknown required controls are silently ignored while progressing;
- source/build/user-state/recovery paths become ambiguous enough that the user must discover them manually;
- a local/export tracker edit is reported as provider synchronization without provider read-back;
- a stale/closed opportunity remains in the active Batch Apply queue after authoritative closure evidence;
- `FILLED` or `READY_TO_APPLY` is reported as `SUBMITTED` without qualifying evidence;
- an email/provider authorization failure is promoted to sent/submitted state;
- real employer/application/profile data appears in tracked batch fixtures or plan artifacts.

## 13. Contract horizon

| Contract | Owner | Current status | Next transition |
| --- | --- | --- | --- |
| User-experience intent | this plan | PROVEN from live-run corrections | bind into EH-A0/EH-Q0 machine contracts |
| Application-assist contract | `contracts/application-assist-session.v1.json` | STALE relative to desired behavior | EH-A0 revises intermediate-navigation policy while retaining final-submit boundary |
| Career queue/evidence contract | `contracts/career-state.v1.schema.json` | PARTIAL; lacks observed execution/freshness states | EH-Q0 |
| Application runtime | `browser/application-assist/*` | IMPLEMENTED for manual progression only | EH-A1/A3 then EH-A5 |
| Profile bridge | cockpit + extension adapters | UNPROVEN / operationally failed live run | EH-A2 |
| External tracker/provider reconciliation | application companion + provider adapters | PARTIAL; provider-agnostic sync boundary exists, Batch Apply reconciliation unimplemented | EH-Q1 |
| Batch coordinator | application orchestration owner | UNPROVEN | EH-Q2 after EH-A5 + EH-Q1 |
| Validation regression floor | tests/fixtures/workflows | PARTIAL | EH-A4 + EH-Q0/Q1 then combined EH-Q2 |
| Live browser/provider acceptance | operator workstation / authorized provider | REQUIRED SUCCESSOR WORK | EH-A6 |
| Mainline/integration promotion | repository promotion owner | REQUIRED SUCCESSOR WORK | after exact-candidate validation |
| Universal ATS compatibility | no owner can prove universally | NOT APPLICABLE as a completion claim | document observed compatibility only |

## 14. Launch order

Planning output only; **no implementation lane is dispatched by this planning pass**.

After explicit implementation authorization:

1. **Parallel Wave 0 — contract floors**
   - **EH-A0 — Progression & account-flow contract floor**
   - **EH-Q0 — Career-state queue & evidence contract floor**
2. **Parallel Wave 1 — browser/product lanes after their owning floor**
   - after EH-A0: **EH-A1**, **EH-A2**, **EH-A3**, **EH-A4**, **EH-U1**
   - after EH-Q0: **EH-Q1 — External tracker/provider reconciliation adapter**
3. **EH-A5 — Product convergence: one continuous application run** after A1/A2/A3/A4/U1.
4. **EH-Q2 — Batch application coordinator & evidence close loop** after A5 + Q1.
5. **EH-A6 — Live acceptance, release classification, and durable closeout** after Q2.

Parallel execution is **REQUIRED AFTER AUTHORIZATION** because Wave 0 has two meaningful non-conflicting contract owners. The planning pass does not pretend that lane enumeration is dispatch proof.

## 15. First executable continuation

**Current authorization gate:** product/runtime implementation is not authorized by this planning pass.

**NEXT ACTION — operator approval:** explicitly authorize the implementation floor, for example: `EXECUTE EH-A0 + EH-Q0`.

Only after that gate succeeds, the execution owner must resolve the current checkout portably rather than assuming the historical OneDrive path:

```powershell
$repo = & pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location -LiteralPath $repo
git fetch --all --prune --tags
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git status --short --branch
git merge-base --is-ancestor be4a4c41403d700285084f941f2725a95a9877b5 origin/integration/replit-donor-b01f628-20260921
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

The authorized executor then creates isolated writers for EH-A0 and EH-Q0 from the refreshed integration floor and dispatches them concurrently through the first safe evidenced adapter rung. It must not start their dependent lanes until the corresponding contract floor is integrated/pinned.

### Dispatch artifact collision

The repository's active Windows lifecycle graph already reserves `Outputs/prompt-parallel-dispatch/manifest.json` as its canonical target. This plan therefore stores its machine-readable graph at:

`Outputs/prompt-parallel-dispatch/runs/escapehatch-application-assist-autopilot-20260923/manifest.json`

That run-scoped manifest is durable orchestration evidence, but **does not satisfy canonical dispatch validation/receipt proof** while `harness/contracts/prompt-parallel-dispatch.v1.json` and `scripts/prompt_parallel_dispatch.py` remain absent and the generic target remains owned by the lifecycle graph. Do not rebind the generic path from this application-assist planning lane.

## 16. Closeout state of this planning pass

- **COMPLETED / PROVEN:** live-run browser/account/profile/path defects plus Batch Apply tracker/freshness/evidence/channel defects captured; provider floor reconciled; queue/evidence ownership assigned to career-state/application-companion rather than prompts; dependency graph and collision ownership updated.
- **REMAINING GAPS:** no product implementation has been performed; no canonical dispatch validation/receipt exists; no live ATS/provider proof has been promoted.
- **RISKS:** account credentials, browser navigation, tracker reconciliation, and submission evidence are sensitive surfaces; all require typed gates and negative fixtures. The repository is public, so real application/profile/provider data must remain external.
- **BLOCKERS:** implementation awaits explicit operator authorization; canonical dispatch schema/runner are absent; the generic dispatch target is reserved by the active Windows lifecycle graph.
- **PROOF CEILING:** durable planning/provider evidence only.
- **INTEGRATION STATE:** planning PR only; product/runtime integration branch remains unchanged by this planning pass.
- **NEXT ACTION:** operator explicitly authorizes `EH-A0 + EH-Q0`; only then may the execution owner dispatch the two contract floors in parallel.
