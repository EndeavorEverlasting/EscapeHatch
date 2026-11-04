# P04 — Profile Puzzle Atelier: remote-first convergence handoff

**Repository:** `EndeavorEverlasting/EscapeHatch`  
**Parent:** [#69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69), independently still OPEN (deterministic ATS preparation)  
**Design owner:** [#182](https://github.com/EndeavorEverlasting/EscapeHatch/issues/182)  
**Already merged:** [PR #183](https://github.com/EndeavorEverlasting/EscapeHatch/pull/183)  
**Observed base:** `main@a09c0224f93a7a7253d397977a1d9d0fa6364036` (refresh before any mutation).  
**Prompt:** TokenCorridor registry P04, *Repo-Aware Sprint + Harness Factoring Distributor*, current on 2026-11-03.  
**Transport:** Remote repository is the handoff. **Do not ask the operator to download, extract, paste prompts, or schedule workers.**

## Operator outcome — do not lose the parent
The profile should feel like a compelling tactile puzzle. Every reviewed résumé, career-source artifact, verified experience, approved skill, and reusable question answer can complete meaningful puzzle pieces. Missing pieces invite safe, specific work; conflicting or stale answers visibly require review. Animations and tactile transitions must be delightful, purposeful, fast, keyboard accessible, reduced-motion safe, and responsive. This profile puzzle is **not** an employer form completeness score, ATS readiness signal, approved upload, talent-community enrollment, or submission authorization.

The preceding P141 + trifecta local candidate contained: a read-only `profile-puzzle` projection, a React component/CSS, eight pure tests, a guarded patcher, and synthetic preview. The 8/8 and TypeScript PASS are **local candidate evidence only**, not this repository's integration or installed-host proof. That local ZIP is **not a dependency** for this handoff; rebuild/refine from the canonical repository owners below. Prefer the merged product spine to parallel product code.

## Fresh repository situation and supersession rule
- Current `main` already includes `src/components/profile-piece-board.tsx` mounted by `guided-start.tsx`: an interactive, keyboard-selectable **eight-slot contact board** with no personal values in tiles. Source: merged PR #183.
- PR #183 also keeps the current opportunity actionable, reduces Today chrome, and has recorded browser/CI evidence. Issue #182 comment records CI `41758938966` PASS and **disposable Vite** runtime proof at `7719db5`; installed Windows launcher on postmerge main was **not** certified.
- `src/lib/mascot-guidance.ts` defines the eight actual profile fields. `src/lib/answer-recovery.ts` owns recovery, collisions, scope and provenance; `src/components/recovered-answers.tsx` exposes `useRecoveredAnswers`. `src/lib/assist-contract.ts` owns approved/proposed `AssistProfile`; `src/lib/source-bridge.ts` owns approved source bindings. Reuse these exact owners.
- `src/lib/application-puzzle.ts` is current-employer-page scoped. It must remain independent: no whole-application percent or final-Submit authority from the profile projector.
- PR #147 (pre-application studio) and PR #152 (immersive scenes) are open and separately owned. Preserve them; review dependencies without overwriting their heads.
- Avoid a second complete `ProfilePuzzle` alongside `ProfilePieceBoard`. The **existing Today board is the canonical visual owner**. Add only the minimal read-only projection needed for new categories/states.

## Frozen projection contract for the first bounded implementation
Create a pure, read-only function `projectProfilePuzzle(input): ProfilePuzzleSnapshot`, using current owner-bound profile and recovered answers. It must never mutate saves or grant ATS permissions.
- **Piece identity:** stable semantic keys, not row order; grouping may include core contact, reviewed story, experience, education, skills, projects, reusable answers, approved career sources and reviewed role materials only if a corresponding source exists and can be distinguished.
- **Status:** `saved` only for genuinely persisted/approved matching content; `needs_review` for proposed, stale, conflicting or unaccepted content; `missing` for a known empty slot; `unmeasured` for an unavailable/not-yet-inspected source. No fabricated complete state from a stale selected proposal, employer receipt, or merely existing URL.
- **Provenance:** each status has a source owner, bounded timestamp/revision when available, and safe next action. Public logs/screenshots show labels and state, **never contact values, answer text, applicant IDs, résumé text or cloud locators**.
- **Denominator:** display `N of D verified local profile signals` only if D is a defined, current local inventory; otherwise say “coverage not measured.” A locally complete profile never means a job is ready or submitted. Do not use 95–98% résumé prevalence, 60% cover-letter prevalence, or 20% summary prevalence as per-user completion weights.
- **Boundary:** legal/EEO, employer-specific questions, user-selected account credentials, MFA/CAPTCHA, final Submit and any source approval remain in their canonical owners.
- **Safe interaction:** select a piece via keyboard/pointer/touch; inspect its own state; route to the existing edit/review surface, preserve unsaved form drafts and existing opportunity focus; never auto-fill or auto-submit by selecting a piece.

## P04 launch order and collision ownership
1. **EH-PA0 — read-only refresh/inventory and contract freeze**: verify current `origin/main`, active worktrees, PR #147/#152/#183, issue #182, exact authoritative files and installed runtime provenance. Distinguish merged CI proof from actual installed shortcut. Return current head, path ownership, and isolated worktree plan. **No package/download prerequisite.**
2. **Parallel after PA0, width 2:** **EH-PA1** pure evidence model/tests in `src/lib/profile-puzzle-projection.{ts,test.ts}`, no JSX or storage writes; **EH-PA2** adapt *existing* `profile-piece-board.tsx` / CSS / browser tests to the frozen projection interface, no parallel board, no model mutations. Use separate branches/worktrees and one writer per file.
3. **EH-PA3 — integration/convergence** after PA1+PA2: connect only required props to `GuidedStart`/Today, run unit/typecheck/build/browser and parent/scene validators; reconcile PRs and exact head, submit review and merge only with gates satisfied. Preserve protected actions and no blanket “100% ready”.
4. **EH-PA4 — P08 installed-host certificate** after exact-head source proof: launch actual installed EscapeHatch through canonical owned launcher; test empty/partial/approved/conflict/unavailable pieces on mobile/desktop, reduced motion, keyboard, an impacted old application-puzzle control, existing user-opportunity focus, and no auto-Submit. Record source version/host provenance and sanitized screenshots; do not change private user profile merely to prove a test.

**Known collision:** `ProfilePieceBoard` vs proposed new full board. PA2 exclusively owns UI changes; PA1 provides projection only. A 12-piece stand-alone prototype must not replace/duplicate the merged eight-piece board without source reconciliation and design review.

## Exact validation and negative controls
- `cd artifacts/escape-hatch && npm run typecheck && npm run test:unit && npm run build && npm run test:browser`
- `python scripts/validate_application_journey.py`
- `python scripts/validate_application_autofill_parent.py`
- `git diff --check`, exact-head CI and readback after merge.
- Negative checks: contact-only != career ready; a recovered conflicting answer never counts `saved`; an unaccepted Assist proposal never counts `saved`; an unavailable preference endpoint yields `unmeasured`; an approved source remains distinguishable from a mere candidate; opportunity-specific answer never becomes globally reusable; no private values render as tile labels; 200% zoom/320px mobile and reduced-motion path work; no duplicate boards; no regression to browser/extension startup, profile draft persistence, employer-page puzzle or operator final Submit.

## Runtime partition and dispatch integrity
Provider access: GitHub is a **provider**, not the Windows host. Planning here ran in `CURRENT_CHAT_RUNTIME`; source/test/merge in isolated repository worktrees belongs to `LOCAL_AGENT_RUNTIME` or a verified `CI_OR_REMOTE_RUNNER`; installed-app P08 requires `LOCAL_AGENT_RUNTIME` on the verified Windows installation. Local agent execution has **not** been launched by this chat.

Manifest owner: `Outputs/prompt-parallel-dispatch/runs/escapehatch-profile-puzzle-20261103/manifest.json`. The present TokenCorridor and EscapeHatch trees did **not** expose the P04 canonical `harness/contracts/prompt-parallel-dispatch.v1.json` or `scripts/prompt_parallel_dispatch.py`; the manifest cannot be called canonically schema-validated/dispatched until the owning runner/contract is resolved. This is a precisely bounded **AUTONOMY_GAP**, not an invitation for manual operator shuttle.

## Proof, preservation and next parent gate
**READ:** P04 catalog, repository governance, current issue/PR, current relevant UI and answer-recovery owners.  
**APPLIED:** durable P04 factoring and machine-readable dispatch specification in a new scoped branch.  
**OBSERVED:** PR #183 merged on `main`; CI and disposable runtime proof recorded in #182, not an installed update.  
**UNPROVEN:** expanded career/artifact/answer puzzle integration; actual agent dispatch receipt; real Windows postmerge installation and P08 certification; all nine Issue #69 parent gates remain separately open until independent end-to-end proof.

**First executable continuation:** authorized repository worker reads this doc and manifest, refreshes main, performs EH-PA0, selects a real runtime adapter, dispatches PA1/PA2 in isolated owners, integrates PA3 under validation, then performs installed-host PA4. Do not re-download the earlier package and do not invent autonomous workers.
