# EscapeHatch Contextual Autofill & Navigation Plan

**Parent plan:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`
**Scoped owner:** `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md`
**Plan date:** 2026-09-24
**Planning floor:** `integration/replit-donor-b01f628-20260921@d0f89105ed6619263ca311df09abc2a7960f1a0d`
**Disposition:** planning only; no runtime implementation is authorized by this pass.
**Dispatch manifest:** `Outputs/prompt-parallel-dispatch/runs/escapehatch-contextual-autofill-navigation-20260924/manifest.json`

## 1. Live evidence and problem statement

The parent autopilot plan already owns safe intermediate progression, account bootstrap, profile bootstrap, queue evidence semantics, ambient presence, and the hard final-submit boundary. A 2026-09-24 live multi-step application exposed three additional reusable gaps:

1. Opportunity compensation is not yet executable application context. The application can ask for a desired salary using many aliases, while the posting may publish a min/max range. Default behavior should use the verified posted maximum unless a stronger opportunity-specific user override exists.
2. Navigation is still too label-driven. Save and Continue, Save Draft, Save and Exit, Quit, Exit, Back, Submit, Sign/Certify, and unknown controls are different semantic actions and must never share one loose alias bucket.
3. Application topology must be explicit. One-page, multi-step, SPA, hybrid, and account-gated applications need one context engine that understands page, section, stage, and transition separately.

This plan contains only sanitized product evidence. No real profile data, credentials, answers, or screenshots belong in Git.

## 2. Collision map

- PR #29 remains the active Application Assist/A6 recovery owner.
- PR #27 remains the deterministic resume/profile intake owner.
- PR #35 is planning-only for the career-store/import pipeline.
- This plan uses new paths and does not edit the parent autopilot plan while #29/#27 remain separately owned.
- Runtime changes to progression, navigation, shared content, modality/presence, or A6 acceptance must refresh after #29 is merged, superseded, or explicitly reconciled.

## 3. Extended runtime model

Target pipeline:

`canonical opportunity/profile state -> flow context -> semantic field classification -> value resolution -> Fill Plan -> field gate -> DOM writer -> semantic action classification -> Progression Plan -> progression gate -> navigation adapter -> transition observation`

No field value may be invented because its label resembles another question. No control may be activated because its text merely resembles a safe button.

## 4. Compensation policy

Default precedence:

`session confirmation > explicit opportunity override > verified posted maximum > profile preference > unresolved`

The posted maximum is eligible only when:

- the opportunity compensation source is bound to the current opportunity and is sufficiently fresh;
- maximum, currency, and pay period are explicit;
- the destination is a desired/expected/target compensation field;
- the destination is not current compensation, compensation history, or minimum acceptable compensation;
- the field accepts the posted unit or a contract-defined conversion is available;
- an explicit opportunity override does not exist.

If the posting publishes both annual and hourly maxima, match the field's requested unit. If the field accepts either and an annual maximum is explicitly published, prefer that explicit annual value rather than recomputing it.

Canonical compensation provenance should include minimum, maximum, currency, period, source artifact, verified_at, and override metadata.

Compensation semantic families must remain distinct:

- desired / expected / target compensation
- desired annual salary
- desired hourly rate
- currency
- period
- minimum acceptable compensation
- current compensation
- compensation history
- posted range display

Only desired/expected/target fields receive the posted-maximum default.

## 5. Navigation action semantics

Create a typed action ontology:

| Action kind | Examples | V1 policy |
| --- | --- | --- |
| `ADVANCE_INTERMEDIATE` | Next, Continue, Next Step | auto-eligible after Progression Gate |
| `SAVE_AND_ADVANCE` | Save and Continue, Save & Next | auto-eligible after Progression Gate |
| `AUTH_CONTINUE` | Continue with email, Sign in and continue | auto-eligible only in recognized auth state |
| `SAVE_STAY` | Save Draft, Save | manual/review |
| `SAVE_EXIT` | Save and Quit, Save & Exit | manual |
| `EXIT_NO_SAVE` | Quit, Exit | manual |
| `BACK` | Back, Previous | manual/review |
| `CANCEL_WITHDRAW` | Cancel application, Withdraw | hard manual-only |
| `FINAL_SUBMIT` | Submit, Submit Application, Apply, Finish | hard manual-only |
| `ATTEST_SIGN` | Sign, Certify, Electronic Signature | hard manual-only |
| `UNKNOWN` | ambiguous/mixed | REVIEW_REQUIRED |

Rules:

- HTML `type=submit` is not semantic proof of final submission.
- Control text alone is insufficient; action classification consumes flow context and surrounding evidence.
- Initial Apply and final Submit/Apply are different actions.
- Stepper text such as Review and Submit is not button evidence.
- Global site chrome is outside application-control scope.
- Mixed or ambiguous semantics fail closed.
- Final submit, sign, certify, withdraw, and attestation remain non-automatable.

## 6. Application Flow Context engine

This is separate from the existing mouse/keyboard/phone interaction-modality contract.

Topology modes:

- `SINGLE_PAGE`
- `MULTI_STEP`
- `SPA_MULTI_STEP`
- `HYBRID`
- `ACCOUNT_GATE`
- `UNKNOWN`

Stage/section archetypes include application entry, auth/account, resume/profile, identity/contact, education, work experience, company questionnaire, position questionnaire, EEO/diversity, attachments, signature, review, final-submit boundary, and unknown/manual gate.

Page, section, and stage are distinct. One page can contain several virtual sections; one stage can span several physical pages.

V1 context signals:

- form boundaries and required controls
- headings, legends, and labels
- stepper/progress indicators
- control/action semantics
- URL/route change
- page/form fingerprint
- validation errors
- prior transition
- current account/application state
- field-family distribution
- final-review/signature indicators

A future visual adapter may supplement these signals, but V1 correctness must not require computer vision.

Persist session-local context sufficient to track origin, topology, current stage, page fingerprint, virtual sections, observed step/total when available, prior state, expected next states, transition budget, reason/confidence, and unresolved manual gates.

## 7. UX projection

The ambient companion should project context truth, for example:

- `Step 2 of 9 · Education & Certifications`
- `Filling 4 deterministic fields`
- `Next action: Save & Continue · safe intermediate`
- `Waiting on you · attachment required`
- `Final review reached · Submit is manual`

Reaching final review is never equivalent to submission.

## 8. Dependency graph

`{ EH-COMP0 || EH-ACT0 || EH-CTX0 } -> { EH-COMP1 || EH-ACT1 || EH-CTX1 || EH-VAL1 } -> EH-CONV -> EH-LIVE`

Graph width is 3 at the contract floor and up to 4 in the implementation/validation wave when file ownership remains non-overlapping.

### EH-COMP0 — Compensation provenance & resolution contract

Owns compensation provenance in career-state, compensation question families/aliases, preference precedence, and focused synthetic validation.

Acceptance:
- min/max/currency/period/provenance are typed;
- default strategy is verified posted maximum;
- explicit opportunity override wins;
- current/history/minimum compensation cannot inherit desired-compensation values;
- stale or unit-ambiguous source fails closed.

### EH-ACT0 — Navigation action semantic contract

Owns a new action-semantics contract, alias/context fixtures, and focused tests.

Acceptance:
- action kinds above are machine-defined;
- `type=submit` is non-authoritative;
- irreversible actions remain manual-only;
- unknown/mixed actions fail closed.

### EH-CTX0 — Application Flow Context contract

Owns a new flow-context contract and synthetic one-page, multi-step, SPA, account-gated, and unknown fixtures.

Acceptance:
- page, section, stage, and topology are distinct;
- step count is optional;
- context is transition-aware;
- interaction modality remains a separate owner.

### EH-COMP1 — Compensation resolver & field matcher

Depends on EH-COMP0.

Owns a compensation resolver under Application Assist plus the smallest Fill Plan/preference integration.

Acceptance:
- verified posted maximum auto-populates a semantically compatible desired-compensation field;
- aliases resolve to the correct family;
- explicit override wins;
- stale/ambiguous inputs stop for review.

### EH-ACT1 — Context-aware action classifier & progression gate

Depends on EH-ACT0 and refreshed resolution of PR #29.

Owns progression/navigation action classification.

Acceptance:
- Save and Continue may auto-advance only after all gates pass;
- Save Draft, Save/Exit, Quit/Exit, Back, Submit, Sign/Certify remain distinct;
- submit-typed Next can still be intermediate when context proves it;
- initial Apply cannot be confused with final Submit/Apply;
- live action identity is rechecked before dispatch.

### EH-CTX1 — Flow-context runtime engine

Depends on EH-CTX0 and refreshed resolution of PR #29.

Owns a new flow-context module and the smallest content/session integration.

Acceptance:
- one-page and multi-step flows both map coherently;
- steppers can provide step/total when present;
- single-page applications use virtual sections without fake navigation;
- SPA transitions update context without duplicate progression;
- uncertainty blocks risky navigation.

### EH-VAL1 — Cross-context regression floor

Depends on all three contract lanes.

Required fixtures include:

1. desired salary + verified annual range -> posted max;
2. desired salary + hourly-only range -> compatible hourly max;
3. current salary -> never posted max;
4. minimum acceptable salary -> never inherit desired-max policy;
5. stale compensation source -> review;
6. Save and Continue -> safe intermediate candidate;
7. Save Draft -> not progression;
8. Save and Exit / Save and Quit -> manual exit;
9. Quit / Exit -> manual no-save exit;
10. `type=submit` Next -> intermediate when context proves it;
11. final Submit Application -> hard block;
12. initial Apply CTA -> entry action, not submission;
13. one-page virtual-section application;
14. nine-step-style flow with signature and final review;
15. SPA transition;
16. multiple/ambiguous candidates -> review.

### EH-CONV — Contextual autofill convergence

Depends on EH-COMP1, EH-ACT1, EH-CTX1, EH-VAL1.

Owns shared session/content/popup convergence, presence projection, combined Fill/Progression evidence, and collision reconciliation.

Acceptance:
- eligible desired compensation requires no configuration;
- context and action classification agree before auto-advance;
- manual gates stop with exact reason and resume cleanly;
- final review exposes a manual Submit boundary.

### EH-LIVE — Controlled live acceptance

Depends on EH-CONV.

Acceptance:
- observe one multi-step application with compensation and final-submit boundary;
- observe one materially different one-page or SPA application;
- final submit stays operator-only;
- acceptance receipt is sanitized;
- exact validated candidate is handed to repository promotion.

Proof ceiling: observed flows only; never universal ATS compatibility.

## 9. Agent-harness factoring

No new skill is justified yet. Domain behavior belongs in contracts/application code.

Planned reusable capabilities:

- `resolve_opportunity_compensation`
- `classify_application_action`
- `derive_application_flow_context`
- existing `record_application_transition`

Planned triggers:

- live verified opportunity with compensation -> normalize provenance
- desired-compensation field detected -> resolve opportunity value
- navigation control detected -> classify before Progression Plan
- page/DOM transition -> refresh flow context
- final-submit boundary -> AWAITING_OPERATOR, never auto-click

## 10. Validation order

1. focused compensation/action/context contract validators
2. focused implementation unit tests
3. existing application harness/session validators
4. Application Assist runtime tests
5. adversarial cross-context fixtures
6. modality/presence tests
7. career-state/application-companion tests where touched
8. `git diff --check`
9. unpacked-extension observed pass
10. controlled live multi-step + one-page/SPA acceptance
11. release/promotion validators after exact-candidate refresh

## 11. Regression invariants

Regressions include:

- eligible verified posted maximum still requires manual entry;
- salary-like aliases collapse desired, current, historical, or minimum compensation;
- pay-period conversion occurs without explicit contract inputs;
- navigation safety depends only on label text or HTML type;
- Save Draft, Save/Exit, Quit/Exit, Save/Continue, and Submit are treated as equivalent;
- initial Apply and final Submit/Apply are conflated;
- page count is assumed rather than observed;
- single-page sections are treated as fake page transitions;
- flow context duplicates input-modality state;
- any final Submit/Apply/Sign/Certify/attestation/withdraw action is auto-activated;
- final review is promoted to SUBMITTED without qualifying evidence.

## 12. Contract horizon

| Contract | Owner | Status | Next transition |
| --- | --- | --- | --- |
| Parent autopilot | `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md` | active / separately owned | reconcile pointer after #29/#27 settle |
| Compensation semantics | EH-COMP0 | PLANNED | contract + provenance + taxonomy |
| Action semantics | EH-ACT0 | PLANNED | ontology + negative fixtures |
| Flow context | EH-CTX0 | PLANNED | topology/stage/section contract |
| Compensation runtime | EH-COMP1 | REQUIRED SUCCESSOR WORK | resolver + Fill Plan |
| Action runtime | EH-ACT1 | REQUIRED SUCCESSOR WORK | classifier + Progression Gate |
| Context runtime | EH-CTX1 | REQUIRED SUCCESSOR WORK | flow-context runtime |
| Validation | EH-VAL1 | REQUIRED SUCCESSOR WORK | adversarial floor |
| Convergence | EH-CONV | REQUIRED SUCCESSOR WORK | combined assist loop |
| Live acceptance | EH-LIVE | REQUIRED SUCCESSOR WORK | observed distinct ATS flows |
| Final submission | operator | MANUAL-ONLY | never automated |

## 13. Launch order

This planning pass does not dispatch runtime implementation.

After implementation authorization and refreshed collision inspection:

1. Parallel Wave 0: EH-COMP0, EH-ACT0, EH-CTX0.
2. Parallel Wave 1: EH-COMP1, EH-ACT1, EH-CTX1, EH-VAL1. ACT1/CTX1 wait if PR #29 ownership is unresolved.
3. EH-CONV.
4. EH-LIVE.

## 14. First executable continuation

Owner: implementation coordinator.
Dependency: explicit implementation authorization and refreshed provider floor.
First action: refresh integration plus PR #29/#27 ownership, then dispatch EH-COMP0/EH-ACT0/EH-CTX0 in isolated lanes.
Expected proof: three versioned contracts with focused positive/negative fixtures and no private data.
Completion gate: focused validators green and exact validated contract heads integrated without overwriting separately owned work.
