# P141 + Trifecta + P04 — Preparation Studio and per-application progress (2026-10-30)

## Resume here (canonical remote handoff)
**Parent outcome:** A high-volume applicant should arrive at each ATS form with previously reviewed work experience, role-specific skills, evidence for explaining those skills, and reusable answers ready. Each in-progress application must show its actual verified checkpoint, remaining work, next action, and clearly qualified progression estimate; never erase the flow by starting a surprise questionnaire in the employer form.

**Owner:** `EndeavorEverlasting/EscapeHatch`, Issue #69, `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`. This handoff extends `contracts/application-journey-scenes.v1.json` under `pre_application_studio` and `application_progress_projection`. It does not establish a second master scene graph, profile store, tracker, submission policy, or employer identity. The protected 14 root scenes remain in place.

**Current branch/lane:** `feat/p04-preapplication-skills-progress-20261030`; design/contract + pure checkpoint projection + synthetic unit regression + execution manifest. **Forbidden:** changing or releasing user's actual private applicant data; final Submit; legal/EEO/eligibility decisions; password/SSO/MFA/CAPTCHA; running or closing a real employer session; unapproved document upload; overwriting another writer; moving/rewriting PR #145 or modifying user workspaces. Local Windows/Chrome proof is not attainable from the GitHub connector.

### P141 strategy (selected, falsifiable)
- **Selected:** one private reusable pre-application intake, anchored to career history and existing answer memory, paired with evidence-based per-opportunity checkpoints. It closes both repeated skill-entry friction and the current absence of comprehensible status/resume in a high-volume workflow.
- **Rejected A:** merely scraping a global unscoped skill list into every role. Skills must belong to a specific employment record and be reviewable for a technical follow-up.
- **Rejected B:** a visually pleasing percentage based on URLs, clicked buttons, or the current page only. That would imply progress without known denominators and harm trust.
- **Rejected C:** a new cinematic route framework, ReactFlow dependency, or separate checkpoint database. Existing scenes/state owners already cover the needed primitives.
- **Empirical uncertainty:** Can preflight inventory and role-linked skill review reduce questions first encountered mid-application while preserving accuracy and a feeling of uninterrupted flow?

### P82 experiment admission (not yet measured)
**Hypothesis:** For comparable ATS tasks, an optional pre-application studio with verified reusable answers and experience-scoped skills lowers *required mid-application user interruptions per completed review draft* compared with current ad hoc collection, without increasing wrong answers or application identity crossovers.
**Baseline:** existing manual micro1 skills flow triggered six more requested skills after the prior profile steps; quantitative timing, error rate and cross-ATS repeat counts are **not measured**. Do not fabricate them.
**Prototype boundary:** one private synthetic applicant, two varied synthetic ATS fixtures (one role-specific skills selector, one required free-text skills prompt), and later one operator-approved real Chrome flow; no employer final Submit.
**Measurements:** (1) newly encountered questions during application, (2) role skill coverage and source evidence completeness, (3) correct checkpoint recovery after reload/closure, (4) unknown required fields and mistakes, (5) task completion time, (6) accessible scene navigation. Before/after measure on same fixtures, same required fields, different copy order. **Decision:** adopt only if fewer interruptions and no false readiness, cross-job contamination, protected choice automation or regression in launch/login flow. Record actual counts.

## UX scene plan — no material visual redesign silently assumed
**Entry:** current Home has a gentle **Prepare my application kit** affordance and an unmistakable **Paste job link** primary path. Returning users do not repeat approved questions. A user can defer without losing place. Use a conversational progression rather than an eight-part bureaucratic form.

| Subscene | User-facing message/interaction | Verified exit |
| --- | --- | --- |
| STUDIO_WELCOME | “Let's make future applications easier.” Show what EscapeHatch already knows, the gaps, and expected categories; choices **Review my kit / Apply now** | Active owner/workspace verified |
| STUDIO_TIMELINE | Review company, role, start date, end date/current, responsibilities; show role cards and missing dates | Reviewed experience chronology in canonical private career state |
| STUDIO_ROLE_SKILLS | Per-role “Which skills did you use here?” Offer imported suggestions only with provenance; add/remove/reorder, mark user-confirmed; no enforced six-skill fabrication | Each confirmed skill bound to experience ID, source and approval |
| STUDIO_SKILL_STORIES | “Where did you use this? How would you explain it technically?” Optional short example and drill-down; rehearsal can reuse learning-harness artifacts with approval | Approved private evidence, no inflated proficiency |
| STUDIO_ANSWERS | Reusable ATS basics, work modes, notice/availability, supported compensation preference, contact and non-sensitive questions; preview destination and edit later | Saved/loaded through existing preference and answer-memory owner |
| STUDIO_DOCUMENTS | Review source resume, role derivative, cover-letter availability and document hash; optional, job relevance matters later | User-reviewed canonical document revisions, no silent upload |
| STUDIO_READY | Summary of ready-to-reuse, unresolved, and operator-only items; action **Choose a job** | No claim that an employer page is complete |
| APPLICATION_RESUME_CARD | Current job, last observed checkpoint/scene, evidence age, *step 3 of 5* when actual section count known, required fields unresolved and **Resume** | Reinspect same owner/job/origin; explicit confirmation on page drift |
| APPLICATION_BLOCKER | One specific user-owned action, why it matters, and where to answer; **Done—check again / I'll handle this there** | Readback on employer page, not checkbox click claim |

**Visual architecture:** reuse the application's Manrope/Newsreader/DM Mono and existing cream/teal design tokens; wide-screen two-panel workbench (pinned opportunity context + focused next-step card), narrow-screen vertical card stack; scene title, completed indicator, current step, next action and clear resume point. Use restrained native View Transitions 120–180ms only when supported; reduced-motion = instant. Progress is informational, never a gate that locks a user out. Avoid images, dashboards and animation that make filling fields slower.

**Upstream provenance read, not dependencies installed:** private Upstream Intelligence Library `1Xc6T70qEvb9tE1JM9SNDBWXfbSiYBZyE` / Start Here guide `1pwYg8VaP-G23wiZ2bVABmmGEVjLTJyIh`; registered `impeccable` (UX audit method), `UP-A85AD9DC3` (Cathryn Lavery/Diagram Design, narrative hierarchy), `UP-AFAEE2D9D` (Julian Oczkowski, design brief/tokens), `UP-1B0AFA8BE` (Jakub Krehel, state-aware critique), `browser-view-transitions` (native transitions), `UP-60B0939CC` (Playwright visual snapshots), `UP-60FBA76B5` (motion accessibility). Each is a reference only; not claimed installed, licensed, or adopted wholesale. Existing `xyflow-reactflow` is explicitly **DEFER**.

## Progress truth contract
**Inputs:** independent applicant workspace identity, exact opportunity ID + employer application URL, timestamped section/field readback, known-versus-unknown section total, verified required controls, manual-only controls, observed trusted final-review boundary, and separately validated employer submission receipt.

**Output cards:**
- Show **Last verified:** scene and section, timestamp, and **Next:** one explicit action.
- Show **This inspected section: 3 of 4 required fields verified** only on a fresh bound inventory. Mark unknown required controls as needing mapping. A later dynamically revealed question invalidates and recomputes the affected count.
- When an ATS declares *five* sections and the user is at zero-based index two, show **Position estimate: ~40% through the section sequence (step 3 of 5)**. This is not an application-completion rate.
- When the future section count is unknown, show **Remaining sections unknown** rather than a synthetic overall percentage.
- If checkpoint is stale, missing, or belongs to another opportunity, retain its non-sensitive saved resume location where appropriate, suppress numeric progress, and reinspect. A locally stored answer or attached input does not equal employer acceptance.
- **Review ready** requires trusted final boundary and current inspected requirements. **Submitted** requires separately validated employer receipt; final Submit is always operator-owned. Status changes must reconcile with existing local queue/tracker authority without overwriting stronger external provider states.
- `artifacts/escape-hatch/src/lib/application-progress-checkpoint.ts` is a pure projection, not persistence or browser authority. `applicationCompletionPercent` is intentionally always null until an authoritative full-application denominator and employer readback are integrated and validated in the existing canonical owner.

## P04 executable handoff and collision isolation
**Mandatory reconciliation before changes:** refresh `origin/main`, inspect current dirty checkout/worktrees, PR #145 (`feat/micro1-profile-skills-20261030`, draft; owns `AssistExperience.skillsUsed` and role skill review), and existing PRs #138/#139 for source/answer projection. Protect PR #145's owned files `src/lib/assist-contract.ts` and `src/lib/employer-profile-step.ts` and its tests. This branch does not edit them. Also preserve PR #95 installation and #98 launcher lineage.

**Canonical owners to integrate:** `contracts/application-journey-scenes.v1.json` (root+subscene registry), `artifacts/escape-hatch/src/lib/application-journey-projection.ts` (current/next scene), `application-puzzle.ts` (fresh page inspection), `application-requirements.ts` (required control inventory), `application-preferences.ts` / `preference-file.ts` (answers), `workspace-bootstrap.ts` and owner binding (private state), `managed-browser-assist.tsx` (workbench), `managed-progress-evidence.ts` and `browser-assist-control.ts` (form evidence), existing application/tracker reconciliation (status).

**Ordered executable lanes (see JSON dispatch manifest):**
1. **F0—verify floor:** preserve dirty/parallel branches; compare PR #145 exact head; validate root registry and per-opportunity code; do not claim PR head merged into main.
2. **F1—native intake:** add the studio scenes and a reviewable per-role skills editor to the current cockpit; pull actual career history and approved answers first, then only ask for missing values. Role skills include teach-back/evidence but do not automatically self-certify proficiency.
3. **F2—private persistence:** bind checkpoint receipts to verified owner/workspace and opportunity, with section signatures, observed times, revision/CAS and idempotent resume after close/login/reload; protect existing answer memory and browser session. No public ledger.
4. **F3—status UX:** wire pure projection to opportunity tracker/workbench; accurate per-section counts, qualified position estimate, explicit blocker/next action; refresh on dynamic conditional fields, page drift and manual answer.
5. **F4—proof:** P82 synthetic comparators/negative cases, keyboard/320px/200% zoom/reduced-motion, visual snapshots, and P08 controlled actual Windows Chrome only after correct local entrypoint, with operator review and no auto-submit.
6. **F5—integration:** run exact-head tests and validators; reconcile main/PR #145, obtain normal repository promotion checks and merge only after proven. Installed/live behavior and real employer acceptance remain separate gates.

**Current branch tests:** `cd artifacts/escape-hatch && npm run test:unit` (wired to `application-progress-checkpoint.test.ts`); `python scripts/validate_application_journey.py`; `python scripts/validate_application_autofill_parent.py`; `python scripts/validate_governance.py`; `git diff --check`. Source-level/synthetic PASS does not prove local installed Chrome, real ATS, accessibility or final submission. If no dependencies, say skipped and do not invent PASS.

**P08 protected control:** Existing login return → two stable same-page observations → Resume preparation and the protected operator-only final Submit. Never weaken current scene continuity while implementing progress.

**One actionable first local command** (from `C:\Users\CheeksMcClappeth\dev\EscapeHatch`, in PowerShell; inspect local status/dirty work first, do not reset):
```powershell
git fetch --all --prune --tags; if ($LASTEXITCODE) { exit $LASTEXITCODE }; git status --short; git worktree list; git branch -r --list "*preapplication-skills-progress*"; git log -1 --oneline origin/feat/p04-preapplication-skills-progress-20261030
```

**Proof ceiling at authoring:** GitHub provider writes + readback, isolated branch and pure module/tests; local unit tests and browser runtime are not proven by a GitHub commit. **Parent Issue #69 remains OPEN**. The UI studio and true persisted restart behavior remain for F1–F4.
