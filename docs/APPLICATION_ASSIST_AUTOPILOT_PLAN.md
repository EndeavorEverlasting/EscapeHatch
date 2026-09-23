# EscapeHatch Application Assist Autopilot Plan

**Canonical plan owner:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`  
**Plan date:** 2026-09-23  
**Planning floor:** `integration/replit-donor-b01f628-20260921@be4a4c41403d700285084f941f2725a95a9877b5`  
**Planning branch:** `plan/application-assist-autopilot-20260923`  
**Disposition:** planning / handoff durability only; no product-runtime implementation is authorized by this planning pass.

## 1. Execution frame

- **Repository:** `EndeavorEverlasting/EscapeHatch`
- **Historical primary local path:** `C:\Users\pa_rperez26\OneDrive - Northwell Health\OG Laptop Backup\Desktop\dev\EscapeHatch`; local agent must revalidate before mutation.
- **Current provider default:** `main@0824535b9dc1341def885a79a098d297df770ac8`
- **Current provider integration floor:** `integration/replit-donor-b01f628-20260921@be4a4c41403d700285084f941f2725a95a9877b5`, 48 commits ahead / 0 behind `main`.
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

These five incidents are the primary product acceptance input for this plan.

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

## 7. Dependency graph and bounded sprints

Graph:

`EH-A0 -> { EH-A1 || EH-A2 || EH-A3 || EH-A4 || EH-U1 } -> EH-A5 -> EH-A6`

Maximum meaningful width after the contract floor: **5**, subject to refreshed file-collision inspection.

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
**Dependencies:** EH-A1, EH-A2, EH-A3, EH-A4  
**Goal:** integrate progression, profile bootstrap, and account bootstrap into one coherent extension/cockpit experience.

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

## 10. Application-logic factoring

- **Domain services:** profile validation/projection, account credential generation, progression decisioning.
- **State machines:** assist session; account bootstrap; page progression.
- **Adapters:** DOM descriptor adapter; navigation adapter; cockpit-to-extension profile sync; browser session-secret store.
- **Persistence:** existing user-owned profile/preferences; session-only generated secret state; no Git persistence for live values.
- **UI:** extension popup / modality adapter; cockpit sync/status surface; mismatch/final-review status.
- **Launchers:** existing Windows lifecycle remains separate.
- **Jobs/CI:** focused application-assist contract/runtime/browser suites.
- **Deployment/promotion:** existing product-release and repository-promotion contracts.

## 11. Validation order

Each implementation lane should run its focused checks first, then convergence runs:

1. progression/account contract validators;
2. existing application harness validator;
3. assist session contract tests;
4. assist runtime tests;
5. new progression/account synthetic tests;
6. browser fixture tests;
7. application-assist CI;
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
- source/build/user-state/recovery paths become ambiguous enough that the user must discover them manually.

## 13. Contract horizon

| Contract | Owner | Current status | Next transition |
| --- | --- | --- | --- |
| User-experience intent | this plan | PROVEN from live-run corrections | bind into EH-A0 machine contract |
| Application-assist contract | `contracts/application-assist-session.v1.json` | STALE relative to desired behavior | EH-A0 revises intermediate-navigation policy while retaining final-submit boundary |
| Application runtime | `browser/application-assist/*` | IMPLEMENTED for manual progression only | EH-A1/A3 then EH-A5 |
| Profile bridge | cockpit + extension adapters | UNPROVEN / operationally failed live run | EH-A2 |
| Validation regression floor | tests/fixtures/workflow | PARTIAL | EH-A4 then combined EH-A5 |
| Live browser acceptance | operator workstation | REQUIRED SUCCESSOR WORK | EH-A6 |
| Mainline integration | repository promotion owner | REQUIRED SUCCESSOR WORK | after exact-candidate validation |
| Universal ATS compatibility | no owner can prove universally | NOT APPLICABLE as a completion claim | document observed compatibility only |

## 14. Launch order

Planning output only; **no implementation lane is dispatched by this planning pass**.

1. **EH-A0 — Progression & account-flow contract floor**
2. Parallel group after EH-A0:
   - **EH-A1 — Safe intermediate progression engine**
   - **EH-A2 — Deterministic profile bootstrap + path hygiene**
   - **EH-A3 — Account bootstrap & temporary credential lifecycle**
   - **EH-A4 — Adversarial application-flow fixtures and validator floor**
   - **EH-U1 — Ambient Companion Presence**
3. **EH-A5 — Product convergence: one continuous application run**
4. **EH-A6 — Live acceptance, release classification, and durable closeout**

## 15. First executable continuation

**Owner:** local repository agent acting as EH-A0.  
**Dependency:** refreshed local checkout must contain `be4a4c41403d700285084f941f2725a95a9877b5` or a later integration head that still contains this plan after reconciliation.

First action:

```powershell
Set-Location 'C:\Users\pa_rperez26\OneDrive - Northwell Health\OG Laptop Backup\Desktop\dev\EscapeHatch'
git fetch --all --prune --tags
git status --short --branch
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor be4a4c41403d700285084f941f2725a95a9877b5 origin/integration/replit-donor-b01f628-20260921
git show origin/plan/application-assist-autopilot-20260923:docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md
```

Then the agent should create an isolated EH-A0 worktree/branch from the refreshed integration floor, revise the contract/tests only, validate, and return to the dependency graph. It must not begin EH-A1/A2/A3/A4 before EH-A0's contract floor is integrated or otherwise pinned as the shared base.

## 16. Closeout state of this planning pass

- **COMPLETED / PROVEN:** five live-run failures captured; current provider floor refreshed; current manual-navigation contract inspected; collision surfaces identified; successor dependency graph defined.
- **REMAINING GAPS:** no product implementation has been performed; no live ATS proof has been claimed.
- **RISKS:** account credentials and navigation are sensitive surfaces; both require narrow typed gates and negative fixtures.
- **BLOCKERS:** canonical `prompt-parallel-dispatch` schema/runner are absent from the current integration floor, so dispatch-manifest validation/receipt proof cannot be claimed here.
- **PROOF CEILING:** durable planning/provider evidence only.
- **INTEGRATION STATE:** plan branch only; runtime integration branch remains unchanged by this planning pass.
- **NEXT ACTION:** EH-A0 contract-floor implementation by the local repository agent after refreshed checkout/reconciliation.
