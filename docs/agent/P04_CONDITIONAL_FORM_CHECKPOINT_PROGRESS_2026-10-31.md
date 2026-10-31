# P04 + P08 → P82 → P07 — Conditional form requirements and evidence-bound checkpoint progress

## Operator objective and provenance (2026-10-31)

The operator approved the **exact role-specific résumé content** for an active private application and asked that application progress respond to the actual employer questionnaire rather than an assumed list of documents. A cover letter is **not** automatically required, present, approved, or relevant. This is an additive parent outcome under [EscapeHatch #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69); the existing document review hash gates, submission observer, ATS source binding, and protected final Submit are unchanged.

**Private source owner:** the user's existing native Google application tracker and exact role-specific Google Doc, which carry the revision-specific operator approval in their private notes. Retrieve through the operator-authorized Drive source and the stable opportunity identity. Never publish personal document IDs, actual résumé content, private user details or employer-session data into a public repository. The Google Docs approval is **not proof** that the user's installed EscapeHatch already contains the corresponding per-PDF SHA-256 review seal; the local agent must verify PDF parity and record the correct owner-bound hash without re-asking for the same editorial decision.

**Parent intent:** preserve a successful original form submission separately from any post-submission questionnaire; never retry ambiguously submitted applications until local and ATS receipt recovery has been exhausted. Maintain event/outbox/Google tracker readback proof and never infer employer acceptance from merely clicking Submit.

## Current implementation: evidence-bound current-page fraction

Owners: `artifacts/escape-hatch/application-requirements.ts` (current DOM inventory), `src/lib/application-puzzle.ts` (pure projection), `src/components/application-puzzle.tsx` (UI), `src/lib/materials-review-status.ts` (version review policy), `contracts/managed-browser-progression.v1.json` (navigation/Submit boundary).

When inspecting an **identity-bound, fresh live employer page**, compute:
- `eligible = COUNT(visible and classified required inputs)`.
- `verified = COUNT(eligible inputs whose values/attachments pass current DOM readback)`.
- `checkpoint_percent = round(100 * verified / eligible)` **only** when eligible is positive and no current-page input has unknown requiredness; otherwise it is **unavailable**.
- Optional and absent controls contribute **no** denominator term.
- A newly revealed required cover-letter file input contributes one required term and must be supported by an approved matching PDF before any verified attachment count. A required *text* interest response is a question, not a cover-letter file requirement.
- A hidden/removed conditional control is not counted in a fresh inspection; an unknown control or a stale, wrong-job, changed-page, or five-minute-expired inspection never earns a numerical estimate.
- `wholeApplicationPercent = null` until an independent, trusted, complete sequence inventory and final review evidence establish the true questionnaire shape. A current-page `100%` is **not** an application completion claim.

P82 synthetic comparator: two filled required inputs → observed 2/2 = 100%. Reveal empty required cover-letter input → 2/3 = 67%. Mark it optional or hide it → 2/2 = 100%. If cover requiredness is unknown → display no percent. In **all** cases whole-application completion remains UNKNOWN. Inputs are not employer acceptance; final Submit is never automated.

## Trifecta and execution placement

| Lane | Host | Owned scope | Concrete proof / acceptance |
| --- | --- | --- | --- |
| P08 Live Runtime Proof Executor | LOCAL_AGENT_RUNTIME on operator's owned Windows browser; not this GitHub provider | Reuse current authenticated same-job browser session, verify source revision/PDF hash review seal, inspect current and conditional questionnaire controls, read back post-fill and post-navigation state; identify hidden/required/optional cover-letter file or text response separately | Actual DOM controls, stable opportunity binding, observed after-change percentage, appropriate no-letter path; record private evidence, capture blocker and actual ATS receipt/outbox state. No unapproved final Submit |
| P82 Prototype–Measure–Refine | CI_OR_REMOTE_RUNNER for synthetic fixtures; later LOCAL_AGENT_RUNTIME for actual employer | Compare exact same known-required fields with absent/optional/required/hidden/unknown cover input; simulate SPA dynamic changes and protected answers | Report verified denominator, numerator, percentage/null, unresolved classification, regression against prior no-letter path; do not relabel a synthetic browser check as live employer proof |
| P07 Repo Sprint Executor | CURRENT_CHAT_RUNTIME using authenticated GitHub for code, CI_OR_REMOTE_RUNNER for checks | Integrate narrow pure projection/UI and tests without editing separately owned PRs, run exact-head CI, converge to default branch if gates pass | Commit SHA, CI results, actual merge and default-branch readback. The user application still requires local P08 |
| P04 Factoring and convergence | CURRENT_CHAT_RUNTIME for provider evidence, LOCAL_AGENT_RUNTIME for true host actions | Maintain parent Issue #69, identify branch collision with pre-application checkpoint PR #147 and application-materials graph PR #138, preserve later integration authority and private Drive owner | Recovered exact parent/branch state; no child agent or live runtime claimed launched unless a real adapter receipt exists |

**No duplicate checkpoint store.** The separately owned, still-open PR #147 has a cross-section `application-progress-checkpoint.ts` engine with section count and whole-application safety rules; integrate its model only after resolving PR ownership/conflicts and proving observed section inventories. This bounded change augments the already-shipped *current-page* projection; it does not silently replace PR #147, synthesize full-form counts from click history, or create a new profile or database.

## Immediate P08 local acceptance run

1. Read `AGENTS.md`, this handoff, `docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md`, parent Issue #69, current source `main`, open overlapping PRs, and existing dirty work/worktrees. Do not overwrite another writer; run repository-owned Windows runtime `Status` before any launcher or update.
2. Load the exact authorized private original tracker and role résumé, preserve operator approval of that **source revision**, confirm the PDF derivative matches, and establish the SHA-bound local review seal in the correct opportunity. Do not invent a cover-letter artifact.
3. Before reopening a form or retrying an application, inspect the private local submission receipt/outbox and employer session. If an authentic job-bound receipt exists, synchronize/read back the tracker instead of reapplying. If unresolved, keep `Verify Submission`.
4. Use only the actual selected managed browser/form, start with current-page inspection, then respond to conditional inputs without inventing qualifications, answers, privacy consent or artifact availability. For a missing cover-letter field, no cover letter is required *for this observed page*, not necessarily the whole application.
5. At every permitted post-autofill checkpoint, re-inspect; verify updated `checkpoint.percent` / `coverLetter` and unknown-future-page disclosure. For a newly required cover letter, stop to create a draft and obtain revision-specific operator review before staging; a freeform interest field follows its own source-backed answer policy.
6. Record actual operator-visible status, page/section source IDs, form-side acceptance, discovered requirements, eligible/verified counts and any genuinely known section total, and the next actionable step. Operator retains terminal Submit, legal attestations, CAPTCHA/MFA and sensitive declarations. Preserve the original tracked opportunity throughout.
7. Run relevant local validation `python scripts/validate_application_autofill_parent.py`, `python scripts/validate_application_journey.py`, `npm --prefix artifacts/escape-hatch run test:unit` (or repo-verified equivalent), and browser tests under approved launcher; report exact command/results. CI success never proves local Windows/actual employer flow.

## Exit criteria and proof ceilings

**Repository-ready** = conditional progress UI and tests validated on exact head, merged `main`, no private data in Git. **Locally certified** = observed user-owned Windows browser form at the correct origin with conditional cover controls and post-fill checkpoint readback, including protected no-cover regression. **Employer certified** = separate confirmed employer acceptance and job-bound receipt→private tracker readback; never inferred from projection or browser automation success.

Until the actual last page and trusted terminal review are observed, do not display a whole-job 100% claim. The progress estimate **must** change when the form reveals or hides required fields, while preserving the immutable previous employer submission record independently of post-submission additional questions.
