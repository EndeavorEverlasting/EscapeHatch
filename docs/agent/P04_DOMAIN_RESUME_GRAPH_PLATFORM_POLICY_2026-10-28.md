# P00 + P01 + P04 — Domain Resume Graph and Platform Persistence Contract

**Parent**: [EscapeHatch application preparation #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69). Governance: `AGENTS.md`. Workflow owner: `harness/WORKFLOWS.md`. Existing provenance owner: `harness/contracts/career-artifact-propagation.v1.json` (no replacement). Presentation owner: `contracts/resume-presentation.v1.json`. Job-specific derivative work in the concurrently open PR #115 is independently owned; reconcile its accepted release guards and do not overwrite it.

## Why a graph, not a folder convention

A platform may keep one user-wide uploaded resume, reuse it on multiple applications, or let an upload be isolated to a single application. An operator reporting an unexpected global overwrite is sufficient reason for a **fail-closed policy**, but does not license assuming every vendor/version behaves the same. Model that persistence scope as *observed*, with unknown the safe default.

Graph snapshot (per applicant owner, not shared across users):

- `resume(canonical)` -> approved `resume(domain)` -> optional `resume(job)` via typed `derives_from` edges carrying the source content digest.
- `resume(job)` -> `opportunity` via `targets_opportunity`.
- `platform_slot` -> the actual observed account-wide or isolated `resume` via `slot_points_to`.
- `application` -> the exact version used via `application_uses`; prior submission does not change when a later master is updated.
- Domain names/tags are open and overlapping: IT, management, construction logistics, healthcare delivery, people operations, software/AI and future variants. Tag/multi-domain weights come from reviewed job descriptions, not from title guesses.
- Source/provenance and approvals are distinct: a synthesized job-specific prose transformation cannot create missing qualifications.

Graph is a versioned acyclic dependency network with hashed file/parent fingerprints. Per-owner isolation, acyclic derivations, unique job targets and stale source detection are enforced in `artifacts/escape-hatch/src/lib/resume-selection-graph.ts`. Selected domain score is a sum of tagged opportunity weights; ties require review instead of a random winner. Unknown platform scope cannot select or upload. Persistent-global chooses only an approved domain or canonical master; an isolated application may use its approved job-specific derivative. Both return explicit `UPLOAD_REQUIRES_CONSENT` instead of uploading. `KEEP_CURRENT` is the only no-op success.

A separate variance trigger remains `V=1-Σ(w_i×c_i)/Σw_i` on complete reviewed requisition requirements; it determines whether *writing a derivative* is warranted, never whether a shared platform résumé may be silently replaced. Domain selection and application-specific writing are two distinct questions.

## P04 execution graph, ownership, and proof

**Phase 0 [CURRENT_CHAT_RUNTIME + GitHub provider] — product graph and harness policy:** P00 governance, P01 contract/validator/workflow/registry, product resolver and synthetic tests; run exact CI and integrate. Owner: this PR's single writer. No personal applicant data in public repo or fixtures.

**Phase 1a [LOCAL_AGENT_RUNTIME, isolated writer] — persistence and UI:** extend existing private `OpportunityDocumentStore` / career-state owner with saved graph revisions, user-consented slot scope evidence, compare-and-set updates, and private artifact IDs. UI should show `Career Master` → reusable domain master → job derivative → platform slot, the current applied choice and whether changing it affects other applications. Reuse current scene graph rather than making a second queue. Preserve user-approved source documents. Must be tested with two applicants and two developers to forbid context crossover.

**Phase 1b [LOCAL_AGENT_RUNTIME, separate writer] — provider adapters:** attach graph resolution to the existing managed browser `forCurrentEmployerForm` / `forUpload` path and profile answer/attachment planner. Verify actual Indeed persistence on a consented test application; do not swap a shared default. Adapt ZipRecruiter/Glassdoor/custom ATS only after observing exact per-platform behavior. Unknown provider defaults to review; keep all final Submit, legal/EEO controls with operator. Keep PR #130 submission outcome owner separate. This lane may begin adapter analysis in parallel with 1a, but runtime mutation of the shared file binder waits for the state API.

**Phase 2 [P08 actual Windows + provider proof] — end-to-end:** safely refresh existing canonical installed checkout, verify the launch/extension identity, one multi-page Indeed SmartApply flow, preserve the account-wide résumé across unrelated applications, verify selected domain résumé, then test a separately isolated custom ATS and an additional job-board form. Observe actual employer confirmation only following operator Submit.

**Phase 3 [P07 integration]** — exact-head tests, protected original ATS flow, provider branch merge, local installed-build readback, account-slot readback and application receipt. Report `authored`, `tested`, `merged`, `installed`, `observed` separately. A synthetic test is not a platform overwrite proof.

## Machine-triggered validation and continuation

- `python scripts/validate_resume_selection_graph.py`
- `node --experimental-strip-types --test artifacts/escape-hatch/src/lib/resume-selection-graph.test.ts`
- `python scripts/validate_career_artifact_propagation.py`
- `python scripts/validate_application_autofill_parent.py`
- `python scripts/validate_application_journey.py`
- Existing `Career State Validation` CI must run the first two before merge.
- P04 manifest: `Outputs/prompt-parallel-dispatch/runs/escapehatch-resume-graph-20261028/manifest.json`. This is a run-scoped graph of successors; no canonical parallel dispatch runner/receipt has been validated in EscapeHatch. Do not claim local agents launched or the parent completed.
- Missing gate after this PR: actual private graph persistence and browser upload call-site wiring with real platform observed scope. **Do not handwave by writing another generic plan; implement the owner path, tests and consent boundaries in the existing checkout.**

**Current proof ceiling:** verified repository source + synthetic CI only. No private Drive domain-master artifacts were created by this branch; no applicant profile was modified; no external job platform uploaded anything.
