# EscapeHatch — P04 EH-COMP0 + Application Proof Loop Sprint Map

**Disposition:** P04 FACTORED / DURABLE — product implementation remains P07 successor work
**Canonical program owner:** `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md`
**Execution projection:** this file is a bounded sprint map, not a second product-plan authority
**Provider floor refreshed:** `integration/replit-donor-b01f628-20260921@200389612008ee89eddc24206631cb4b0cce644c`
**Provider default branch:** `main@0824535b9dc1341def885a79a098d297df770ac8`
**Design/prototype floor:** PR #46 merged as `1fa7406e21e092f60495b7296df401f541f7c097`
**Latest adjacent runtime floor:** PR #47 merged as `200389612008ee89eddc24206631cb4b0cce644c`
**Proof-protocol floor:** PR #44 merged as `82ba80a1304756bce81bfda39abf7f68b0b4674c`

## 0. Launch order first

1. **COMPLETE / do not redo — PROOF-LOOP-0.** The private Drive proof ledger now contains the capture checklist and AuraOne receipt linkage. PR #44 already owns the repository-safe proof→sanitized-observation protocol.
2. **NEXT MUTATION — EH-COMP0.** Implement the production compensation contract floor from the PR #46 prototypes: career-state provenance + taxonomy semantics + compensation precedence + focused validators/fixtures.
3. **WAIT — EH-COMP1.** Only after EH-COMP0 integrates: wire the pure resolver into Application Assist / Fill Plan. This lane owns runtime behavior, not COMP0.
4. **WAIT / SERIALIZED — EH-QMEM0.** Start only after EH-COMP0 because both own application taxonomy/preference surfaces.
5. **WAIT — EH-QMEM1.** Requires EH-QMEM0 and explicit reconciliation of PR #29 ownership.
6. **CONVERGE.** Coordinator refreshes provider truth, validates exact heads, updates canonical program status, and integrates through the repository's existing promotion rules.

**Current COMP/QMEM subgraph unfinished mutation width:** 1. Parallel mutation is **NOT APPLICABLE inside this bounded COMP/QMEM projection** for the immediate next transition because EH-COMP0 is the single ready writer and QMEM0 shares taxonomy/preference owners. The broader canonical application plan still contains other independent contract lanes (including EH-ACT0, EH-CTX0, EH-REC0, EH-CRED0, EH-ART0, and EH-REV0); this projection neither cancels nor serializes those owners. Any repository-wide executor must retain them from `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md` and refresh their current blockers independently.

## 1. Compact P04 preflight

| Surface | Refreshed truth |
|---|---|
| Repository | `EndeavorEverlasting/EscapeHatch` |
| Default branch | `main` |
| Default HEAD | `0824535b9dc1341def885a79a098d297df770ac8` |
| Integration branch | `integration/replit-donor-b01f628-20260921` |
| Integration HEAD | `200389612008ee89eddc24206631cb4b0cce644c` |
| Local path | UNKNOWN in current connected-provider runtime |
| Local branch/status | UNKNOWN; must be refreshed by the P07 local executor before mutation |
| Worktrees | UNKNOWN in current connected-provider runtime |
| Open PR stack | #29, #30, #31 remain open recovery owners |
| Recent center of gravity | PR #44 proof protocol → PR #46 COMP/QMEM design prototypes → PR #47 default autofill/popup/Windows installer |
| Canonical COMP/QMEM design | `docs/EH_COMP_QMEM_PROGRAM_DESIGN.md` |
| Canonical product plan | `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md` |
| Dispatch runner/schema | still absent on refreshed integration floor |
| Root dispatch target | remains unavailable for validated canonical execution; use this run-scoped manifest |

### Collision check

PR #47 owns installer/popup/modality/settings surfaces and does **not** own the EH-COMP0 contract files below. PR #29/#30/#31 own Application Assist recovery/evidence surfaces; they do not authorize a second writer in those files. EH-COMP0 therefore stays strictly out of popup, progression, companion, batch, and recovery-stack files.

## 2. Runtime partition

| Runtime | Role in this P04 execution | Disposition |
|---|---|---|
| CURRENT_CHAT_RUNTIME | recover context, refresh provider truth, make architecture/factoring decisions, synchronize durable plan | EXECUTED HERE |
| CONNECTED_PROVIDER — GitHub | durable plan/manifest, exact refs, PR/CI evidence, integration | EXECUTED HERE |
| CONNECTED_PROVIDER — Google Drive | private application proof ledger / detailed receipts / tracker links | EXECUTED HERE for proof protocol; no private values copied to Git |
| LOCAL_AGENT_RUNTIME | P07 implementation of EH-COMP0 in an isolated branch/worktree | SUCCESSOR |
| CI_OR_REMOTE_RUNNER | focused validators + repository CI on exact candidate | SUCCESSOR VALIDATION |
| OPERATOR_OR_PHYSICAL_RUNTIME | actual employer form interaction and final submission proof | NOT REQUIRED for COMP0 contract build |
| UNKNOWN_RUNTIME | any unpushed Cursor/local dirty state | MUST BE DISCOVERED before P07 writes |

Provider access and host runtime are separate facts: provider write capability does not prove a clean local checkout, and local dirty state must never be inferred from GitHub.

## 3. Recovered decisions that bind the next lane

PR #46 exercised the intended success/failure call-stack **architecture**, but it is not production-safe semantic proof. P07 must preserve the architecture while repairing the known prototype defects explicitly listed in this plan; it must not copy the prototype wholesale or redesign around those defects.

### 3.1 Career-state compensation shape

Add an **optional**, backward-compatible `opportunity.compensation` **array** of typed range/provenance entries so independently published annual and hourly ranges are both preserved instead of one overwriting the other.

Each entry requires:
- `currency`: non-empty string, normalized by consumers to uppercase;
- `period`: `annual | hourly | monthly | weekly | unknown`;
- `source`: existing `artifactRef` shape;
- `verified_at`: ISO date-time;
- `freshness_ttl_hours`: positive integer.

Each entry may contain:
- `minimum`: nonnegative number;
- `maximum`: nonnegative number.

At least one numeric bound must be present. When both exist, `minimum <= maximum`. Duplicate entries for the same normalized `currency + period + source` identity are rejected rather than resolved by last-write-wins behavior. `compensation_text` remains a legacy/display projection and is **not** fill-time provenance.

No implicit freshness default is encoded in the schema. Producers must write an explicit TTL so hidden policy cannot drift between importers.

**Future timestamp rule:** define one shared tolerance of **300 seconds (5 minutes)**. A `verified_at` value more than 300 seconds ahead of the evaluation clock fails closed as `future_verified_at`; a value within the tolerance is treated as age zero for freshness calculation. The Python validator, TypeScript validator, pure resolver, and focused fixtures must agree on this rule.

### 3.2 Unit policy

- No annual↔hourly/monthly/weekly conversion in COMP0 or COMP1.
- Exact period match is required for verified-posted-max autofill.
- If a posting publishes both annual and hourly ranges, both entries are retained; COMP1 selects the entry matching the destination period.
- If the destination explicitly accepts either and an annual range is explicitly published, prefer that explicit annual entry as already required by the canonical plan; do not derive an annual value from hourly data.
- `unknown` may be stored as provenance but can never authorize a fill.
- A form that accepts annual **or** hourly compensation must expose enough destination-period context before COMP1 may use the posted maximum.

### 3.3 Compensation semantic families

COMP0 owns explicit canonical question semantics sufficient to distinguish at least:

- desired annual compensation;
- desired hourly compensation;
- generic desired compensation whose unit must come from field/context evidence;
- current compensation;
- previous/history compensation;
- minimum acceptable compensation;
- currency / pay-period controls where applicable.

Only the **desired** family may consume `verified_posted_maximum`. Current/history/minimum semantics must not inherit it. Until later Answer Memory policy explicitly authorizes reuse, current/history/minimum remain fail-closed/manual rather than being promoted through a loose salary alias.

### 3.4 Resolution precedence

Keep the general preference precedence unchanged for ordinary questions:

`session_confirmation > opportunity_override > profile_preference`

Add a compensation-specific resolution order:

`session_confirmation > opportunity_override > verified_posted_maximum > profile_preference`

`verified_posted_maximum` is a **derived opportunity-local resolution source**, not a user preference to persist as ordinary reusable profile state.

### 3.5 Privacy / proof boundary

Private screenshots, selected answers, protected-class values, credentials, signatures, and application receipts remain outside Git.

The only repository-consumable product evidence from a completed application is sanitized structure:
- label/prompt;
- control type;
- sanitized option labels;
- useful name/id/placeholder context;
- stage/action semantics;
- non-canonical ATS/provider hint.

## 4. Ownership ledger

| Topic | Owner | State | Collision rule |
|---|---|---|---|
| Private application proof / screenshots | Drive proof ledger + per-application receipt | COMPLETE CURRENT LOOP | never commit raw proof |
| Proof → sanitized observation protocol | `harness/workflows/APPLICATION_FORM_INTAKE.md` + mapping skill | INTEGRATED PR #44 | extend existing owner only |
| COMP design seam | `docs/EH_COMP_QMEM_PROGRAM_DESIGN.md` + prototypes | PROVED PR #46 | no second architecture |
| Career-state compensation provenance | EH-COMP0 | READY | single writer |
| Compensation taxonomy | EH-COMP0 | READY | serialized before QMEM0 |
| Compensation resolution policy | EH-COMP0 | READY | contract/validator only |
| Application Assist compensation runtime | EH-COMP1 | WAITING EH-COMP0 | no COMP0 DOM writes |
| Answer Memory contract | EH-QMEM0 | WAITING EH-COMP0 | shares taxonomy/preference owners |
| Answer Memory runtime | EH-QMEM1 | WAITING EH-QMEM0 + PR #29 | no early runtime mutation |
| PR #29/#30/#31 recovery | existing PR owners | OPEN | do not opportunistically absorb |

## 5. Sprint panel — EH-COMP0

**Disposition:** READY FOR P07
**Type:** product contract + validation
**Base:** refresh the integration branch at execution time; it must contain at least `200389612008ee89eddc24206631cb4b0cce644c` and this P04 plan commit.

### Mission

Turn the proven compensation prototype into the canonical production contract floor without wiring employer-page DOM behavior.

### Owned mutation surfaces

- `contracts/career-state.v1.schema.json`
- `fixtures/career-state.v1.example.json`
- `scripts/validate_career_state.py`
- `artifacts/escape-hatch/src/lib/career-store.ts`
- `artifacts/escape-hatch/tests/career-store.spec.ts`
- `harness/contracts/application-form-taxonomy.v1.json`
- `harness/contracts/application-preference-cache.v1.json`
- `scripts/validate_application_harness.py`
- focused COMP0 tests/fixtures if repository convention requires a new file

### Read first

- `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md`
- `docs/EH_COMP_QMEM_PROGRAM_DESIGN.md`
- `artifacts/escape-hatch/src/lib/compensation-resolution.prototype.ts`
- `artifacts/escape-hatch/src/lib/compensation-resolution.prototype.test.ts`
- PR #44 proof-protocol owners
- PR #46 merge evidence

### Forbidden scope

- `browser/application-assist/compensation.js` or equivalent production DOM runtime;
- general `assist-core.js` behavior except a validator-required mirror explicitly owned by COMP0 — default is **do not touch**;
- popup/install/modality surfaces from PR #47;
- PR #29/#30/#31 recovery files;
- QMEM0/QMEM1 implementation;
- website/portfolio profile expansion;
- pay-period conversion;
- private Drive proof or real compensation values;
- final submit/sign/attestation behavior;
- weakening backward compatibility of career-state v1.

### Tasks

1. Add the optional typed `opportunity.compensation[]` schema/definition exactly as settled above, preserving multiple independently published period/currency ranges.
2. Extend the example fixture with synthetic annual and/or hourly compensation provenance sufficient to validate the contract.
3. Update both career-state validation owners — `scripts/validate_career_state.py` and `artifacts/escape-hatch/src/lib/career-store.ts` — plus their focused tests with positive and negative cases:
   - valid annual range;
   - valid hourly range;
   - missing source / verified_at / TTL;
   - invalid period;
   - no min or max;
   - malformed date-time;
   - future `verified_at` > 300 seconds ahead must fail closed as `future_verified_at` and must never authorize posted-max fill;
   - `verified_at` within the 300-second tolerance is treated as age zero consistently;
   - negative minimum/maximum;
   - inverted bounds (`minimum > maximum`);
   - duplicate same-period/source entries;
   - annual + hourly ranges preserved simultaneously;
   - backward-compatible opportunity without `compensation`.
   The TypeScript validator must accept the same optional `opportunity.compensation` shape as the canonical schema instead of rejecting it as an unknown property.
4. Add explicit compensation question IDs/aliases without collapsing desired/current/history/minimum semantics.
5. Add compensation-specific precedence to the preference contract while keeping ordinary question precedence unchanged.
6. Strengthen `validate_application_harness.py` so:
   - desired families are opportunity-scoped as required;
   - posted-max source is allowed only in compensation-specific precedence;
   - manual/fail-closed semantics for current/history/minimum cannot be silently weakened;
   - cross-question alias collision protection remains intact.
7. Repair and reconcile the prototype before it can become a production reference:
   - non-desired families (`current`, `history`, `minimum_acceptable`) must **not** fill from `profile_preference`; add preference-present negative tests proving they stay manual/fail-closed;
   - reject `future_verified_at` beyond the shared 300-second tolerance and test the tolerated-skew boundary;
   - select among multiple compensation entries only by explicit destination-period compatibility;
   - reject negative/inverted bounds before any maximum can reach a fill decision;
   - keep the repaired prototype as executable reference if COMP1 will consume it later, or move only the pure non-DOM resolver into a production-neutral shared module;
   - Do **not** wire the browser runtime in COMP0.
8. Update only the lane status/evidence section reserved by the coordinator after tests pass; do not rewrite canonical architecture to make an implementation convenient.

### Validation

Minimum:
- `python scripts/validate_career_state.py`
- focused `artifacts/escape-hatch/tests/career-store.spec.ts` validation through the repository's existing test command
- `python scripts/validate_application_harness.py`
- focused compensation prototype/contract tests
- `python scripts/validate_harness.py`
- `git diff --check`

Then run repository CI required by the touched files and inspect exact-head review findings.

### Completion proof

EH-COMP0 is complete only when:
- typed multi-range opportunity compensation provenance is canonical and backward-compatible;
- annual and hourly ranges can coexist without loss;
- negative/inverted/duplicate/future-dated provenance fails closed;
- desired/current/history/minimum families cannot cross-contaminate, including when a non-desired `profile_preference` exists;
- the compensation-specific precedence is machine-validated;
- all negative fixtures fail for the expected reason, including future-dated `verified_at` and TypeScript-validator parity;
- exact candidate checks are green;
- no unresolved review thread remains;
- provider read-back proves the exact integrated commit contains the contract.

### Proof ceiling

Repository contract/validator proof only. It does **not** prove real ATS compensation autofill; that belongs to COMP1/LIVE.

## 6. Sprint panel — EH-COMP1

**Disposition:** WAITING EH-COMP0

Mission after COMP0 integrates:
- implement the compensation field/context adapter and pure resolver consumption;
- feed only gate-approved results into the canonical Fill Plan;
- preserve empty/user-edit protection;
- surface review for stale, period-ambiguous, or mismatched provenance;
- never convert units silently;
- keep final submission manual.

Primary mutation should prefer a new bounded compensation module rather than expanding `assist-core.js` into a second semantic owner.

## 7. Sprint panel — EH-QMEM0

**Disposition:** WAITING EH-COMP0; serialized shared owner

Use PR #46's Answer Memory prototype as the executable seam, then define the production Answer Memory contract and synthetic fixtures. Do not start QMEM1 runtime until QMEM0 is integrated and PR #29 is explicitly reconciled.

## 8. Proof loop operating checklist

The private Drive ledger is the human-facing capture surface. For every manual application:

1. capture the strongest final completion evidence;
2. record company, role, route/provider, and submitted date;
3. reconcile tracker status only from qualifying evidence;
4. link a detailed receipt when the application contains reusable field/question evidence;
5. distill structural observations without selected values;
6. admit an alias only when semantics, sensitivity, scope, freshness, automation, and confirmation policy are the same;
7. route genuinely new semantics to the canonical taxonomy/Answer Memory owner;
8. never treat a screenshot, signature, review page, draft, or prepared email as reusable authority to submit/sign.

## 9. Dispatch disposition

Run-scoped manifest:
`Outputs/prompt-parallel-dispatch/runs/escapehatch-comp0-proof-loop-20260927/manifest.json`

The canonical target `Outputs/prompt-parallel-dispatch/manifest.json` is **not claimed** because the refreshed tree still lacks:
- `harness/contracts/prompt-parallel-dispatch.v1.json`;
- `scripts/prompt_parallel_dispatch.py`.

The repository also already carries a root-target collision/block record from the Windows lifecycle graph. P04 therefore persists a run-scoped manifest rather than overwriting another owner's dispatch target.

## 10. Durability / handoff rule

No actionable decision in this P04 pass may remain chat-only.

Durable owners after this pass:
- full product graph: `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md`;
- COMP/QMEM architecture: `docs/EH_COMP_QMEM_PROGRAM_DESIGN.md`;
- this bounded P04 projection: `docs/plans/EH_COMP0_PROOF_LOOP_P04_2026-09-27.md`;
- executable dispatch description: run-scoped manifest above;
- private proof/capture checklist: Google Drive Application Proof ledger.

## 11. Exact next transition

**P07 executes EH-COMP0 only.**

Execution must begin by refreshing provider integration, local branch/status/worktrees, open PR file ownership, and any unpushed local changes. If the execution floor moved, rebase/recreate the isolated lane from the refreshed integration head rather than applying this plan to a stale checkout.

Do not start EH-COMP1 or EH-QMEM0 in the same writer.
