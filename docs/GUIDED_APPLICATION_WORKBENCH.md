# Guided application workbench

## Boundary and owners

Sprint: guided-application-workbench-20261025. Base: `9cc71711fb8152ea869ba2530a06f88b7ef4949a` on refreshed `origin/main`. Single writer: `codex/guided-application-workbench-20261025` in an isolated worktree. The original dirty education checkout and PR #95's workspace recovery, installation and tracker owners are preserved.

Outcome: first launch gives applicants an actionable sources → opportunity → application journey. Sources accepts reviewed career facts before an opportunity exists. Drag and chooser share intake. Application Assist puts the selected job first and assembles its observed employer prompts alongside private document review.

Owned: guided-start, artifact-dropzone, application-puzzle, application-requirements; existing source approval, PDF intake, minimal App/Assist layout, narrow-screen file/milestone fixes, test port selection, tests and this evidence/registry. Forbidden: private source inputs, real applications, résumé generation, employer submission, notifications, Windows recovery/install/provider work, destructive cleanup, governance or dispatch-runner replacement.

Release classification: compatible user-visible feature (`minor`). The canonical `scripts/product_version.py bump --change minor` generator advances `VERSION` to 1.1.0, synchronizes `browser/application-assist/manifest.json`, and records `CHANGELOG.md`. No release tag/publication is claimed by this source mutation.

Existing `source-bridge.ts` owns claim provenance/revision validation and atomic persistence. Existing private opportunity-document store owns exact PDF digests and review. No puzzle storage or alternate approval authority is introduced. A blank opportunity means profile-only review; nonempty missing/closed IDs still fail.

## Design decision

Audience: applicants assembling a specific employer application. Primary job: make the next artifact or answer evident without pretending a decorative score measures readiness.

Preserve the established palette and fonts: paper `#f6f3ee`, ink `#1b3037`, teal `#2a6f65`, muted slate `#667c85`, coral `#e29a7a`; Manrope UI, Newsreader headings, existing DM Mono metadata. Left-aligned guidance uses an actual three-step sequence. Distinct employer prompts form a responsive work board; file boxes respond to drag and focus. No new fonts, animation library, copied assets or third-party code.

Bounded registry references (methods only; no code/asset license inferred):

- `impeccable`: hierarchy and deliberate second-pass critique.
- `UP-A85AD9DC3`: explicit state and next action instead of decorative progress.
- `UP-60FBA76B5`: reduced motion and keyboard parity.

Uniqueness review retained the existing EscapeHatch visual system rather than installing a new theme. Mobile critique removed excessive nested padding and put policy detail behind a labelled disclosure. Motion changes only the drop target's border/background in response to input; reduced motion disables transitions.

## Behavior and proof boundaries

`/__escapehatch/managed-assist/requirements` is an operator-origin-protected POST using the existing managed-runtime gate. It reads the already launched page without navigation, filling, preference recording or submission. Scope binds opportunity ID, launched URL, origin, path/subpath and exact query. Changed page URL during capture fails. Labels are returned, answers are reduced to a population/validity boolean; passwords and hidden/disabled inputs are excluded. Visually hidden upload inputs require a visible associated label. Native radio population is resolved within form/root/name groups.

Inventory is **current-page only**, expires after five minutes and resets on selection changes. At most 200 supported controls are listed. Unrecognized widgets, iframes, unseen/later pages and requisition availability remain unverified. Native required/ARIA evidence distinguishes required, optional and unknown. A saved file, reviewed digest, populated employer input and accepted employer upload are separate states. No inventory or score authorizes preparation or final Submit. The existing preparation policy remains authoritative.

Inspection refreshes after explicit managed form actions; a manual Inspect control handles changes made directly in the employer browser. Source/file controls cannot start launch/prepare/attach merely by displaying the puzzle. Existing review-off preparation behavior is preserved; review-off never fabricates exact-file review.

PDF intake and responses invalidate stale generations, including selection round trips. A newer drop supersedes an older pending file read. The chooser and drag path preserve source/PDF validation, explicit review, and private persistence. Multiple files are rejected with a recovery message.

## Prototype, measurement and refinement

P08 baseline: canonical Vite/Playwright entrypoint on an isolated port exercised existing chooser → explicit approval → reload and empty-source rejection: 2 browser tests passed. Standard port 21031 was occupied; no existing process was stopped. `PLAYWRIGHT_PORT` supplies an isolated port while retaining the canonical config. This is disposable Chromium proof, not installed Windows/real employer proof.

P82 hypothesis: removing the incidental job dependency lets a new applicant save selected source facts from the first guide step without inventing a job or binding. Comparator: baseline source approval requires a job. Boundary: source-first intake plus one employer-specific workbench. Measurement: actual UI drop/chooser, no write before approval, profile persistence after reload, zero bindings, exact job scoping, required/optional/unknown and stale evidence tests. Decision: retain only if this path works and existing job-bound source and managed-document regressions pass.

Pass 1: integrated source-first review, shared drop input, guide, scoped inspection and puzzle; deterministic checks passed. Browser suite retained 16 existing/new paths but exposed 320px overflow. Pass 2: fixed overflow, query scope, radio population, hidden future uploads, pending file-read ordering and canonical test-key use. Reviewed desktop light and mobile dark screenshots. Pass 3: automatic inspection refresh after explicit managed actions, then rerun focused and broader gates. Candidate is functional integrated UI; full employer/Windows certification remains outside this proof.

Parallel graph width: 2 (primary implementation + independent read-only evidence/diff review). Adapter: native `collaboration.spawn_agent`, then `followup_task`; no worker mutations or merges. Review returned the query/radio/hidden-upload/race/test-key findings repaired above. Primary owns rejoin validation. `Outputs/prompt-parallel-dispatch/manifest.json` records the lanes. The canonical schema and `scripts/prompt_parallel_dispatch.py` are absent; the attempted validation failed with file-not-found. Standardized manifest/receipt verification is **UNPROVEN**, not a clean parallel-contract pass. The existing blocked dispatch artifact records the same harness-owner dependency; this feature does not create a competing runner.

## Reproduce validation

From `artifacts/escape-hatch`:

```powershell
npm run typecheck
npm run build
npm run test:workbench
npm run test:unit
npm run test:managed-assist
$env:PLAYWRIGHT_PORT = '21141'
npm run test:browser -- tests/application-workbench.spec.ts tests/sources.spec.ts tests/managed-browser-assist.spec.ts
```

From the repository root:

```powershell
python scripts/validate_governance.py
python scripts/validate_harness.py
git diff --check
```

Browser fixtures use synthetic identities only. Tests cover real DOM inspection and source persistence; managed launch/document UI responses are simulated, with real private-document-store tests proving digest/review behavior separately. Screenshots and browser outputs are disposable local evidence, never public personal artifacts.

`tests/application-requirements-control.spec.ts` additionally exercises the actual managed plugin over real loopback HTTP with an isolated browser page and synthetic runtime identity: cross-origin POST 403, wrong opportunity 422, matching inventory 200, unchanged DOM. The seeded session avoids real browser accounts and does not certify the Windows launcher.

Remaining gates: exact-head CI and repository promotion, Windows bootstrap/recovery integration through PR #95's independent owner, real employer widgets/multipage coverage and exact-requisition opportunity-watch freshness. The supplied Opportunity Watch patch was inspected but not applied: polling/notifications are a distinct lane and cannot stand in for live vacancy evidence here.
