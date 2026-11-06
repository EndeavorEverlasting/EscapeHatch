# P04 / P01 — Current master résumé and real-application execution handoff

**Status:** Provider-side P01 harness correction and P04 handoff, November 5–6, 2026. **Execution target:** actual installed EscapeHatch on the operator's Windows host. **Parent:** [Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) and `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`. This document supplements, never replaces, `AGENTS.md`, `docs/agent/P04_OPERATOR_LIGHT_APPLICATION_SPRINT_2026-10-27.md`, `docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md`, and the existing browser/controller/receipt owners.

## LAUNCH ORDER — execute real work, not a planning-only exercise

1. **EH-R0 — Recovery and exact source/version binding.** On the actual Windows installation, identify its selected source and private applicant/workspace. Refresh Git provider/default branch, all active worktrees, PR ownership, runtime/21031 state, and the original private tracker. Resolve the private Career Agent Start Here index, its current Google Docs master résumé and Career Impact Bank. Confirm the approved source digest/revision and generate or recover the same approved ATS-conservative PDF. Do not use the public ParallaxPort résumé HTML as the private editable master or assume a website deploy has delivered private ATS PDF bytes.
2. **EH-R3 — Operator-light applications, up to three real candidates.** Execute against the existing managed Chrome application controller and *unsubmitted* tracker opportunities immediately when they are usable; prioritize existing advanced, fresh, strong-fit roles and skip applied/closed/uncertain submissions. For a pure Indeed-native application, use the approved **canonical master as-is**, without re-requesting resume review merely because the next job differs. Bind its exact approved revision/digest and opportunity/account ownership. Use the existing private answer memory. Fill readback-verified allowed fields, advance only trusted nonterminal controls, checkpoint manual gates, and move to the next candidate without waiting for the operator. Never claim submitted without employer confirmation proof.
3. **EH-R1 — P07 implementation: Indeed default-and-restore integration.** In a separate isolated worktree, wire the **existing** `harness/contracts/resume-selection-graph.v1.json` policy to existing resume graph, opportunity PDF store and trusted managed browser call sites, with tests. Avoid parallel writers on browser controller and the active live browser. Preserve the current user session while making changes; synthetic proof must precede live P08 checks.
4. **EH-R2 — P07 implementation: non-Indeed custom artifact lane.** In a disjoint isolated worktree, use existing career-state, claim fidelity, artifact propagation and document-generation owners. For external employer ATS/custom forms, derive exact opportunity-bound résumé/cover/CV only when required. Prepare private artifacts and their preview/readback. **Review newly custom-tailored artifacts before employer attachment**; do not ask for another review of unchanged approved master content. This lane can develop alongside R1 only while file mutation ownership remains disjoint.
5. **EH-R4 — Converge / P08 / P07.** Validate targeted and existing parent gates at exact current head, inspect PR collisions and CI, integrate authorized verified code, update the installed selected runtime safely, then observe the real Indeed account slot (and one unrelated external ATS). Read back resume selection, application-step state, protected final-submit control, private tracker receipts and restoration success. Record tested/merged/installed/live/employer status independently. Parent #69 remains open until conjunctive gates are demonstrated.

The first runtime path in R0/R3 is **real application work**, not a request to rebuild architecture before touching jobs. R1/R2 are durable regression-prevention consumers, not an excuse to postpone prepared candidates.

## Operator decision — precise, no added friction

**Ordinary Indeed-native application:** the user's current approved **canonical master résumé** is the stable Indeed account-wide default. No role-domain scoring, opportunity change or array order may silently replace it with a tailored résumé. If the verified account-wide slot already contains that exact approved master, `KEEP_CURRENT`, select the job, and keep working. Do not ask the operator to approve the *same master* for every Indeed opening; a new source revision needs a real exact-PDF readback/validation, not arbitrary copy edits or repeated discretionary polishing.

**Exception: a deliberately chosen temporary domain switch.** The operator authorizes **one specific alternative domain résumé and its later restoration to the pinned master** in one informed decision. Before changing the account-wide slot, verify exact applicant/account identity, observed global-slot semantics, approved candidate digest, canonical master digest and the bound opportunity. Save a **private** restoration checkpoint. Attach the temporary approved domain résumé, verify platform readback, work that one bound application, and then **restore the canonical master and verify its actual presence**. Restoration applies even on abort, cancellation, another employer blocker or interrupted session. The original switch approval can authorize this exact restoration; do not create a redundant second approval request. A new candidate, changed master digest or different account requires new authorization. If authenticated restoration cannot be verified, hold further Indeed applications and surface the single precise repair gate; do not say the master is restored merely because an upload click returned.

**Indeed discovery vs Indeed-native:** a job listing on Indeed that redirects to a company's separate ATS is *not* an Indeed account-wide resume slot. Use observed company ATS upload semantics; if a unique custom application document is required, prepare it privately and request one opportunity-specific artifact review. An existing reviewed exact-URL/hash packet may be reused without re-editing it; unchanged facts do not need another content-polish cycle.

**Human gates already in the parent** remain separate from document review: employer account sign-in, MFA/CAPTCHA, legal/EEO/sensitive declarations, unknown page effects, final Submit and attestations stay operator-controlled until the existing higher-authority governance is deliberately changed. The user can be away while the agent prepares multiple applications to the highest safely proven checkpoint. No silent auto-submit or fake application status. Routine saved answers and nonterminal steps should not create extra human gates.

**Outcome truth:** `PREPARED` is not `REVIEW_READY`; `REVIEW_READY` is not `SUBMITTED`; submitted job, talent community enrollment and recruiter communication are different ledgers. After actual employer submission, only exact accepted receipt permits tracker writeback to `Applied`. Don't duplicate a completed or ambiguous requisition.

## Sources and controls — resolve privately

- Load the **existing private** Career Agent Start Here index first; its current master Google Doc, Career Impact Bank (initiative and functional leadership), current Career Search Operating Profile, original Job Application Tracker, and opportunity-bound reviewed documents are independent source roles. Never commit their opaque IDs, real profile, private question answers or materialized document bytes to this public repository.
- The master is source-of-truth for general Indeed submissions; the public ParallaxPort resume is a published projection, not authoritative for exact active applicant document revision. A stale cached PDF or older local résumé must not outrank a fresher approved source.
- Read `contracts/resume-presentation.v1.json`, `contracts/career-claim-fidelity.v1.json`, `harness/contracts/career-artifact-propagation.v1.json`, `harness/contracts/resume-selection-graph.v1.json`, and `contracts/application-journey-scenes.v1.json`. Preserve measured functional ownership in current TogaTech leadership and the distinct former team scale; do not generalize or erase approved achievements.
- `artifacts/escape-hatch/src/lib/resume-selection-graph.ts` and its tests own pure selection logic; `artifacts/escape-hatch/opportunity-documents.ts` owns exact private PDF hashes/review binding; `artifacts/escape-hatch/browser-assist-control.ts`, `managed-preparation-driver.ts` and `application-autopilot-executor.ts` own form progression. `scripts/windows/EscapeHatch-Prepare-Application.ps1` and `EscapeHatch-CompleteApplication.ps1` are established host adapters; use only their documented, verified safety contract. The local authenticated host—not this GitHub handoff—owns installed browser and private tracker evidence.
- Respect separately owned open PRs, especially the existing Indeed text-only adapter #139 and live application handoff #197. Inspect new head/base/checks before mutating or integrating them. Do not steal their mutation surfaces.
- Never use Gmail, Contacts, contact-directory connectors, exported login secrets, unbounded browser clicking, a new parallel applicant database, arbitrary app-port process termination or a second mutable repo checkout.

## P01 harness implementation boundary and tests

**Harness edits on this branch:** extend the existing résumé-selection graph **contract** and `scripts/validate_resume_selection_graph.py`; route the existing `harness/WORKFLOWS.md` here. No conflicting new governance owner, no private test fixture, no product-code changes hidden in P01. The contract now describes ordinary Indeed KEEP_CURRENT, one-consent temporary switch-and-return, private checkpoint, restoration on abort/failure, verified exact account-slot readback and block-on-unproved-restore. R1 subsequently implements those invariant consumers in product code with private runtime proof.

**Regression matrix to implement and execute in R1/R2, then observe via P08:** same master + new Indeed job => no résumé swap, no repeat human review; new job with different domain score => still master; explicit approved one-job domain switch => alternate selected and master restored with browser readback; aborted/crashed switch => persisted recovery, no unrelated Indeed application until restored; unknown or unverified account slot => never silently overwrite; changed applicant identity/digest => prior switch consent invalid; Indeed listing redirected to external ATS => no Indeed-global slot mutation; custom document not approved => draft/checkpoint only; previously reviewed identical custom artifact => reuse; protected legal/final Submit => never agent-committed; submitted opportunity => never reentered; original tracker receipt corresponds to exact requisition.

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
- `OPERATOR_OR_PHYSICAL_RUNTIME`: one-time explicit custom artifact review, temporary domain-switch authorization, employer login/MFA/CAPTCHA, protected declarations and final Submit. No continuous user supervision for routine preparation.
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
