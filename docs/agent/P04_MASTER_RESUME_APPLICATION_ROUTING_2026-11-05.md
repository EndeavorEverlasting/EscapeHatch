# P04 / P01 — Current master résumé and real-application execution handoff

**Status:** Provider-side P01 harness correction and P04 handoff, November 5–6, 2026. **Execution target:** actual installed EscapeHatch on the operator's Windows host. **Parent:** [Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) and `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`. This document supplements, never replaces, `AGENTS.md`, `docs/agent/P04_OPERATOR_LIGHT_APPLICATION_SPRINT_2026-10-27.md`, `docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md`, and the existing browser/controller/receipt owners.

## LAUNCH ORDER — execute real work, not a planning-only exercise

1. **EH-R0 — Recovery and exact source/version binding.** On the actual Windows installation, identify its selected source and private applicant/workspace. Refresh Git provider/default branch, all active worktrees, PR ownership, runtime/21031 state, and the original private tracker. Resolve the private Career Agent Start Here index, its current Google Docs master résumé and Career Impact Bank. Confirm the approved source digest/revision and generate or recover the same approved ATS-conservative PDF. Do not use the public ParallaxPort résumé HTML as the private editable master or assume a website deploy has delivered private ATS PDF bytes.
2. **EH-R3 — Operator-light applications, up to three real candidates.** Execute against the existing managed Chrome application controller and *unsubmitted* tracker opportunities immediately when they are usable; prioritize existing advanced, fresh, strong-fit roles and skip applied/closed/uncertain submissions. For an Indeed-native application, use the **currently user-selected approved master or domain résumé**; suggest the canonical master when no choice exists, but never override a valid explicit selection. Bind its exact approved revision/digest and opportunity/account ownership. Use the existing private answer memory. Fill readback-verified allowed fields, advance only trusted nonterminal controls, checkpoint manual gates, and move to the next candidate without waiting for the operator. Never claim submitted without employer confirmation proof.
3. **EH-R1 — P07 implementation: freely selectable approved résumé integration.** In a separate isolated worktree, wire the **existing** `harness/contracts/resume-selection-graph.v1.json` policy to existing resume graph, opportunity PDF store and trusted managed browser call sites, with tests. Avoid parallel writers on browser controller and the active live browser. Preserve the current user session while making changes; synthetic proof must precede live P08 checks.
4. **EH-R2 — P07 implementation: non-Indeed custom artifact lane.** In a disjoint isolated worktree, use existing career-state, claim fidelity, artifact propagation and document-generation owners. For external employer ATS/custom forms, derive exact opportunity-bound résumé/cover/CV only when required. Prepare private artifacts and their preview/readback. **Review newly custom-tailored artifacts before employer attachment**; do not ask for another review of unchanged approved master content. This lane can develop alongside R1 only while file mutation ownership remains disjoint.
5. **EH-R4 — Converge / P08 / P07.** Validate targeted and existing parent gates at exact current head, inspect PR collisions and CI, integrate authorized verified code, update the installed selected runtime safely, then observe the real Indeed account slot (and one unrelated external ATS). Read back resume selection, application-step state, protected final-submit control, private tracker receipts and restoration success. Record tested/merged/installed/live/employer status independently. Parent #69 remains open until conjunctive gates are demonstrated.

The first runtime path in R0/R3 is **real application work**, not a request to rebuild architecture before touching jobs. R1/R2 are durable regression-prevention consumers, not an excuse to postpone prepared candidates.

## P83 operator correction — a switcher, not a restriction

**I must be able to switch back and forth easily.** The approved canonical master is an initial suggestion for Indeed, **not a forced permanent default**. EscapeHatch must present existing approved, owner-bound reusable master/domain résumés in one private selector and let me choose the current one for the verified account-wide platform slot. I can change domains again or return to master whenever I want. No one-job timer, forced rollback, automatic queue-wide master promotion or artificial approval ceremony for unchanged already-reviewed résumé content. A real account-wide upload still needs one clear user-authorized selection because it replaces the shared platform copy.

**Product API already available:** `listApprovedResumeChoices(graph, platformSlotId)` presents the eligible options and current selection; `resolveUserSelectedResume(graph, {platformSlotId,resumeId})` plans `KEEP_CURRENT` or `UPLOAD_REQUIRES_CONSENT`. **EH-R1 host wiring (this checkout):** private owner-bound store `artifacts/escape-hatch/resume-selection-store.ts`, managed-assist routes `/resume-selection`, `/resume-selection/register`, `/resume-selection/select`, `/resume-selection/provider-readback`, UI `ResumePlatformSwitcher` on Assist, and Indeed attach/prepare preference for the current selected PDF. Still verify actual provider account-slot readback after a live switch; do not infer Indeed acceptance from a local choice. The operator may continue to use the selected domain résumé for multiple jobs. No automatic reset after a job, crash, or abort.

**Indeed-native vs external ATS:** A job discovered on Indeed may redirect into a separate employer ATS; determine the actual provider account/slot scope and use the matching adapter, without treating it as an Indeed-global mutation. Tailor external-ATS materials when genuinely required; obtain review for newly written custom artifacts, not for an unchanged already approved résumé. The master remains a source of career facts, not a restriction on choosing which approved résumé to submit.

**Targeted failure handling:** If an upload or readback fails, mark that exact account slot unknown/pending and show the next action. Do **not** lock the whole Indeed application queue, block unrelated sites, or secretly overwrite a current selection. A further mutation *of that uncertain slot* needs readback/repair first; other eligible application preparation continues.

**Human safety boundaries:** The operator controls account-wide upload authorization, employer sign-in, MFA/CAPTCHA, sensitive/legal/EEO declarations, unknown employer effects, attestations, and final Submit under existing repo governance. A résumé switch should be a quick choice in the product, not a requirement to supervise every otherwise routine application.

**Outcome truth:** `PREPARED` ≠ `REVIEW_READY` ≠ `SUBMITTED`; only actual employer acceptance can advance the original tracker to Applied. Distinguish talent community and recruiter actions from a job submission. No duplicate applications.

## Sources and controls — resolve privately

- Load the **existing private** Career Agent Start Here index first; its current master Google Doc, Career Impact Bank (initiative and functional leadership), current Career Search Operating Profile, original Job Application Tracker, and opportunity-bound reviewed documents are independent source roles. Never commit their opaque IDs, real profile, private question answers or materialized document bytes to this public repository.
- The canonical master is the career facts source for generated derivatives, not the only allowed Indeed submission résumé; the public ParallaxPort resume is a published projection, not authoritative for exact active applicant document revision. A stale cached PDF or older local résumé must not outrank a fresher approved source.
- Read `contracts/resume-presentation.v1.json`, `contracts/career-claim-fidelity.v1.json`, `harness/contracts/career-artifact-propagation.v1.json`, `harness/contracts/resume-selection-graph.v1.json`, and `contracts/application-journey-scenes.v1.json`. Preserve factual current project-delivery ownership and separately evidenced historical team-leadership scale; do not generalize or erase approved achievements.
- `artifacts/escape-hatch/src/lib/resume-selection-graph.ts` and its tests own pure selection logic; `artifacts/escape-hatch/opportunity-documents.ts` owns exact private PDF hashes/review binding; `artifacts/escape-hatch/browser-assist-control.ts`, `managed-preparation-driver.ts` and `application-autopilot-executor.ts` own form progression. `scripts/windows/EscapeHatch-Prepare-Application.ps1` and `EscapeHatch-CompleteApplication.ps1` are established host adapters; use only their documented, verified safety contract. The local authenticated host—not this GitHub handoff—owns installed browser and private tracker evidence.
- Respect separately owned open PRs, especially the existing Indeed text-only adapter #139 and live application handoff #197. Inspect new head/base/checks before mutating or integrating them. Do not steal their mutation surfaces.
- Never use Gmail, Contacts, contact-directory connectors, exported login secrets, unbounded browser clicking, a new parallel applicant database, arbitrary app-port process termination or a second mutable repo checkout.

## P83 product correction, harness guard and regression acceptance

The previous P01 harness installed an arbitrary fixed-master default, one-job domain switch, compulsory restoration and whole-queue lock. Those are **superseded by operator-directed switching** in `harness/contracts/resume-selection-graph.v1.json`; the prior stronger security protections remain. P83 repairs the graph runtime with `resolveUserSelectedResume` and `listApprovedResumeChoices`, adds regressions, and directs local agents to wire the choice into the existing UI/browser adapter.

**Acceptance:** choose master → domain → different domain → master freely; verified chosen domain remains active for unrelated Indeed roles; job-domain scoring never overrides it; no implicit restore at application completion or abort; a failed upload cannot claim the wrong résumé as live but doesn't stop unrelated work; choices are scoped to real applicant, approved/current source, actual account slot and safe upload consent. External ATS custom artifact review is separate; final Submit stays operator-only.

**P08 required:** Local Windows managed Chrome proves the real applicant sees an interactive resume selector, can select multiple approved candidate versions, performs a consented actual Indeed replacement, reads back the selected file, switches to another and back, and continues other appropriate work after a reversible failure. Pure tests/contract edits and merged GitHub commits do **not** prove that path.

**Validation sequence on selected local repo:**
```powershell
git fetch --all --prune --tags
git status --short
python scripts/validate_resume_selection_graph.py
node --experimental-strip-types --test artifacts/escape-hatch/src/lib/resume-selection-graph.test.ts
python scripts/validate_career_artifact_propagation.py
python scripts/validate_career_claim_fidelity.py
python scripts/validate_resume_presentation.py
python scripts/validate_application_autofill_parent.py
python scripts/validate_application_journey.py
npm --prefix artifacts/escape-hatch run test:managed-assist
```
If installed dependencies make a command unavailable, report the failed executable gate and repair only after preserving user state. `git diff --check`, typecheck, build, focused ATS/extension tests and repository promotion gates apply to product code modifications. Actual browser/platform acceptance is separate from local/synthetic tests.

## P04 runtime partition and handoff receipt

- `CURRENT_CHAT_RUNTIME` + GitHub/Google Drive connector: source/controller/contracts/PR inspection, P01 public-safe harness edits, machine-readable P04 handoff, provider readback. **Not** Windows shell, installed private workspace, authenticated employer browser or employer-facing submit.
- `LOCAL_AGENT_RUNTIME`: R0–R4 local checkout, isolated worktree(s), installed source, actual private documents, verified PDF rendering, managed Chrome actions, runtime tests and private opportunity receipts.
- `OPERATOR_OR_PHYSICAL_RUNTIME`: one-time explicit custom artifact review, account-wide résumé-selection authorization, employer login/MFA/CAPTCHA, protected declarations and final Submit. No continuous user supervision for routine preparation.
- `CI_OR_REMOTE_RUNNER`: synthetic checks for committed source; does not prove user/browser/application acceptance.
- The sibling run-scoped P04 manifest is `Outputs/prompt-parallel-dispatch/runs/escapehatch-master-resume-routing-20261105/manifest.json`. It is a **portable unexecuted dispatch description**, not proof of spawned agents or a validated canonical TokenCorridor receipt. Resolve the actual local runner/schema before dispatch; if unsupported, perform reachable safe single-writer work and report degraded parallel proof honestly.

**Provider evidence floor at authorship:** GitHub `main` was `4b3f84f3866498cf174944825b074b0b8dce63db` prior to this isolated handoff branch. Active sibling PRs #139 and #197 open. These are observations, not frozen authority. The active Windows installation, private tracker current row, exact approved PDF hash, account-wide Indeed slot and real employer form have not been observed from this provider session.

**Report contract: CHANGED | PROVED | NEXT.** Per actual opportunity list current source revision, original tracker state, actual browser phase, files chosen, review/consent requirement (if any), precise missing field, private checkpoint pointer and exact next action. For the repository list modified files, targeted tests, commit SHA, PR/merge state, installed/live observation independently, and the first unproven Issue #69 gate. Private details belong in the private workspace, never public GitHub.

**First local-agent command:**
```powershell
$repo = & .\scripts\resolve_repo.ps1 -ResolveOnly
git -C $repo fetch --all --prune --tags
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'Status-EscapeHatch.ps1')
```
Then use the selected installed source's documented `Launch-EscapeHatch.cmd` only when ownership-safe, and begin R0/R3 real application preparation rather than asking the operator to relaunch historical fixtures.
