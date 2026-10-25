# Guided application workbench

## Boundary and owners

Sprint: guided-application-workbench-20261025. Base: `9cc71711fb8152ea869ba2530a06f88b7ef4949a` on refreshed `origin/main`. Single writer: `codex/guided-application-workbench-20261025` in an isolated worktree. The original dirty education checkout and PR #95's workspace recovery, installation and tracker owners are preserved.

Outcome: first launch gives applicants an actionable sources → opportunity → application journey. Sources accepts reviewed career facts before an opportunity exists. Drag and chooser share intake. Application Assist puts the selected job first and assembles its observed employer prompts alongside private document review.

Owned: guided-start, artifact-dropzone, application-puzzle, application-requirements; existing source approval, PDF intake, minimal App/Assist layout, narrow-screen file/milestone fixes, test port selection, tests and this evidence/registry. Forbidden: private source inputs, real applications, résumé generation, employer submission, notifications, Windows recovery/install/provider work, destructive cleanup, governance or dispatch-runner replacement.

Release classification: compatible user-visible feature (`minor`). The canonical `scripts/product_version.py bump --change minor` generator advances `VERSION` to 1.1.0, synchronizes `browser/application-assist/manifest.json`, and records `CHANGELOG.md`. No release tag/publication is claimed by this source mutation.

Provider CI exposed a release-fixture dependency on the real repository version: the temporary 1.0.0 mirror test monkeypatched a module constant, while a default argument still read the real VERSION (now 1.1.0). The bounded test repair passes the temporary workspace's version explicitly to mirror check/sync; production release policy and generator are unchanged. Validation: `python tests/test_product_version.py` and `python scripts/validate_product_version.py`.

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

Pass 4 (bounded stability repair): the broad browser run produced 88 pass, 1 skip, 1 failure in answer edit validation, reproduced on the candidate. Three ordinary unchanged-mainline repeats passed, so they did not establish causality. A held-validation-frame experiment then reproduced focus theft on unchanged `9cc7171` for both answer and opportunity forms: after an invalid submit, the delayed focus callback moved focus away from the user's next edit. Reused exact existing opening-focus repair `0293c991b567bb993efa8b2c168a15a2ed860c9a` from PR #95 with `git cherry-pick -x` (local dependency commit `8de5e86`), preserving attribution and leaving that PR's recovery/install/tracker work untouched. Removed the separate delayed validation-focus callbacks because their inputs already exist at submit time. Retained deterministic opening and validation regressions plus original edit-clear, Escape and return-focus controls. Baseline comparison used an isolated detached checkout, shared dependency junction and untracked test-only port config; no baseline product source was modified.

Pass 5 (regression correction): a subsequent broad run found repeated recovery activation could hit Close after synchronous opening focus. Default dialogs now focus a neutral dialog target before paint, with forward/reverse Tab trapping; explicit initial-focus callers retain their target. Existing repeated Enter/Space recovery assertions remain unchanged. Exact-deadline helper timeouts were isolated to installing a global deadline before a locator refocus could detach the expired button. The helper now freezes Date.now in the native click capture, presses the already-focused keyboard target, and asserts the actual target/time before retaining all deadline-denial assertions. Production expiry policy/listeners remain unchanged. These opening/validation/repeated-key/deadline/return-focus controls passed 28 executions (two repetitions) without retries; typecheck and build passed.

Final UI candidate `8e4f4140be3440b6f38ab5f8fc01a3218aea6d47`: full local Playwright run (`--workers=3`) passed 94, skipped 1 (existing obsolete MV3 popup harness), failed 0. The actual loopback middleware, source-first drop/review persistence, exact-job/PDF reset, automatic form-action refresh, mobile dark/reduced-motion checks, focus and recovery paths passed. Hosted browser CI on that head also passed. Earlier exact-runtime unit evidence: 41 unit, 19 workbench and 52 managed-assist tests passed. Build emits a chunk-size advisory; it is not a runtime performance measurement.

Integration repair: the required-check manifest names Career State Validation for every main candidate, but its PR path filter omitted this UI change. Extend only that existing trigger to all PRs targeting main and retain push filters; `tests/test_repository_promotion.py` prevents omission from recurring. Validation: `python tests/test_repository_promotion.py`, career-state/claim-fidelity/artifact-propagation validators, harness, and observed exact-head provider checks. Local `promotion_guard.py check` defaults to demonstration outcomes without a token; its local READY is **not provider readiness proof**. Read actual workflow conclusions, PR head/base, review threads and merge state directly before accepting integration. The missing canonical dispatch runner remains separately blocked.

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
npm run test:browser -- tests/application-requirements-control.spec.ts tests/validation-focus.spec.ts
```

From the repository root:

```powershell
python scripts/validate_governance.py
python scripts/validate_harness.py
git diff --check
```

Browser fixtures use synthetic identities only. Tests cover real DOM inspection and source persistence; managed launch/document UI responses are simulated, with real private-document-store tests proving digest/review behavior separately. Screenshots and browser outputs are disposable local evidence, never public personal artifacts.

`tests/application-requirements-control.spec.ts` additionally exercises the actual managed plugin over real loopback HTTP with an isolated browser page and synthetic runtime identity: cross-origin POST 403, wrong opportunity 422, matching inventory 200, unchanged DOM. The seeded session avoids real browser accounts and does not certify the Windows launcher.

At the source checkpoint, remaining gates were exact-head CI and repository promotion (current outcomes belong to PR #96 and its final report). Windows bootstrap/recovery integration through PR #95's independent owner, real employer widgets/multipage coverage and exact-requisition opportunity-watch freshness remain outside this local proof. The supplied Opportunity Watch patch was inspected but not applied: polling/notifications are a distinct lane and cannot stand in for live vacancy evidence here.

## Changed-file report

Feature and bounded stability ownership, relative to this repository root:

- `.gitignore`
- `.github/workflows/career-state.yml`
- `ARTIFACT_REGISTRY.md`
- `CHANGELOG.md`
- `VERSION`
- `browser/application-assist/manifest.json` (canonical generated version mirror only)
- `Outputs/prompt-parallel-dispatch/manifest.json`
- `harness/CODEBASE_MAP.md`
- `tests/test_product_version.py`
- `tests/test_repository_promotion.py`
- `docs/GUIDED_APPLICATION_WORKBENCH.md`
- `artifacts/escape-hatch/application-requirements.ts`
- `artifacts/escape-hatch/browser-assist-control.ts`
- `artifacts/escape-hatch/package.json`
- `artifacts/escape-hatch/playwright.config.ts`
- `artifacts/escape-hatch/tsconfig.json`
- `artifacts/escape-hatch/src/App.tsx`
- `artifacts/escape-hatch/src/index.css`
- `artifacts/escape-hatch/src/components/application-puzzle.tsx`
- `artifacts/escape-hatch/src/components/artifact-dropzone.tsx`
- `artifacts/escape-hatch/src/components/career-records.tsx`
- `artifacts/escape-hatch/src/components/guided-start.tsx`
- `artifacts/escape-hatch/src/components/managed-browser-assist.tsx`
- `artifacts/escape-hatch/src/components/opportunity-documents.tsx`
- `artifacts/escape-hatch/src/components/sources-page.tsx`
- `artifacts/escape-hatch/src/lib/application-puzzle.ts`
- `artifacts/escape-hatch/src/lib/application-puzzle.test.ts`
- `artifacts/escape-hatch/src/lib/source-bridge.ts`
- `artifacts/escape-hatch/src/lib/source-bridge.test.ts`
- `artifacts/escape-hatch/tests/application-requirements-control.spec.ts`
- `artifacts/escape-hatch/tests/application-workbench.spec.ts`
- `artifacts/escape-hatch/tests/persistence.spec.ts` (attributed opening-focus regressions and atomic native deadline-activation proof)
- `artifacts/escape-hatch/tests/validation-focus.spec.ts`
