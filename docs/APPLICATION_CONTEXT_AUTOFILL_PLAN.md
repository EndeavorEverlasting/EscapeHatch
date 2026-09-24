# EscapeHatch Contextual Autofill & Navigation Plan

**Parent plan:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`
**Scoped owner:** `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md`
**Plan date:** 2026-09-24
**Planning floor:** `integration/replit-donor-b01f628-20260921@f3d40c1238f76957ae71519be8e628b48ef83047`
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

## 15. Observation round 2 — standard questionnaire memory, native-autofill repair, tracker hydration, and durable account access

A second 2026-09-24 observed application pass supplies a fuller nine-stage reference flow. The evidence is Taleo-shaped but the product requirement is ATS-generic:

1. profile / personal information;
2. education and certifications;
3. repeated work experience;
4. company questionnaire;
5. position questionnaire;
6. diversity / EEO questionnaire;
7. attachments;
8. electronic signature;
9. review and submit.

The observed flow also exposed a common application entry pattern in which the ATS offers a native donor such as a résumé import or a third-party profile import. EscapeHatch must treat those imports as potentially useful **donor data, never canonical truth**. Native autofill may be incomplete, mis-bind repeated records, or lose formatting.

The hard submission boundary remains unchanged.

### 15.1 Native-autofill reconciliation invariant

After an ATS-native résumé/profile import completes, EscapeHatch should:

`start user-edit provenance capture before donor import -> wait for donor stability -> describe page -> group repeated records -> match each group to canonical user records -> diff donor vs canonical state -> repair only policy-owned fields that remain unedited -> record provenance`

Required behavior:

- do not align repeated work-history records by DOM index alone;
- bind a work-experience group using deterministic evidence such as employer, title, dates, and canonical record identity;
- responsibilities, dates, employer, title, and location from one record may never leak into another record;
- preserve multiline/bulleted responsibilities through a text-field presentation adapter;
- recognize that a donor-filled field can be wrong even when it is non-empty;
- keep source provenance per field: ATS donor, EscapeHatch canonical value, user edit, or unresolved;
- user-change provenance begins before/during native donor import, not only after reconciliation;
- any field edited by the user while donor import/reconciliation is pending is protected from overwrite; the reconciler must rebase around that edit or stop for review;
- once the user edits a field at any point in the current application session, that edit becomes authoritative unless the user explicitly requests another repair;
- unknown or low-confidence record matching stops for review rather than silently overwriting.

Permanent negative fixture: two employment records where native autofill places record B responsibilities into record A. The reconciler must detect the cross-record mismatch and repair or block it.

Permanent presentation fixture: correct responsibilities imported as one collapsed paragraph. The presentation adapter must preserve readable list structure without changing factual content.

### 15.2 Application Answer Memory

The existing application-question taxonomy and preference cache are the correct floor, but they are not yet broad enough to eliminate repeat questioning.

The reusable answer layer must distinguish:

- **stable profile facts** — name, education, languages, ordinary identity/contact;
- **stable explicit eligibility choices** — reusable until the user changes them;
- **derived per-employer facts** — e.g. prior-employer relationship;
- **opportunity-scoped answers** — e.g. compensation;
- **capability/tenure answers** — skill experience that must remain evidence-backed;
- **sensitive explicit preferences** — demographic/EEO answers supplied by the user, never inferred;
- **legal-current answers** — reusable only under their configured freshness/reconfirmation policy;
- **manual-each-submission answers** — signature, certification, attestation.

Standard families now required by observed application flows include:

- age-threshold eligibility such as age 18 or older;
- essential-functions capability with or without reasonable accommodation;
- prior employment with the employer or related entity;
- current/future sponsorship requirement;
- ability to provide work-authorization documentation;
- highest completed education;
- years/bucket of experience creating agents;
- years/bucket of experience using a named agent platform such as MS Copilot;
- years/bucket of SQL experience;
- scripting/programming languages;
- source/referral tracking such as job board or website;
- race/ethnicity;
- gender;
- veteran status;
- disabled-veteran status;
- recently-separated-veteran status;
- active-duty wartime/campaign-badge veteran status;
- armed-forces service-medal veteran status.

The answer store needs provenance fields such as:

- canonical `question_id`;
- normalized observed question;
- selected value;
- answer scope;
- sensitivity;
- source (`explicit_user_action`, `profile_import`, `evidence_derived`, or `opportunity_override`);
- `confirmed_at`;
- freshness policy;
- reusable/auto-fill policy;
- observed option signature where option mapping matters.

### 15.3 Learn once, reuse later

When the EscapeHatch session is active and the user manually answers a question that is not yet confidently mapped:

1. observe the user-originated change as a **candidate answer**, not durable consent;
2. extract deterministic DOM/accessibility context;
3. canonicalize the question if possible;
4. resolve whether the answer is profile-, employer-, opportunity-, capability-, sensitive-, legal-, or session-scoped;
5. stage the candidate locally for the current session;
6. obtain an explicit **Save/reuse this answer** action (or a previously explicit user-configured reuse policy) before mutating durable answer memory;
7. acknowledge through the ambient companion whether the answer is merely observed for this session or durably saved for reuse;
8. use a durably saved answer on future semantically equivalent questions according to its scope/freshness policy.

This is not permission to infer protected characteristics. A name, résumé, location, photograph, or other proxy may **never** be used to infer race/ethnicity, gender, veteran status, disability, or another protected/sensitive answer. Only an explicit user selection may seed those reusable values.

### 15.4 Hidden/opaque question fallback

DOM/accessibility evidence remains primary. Matching should inspect, when present:

- label;
- aria-label / aria-labelledby;
- name/id;
- placeholder;
- fieldset/legend;
- table/row/column headers;
- nearby question text;
- option-group text;
- current stage/section context.

If those signals still cannot expose the semantic question, EscapeHatch may offer a **user-authorized visual mapping fallback**:

- request one screenshot/capture of the relevant page or field region;
- keep the image local and ephemeral;
- extract only enough text/context to propose a question mapping;
- require the user to confirm the mapping before it becomes reusable;
- discard the image after mapping unless the user explicitly saves it;
- never place the screenshot, sensitive values, or raw page capture in Git, telemetry, logs, ordinary exports, or regression fixtures.

A future vision adapter is therefore a fallback capability, not the primary application engine.

### 15.5 Capability tenure

“Years of experience” questions must not become a generic résumé-keyword counter.

Use a capability-tenure resolver with:

- canonical capability id;
- explicit user-confirmed tenure when available;
- dated evidence windows from verified work/projects;
- vendor/product aliases;
- answer bucket mapping for site options;
- confidence and provenance;
- user override.

A computed tenure may never exceed what the accepted evidence interval supports. If evidence is insufficient to choose a bucket, stop for user input and then remember the explicit answer under the configured scope.

### 15.6 Taleo adapter boundary

Repeated Taleo layouts justify an ATS adapter as an optimization layer, not a second domain model.

A `TaleoAdapter` may own:

- stepper/progress extraction;
- repeated-work-history container detection;
- Taleo label/control descriptor normalization;
- questionnaire option-group extraction;
- Save and Continue / Save as Draft / Quit control discovery;
- attachments table interpretation;
- review-section extraction;
- page-transition observation.

It may **not** own:

- user answers;
- compensation policy;
- submission state;
- final-submit authority;
- demographic inference;
- canonical question semantics.

Generic DOM/accessibility fallback must continue to work when the adapter does not recognize a page.

## 16. Tracker-to-application knowledge hydration

The uploaded application tracker demonstrates that an existing user ledger can already contain most of the opportunity context needed by Application Assist: status/priority, company, role, work mode/location, employment type, compensation, fit/gaps, application dates, next action, apply link, résumé references, notes/source evidence, and study guidance.

PR #35 / `docs/CAREER_STORE_IMPORT_PLAN.md` already owns **JSON/CSV/XLSX/document import into canonical `escapehatch-career-state/v1`**. Do not build a second tracker parser here.

After that importer exists, this plan owns only the downstream hydration seam:

`canonical career state -> selected opportunity -> application run context`

Application-run hydration should expose at least:

- company / organization;
- role title;
- verified compensation and active override;
- application channel;
- verified apply link;
- posting/source identity and freshness;
- current application execution state;
- role-specific résumé artifact;
- optional cover-letter artifact;
- known account identity / secret reference;
- question-answer memory;
- source/referral metadata when known.

Dashboard and list/helper sheets are projections, not canonical imported records.

### 16.1 Compensation control

When a verified opportunity has a range:

- present a range control bounded to the posted minimum and maximum;
- default the value to the verified maximum;
- show unit and currency;
- moving the control creates an explicit opportunity override;
- provide a deterministic “Use posting max” reset;
- do not synthesize a slider for a fixed value, missing range, or incompatible units.

The value emitted to an application field still passes the compensation semantic resolver from this plan.

### 16.2 Launch application

A reusable `launch_application` capability should:

1. resolve the selected canonical opportunity;
2. verify or consume current freshness evidence;
3. resolve the correct application channel;
4. open the canonical apply link for web-form routes;
5. hydrate Application Assist with opportunity/profile/answer/artifact/account context;
6. enter account bootstrap when needed;
7. never mark an application submitted merely because the application page opened.

This capability belongs above provider/browser adapters and below queue orchestration.

## 17. Durable account credentials

The existing account-bootstrap floor intentionally stores generated secrets only for the browser session. The observed workflow adds a stronger user requirement: a user who creates an application account must be able to recover the account identity later.

New invariant:

> Application state may durably retain non-secret account metadata and a secret reference, but a reusable password must live only behind a dedicated secure secret-store adapter. A session-only secret is not permitted to masquerade as durable recoverability.

Durable account metadata may include:

- ATS/application origin;
- username or account email;
- account-created timestamp;
- last-used timestamp;
- recovery/login URL;
- account state;
- secret reference.

Password/secret bytes must never appear in:

- career-state JSON;
- job tracker export;
- ordinary profile export;
- Git;
- logs;
- screenshots;
- telemetry;
- application receipts.

The credential architecture must expose a `SecretStore` interface. Candidate adapters require an evidence-backed implementation decision, such as a platform credential vault/native host or an encrypted local vault with a user-controlled unlock boundary. Existing session storage remains the safe fallback until a durable adapter passes its security contract.

The UX must provide an account-credentials surface that can display username/account origin and, when the secret store authorizes it, explicitly reveal/copy the password. If durable secure storage is unavailable, the product must say so and require the user to copy/save the temporary password before the session ends.

## 18. Attachments and final review

### 18.1 Opportunity attachment package

Extend the existing résumé-artifact-sync owner with an application-facing package concept rather than creating a second résumé authority.

An opportunity attachment package can reference:

- selected résumé PDF;
- optional cover letter;
- optional other approved supporting artifacts;
- filename;
- MIME/type;
- size;
- artifact revision/hash;
- purpose (`resume`, `cover_letter`, etc.);
- opportunity binding.

The attachments runtime may attempt deterministic upload only when:

- the exact artifact bytes are locally/authorizedly accessible;
- the site permits the interaction;
- size/type constraints pass;
- artifact identity matches the selected opportunity;
- the action is not blocked by browser security or an unresolved mismatch.

Otherwise EscapeHatch prepares the exact artifact and stops with a precise user handoff. It must never claim attachment success without observing the resulting ATS attachment state.

### 18.2 Final-review auditor

Before the manual final Submit action, EscapeHatch should perform a read-only audit of the review page.

Compare visible review values to the expected application projection for:

- identity/contact;
- source tracking;
- compensation;
- education;
- work history;
- reusable questionnaire answers;
- sensitive answers that the user explicitly chose to reuse;
- attachments;
- account/application metadata where shown.

Output:

- matched;
- mismatch;
- missing;
- intentionally manual;
- unable to verify.

The auditor should deep-link or point to the relevant Edit section when the ATS exposes such navigation.

Electronic signature, certification, and final Submit remain operator actions. The auditor may verify that a user-completed signature state is present after the fact, but it may not create or accept the signature.

## 19. Round-2 dependency graph and bounded sprints

Round 1 remains:

`{ EH-COMP0 || EH-ACT0 || EH-CTX0 } -> { EH-COMP1 || EH-ACT1 || EH-CTX1 || EH-VAL1 } -> EH-CONV -> EH-LIVE`

Round 2 extends it:

`{ EH-REC0 || EH-CRED0 || EH-ART0 || EH-REV0 || EH-COMP0 } -> EH-QMEM0`

After required contract floors and refreshed recovery/import owners:

`{ EH-WORK1 || EH-QMEM1 || EH-CRED1 || EH-ART1 || EH-REV1 || EH-TAL1 }`

PR #35 implementation plus the relevant domain floors unlock:

`EH-KNOW1`

Then:

`{ EH-CONV + EH-WORK1 + EH-QMEM1 + EH-CRED1 + EH-ART1 + EH-REV1 + EH-TAL1 + EH-KNOW1 } -> EH-CONV2 -> EH-LIVE2`

### EH-REC0 — Native Autofill Reconciliation Contract

**Type:** application contract + validation

**Goal:** define donor-autofill provenance, repeated-record matching, repair authority, user-edit preservation, and multiline presentation.

**Owned scope**
- new `contracts/application-native-autofill-reconciliation.v1.json`;
- synthetic two-record mismatch fixtures;
- formatting fixture;
- focused validator/tests.

**Forbidden scope**
- production DOM mutation;
- résumé parser changes owned by PR #27;
- user-specific work-history fixtures.

### EH-QMEM0 — Application Answer Memory Contract

**Type:** harness spine + application contract

**Dependencies:** EH-COMP0 because compensation and question-memory work share taxonomy/preference owners.

**Goal:** make standard questionnaire answers reusable under typed scope/sensitivity/freshness rules.

**Owned scope**
- `harness/contracts/application-form-taxonomy.v1.json`;
- `harness/contracts/application-preference-cache.v1.json`;
- optional new `contracts/application-answer-memory.v1.json`;
- synthetic question/option fixtures;
- validator/tests.

**Forbidden scope**
- real user answers;
- inference of protected characteristics;
- production fill/capture runtime.

### EH-CRED0 — Durable Credential Contract & Adapter Decision

**Type:** security contract + research/design

**Goal:** define durable account metadata, secret references, SecretStore interface, and acceptable secure persistence adapters.

**Owned scope**
- new `contracts/application-credential-vault.v1.json`;
- synthetic secret-reference fixtures;
- security validator/tests;
- short adapter decision record.

**Forbidden scope**
- raw passwords in Git/tests/logs;
- plaintext durable browser storage;
- weakening existing session-secret rules before the durable adapter proves stronger guarantees.

### EH-ART0 — Opportunity Attachment Package Contract

**Type:** integration contract

**Goal:** bind the correct role-specific résumé/cover-letter artifacts to an application run.

**Owned scope**
- extension or companion contract that references the existing application-resume-artifact-sync owner;
- synthetic package fixtures;
- size/type/identity guards.

**Forbidden scope**
- duplicate résumé authority;
- private document bytes in Git.

### EH-REV0 — Final Review Audit Contract

**Type:** safety/validation contract

**Goal:** define read-only expected-vs-observed review semantics before manual submission.

**Owned scope**
- new review-audit contract;
- synthetic match/mismatch/missing/manual fixtures;
- validator/tests.

**Forbidden scope**
- submit/sign/certify automation.

### EH-WORK1 — Native Autofill Repair + Work Record Binding

**Type:** conventional application logic

**Dependencies:** EH-REC0; PR #27 merged/superseded/reconciled; refreshed Application Assist floor.

**Goal:** repair native résumé/profile import mistakes without cross-record contamination.

**Owned scope**
- donor reconciliation module;
- repeated-record matcher;
- work-responsibility presentation adapter;
- smallest Fill Plan integration;
- focused tests.

### EH-QMEM1 — Question Capture, Reuse, and Visual Fallback Runtime

**Type:** conventional application logic + integration seam

**Dependencies:** EH-QMEM0; PR #29 merged/superseded/reconciled.

**Goal:** fill known standard questions and learn explicit user answers for future reuse.

**Owned scope**
- question descriptor/canonicalization runtime;
- answer-memory resolver;
- user-change observer;
- option mapping;
- ephemeral screenshot/visual mapping fallback;
- ambient presence projections such as learning/saved/waiting-for-mapping;
- focused tests.

**Safety**
- protected/sensitive answers are explicit only;
- screenshots are local/ephemeral and never logged/exported by default;
- attestation/signature remains manual.

### EH-CRED1 — Credential Store + Account Access UX

**Type:** security implementation + UI

**Dependencies:** EH-CRED0; account-bootstrap floor; PR #29 reconciliation.

**Goal:** make generated account credentials recoverable without leaking secrets into career state.

**Owned scope**
- chosen SecretStore adapter;
- account metadata/secret-reference service;
- credentials UI with copy/reveal gating;
- migration from session-only secret when available;
- focused security tests.

### EH-ART1 — Attachment Resolver and ATS Attachment Observation

**Type:** integration seam

**Dependencies:** EH-ART0; role-specific artifact-sync floor.

**Goal:** select the correct application artifacts and automate or precisely hand off attachment work.

**Owned scope**
- attachment package resolver;
- ATS attachment state observer;
- deterministic upload adapter only where technically supported;
- manual handoff when browser/site constraints block automation.

### EH-REV1 — Final Review Auditor Runtime

**Type:** validation + UI

**Dependencies:** EH-REV0; EH-QMEM0; EH-REC0; compensation/context floors.

**Goal:** catch wrong values before the human submits.

**Owned scope**
- review-page extractor;
- expected-vs-observed comparator;
- mismatch UI;
- Edit-section routing hints;
- no-write audit mode.

### EH-TAL1 — Taleo Adapter

**Type:** ATS adapter

**Dependencies:** EH-CTX0, EH-ACT0, EH-REC0, EH-QMEM0.

**Goal:** use repeatable Taleo structure to improve descriptor quality without moving domain ownership into vendor code.

**Owned scope**
- new Taleo descriptor adapter;
- sanitized nine-stage fixtures;
- stepper/work-history/questionnaire/attachment/review extraction tests.

### EH-KNOW1 — Career-State to Application-Run Hydration

**Type:** integration seam

**Dependencies:** implemented PR #35 career-store/import floor; EH-COMP0; EH-ART0.

**Goal:** turn imported/manual canonical opportunity state into one launchable Application Assist context.

**Owned scope**
- selected-opportunity hydration service;
- `launch_application` capability;
- apply-link/channel/freshness integration;
- compensation control projection;
- artifact/account/question context references.

**Forbidden scope**
- a second spreadsheet/XLSX parser;
- dashboard/list sheet import as domain authority.

### EH-CONV2 — Learned-Application Convergence

**Type:** integration + UX

**Dependencies:** EH-CONV, EH-WORK1, EH-QMEM1, EH-CRED1, EH-ART1, EH-REV1, EH-TAL1, EH-KNOW1.

**Goal:** deliver the full observed workflow: launch -> native donor or EscapeHatch profile -> repair -> fill/learn -> safe advance -> attach -> manual signature -> review audit -> manual submit.

### EH-LIVE2 — Full-Flow Live Acceptance

**Type:** runtime proof

**Dependencies:** EH-CONV2.

**Acceptance**
- one Taleo-shaped multi-step application traversed with the indicator active;
- repeated work history proves no cross-record responsibility leakage;
- a previously answered standard questionnaire auto-fills on a later compatible form;
- a new explicit answer is learned and reused locally;
- protected/sensitive answer is reused only from explicit user choice;
- attachment identity is correct or a precise manual handoff is shown;
- credentials are recoverable according to the proven secret-store contract;
- review auditor catches a synthetic/controlled mismatch;
- electronic signature and final Submit remain manual;
- one materially different ATS topology confirms the generic fallback.

## 20. Round-2 capabilities and triggers

New reusable capabilities:

- `reconcile_native_autofill`
  - input: donor-filled page + canonical records + user-edit provenance;
  - output: repair Fill Plan or REVIEW_REQUIRED.
- `resolve_question_answer`
  - input: canonical question + answer memory + opportunity/employer context;
  - output: reusable answer or unresolved reason.
- `capture_explicit_answer`
  - input: user-originated field change + canonical question + policy;
  - output: local answer-memory mutation or non-persist disposition.
- `resolve_capability_tenure`
  - input: capability id + verified evidence + explicit override;
  - output: supported tenure/bucket.
- `request_visual_question_mapping`
  - input: unresolved field descriptor;
  - output: user-authorized ephemeral mapping proposal.
- `resolve_application_attachments`
  - input: opportunity + registered artifacts + ATS constraints;
  - output: attachment package or manual handoff.
- `audit_final_review`
  - input: expected application projection + observed review page;
  - output: mismatch receipt; never writes/submits.
- `load_application_account`
  - input: application origin/account metadata + authorized SecretStore;
  - output: account bootstrap context without exposing raw secret to logs/state.
- `launch_application`
  - input: selected canonical opportunity;
  - output: verified routed application session context.

New triggers:

- `native_autofill_stable` -> reconcile native autofill;
- `unknown_question_answered_by_user` -> stage candidate answer; persist only after explicit save/reuse consent;
- `known_question_detected` -> resolve question answer;
- `opaque_question_unresolved` -> offer visual mapping fallback;
- `repeated_work_record_detected` -> record matcher;
- `attachment_stage_detected` -> resolve application attachments;
- `signature_or_attestation_stage_detected` -> manual gate;
- `review_stage_detected` -> audit final review;
- `application_account_created` -> persist account metadata + secure secret reference when available;
- `selected_opportunity_launched` -> hydrate application context from canonical career state.

## 21. Additional regression invariants

The following are permanent regressions if they recur:

- native résumé/profile autofill is trusted without reconciliation;
- work responsibilities from one employment record populate another record;
- correct multiline responsibilities are flattened into unreadable text;
- a user has to repeatedly answer a previously **explicitly saved for reuse** stable question;
- a user-originated selection is durably reused without explicit save/reuse consent or a previously explicit reuse policy;
- a sensitive demographic answer is inferred from a name, résumé, image, or other proxy;
- an unknown field silently receives a guessed answer;
- an authorized visual mapping screenshot persists into logs, Git, telemetry, or ordinary exports;
- skill-tenure answers exceed supported evidence without an explicit user override;
- a Taleo optimization owns generic question or submission semantics;
- tracker/XLSX parsing is reimplemented outside the career-store/import owner;
- a dashboard/helper sheet becomes canonical career state;
- a generated password is called durable while it is only in session memory;
- a raw password enters career-state JSON or the job tracker;
- the wrong résumé/cover letter is attached to an opportunity;
- attachment success is claimed without observed ATS state;
- final review proceeds without surfacing a known deterministic mismatch;
- signature/certification/final Submit is auto-performed.

## 22. Revised launch order

This remains a planning-only pass.

After explicit implementation authorization and refreshed collision inspection:

1. Parallel contract floor: **EH-COMP0, EH-ACT0, EH-CTX0, EH-REC0, EH-CRED0, EH-ART0, EH-REV0**.
2. **EH-QMEM0** after EH-COMP0 because both own taxonomy/preference surfaces.
3. After contract floors and recovery-owner reconciliation, parallel implementation: **EH-COMP1, EH-ACT1, EH-CTX1, EH-VAL1, EH-WORK1, EH-QMEM1, EH-CRED1, EH-ART1, EH-REV1, EH-TAL1** subject to file-collision inspection.
4. **EH-KNOW1** after the career-store/import implementation from PR #35 exists.
5. **EH-CONV** may close the original context/compensation/action loop as soon as its original dependencies are green; it must not wait merely for round-2 work.
6. **EH-CONV2** after round-2 runtime lanes plus EH-CONV.
7. **EH-LIVE2** for observed end-to-end acceptance and promotion handoff.

The original EH-LIVE remains useful for narrower compensation/context/action acceptance and does not replace EH-LIVE2.

## 23. Mainline user-state bootstrap invariant

The requested product end state is the repository default branch, not a planning branch, integration branch, feature branch, worktree, or open pull request.

EscapeHatch is not complete for this behavior until the refreshed default branch contains and validates a deterministic startup pipeline equivalent to:

\`authorized local inputs -> canonical profile/career-state resolution -> selected opportunity context -> Application Assist hydration\`

### 23.1 Zero-friction user profile startup

Normal startup must not require JSON archaeology, a local agent, or retyping facts that EscapeHatch already owns.

Resolution precedence:

1. current explicit user edits in canonical local profile/state;
2. current reviewed canonical profile derived from prior résumé/document intake;
3. an authorized résumé already present in EscapeHatch-owned/user-selected local storage;
4. explicit provider/import source authorized by the user;
5. unresolved/manual entry only for facts that remain unknown or policy-gated.

When a résumé is available to EscapeHatch:

- parse it automatically without a separate “configure autofill” step;
- normalize representable contact, links, summary, skills, projects, experience, and education into the existing profile model;
- preserve explicit user edits over resume-derived values;
- do not silently promote ambiguous or medium-confidence proposals into reusable truth;
- keep sensitive demographic, legal, credential, and attestation values outside resume inference;
- deduplicate repeated imports of the same evidence;
- preserve record identity for repeated employers/schools and their supporting details;
- expose only genuine conflicts for review.

“Resume present” means the user has already supplied or authorized access to the file through an EscapeHatch-owned/user-selected surface. Browser security is not bypassed to crawl arbitrary local files.

PR #27 remains the current separately owned resume/profile implementation lane and must be repaired/reconciled rather than duplicated.

### 23.2 Job tracker as canonical-import input

When an authorized job tracker is present, normal startup should ingest it through the career-store import owner and make its opportunities immediately usable by the ordinary EscapeHatch queue.

The tracker is an input/projection format; it is not a second domain model.

Required path:

\`tracker/XLSX/CSV/JSON/document -> validated import preview -> escapehatch-career-state/v1 -> local durable store -> queue/application context\`

After successful import, a user selecting an opportunity should not have to re-enter company, role, compensation, apply link, source metadata, resume reference, status, next action, or other already-mapped opportunity data.

PR #35 / \`docs/CAREER_STORE_IMPORT_PLAN.md\` owns tracker/document decoding and canonical import. This plan owns downstream startup/application hydration only.

### 23.4 Completed-application snapshot as a profile donor

A user-supplied completed/reviewed application snapshot is a richer donor than a résumé and should be usable to bootstrap the first local EscapeHatch profile.

Potential donor classes include a saved review page, user-exported application PDF/document, or another user-authorized application summary.

The intake path is:

\`completed application snapshot -> structural extraction -> canonical question/profile mapping -> proposal set -> user review/reuse consent -> local profile + answer memory\`

It may propose:

- identity/contact values;
- source/referral metadata;
- compensation preference for the opportunity;
- education;
- work-history records and responsibility text;
- standard company/position questionnaire answers;
- capability/tenure answer buckets;
- attachment identities;
- other non-secret application metadata.

Rules:

- current explicit user edits remain authoritative;
- repeated work/education records retain identity and must not cross-contaminate;
- opportunity-scoped facts remain opportunity-scoped unless the user explicitly promotes them;
- sensitive demographic, legal, accommodation, veteran, disability, or similar values may be recognized only from the user's explicit supplied record and require the Answer Memory reuse-consent policy before durable cross-application reuse;
- signature/certification text is evidence of a prior user action, never reusable signing authority;
- credentials/secrets are never extracted into ordinary profile state;
- the source snapshot remains user-owned/private and is not committed to repository fixtures.

This makes the first-user experience capable of combining \`resume + completed application snapshot + job tracker\` into one reviewed local state rather than treating each as a separate configuration exercise.

### 23.3 Mainline completion gate

A lane may be IMPLEMENTED or VALIDATED before default-branch integration, but this feature is not COMPLETE until:

- all required owner PRs are reconciled and their exact validated heads are integrated;
- provider promotion places the required behavior on refreshed \`main\`;
- \`git merge-base --is-ancestor <proven-integration-sha> origin/main\` or repository-owned equivalent proves containment;
- default-branch content still contains the governing contracts and implementation;
- required mainline validators remain green;
- observed browser proof stays within its actual ATS/surface coverage ceiling.

## 24. Application surface model

Employer platform brand and application transport are orthogonal.

Do not model “Taleo” as an application type. Taleo is one vendor adapter that can optimize a generic structured-form surface.

### 24.1 Surface classes

V1 surface classes:

| Surface class | Examples | Routing behavior |
| --- | --- | --- |
| \`ATS_STRUCTURED_FORM\` | Taleo/Workday/Greenhouse/iCIMS-like flows | vendor adapter when recognized, generic form engine otherwise |
| \`FORM_BUILDER\` | Typeform/Jotform/other stepwise form builders | form-builder adapter when recognized, generic form engine otherwise |
| \`GENERIC_WEB_FORM\` | employer-owned/custom forms | generic DOM/accessibility engine |
| \`DOCUMENT_INSTRUCTIONS\` | PDF/document/page containing application instructions | extract routing instructions; never treat document itself as submission proof |
| \`EMAIL_APPLICATION\` | instructions require emailing materials | compose deterministic package, stop at send boundary unless a separately authorized channel policy allows sending |
| \`EXTERNAL_PROVIDER\` | provider-owned application/identity workflow | route through authorized provider adapter |
| \`MANUAL_ONLY\` | unsupported/ambiguous interaction | precise operator handoff |

A \`DOCUMENT_INSTRUCTIONS\` surface may deterministically route to \`EMAIL_APPLICATION\`, \`EXTERNAL_PROVIDER\`, another URL, or \`MANUAL_ONLY\`.

### 24.2 Surface classification contract

A classifier should consume:

- URL/origin and redirect chain;
- DOM/accessibility structure;
- vendor fingerprints that are stable enough to recognize;
- visible page/form headings;
- stepper/progress structure;
- document MIME/type and extracted instructions;
- apply-link/source metadata from the selected opportunity;
- observed action semantics;
- attachment/signature/review markers.

Output:

- \`surface_class\`;
- optional \`vendor_adapter_id\`;
- confidence/reason evidence;
- permitted next adapter;
- unresolved/manual gates.

Unknown vendor is not failure if the generic surface engine can still operate safely.

## 25. Vendor/form adapter registry

Create one adapter registry behind generic interfaces rather than branching application logic throughout the product.

Minimum adapter interface:

- \`detect(surfaceEvidence) -> detection score + reasons\`;
- \`describePage(document) -> normalized controls/sections\`;
- \`describeProgress(document) -> stage/step model\`;
- \`describeRepeatedRecords(document) -> normalized record containers\`;
- \`describeActions(document) -> semantic action candidates\`;
- \`describeAttachments(document) -> attachment state\`;
- \`describeReview(document) -> review projection\`.

Vendor adapters may optimize descriptors only. They do not own:

- user profile values;
- answer memory;
- compensation policy;
- credential secrets;
- submission truth;
- final-submit authority;
- protected-class inference.

The first proven adapter can be Taleo because repeated Taleo structure has now been observed, but the registry contract must support additional vendors without changing core domain services.

## 26. Recurrence-first component doctrine

A repeated application component is evidence of a reusable abstraction opportunity.

This is a foundational product rule:

> The more frequently a semantically stable application component recurs across applications or vendors, the higher its priority for extraction into a reusable component, classifier, fixture family, or adapter primitive.

Frequency is prioritization evidence, not permission to collapse semantically distinct things.

Maintain a local structural observation corpus with fields such as:

- semantic component key;
- surface class;
- vendor adapter, if any;
- observed structural fingerprint;
- occurrence count;
- first/last observed time;
- confidence;
- cross-vendor recurrence count;
- current reusable owner;
- sanitized fixture promotion status.

High-value recurring examples include:

- identity/contact blocks;
- source/referral tracking;
- education records;
- repeated work-history groups;
- standard company questionnaires;
- skill/experience bucket questions;
- EEO/veteran blocks;
- Save/Continue/Draft/Quit controls;
- attachment tables;
- signature stages;
- final-review summaries.

Private answer values, credentials, resume text, or raw screenshots do not enter the repository corpus. Only sanitized structural evidence may become fixtures.

## 27. Document-to-email application mode

When a posting terminates in a PDF/document or page whose actionable instruction is “email these materials”:

1. bind the document to the selected opportunity;
2. extract recipient, subject guidance, required materials, requested metadata, deadline, and any body/instruction text;
3. classify the resulting route as \`EMAIL_APPLICATION\`;
4. resolve the role-specific resume/cover-letter/application package;
5. prepare recipient, subject, body, and attachments;
6. show an explicit send boundary because sending the email is the submission act;
7. after user/provider-authorized send, require sent/outbox/provider evidence before promoting to \`SUBMITTED\`;
8. if the email/provider adapter is unavailable, remain \`AWAITING_OPERATOR\` or \`BLOCKED\` with the exact prepared package and handoff.

A draft, local email file, or composed message is not submission proof.

## 28. New bounded sprints from this observation

### EH-BOOT0 — Mainline Zero-Config Bootstrap Contract

**Type:** application contract + integration seam

**Goal:** make profile/résumé/tracker hydration a default startup property rather than an optional configuration flow.

**Dependencies:** PR #27 profile/resume owner; PR #35 career-store/import owner.

**Owns**
- startup resolution/precedence contract;
- conflict semantics;
- duplicate-resume behavior;
- tracker-to-canonical-store hydration handoff;
- focused fixtures/tests.

**Does not own**
- resume parser internals from PR #27;
- tracker decoder/import internals from PR #35;
- provider credentials.

### EH-SURF0 — Application Surface Taxonomy & Router Contract

**Type:** application contract

**Goal:** distinguish ATS structured forms, form builders, generic forms, document instructions, email applications, external providers, and manual-only routes.

**Owns**
- surface enum/descriptor contract;
- routing invariants;
- document-to-email transition fixtures;
- unknown/fail-closed cases.

### EH-ADAPT0 — Vendor Adapter Registry + Recurrence Contract

**Type:** application architecture + validation

**Goal:** make vendor-specific reuse modular and frequency-driven without moving domain truth into vendor code.

**Owns**
- adapter interface/registry;
- recurrence observation schema;
- sanitized structural fixture rules;
- adapter detection collision rules.

### EH-TAL1 — Taleo Adapter (existing canonical owner, extended)

**Type:** application adapter

**Dependencies:** existing EH-CTX0, EH-ACT0, EH-REC0, EH-QMEM0 plus new EH-SURF0 and EH-ADAPT0.

**Goal:** keep one Taleo implementation owner and extend it to implement the first vendor optimization against the generic adapter interface.

**Ownership rule:** this section extends the existing EH-TAL1 lane defined earlier in this plan; it does not create a second Taleo writer.

### EH-FORM1 — Form-Builder Adapter Floor

**Type:** application adapter

**Dependencies:** EH-SURF0, EH-ADAPT0.

**Goal:** prove the registry against a materially different stepwise form-builder pattern (Typeform-like or equivalent observed fixture), without asserting universal compatibility.

### EH-DOC1 — Document/Email Application Router

**Type:** integration seam

**Dependencies:** EH-SURF0; existing batch/channel evidence semantics.

**Goal:** recognize document instructions, prepare email applications, and preserve the submission-proof boundary.

### EH-BOOT1 — Startup Hydration Runtime

**Type:** conventional application logic

**Dependencies:** EH-BOOT0; repaired/integrated PR #27; career-store convergence EH-D7; existing selected-opportunity hydration owner EH-KNOW1.

**Goal:** compose already-canonical profile/resume/career-store/opportunity hydration into startup, with no normal-path JSON/file shuttling. EH-BOOT1 must not duplicate EH-KNOW1's selected-opportunity hydration service.

### EH-SEED0 — Completed-Application Donor Contract

**Type:** application contract + privacy boundary

**Goal:** define how a user-supplied completed application/review snapshot can propose profile and Answer Memory state without importing secrets, signing authority, or silent sensitive reuse.

**Dependencies:** existing Answer Memory/QMEM contract.

### EH-SEED1 — Completed-Application Donor Runtime

**Type:** conventional application logic

**Dependencies:** EH-SEED0; repaired profile/resume owner; Answer Memory runtime.

**Goal:** ingest a user-authorized application snapshot, generate reviewed proposals, and merge accepted values into local canonical state with provenance.

### EH-MAIN0 — Default-Branch Product Convergence

**Type:** integration/promotion

**Dependencies:** required Application Assist, career-store, surface/router, adapter, answer-memory, attachment/review, and startup lanes.

**Goal:** converge exact validated product heads and promote through the canonical repository-promotion owner to refreshed \`main\`.

**Completion gate:** mainline containment plus owning validators; no feature is called complete merely because it exists on integration.
