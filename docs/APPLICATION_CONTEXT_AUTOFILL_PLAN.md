# EscapeHatch Contextual Autofill & Navigation Plan

**Parent plan:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`  
**Scoped canonical owner for this expansion:** `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md`  
**Plan date:** 2026-09-24  
**Planning floor:** `integration/replit-donor-b01f628-20260921@d0f89105ed6619263ca311df09abc2a7960f1a0d`  
**Disposition:** planning / handoff durability only; no product-runtime implementation is authorized by this planning pass.  
**Run-scoped dispatch manifest:** `Outputs/prompt-parallel-dispatch/runs/escapehatch-contextual-autofill-navigation-20260924/manifest.json`

## 1. Why this scoped plan exists

The parent autopilot plan already establishes safe intermediate progression, account bootstrap, profile bootstrap, queue evidence semantics, ambient presence, and an absolute final-submit boundary. The 2026-09-24 live application run exposed three additional product seams that are now concrete enough to factor without widening the active recovery PR:

1. **Opportunity compensation must become executable application context.** A live job posting may publish a minimum/maximum compensation range while the application asks for aliases such as “Desired Salary Expectations,” “Desired Salary,” “Target Compensation,” “Expected Pay,” or an annual/hourly value. The product currently has a question taxonomy entry for desired annual salary and opportunity-scoped preference precedence, but canonical opportunity state does not carry a normalized compensation range. EscapeHatch therefore cannot deterministically derive the operator’s requested default: **use the verified posted maximum when the application asks for desired/expected compensation and no stronger user override exists.**
2. **Navigation controls need semantic action typing, not a short label allowlist.** The runtime currently recognizes exact labels such as Next, Continue, and Save and Continue, and blocks obvious Submit/Apply/Finish labels. Real applications also expose Save Draft, Save & Exit, Save & Quit, Quit, Exit, Back, Cancel, Review & Submit, and controls whose HTML type is `submit` even when their semantic effect is merely “next step.” Those are materially different actions.
3. **Application topology/context must be first-class.** A live Taleo flow exposed a nine-step application after login (profile, education/certifications, work experience, company questionnaire, position questionnaire, diversity questionnaire, attachments, electronic signature, review/submit), while other ATS flows may be one-page, SPA-driven, or hybrid. The product must model the current application/section context instead of assuming a fixed page count or one universal page shape.

This plan records only sanitized product evidence. It does not persist the operator’s contact data, salary entry, account credentials, application answers, screenshots, or employer-private state.

## 2. Refreshed floor and collision map

- Provider default remains `main@0824535b9dc1341def885a79a098d297df770ac8`.
- Provider integration floor is `integration/replit-donor-b01f628-20260921@d0f89105ed6619263ca311df09abc2a7960f1a0d`.
- PR #29 (`recovery/eh-crash-align-20260924`) remains the active Application Assist/A6 recovery lane and owns convergence/acceptance surfaces including the parent autopilot plan, modality/presence, batch reconciliation, and acceptance receipt.
- PR #27 owns deterministic zero-configuration resume/profile intake under the cockpit artifact and also touches the parent autopilot plan.
- PR #35 is planning-only for the local career store/import pipeline and touches no production application-assist files.
- This scoped plan therefore uses **new owned plan/manifest paths** and does not edit the parent autopilot plan while #29/#27 remain separately owned.
- Production edits to `progression.js`, `navigation-adapter.js`, shared `content.js`, modality/presence convergence, or A6 acceptance must refresh against #29’s resolved integration result before mutation.

## 3. Design invariant: derive, classify, then act

The extended runtime should become:

`canonical opportunity/profile state -> application flow context -> semantic field classification -> value resolution -> Fill Plan -> field gate -> DOM writer -> semantic action classification -> Progression Plan -> progression gate -> navigation adapter -> transition observation`

No field value may be invented because a label resembles another field, and no click may be dispatched because a control merely contains a familiar word.

### 3.1 Compensation default invariant

When a live/verified opportunity publishes a parseable compensation range, the default desired-compensation strategy is:

`session_confirmation > explicit opportunity_override > verified_posted_maximum > profile_preference > unresolved`

The default **posted maximum** is eligible only when all required facts are explicit and compatible with the application field:

- the opportunity compensation source is current enough for the application attempt and bound to the opportunity;
- maximum value is explicitly published, not inferred from market data;
- currency is known;
- pay period/unit is known or the destination field explicitly accepts the published unit;
- the field is semantically a desired/expected/target compensation field;
- the field is not current compensation, compensation history, minimum acceptable pay, or another materially different question;
- any conversion between hourly/annual/other periods is performed only when a repository contract defines the conversion inputs; otherwise the field stops for review;
- an explicit per-opportunity override always wins.

If the posting publishes both hourly and annual maxima, prefer the value whose unit matches the destination field. If the destination explicitly accepts either form, prefer the explicitly published annual maximum when available rather than recomputing it from hourly data.

### 3.2 Compensation provenance model

Add a typed opportunity-level compensation projection with at least:

- `minimum`
- `maximum`
- `currency`
- `period` / unit (hour, year, etc.)
- optional alternate explicitly published range(s)
- raw/source artifact identity
- `verified_at`
- derivation/provenance state
- optional user override and override timestamp

Do not store real operator values in repository fixtures. Synthetic fixtures only.

### 3.3 Compensation semantic families

Do not turn every salary-like phrase into one alias bucket. Distinguish:

- desired / expected / target compensation
- desired annual salary
- desired hourly rate
- compensation currency
- compensation period
- minimum acceptable compensation
- current compensation
- compensation history
- posted range display (not an input)

Only desired/expected/target fields are eligible for the default posted-maximum policy in the first implementation.

## 4. Semantic navigation-action ontology

Introduce a versioned action-semantics owner rather than growing ad-hoc string tests forever.

Minimum action kinds:

| Action kind | Examples | Initial automation policy |
| --- | --- | --- |
| `ADVANCE_INTERMEDIATE` | Next, Continue, Next Step | auto-eligible only after Progression Gate |
| `SAVE_AND_ADVANCE` | Save and Continue, Save & Next | auto-eligible only after Progression Gate |
| `AUTH_CONTINUE` | Continue with email, Sign in and continue | auto-eligible only in recognized auth/account state |
| `SAVE_STAY` | Save Draft, Save | manual/review initially |
| `SAVE_EXIT` | Save and Quit, Save & Exit | manual-only initially |
| `EXIT_NO_SAVE` | Quit, Exit | manual-only |
| `BACK` | Back, Previous | manual/review initially |
| `CANCEL_WITHDRAW` | Cancel application, Withdraw | hard manual-only |
| `FINAL_SUBMIT` | Submit, Submit Application, Apply, Finish | hard manual-only |
| `ATTEST_SIGN` | Sign, Certify, Electronic Signature | hard manual-only |
| `UNKNOWN` | ambiguous or mixed semantics | REVIEW_REQUIRED |

Rules:

- HTML `type=submit` is **not** equivalent to `FINAL_SUBMIT`; server-rendered multi-step forms frequently use submit-type controls for intermediate steps.
- Raw label text alone is insufficient. Classification consumes control label, form/page context, current stage, surrounding heading/help text, location in the application flow, and prior transition evidence.
- “Apply” at application entry and “Apply/Submit” at final review are different semantic actions; context decides.
- Stepper labels such as “Review and Submit” are not clickable-action evidence by themselves.
- Page chrome such as Sign Out, account options, browser navigation, unrelated site CTAs, and global headers must stay outside the application-control scope.
- Any mixed/ambiguous action fails closed to `REVIEW_REQUIRED`.
- The irreversible boundary remains: **no automatic final submit, certification, signature, withdrawal, or attestation.**

## 5. Application Flow Context engine

This is separate from the existing mouse/keyboard/phone **interaction modality** contract. “Multimodal” here means **multiple evidence signals feeding one application-context model**, not a second user-input modality state machine.

### 5.1 Topology modes

Support at least:

- `SINGLE_PAGE`
- `MULTI_STEP`
- `SPA_MULTI_STEP`
- `HYBRID`
- `ACCOUNT_GATE`
- `UNKNOWN`

### 5.2 Stage/section archetypes

The context engine should represent stages such as:

- application entry
- email/account/login
- resume/profile upload
- identity/contact
- education/certifications
- work experience
- company questionnaire
- position questionnaire
- EEO/diversity
- attachments
- electronic signature
- review
- final submit boundary
- unknown/manual gate

One page may expose several virtual sections. A multi-step flow may expose one or several sections per physical page. Therefore **page != section != stage**.

### 5.3 Context signals

V1 should fuse deterministic browser signals:

- DOM form boundaries and required controls
- visible headings/legends/labels
- stepper/progress indicators and current-step markers
- control/action semantics
- URL/route changes
- page/form fingerprints
- validation errors
- prior observed transition
- known account/application state
- field-family distribution
- visible final-review/signature indicators

A future visual/screenshot model may be added as an optional adapter, but V1 correctness must not require computer vision when the DOM/accessibility surface already provides deterministic evidence.

### 5.4 Context state

Persist enough session-local state to reason about continuity without treating URL alone as truth:

- application/session binding
- origin
- topology
- current stage
- current physical page fingerprint
- current virtual section(s)
- observed step index / total when available
- prior stage/page
- expected next stage set
- transition budget
- confidence/reason codes
- unresolved manual gates

The engine must tolerate unknown total page counts and dynamic insertion/removal of steps.

## 6. UX projection

The ambient companion should eventually project truth from the context engine rather than generic “working” state only. Examples:

- `Step 2 of 9 · Education & Certifications`
- `Filling 4 deterministic fields`
- `Next action: Save & Continue · safe intermediate`
- `Waiting on you · attachment required`
- `Final review reached · Submit is manual`

The projection must never imply that submission occurred merely because the form was filled or the final page was reached.

## 7. Dependency graph and bounded sprints

Graph:

`{ EH-COMP0 || EH-ACT0 || EH-CTX0 } -> { EH-COMP1 || EH-ACT1 || EH-CTX1 || EH-VAL1 } -> EH-CONV -> EH-LIVE`

Additional gate:

- Production implementation lanes touching the Application Assist runtime must start from a refreshed floor where PR #29 is either merged into integration or explicitly superseded/reconciled.
- PR #27 must be reconciled before any cockpit/profile intake collision is introduced; the compensation lanes should avoid its files unless refreshed evidence proves convergence.

Graph width is **3** at the contract floor and up to **4** during implementation/validation when file ownership remains non-overlapping.

### EH-COMP0 — Compensation provenance & resolution contract

**Type:** harness spine + conventional application data contract  
**Goal:** make verified posted compensation and “posted maximum by default” a typed, provenance-bound policy.

**Owned scope**
- new compensation contract if separation is cleaner;
- `contracts/career-state.v1.schema.json` compensation projection;
- `harness/contracts/application-form-taxonomy.v1.json` compensation question families/aliases;
- `harness/contracts/application-preference-cache.v1.json` strategy/precedence semantics;
- focused synthetic validator/tests.

**Forbidden scope**
- real employer compensation records in Git;
- scraping implementation;
- browser DOM writes;
- automatic final submission;
- converting compensation across periods without explicit contract inputs.

**Acceptance**
- opportunity compensation can carry verified min/max/currency/period/provenance;
- desired compensation strategy defaults to verified posted max;
- explicit opportunity override wins;
- current/history/minimum-compensation questions cannot inherit desired-compensation values;
- unknown/missing unit or stale source fails closed.

### EH-ACT0 — Navigation action semantic contract

**Type:** harness spine + safety contract  
**Goal:** replace short label lists with typed action semantics and irreversible-action policy.

**Owned scope**
- new `contracts/application-action-semantics.v1.json`;
- sanitized alias fixtures;
- focused validator/tests;
- compatibility mapping to existing Progression Plan terminology.

**Forbidden scope**
- production clicks;
- final-submit automation;
- ATS-specific hardcoded selectors.

**Acceptance**
- all action kinds above are machine-defined;
- `type=submit` is explicitly non-authoritative;
- final submit/sign/certify/withdraw remain manual;
- unknown/mixed aliases fail closed.

### EH-CTX0 — Application Flow Context contract

**Type:** application context/state-machine contract  
**Goal:** model application topology, stages, pages, and virtual sections independently of ATS vendor and page count.

**Owned scope**
- new `contracts/application-flow-context.v1.json`;
- sanitized topology fixtures for one-page, multi-step, SPA, account-gated, and unknown flows;
- focused validator/tests.

**Forbidden scope**
- browser runtime mutation;
- visual-model dependency;
- employer-specific state machine.

**Acceptance**
- page, section, stage, and application topology are distinct;
- step count is optional;
- context is transition-aware and fail-closed;
- interaction modality contract remains separate.

### EH-COMP1 — Compensation resolver & field matcher

**Type:** conventional application logic  
**Dependencies:** EH-COMP0; refreshed Application Assist floor  
**Goal:** derive the correct requested compensation value and feed it through the existing Fill Plan.

**Owned scope**
- new compensation resolver module under `browser/application-assist/`;
- smallest required integration into Fill Plan/preference resolution;
- opportunity-context adapter;
- synthetic compensation fixtures/tests.

**Forbidden scope**
- market-rate inference;
- current-salary inference;
- unsupported period conversion;
- unrelated profile/resume intake.

**Acceptance**
- a City-of-Hope-shaped “Annual (...) or Hourly (...)” synthetic field receives the verified posted maximum in a compatible published unit;
- aliases route to the correct semantic family;
- explicit user override wins;
- stale/ambiguous ranges stop for review.

### EH-ACT1 — Context-aware action classifier & progression gate

**Type:** conventional application logic + safety boundary  
**Dependencies:** EH-ACT0; PR #29 merged/superseded/reconciled  
**Goal:** classify controls semantically and let only safe intermediate actions reach the navigation adapter.

**Owned scope**
- `browser/application-assist/progression.js`;
- `browser/application-assist/navigation-adapter.js`;
- new action-classifier module if it keeps responsibilities cohesive;
- focused tests.

**Forbidden scope**
- final submit/sign/certify/withdraw;
- generalized click-by-label;
- unrelated profile logic.

**Acceptance**
- Save & Continue auto-advances only when all gates pass;
- Save Draft, Save & Exit, Quit/Exit, Back, Submit, Sign/Certify remain distinct;
- a submit-typed Next button can still classify as intermediate;
- an initial Apply CTA cannot be confused with a final Submit/Apply control;
- live re-scan must preserve action identity before dispatch.

### EH-CTX1 — Flow-context runtime engine

**Type:** conventional application logic + integration seam  
**Dependencies:** EH-CTX0; PR #29 merged/superseded/reconciled  
**Goal:** build and maintain application topology/stage context across DOM mutations and page transitions.

**Owned scope**
- new `browser/application-assist/flow-context.js`;
- smallest integration in `content.js`;
- session-local context projection;
- focused tests.

**Forbidden scope**
- duplicate assist/session state machine;
- vision as required dependency;
- hardcoded Taleo-only flow.

**Acceptance**
- one-page and nine-step-style synthetic applications both map coherently;
- stepper evidence may provide 2-of-9 style state when present;
- single-page flows create virtual sections without fake page transitions;
- SPA transitions update context without double-advance;
- context uncertainty blocks risky navigation.

### EH-VAL1 — Cross-context adversarial regression floor

**Type:** validation  
**Dependencies:** EH-COMP0, EH-ACT0, EH-CTX0  
**Goal:** bind the new semantics to permanent negative/positive cases.

**Required fixtures**
1. desired salary alias with verified annual range -> posted max;
2. desired salary alias with hourly-only range -> compatible hourly max;
3. current salary label -> must not receive posted max;
4. minimum acceptable salary label -> must not inherit desired max policy;
5. stale compensation source -> review required;
6. Save and Continue -> safe intermediate candidate;
7. Save Draft -> not progression;
8. Save and Exit / Save and Quit -> manual exit;
9. Quit / Exit -> manual no-save exit;
10. server-side `type=submit` Next -> intermediate when context proves it;
11. final Submit Application -> hard block;
12. initial Apply CTA -> application-entry action, not submission;
13. one-page application with virtual sections;
14. nine-step Taleo-shaped flow with signature and final review;
15. SPA route mutation with stable application binding;
16. ambiguous/multiple candidate controls -> review required.

### EH-CONV — Contextual autofill convergence

**Type:** integration seam + UX  
**Dependencies:** EH-COMP1, EH-ACT1, EH-CTX1, EH-VAL1  
**Goal:** converge compensation, flow context, and action semantics into one continuous application-assist loop.

**Owned scope**
- shared session/content/popup integration;
- context projection into ambient companion;
- combined Fill Plan / Progression Plan evidence;
- collision resolution with merged A6 recovery;
- combined tests.

**Forbidden scope**
- automatic final submit;
- weakening existing attestation/CAPTCHA/MFA/manual gates;
- duplicate state authority.

**Acceptance**
- known deterministic fields including eligible desired compensation populate without configuration;
- context and action classifier agree before auto-advance;
- manual gates stop with exact reason and can resume;
- final review presents a manual Submit boundary.

### EH-LIVE — Controlled live acceptance & promotion handoff

**Type:** runtime proof + docs/reporting  
**Dependencies:** EH-CONV  
**Goal:** prove behavior on controlled real applications without claiming universal ATS support.

**Acceptance targets**
- one observed multi-step ATS flow with salary field and final submit boundary;
- one materially different one-page or SPA application;
- final submit remains operator-only in both;
- sanitized acceptance receipt records observed topology/action/value decisions without private answers;
- release/promotion owner receives exact validated candidate.

**Proof ceiling:** only observed ATS/application flows; no universal compatibility claim.

## 8. Agent-harness factoring

No new skill is justified yet. Product/domain logic belongs in contracts and application code.

Planned reusable capabilities:

- `resolve_opportunity_compensation`
  - input: verified opportunity compensation + destination field semantic;
  - output: typed value/unit/source or REVIEW_REQUIRED;
  - guardrail: no market inference or unsupported conversion.
- `classify_application_action`
  - input: control descriptor + flow context;
  - output: typed action kind + confidence/reason;
  - guardrail: irreversible actions manual-only.
- `derive_application_flow_context`
  - input: DOM/page descriptor + prior context;
  - output: topology/stage/section/transition context;
  - guardrail: unknown context blocks risky progression.
- existing `record_application_transition` remains the queue/application status owner after actual evidence changes.

Planned deterministic triggers:

- `opportunity_live_verified_with_compensation` -> normalize compensation provenance;
- `desired_compensation_field_detected` -> resolve opportunity-scoped compensation;
- `navigation_control_detected` -> classify action before Progression Plan;
- `page_or_dom_transition_observed` -> refresh flow context;
- `final_submit_boundary_detected` -> `AWAITING_OPERATOR`, never auto-click.

## 9. Validation order

1. focused compensation/action/context contract validators;
2. focused unit tests for each implementation lane;
3. existing application harness + session contract validators;
4. application-assist runtime tests;
5. adversarial cross-context fixture suite;
6. modality/presence tests to prove no second UI state machine;
7. career-state/application companion tests where compensation/application state changes;
8. `git diff --check`;
9. unpacked-extension synthetic/observed browser pass;
10. controlled live multi-step + one-page/SPA acceptance;
11. release/promotion validators after exact-candidate refresh.

## 10. Regression invariants

These are regressions if they recur:

- desired/expected compensation is left manual when a verified compatible posted maximum and no stronger override exist;
- salary-like aliases collapse current/history/minimum compensation into desired compensation;
- compensation is converted between periods without explicit contract inputs;
- navigation safety is based only on a control’s text or HTML `type`;
- Save Draft, Save & Exit, Quit/Exit, Save & Continue, and Submit are treated as equivalent;
- an initial Apply CTA is treated as final submission or vice versa;
- page count is assumed rather than observed;
- single-page sections are treated as fake page transitions;
- the flow-context engine duplicates mouse/keyboard/phone modality state;
- any final Submit/Apply/Sign/Certify/attestation/withdraw action is auto-activated;
- reaching final review is promoted to SUBMITTED without qualifying evidence.

## 11. Contract horizon

| Contract | Owner | Status | Next transition |
| --- | --- | --- | --- |
| Parent Application Assist autopilot | `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md` | active / separately owned by recovery work | reconcile pointer after #29/#27 settle |
| Compensation semantics | EH-COMP0 | PLANNED | versioned contract + provenance + taxonomy |
| Navigation action semantics | EH-ACT0 | PLANNED | action ontology + negative fixtures |
| Application flow context | EH-CTX0 | PLANNED | topology/stage/section contract |
| Compensation runtime | EH-COMP1 | REQUIRED SUCCESSOR WORK | resolver + Fill Plan integration |
| Action runtime | EH-ACT1 | REQUIRED SUCCESSOR WORK | classifier + Progression Gate integration |
| Context runtime | EH-CTX1 | REQUIRED SUCCESSOR WORK | flow-context module + content integration |
| Cross-context validation | EH-VAL1 | REQUIRED SUCCESSOR WORK | adversarial fixture floor |
| Product convergence | EH-CONV | REQUIRED SUCCESSOR WORK | combined session/UX loop |
| Live ATS acceptance | EH-LIVE | REQUIRED SUCCESSOR WORK | observed multi-step + materially different flow |
| Final submission | operator | MANUAL-ONLY | never automated by this plan |

## 12. Launch order

This planning pass does **not** dispatch product implementation.

After explicit implementation authorization and a refreshed collision check:

1. **Parallel Wave 0:** EH-COMP0, EH-ACT0, EH-CTX0.
2. **Parallel Wave 1:** EH-COMP1, EH-ACT1, EH-CTX1, EH-VAL1, with ACT1/CTX1 waiting for #29 merge/supersession if its shared runtime floor is unresolved.
3. **EH-CONV:** single convergence owner.
4. **EH-LIVE:** controlled live acceptance and promotion handoff.

## 13. First executable continuation

**Owner:** future implementation coordinator.  
**Dependency:** explicit implementation authorization + refreshed provider floor.  
**First action:** refresh integration/PR #29/#27 ownership, then dispatch EH-COMP0/EH-ACT0/EH-CTX0 in isolated non-overlapping lanes.  
**Expected proof:** three versioned contracts with focused positive/negative fixtures and no private data.  
**Completion gate:** focused validators green and the exact validated contract heads are integrated into the current integration floor without overwriting separately owned recovery work.
