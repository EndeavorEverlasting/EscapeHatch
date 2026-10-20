# P04 execution handoff — zero-friction job application preparation

**As of 2026-10-20.** Canonical parent: [Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69). Canonical plan: [Application Assist Autopilot Plan](../APPLICATION_ASSIST_AUTOPILOT_PLAN.md). This is an **executable subordinate handoff**, not a second product specification or a claim that end-to-end production automation is finished.

## User outcome — do not shrink it

A user selects a viable opportunity from their existing career ledger and invokes **Prepare application** once. EscapeHatch reuses the user's approved profile, answers and correct versioned résumé/cover packet, starts a managed browser itself, interprets a changing employer form, fills every safely determinable field, stages approved documents, advances *only* through verified nonterminal steps, persists progress through reloads/sign-ins and presents a clear **review screen at the employer's final submission boundary**. The user should not have to reinstall an unpacked extension, paste JSON, recreate OAuth client credentials, shuttle documents, find local paths, re-answer saved questions, or relay debugging between agents. Final Submit, signatures/certifications, legal/EEO/accommodation choices, CAPTCHA, MFA and unknown-effect controls remain human actions. An account login or permission prompt may still require the user's direct participation.

This is the long-lived parent outcome even if a particular runtime/agent can currently implement only one part. The app must distinguish **REVIEW_READY** (trusted final action is identified and held) from **REVIEW_REQUIRED** (manual blocker remains) and **BLOCKED** (unsafe/invalid session), not call all three “done.”

## Resolved evidence — recover before the next edit

- On 2026-10-20, provider `main` was `315e77c5198801441a36598ac725d85b14499381`. Refresh the actual provider default SHA, PRs, CI and local worktrees before acting; this is **not** an immutable main reference.
- `AGENTS.md` owns governance, this plan owns implementation, `harness/contracts/application-autofill-parent.v1.json` owns nine conjunctive parent gates, and `docs/agent/TRIFECTA.md` resolves P08+P82+P07 via TokenCorridor's live registry. Never infer prompt contents from a shorthand.
- Main already contains `browser-assist-control.ts` (managed Chrome/local Vite control), `managed-form.ts` (guarded native field fill), `opportunity-documents.ts` (private per-opportunity PDF bytes and review/digest), `managed-answer-memory.ts` and `preference-file.ts` (user-owned answer persistence), `managed-preparation-driver.ts`, `application-autopilot-executor.ts` (trusted-effect navigation), `tracker-bridge.ts`, `source-bridge.ts`, and `src/components/managed-browser-assist.tsx`.
- Open, separately owned PRs on inspection: #64 stacked preference/form, #66 source directory, #76 Sources UX, #89 narrative-engine proposal, #92 voice rules and #59/#61/#62 observer chain. Review current status and avoid blind cherry-picks; main may have later equivalent changes. #89 is **design**, not completed language engine.
- Existing evidence includes earlier live guarded filling on an employer form and independently verified synthetic ATS navigation. Neither establishes that a new employer form has reached final review or that installation is turnkey.
- **This sprint's implementation**: `managed-prepare-fallback.ts` + tests; when trusted navigation evidence is absent, the explicit Prepare action still fills approved fields **before** staging reviewed PDFs and returns `REVIEW_REQUIRED` with specific unresolved fields/uploads. The UI carries an explicit launch through that preparation if the exact opportunity documents already meet the saved review policy. No extra extension, JSON registry setup, or automatic clicking is required for this **bounded partial preparation**; it does **not** navigate through unknown buttons or certify final review.
- Public continuation candidate: **micro1 Strategic Project Lead**. Live role/opportunity freshness must be rechecked before proceeding. This repository may hold a public posting link or synthetic fixture only; **never** put the user's private resume, contact info, role packet, Google Drive IDs, user tracker row or application answers into public Git, PR bodies, logs or tests.

## Current sprint scope / expected proof

Implementation owner: `feat/p04-review-ready-fallback-20261020` (isolated branch from the above main floor).

| Surface | Behavior | Validation |
| --- | --- | --- |
| `managed-prepare-fallback.ts` | Fill approved fields, stage exact reviewed files, stop before all untrusted navigation; report precise pending operator checks | `managed-prepare-fallback.test.ts` |
| `browser-assist-control.ts` | Reuse canonical private preferences/contact/role projection; run fallback only when trusted effect registry unavailable; retain existing exact job/origin/doc-review guards | `test:managed-assist`, browser tests |
| `src/components/managed-browser-assist.tsx` | One explicit Launch continues to bounded preparation when the exact opportunity's PDF files are already upload-authorized; no premature preparation from landing/login screen; show what actually filled or staged | Playwright managed browser fixtures |
| `package.json` | Wire the focused test into the established test entry point | `npm run test:managed-assist` |
| This runbook + canonical owner links | Preserve this user outcome, boundaries, measurable gates and continuation in git | Parent/governance validators + content review |

No mutation of active browser sessions, public identity fixtures, submitted applications, private Drive documents, local dirty branches, independent PR-owned files, or operator-only terminal controls.

## Next integration slices — executable in order, not a new planning exercise

**A — exact-head preflight and fixture certification.** Refresh origin/default SHA; inspect branch status, overlap and PR review; run from `artifacts/escape-hatch`: `npm ci` (only if required by existing lockfile/bootstrap; do not modify system settings on a user's machine), `npm run typecheck`, `npm run test:managed-assist`, `npm run test:tracker`, `npm run test:unit`, `npm run build`, `npx playwright test tests/application-autopilot-executor.spec.ts tests/managed-browser-assist.spec.ts`. From root: `python scripts/validate_application_autofill_parent.py`, `python scripts/validate_governance.py`, `python scripts/validate_career_claim_fidelity.py`, `python scripts/validate_career_artifact_propagation.py`, and `git diff --check`. Correct any failures; record exact command and exit status. Test current functionality against the known-good selected browser fixtures, not merely the new fallback.

**B — eliminate manual document shuttle and bootstrap.** Reuse the existing `source-bridge.ts`, `tracker-bridge.ts`, `opportunity-documents.ts`, existing authorized TokenCorridor/Google connector bridge and Windows launch scripts. Bind one verified opportunity to its reviewed PDF files by source revision/hash. Introduce an adapter that reads user-selected sources under existing authorized credentials, streams files **privately to the local document store**, confirms bytes and PDF signatures, and shows any stale/ambiguous version without silently overriding reviewed files. Do not assume this ChatGPT conversation's Drive connection automatically authorizes the standalone local app. A local-source picker is a fallback; raw path/JSON transfer is not a normal user step. Contract-test stale revisions, job mismatch, missing OAuth, multiple resumes and offline mode with fake candidates; preserve original Drive file IDs and application ledger.

**C — remove installation/extension friction.** Make the existing `Launch-EscapeHatch.cmd`/PowerShell path the sole normal workstation bootstrap, with architecture/OS/tool probes and bounded, idempotent provisioning for missing repo dependencies **using existing repo ownership**. Never require installing the MV3 unpacked extension to operate the managed Chrome route; extension remains optional. Detect missing Google Chrome/Playwright runtime and give one explicit, actionable recovery state rather than promising readiness. Reuse authenticated accounts and existing provider tokens; don't request a fresh Cloud project or OAuth secrets by default. Never elevate/install software or manipulate user browser profiles without clear authorization. Prove clean Windows standard-user first run and repeat run with zero manual file shuttles.

**D — reusable answer readiness.** Wire reviewed `Profile`, `AssistProfile`, `application-preferences.ts`, `managed-answer-memory.ts` and form taxonomy into one versioned, reviewable answer projection. A user's previously accepted answer may be applied only under its question/scope policy. Cross-company employee history, legal eligibility, sponsorship, compensation, accommodations and EEO answers must not be globalized or inferred from a résumé. Preserve manual edits on the live form and reject stale/unverified values. Distinguish a field's **written value** from a DOM readback match and from server-accepted semantics.

**E — trusted multi-step execution, no guessed “Submit.”** Use `application-navigation-policy.ts` and `managed-preparation-driver.ts` for host-versioned ATS effect evidence. A page label or locally entered registry is not trustworthy proof of an effect. Bind evidence to origin, exact page/control fingerprint, reviewed effect, expiry and opportunity/session. Confirm visible validation, exact changed action and upload acceptance; bound retries, loops and cross-origin redirects. Unknown evidence => `REVIEW_REQUIRED`; terminal commit => `REVIEW_READY` without invoking it. The protected synthetic fixture with identically labeled intermediate/final Submit must still produce zero terminal commits. Add native/React/SPA and an independent ATS fixture before generalizing.

**F — actual operator journey.** Only after the above gates, on the user's managed Windows session, run the canonical launcher in a safe context; choose a fresh *unsubmitted* opportunity, recover the approved and scoped documents, launch and observe the actual employer browser URL, real field values, accepted filenames, safe intermediate transitions, persistent answer state and final operator-only control. Capture private, redacted proof and verify a second unrelated ATS archetype. Do not perform or fake final Submit, employer acceptance, account creation or personal attestations. No live employer test from cloud-only provider source inspection.

## Non-negotiable invariants and regression fixtures

1. Missing registry: **safe fill + reviewed file staging**, never `BLOCKED` without attempting the separately authorized work, never navigation; result `REVIEW_REQUIRED` until effect evidence exists.
2. Missing/unreviewed/wrong-job document: no upload, no hidden switch to master résumé; expose exact missing reason.
3. Saved user's in-form edit survives repeated Prepare; no overwriting with a stale cached answer.
4. An opportunity already Submitted, Closed or locked in provider ledger must not be auto-launched from stale local cache.
5. A control labeled Submit may be intermediate OR final; always classify by independently established consequence, not text.
6. Password/CAPTCHA/MFA, signatures, certifications, EEO and accommodation stay human-controlled; no automatic terminal actions.
7. Reload, browser close/reopen, multiple windows and changing origin must preserve or safely invalidate session bindings.
8. Public product must not require a developer console, source checkout knowledge, unpacked extension, manually curated `localStorage` registry, or re-entering an accepted answer. Unsupported environments should show a single deterministic recovery route; do not claim zero friction before witnessed cold-start proof.
9. Private data stays in user-owned approved stores, encrypted/permission-scoped as appropriate, never tracked fixtures, CI traces or public logs. Public multi-user readiness requires tenancy isolation, deletion/export, revocation and synthetic two-user adversarial tests.
10. User approval is scoped: reviewing a PDF does not imply employer upload approval if review-policy requires it; permission to prepare never means permission to Submit.

## Proof matrix / receipt contract

The canonical gate IDs must not be renamed or “passed by association”: `SOURCE_TO_APPROVED_PROFILE`, `MANAGED_BROWSER_LAUNCH`, `SEMANTIC_CROSS_FORM_MAPPING`, `DETERMINISTIC_FILL_AND_PDFS`, `CONSEQUENCE_SAFE_MULTISTEP`, `SESSION_CONTINUITY`, `ADVERSARIAL_CROSS_ARCHETYPE`, `P08_REAL_BROWSER_USER_JOURNEY`, `MERGED_AND_LIVE_OBSERVED`. Their parent `status=UNPROVEN` until exact qualifying evidence is added under the canonical contract. A synthetic test or a green PR never closes a live gate.

For every successor: record `CHANGED | PROVED | NEXT`; tracked paths, SHA, branch/PR/merged state, exact validated head, tests and exit codes; last-known-good control exercised; remaining blocker and next safe executable gate. State if a local/Windows runtime was actually observed, including Chrome identity, target job URL (redacted in shared logs), observed field/readback and final action untouched. Where validation cannot run in the current environment, say so **and advance the next safe reachable gate**, never manufacture PASS.

**First continuation after this sprint:** obtain exact-head CI results for the created implementation branch; repair failed checks; integrate when mandatory checks and ownership allow; then run the existing managed-Chromium synthetic test and Windows P08 observation on an unsubmitted job. The next product slice is private, versioned, user-authorized source-to-document provisioning so the public app does not need a manual PDF picker.

## Trifecta execution, not a slogan

- **P07**: refresh the actual current repo/default, guard unrelated work, implement + run exact checks + converge through merge where justified.
- **P82**: hypothesis: “absence of an ATS effect registry should not suppress already authorized field fill/PDF staging”; comparator: old `BLOCKED` with zero pages; candidate: safe fallback with one prepared page, zero intermediate and terminal actions; test same synthetic fields and document states, inspect wrong-job/unknown-question negatives.
- **P08**: evaluate the known-good form fill and new one-click scoped fallback through the repo launcher and a real browser **only when that runtime exists and is authorized**. Connected GitHub + code checks are not Windows live proof.
- Resolve the actual full P08/P82/P07 entries through TokenCorridor Prompt Kit each time, per `docs/agent/TRIFECTA.md`. No synthetic “100 agents dispatched” receipts or claims of a connected runtime that wasn't exercised.

**Do not ask the operator to hand-write a new plan, manually transfer these instructions, or repeat data already in accessible canonical sources.** The operator's next involvement should be approval of private documents/credentials when genuinely required, and final employer review/submission.
