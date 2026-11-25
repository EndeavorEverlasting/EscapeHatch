# EH-NAV1 — Persistent `Submit` label, consequence-aware ATS navigation

**Status:** PLAN FOR REVIEW — NO AUTOMATION IMPLEMENTED, NO LIVE ATS REPLAY.
**Correction (operator, 2026-10-17):** On the Savantage/HiringThing application, **every application page consistently displayed a `Submit` button**. On intermediate pages it progressed through the application; on the eventual final action it delivered the application. The label **did not change** at the boundary. The website didn't expose a reliable progress bar. Prior summaries saying a Submit control "eventually appeared" were incorrect and are superseded by this paragraph.

**Parent objective:** EscapeHatch should reach the operator's final submission-review point across multi-page ATS applications with minimum manual navigation, while distinguishing intermediate progress from actual delivery **before activating controls**, communicating its evidence/uncertainty, and never autonomously making the final application submission or attestation decision.

## Evidence and proof ceilings

- Operator screenshots show an EEO page stating the application was not yet complete; instructions reference continuing to the next step, while the visible button was `Submit`. Later screenshot shows a Savantage employer acknowledgment, "We've received your application."
- This is evidence of the **user-observed label reuse and the eventual employer acknowledgment**, not proof of the earlier buttons' exact HTTP routes, side effects, drafts saved, total step count, or backend application ID. Never replay a live application to discover these consequences.
- Remote GitHub `main` at planning time: `5787fc0d72fd973f939ecc5652d4423ddb55961a`. Draft PR #63 (`e5c051863d2211637b09cc7e1e5b74fdc71af5f2`, base main) adds managed Chrome launch/fill/attach; draft PR #64 (`9a7ef5cf1a115c9e57193bdc96c95c448844823e`, stacked on #63) adds reusable preferences and Savantage form preparation. Neither is merged into main.
- #64 `artifacts/escape-hatch/browser-assist-control.ts` exposes launch/fill/attach, not multi-step advance. `managed-form.ts` deliberately changes values without Next or Submit; its narrowly bounded application-entry click is not a generic navigation authority.
- `main:contracts/application-assist-session.v1.json` explicitly forbids `click_next_or_continue` and `auto_submit`. This must change through a versioned policy migration, not a label-based exception. Do not silently turn existing session behavior into an unrestricted clicker.
- Draft #59/#61/#62 event-observer/evidence-authority chain and Issue #60 are separate owners for cross-page evidence. Existing `docs/plans/task-100-...` protects the old never-navigate floor; reconcile its regression acceptance rather than deleting it.
- Chrome's visible `--no-sandbox` warning is an independent deployment security gate; verify actual process arguments before attributing its source.
- No local workstation checkout, installed runtime, remote vendor API behavior or PR exact-head CI was validated by producing this plan.

## No label can confer authority

A label, DOM type (`type=submit`), step ordinal, URL, heading, or client-side event listener alone must not be promoted into evidence that a control is safe. A form's ordinary `submit` event may itself transmit data. The classifier predicts **consequence of an authorized action**, not the marketing meaning of its text.

`LOCAL_STEP_ONLY`: trusted versioned contract guarantees intermediate same-application progression with no unacceptable data disclosure.
`DRAFT_WRITE_AND_ADVANCE`: known ATS step submission persists or transmits draft information. Must have explicitly scoped user authorization for **that disclosure**, consent/data categories, origin, and lifetime.
`TERMINAL_APPLICATION_COMMIT`: irreversible or effective final delivery (including implicit keyboard submission); **operator-only** regardless of button label.
`UNKNOWN_OR_COMPOSITE`: changed fingerprint/handler/endpoint, mixed effect, uncertain JS behavior, unknown destination, or unverified vendor-specific control. **Stop; no real-world exploratory click.**

**Non-negotiable:** If the classifier cannot determine an effect **before the action** from trusted, current, prevalidated evidence, only the operator can continue that real application. Passive instrumentation may watch the operator-driven transition and record sanitized observations for future candidate adapters, but one successful prior observation must not be treated as universally safe across other applications/pages/versions.

## Architecture — one existing owner per concern

1. **Read-only step observer:** Discover current application/session identity, origin, visible section, heading, stable control ID, ancestry, HTML form properties, known redirects, network method/targets when safely observable, provider/build fingerprint, current progress hints, validation issues, and dynamic changes. No raw answers, EEO selections, auth headers, filenames or account identifiers in public source, logs, fixtures or manifests. Never infer the total number of steps.
2. **Pure consequence classifier:** Versioned `contracts/application-navigation-authority.v1.json` plus `classifyNavigationAction(snapshot, adapterEvidence, authorization) -> typed verdict` in application-owned code. Verified context-specific adapter evidence is required for `LOCAL_STEP_ONLY`/`DRAFT_WRITE_AND_ADVANCE`. An agent's confidence, DOM similarity and "Submit means next here" are insufficient.
3. **Canonical Navigation Plan (separate from Fill Plan):** One action only; includes private opportunity/session binding, precise origin, page/control fingerprint, versioned adapter contract, authorized data categories, expiration, consequence classification, and expected postconditions. Session restart, content mutation, page change, missing evidence, or unauthorized disclosure invalidates it.
4. **Policy gate & action executor:** Before any click, intercept equivalent Enter/implicit submit or programmatic activation routes, constrain the managed page/session, enforce one in-flight action and pause/stop, and require classification/authority to remain fresh. Block known finalizing endpoints when technically possible as defense-in-depth; **do not claim arbitrary third-party JavaScript can be made fail-proof through interception**. Unsupported automation must remain manual.
5. **Post-action observer & evidence reducer:** Observe changed step fingerprint, validation errors, pending drafts, and receipt evidence. Click ACK is not navigation proof. Separate `STEP_ADVANCED`, `DRAFT_RECORDED`, `SUBMISSION_ATTEMPT`, `EMPLOYER_RECEIPT_OBSERVED` and `SUBMITTED_OPERATOR_CONFIRMED`. Reuse Issue #60 event journal and CareerState reducer; no duplicate event state machine or public PII.
6. **UX:** Explicit `Step N — total unknown` when applicable, permanent current state, `Submit label → known intermediate step` only if evidence-backed, `Submit label → final delivery / Your turn` only if known, otherwise `Submit label → uncertain / Your turn`. Show basis, authorized disclosure, changed-site warning and last observed effect. Never invent a progress percentage or show `Applied` from a click.
7. **Security:** Preserve manual-only legal signatures/attestations, credentials, OTP/CAPTCHA/MFA and accurate user-owned EEO handling. Intermediate navigation must not inherit final-submission or demographic consent. Investigate `--no-sandbox` before production promotion.

## P04 — factoring, ownership and dependencies

**Runtime partition first:** CURRENT_CHAT_RUNTIME completed read-only evidence and plan synthesis. LOCAL_AGENT_RUNTIME owns source/tests, managed Chrome/local run, private-profile inspection and security launch evidence. CI_OR_REMOTE_RUNNER may own isolated static/synthetic gates. OPERATOR_OR_PHYSICAL_RUNTIME owns final ATS submission and protected facts. GitHub is a provider, not an execution host. The private screenshot/source evidence is referenced as an opaque operator artifact; don't copy it into public GitHub.

**Execution graph (after plan approval):**
`PRE-0 refresh/reconcile, owner and local runtime census` → `[POL-1 classifier/contract || FIX-1 synthetic persistent-Submit ATS fixture]` → `OBS-2 step correlation integration` → `CTRL-3 one-step gate/executor + cockpit UI` → `P08-4 independent runtime proof + existing behavior regressions` → `INT-5 dependency-aware integration`.
**Graph width:** 2 after PRE-0; POL-1 and FIX-1 have disjoint owners and fixtures. Do not claim parallel work dispatched in this planning phase. File-level ownership and dispatch fields are in the companion manifest.

**Collision rules:** PR #64 owns current managed control, form mapping, preferences and UI. PRs #59/#61/#62 own extension journal/evidence observation. Reuse existing owners; do not rewrite another lane's branch; plan a minimal integration PR after their base ancestry and CI are reconciled. Triage, TokenCorridor prompt definitions, and private candidate preferences are forbidden mutation surfaces. Generated plan/task files may have a canonical generator: discover it before editing.

**P04 unresolved tooling seam:** TokenCorridor's current registry requires `scripts/prompt_parallel_dispatch.py` for dispatch proof, but the tool is not present on fetched TokenCorridor `main` tree. Thus this manifest is structural planning evidence only; canonical validation/dispatch is **UNPROVEN** until the actual owner/resolver/tool is found or repaired. Do not represent `json.loads` or prose as that validator's receipt.

## P82 — fixed experiment rubric and prototype ladder

**H1 (primary):** A control whose visible text is always `Submit` can be classified as verified intermediate step or terminal commit using versioned pre-action adapter/effect evidence, without clicking unclassified real employer controls.
**Baseline:** Current policy blocks all Next/Continue/Submit automatic navigation, which prevents unsafe submission but forces manual page transitions.
**Test candidates:** (A) no trusted adapter → UNKNOWN/fail-closed; (B) synthetic ATS with explicit stable adapter contract identifying intermediate `Submit`; (C) same exact label on terminal page; (D) adversarial change of endpoint, page fingerprint or handler without text change.
**Falsifier:** Any automated terminal commit; any automatic click of UNKNOWN; any false `STEP_ADVANCED`; any captured private value in tracked artifacts; any mistaken cross-opportunity/session reuse. Failure preserves baseline and rejects promotion.
**Measurements:** terminal-commit count=0, unclassified-click count=0, admitted intermediate transitions accurately observed, controlled draft disclosure only inside scoped authority, preserved manual final gate, exact step count reported only when verifiable, regression check on contact fill/PDF attach/Save/Undo/Pause/Stop.
**Decision:** `KEEP` only when safety invariants pass and synthetic navigation yields real measured progress; otherwise `REFINE` once with named cause or `REJECT` the automation class. Preserve last-known-good manual flow at every iteration.

## P07 — implement later, not as part of plan approval

On approved execution, refresh GitHub refs and inspect local branches/worktrees; don't reset dirt or merge PR #64 blindly. P07 starts with POL-1 and FIX-1 in safe parallel only after PRE-0 and adapter proof. Build classifier/fixtures; execute tests and at least one independent critique/falsification loop; integrate conservative managed route + UI only after policy proof. Update the exact owners: session contract, application harness, managed-browser guide, event-journal integration, tests/CI, artifact registry and any generated docs. Resolve known existing PR #63 browser selector failure rather than silently excluding the test. After changed heads, rerun relevant checks; only integrate code after authorization and gates.

## P08 — proof ladder, not fake live proof

1. Static schema/policy test + synthetic Playwright served ATS where `Submit` is visibly identical on every page and side effects differ.
2. Prove safe intermediate step progress and terminal action suppression in real managed Chromium on synthetic site, *with* protected contact/fill/PDF attachment and Pause/Stop/Undo regressions. Verify keyboard implicit submit, SPA routing, drafts/network writes, stale contracts, redirects and response errors.
3. Test restart, dedupe, cross-application binding, user edits, privacy and event journal consistency.
4. Run Windows locally through repository-owned launcher in an isolated preview, no overwriting open sessions. Capture current process launch/Chrome sandbox flag evidence.
5. On the live employer site, **passively observe only** user-driven behavior; no automatic replay of this already completed Savantage application, no duplicated submission. Do not infer live-safe pre-action classification from synthetic proof alone.
6. Commit/PR readiness, merge, installed runtime, and end-to-end employer completion are distinct proof levels. Employer confirmation observed in screenshot belongs to the prior human action, not new code.

## Exact next gates and closeout

**CHANGED in this lane:** design and manifest only; implementation and browser untouched.
**PROVED:** user-reported constant `Submit` label; screenshot acknowledgment; old policy forbids Next/Submit; PR #64 has no advance handler; dependency/owner graph resolved from GitHub.
**UNKNOWN:** actual pre-action vendor side-effect semantics, vendor adapter freshness, current local checkout/runtime, Chrome sandbox flag provenance, canonical P04 dispatch-validator availability at a usable owner, future green CI.
**NEXT:** operator review/acceptance of this plan, then PRE-0 from the verified EscapeHatch local checkout: `git fetch --all --prune --tags` followed by `git status --short && git worktree list && git branch -avv`, then start POL-1 and FIX-1 on isolated paths. No real ATS click until an eligible, evidenced, explicitly authorized capability exists.

**Authority boundary:** This is a reviewable plan, not approval to automate final submission. User remains the final submitter.
