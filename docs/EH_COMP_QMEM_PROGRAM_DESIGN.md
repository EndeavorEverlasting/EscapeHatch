# EscapeHatch — Compensation + Answer Memory Program Design

**Disposition:** DESIGNED / prototyped seams — not full COMP0/QMEM0 product implementation  
**Floor:** `integration/replit-donor-b01f628-20260921@82ba80a1304756bce81bfda39abf7f68b0b4674c` (contains PR #44 application-proof protocol)  
**Canonical product plan owner:** `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md`  
**Design branch:** `design/eh-comp-qmem-seams-20260927`  
**Private evidence boundary:** Drive tracker/proof/receipts stay private; Git receives sanitized structure only (PR #44 protocol).

## 0. Mission boundary

This design pass proves executable call-stack seams for:

1. **EH-COMP0 → EH-COMP1** — verified posted-maximum compensation resolution with unit-aware fail-closed behavior;
2. **EH-QMEM0** — Answer Memory scope classification from sanitized observations.

It does **not**:

- implement production career-state schema mutations;
- ship `browser/application-assist/compensation.js`;
- start EH-QMEM1 (blocked on EH-QMEM0 + PR #29 reconciliation);
- invent a website/portfolio profile authority;
- copy private Drive proof, answers, demographics, credentials, or signatures into Git;
- promote integration → `main` (`main` remains `0824535b…`).

## 1. User outcomes and invariants

| Outcome | Invariant |
|---|---|
| Desired/expected/target pay autofills from verified posting max | Only when fresh, unit-explicit, destination family = desired, no stronger override |
| Annual vs hourly forms both work | Periods must match; no silent conversion |
| Current / history / minimum pay never inherit posted max | Family gate fails closed |
| Explicit opportunity override wins | Precedence: session > opportunity_override > verified_posted_maximum > profile |
| Learn from applications without overfitting | Aliases = same semantic question; bare ambiguous labels stay unresolved |
| Answer Memory reduces accidental re-typing | Persist only under correct scope; EEO/attestation never inferred |
| Private proof stays private | Sanitize before any repo/learning surface |

## 2. Domain vocabulary

| Term | Owns / decides |
|---|---|
| **OpportunityCompensationProvenance** | Typed min/max/currency/period/source/verified_at/freshness for one opportunity |
| **CompensationFamily** | `desired` \| `current` \| `history` \| `minimum_acceptable` \| `unknown` |
| **PayPeriod** | `annual` \| `hourly` \| `monthly` \| `weekly` \| `unknown` |
| **verified_posted_maximum** | Preference/resolution source between override and profile |
| **SanitizedFieldObservation** | Label, control type, option labels, ids — never filled values |
| **AnswerMemoryScope** | Where an answer may live and whether autofill may reuse it |
| **Fill Plan** | Existing Application Assist ordered write plan (`assist-core.js`) |
| **Application proof protocol** | Tracker → proof/receipt → sanitize → taxonomy → automation-state → aliases |

## 3. Alternatives compared

### Compensation ownership

| Candidate | Verdict |
|---|---|
| **A. Typed nested object on career-state opportunity** (+ taxonomy families + preference precedence) | **SELECTED** — matches plan COMP0 ownership; one portable graph |
| B. Separate `application-compensation.v1.json` only, career-state keeps free-text | Rejected as split-brain with career-state opportunity truth |
| C. Preferencestore-only synthetic override for posted max | Rejected — conflates posting provenance with user preference |
| D. Parse `compensation_text` at fill time | Rejected — unit-ambiguous, fail-open |

### Answer Memory ownership

| Candidate | Verdict |
|---|---|
| **A. New `contracts/application-answer-memory.v1.json` after taxonomy/preference expansion** | **SELECTED** for QMEM0 |
| B. Expand taxonomy + preference only (no new contract) | Insufficient for capability-tenure / legal-current scopes |
| C. Reuse cockpit `AssistAnswer` store as QMEM authority | Rejected — coarser second schema |

## 4. Module / interface map

| Module | Responsibility | Public interface | Hidden complexity | Callers | Side effects | Failure contract |
|---|---|---|---|---|---|---|
| `OpportunityCompensation` (career-state; COMP0 build) | Durable typed posting provenance | schema fields on opportunity | freshness, source binding | COMP1, import later | none at resolve time | reject invalid/stale at validate |
| Taxonomy compensation families (COMP0 build) | Question ids + aliases + automation policy | `application-form-taxonomy.v1.json` | alias biparity / competing-alias rules (PR #44) | assist-core, QMEM0 | none | unknown → leave blank |
| Preference cache precedence (COMP0 build) | Insert `verified_posted_maximum` | `application-preference-cache.v1.json` | scope nesting vs flat entries | assist-core, COMP1 | browser-local only | no_match leave blank |
| **`resolveCompensationFill` (prototype → COMP1)** | Decide fill/review/blank | pure function | period + freshness gates | Fill Plan builder | none | `review` / `leave_blank` reasons |
| `compensation.js` (COMP1 build) | Wire resolver into assist Fill Plan | `resolveCompensationForField(...)` | DOM field → family/period | content/assist-core | DOM writes via existing applyFillPlan | stop for review |
| **`classifyAnswerMemoryScope` (prototype → QMEM0)** | Scope eligibility | pure function | category/label heuristics floor | QMEM0 validator/fixtures | none | `reject` / manual scopes |
| Answer Memory contract (QMEM0 build) | Durable scoped memory schema | new contract + fixtures | sensitivity matrix | QMEM1 | none in QMEM0 | never store private fixtures |
| QMEM1 runtime | Capture/reuse/visual fallback | resolve/capture APIs | option mapping, ephemeral OCR | popup/content | preference/memory writes | PR #29 dependency |

**Dependency direction (acyclic):**

```text
career-state provenance (COMP0)
        ↓
taxonomy + preference-cache (COMP0) ──→ QMEM0 answer-memory contract
        ↓                                         ↓
COMP1 compensation.js → assist-core Fill Plan    QMEM1 (after PR #29)
        ↓
DOM / session (existing)
```

Serialize COMP0 taxonomy/preference writes vs QMEM0 (shared owners). PR #45 is docs-only (installer/popup plan) — low COMP0 collision; later COMP1/QMEM1 must not collide with popup polish writers.

## 5. Success and failure call stacks

### COMP — success (terminal user value: desired-pay field populated or explicitly deferred)

```text
PAGE FIELD (desired salary)
  -> classifyField / taxonomy match
  -> classifyCompensationFamily (= desired)
  -> resolveCompensationFill
       session_confirmation?
       opportunity_override?
       verified_posted_maximum? (fresh + period match + max present)
       profile_preference?
  -> buildFillPlan / policyGate
  -> applyFillPlan
  -> status: Filled N  (TERMINAL for this field)
```

### COMP — failure (stale / unit mismatch / wrong family)

```text
PAGE FIELD
  -> resolveCompensationFill
       -> { status: review | leave_blank, reason }
  -> Fill Plan omits write OR surfaces review
  -> never invent conversion or current-salary fill
```

### QMEM0 — success (terminal: eligible scoped memory candidate, no private value)

```text
PRIVATE RECEIPT (Drive)
  -> sanitizeObservation (drop values)
  -> classifyAnswerMemoryScope
  -> fixture / taxonomy alias proposal (structure only)
```

### QMEM0 — failure

```text
EEO / signature observation
  -> classifyAnswerMemoryScope
  -> reject (forbidden_infer | manual_each)
  -> no fixture promotion
```

## 6. Executable prototypes

| Artifact | Role |
|---|---|
| `artifacts/escape-hatch/src/lib/compensation-resolution.prototype.ts` | COMP0/1 resolution seam |
| `artifacts/escape-hatch/src/lib/compensation-resolution.prototype.test.ts` | VAL1 fixtures 1–5 subset (success + failure) |
| `artifacts/escape-hatch/src/lib/answer-memory-scope.prototype.ts` | QMEM0 sanitize + scope seam |
| `artifacts/escape-hatch/src/lib/answer-memory-scope.prototype.test.ts` | success + protected-class/attestation failures |

## 7. Second-pass critique (after prototypes)

| Finding | Change |
|---|---|
| Preference-cache today omits `verified_posted_maximum` | COMP0 build must extend precedence; prototype already uses the four-level order |
| `compensation_text` free-text cannot prove period | COMP0 must add typed fields; keep text as display/legacy projection only |
| Family classification from question_id heuristics is temporary | COMP0 taxonomy must mint explicit ids (`desired_hourly_rate`, `current_salary`, …) so COMP1 does not regex production labels |
| QMEM0 label heuristics are a floor, not taxonomy | Promote only via taxonomy ids + sanitized fixtures; heuristics stay prototype-only |
| Website/portfolio gap | Explicitly deferred — do not invent under COMP/QMEM |

## 8. Unresolved decisions (build-owned)

1. Exact career-state JSON shape for nested vs flat typed compensation fields.
2. Freshness TTL default and per-source override policy.
3. Whether monthly/weekly periods ship in COMP0 or remain `unknown`→review until needed.
4. QMEM0 contract path name and whether capability-tenure shares preference storage or a sibling key.

## 9. Proof ceiling

Repository design + prototype unit proof. Not: live autofill on employer sites, mainline deployment, Drive access, or observed questionnaire acceptance.

## 10. Implementation seam for next build sprint (EH-COMP0)

**Owner:** local Cursor implementation sprint  
**Base:** refreshed `upstream/integration/replit-donor-b01f628-20260921` containing `82ba80a`  
**Forbidden:** private Drive content; PR #29/#45 owned surfaces; QMEM1 runtime; website field; silent pay conversion  

**First mutations:**

1. Extend `contracts/career-state.v1.schema.json` (+ fixtures/validator) with typed opportunity compensation provenance.
2. Expand `harness/contracts/application-form-taxonomy.v1.json` compensation families/aliases (desired annual/hourly, current, minimum, history; currency/period as needed).
3. Insert `verified_posted_maximum` into `harness/contracts/application-preference-cache.v1.json` precedence.
4. Port prototype tests into owned COMP0 validator/unit floor (retire `.prototype` suffix when production module lands — COMP1 owns `compensation.js`).
5. Keep prototype module as reference until COMP1 wiring lands, or fold pure resolver into a non-DOM shared module consumed by COMP1.

**Completion gate:** focused compensation validators green; `validate_career_state` + `validate_application_harness` green; exact head integrable without overwriting separately owned work.

**Then:** EH-COMP1 (`compensation.js` + Fill Plan); EH-QMEM0 contract; reconcile PR #29 before EH-QMEM1.
