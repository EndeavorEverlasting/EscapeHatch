# EscapeHatch Operational Workflows

These workflows implement `AGENTS.md`; they do not override governance.

## Workflow selection

Use **Repository Location** for durable Windows checkout/worktree acquisition. Use **Task Pickup** for every writing sprint. Use **Application Form Intake** when application questions/pages are being mapped or automated. Use **Application Companion** when an installable/local client records career/application progress or synchronizes user-owned state. Use **Application Assist Session** when operating the browser extension control loop that fills deterministic allowed fields on a live application. Use **Resume Presentation** whenever an agent creates, refreshes, tailors, exports, or synchronizes a resume/CV. Use **Product Release Versioning** when establishing, bumping, tagging, or auditing the human-facing product release identity. Use **Repository Promotion** when advancing an exact validated candidate through the provider-bound promotion pipeline to an authorized merge/tag/deployment. Use **Failure Recovery** when a required command fails. Use **Handoff** before changing owners/chats or when an external blocker stops the lane.

## Repository Location

On Windows, durable repository state belongs under `Desktop\Dev`. The canonical resolver is `scripts/resolve_repo.ps1`.

1. Reuse an observed `Desktop\Dev` ancestor when already inside one.
2. Otherwise prefer `$HOME\Desktop\Dev`.
3. Establish the durable directory when missing.
4. Never use `%TEMP%` or `AppData\Local\Temp` as the default durable checkout/worktree location.
5. Preserve existing work. Fetch without force.
6. When the requested branch/commit cannot safely own the canonical checkout, create/reuse a clean detached worktree under the same durable root.
7. Verify origin and exact requested remote head when an expected commit is supplied.

```powershell
$DevRoot = & .\scripts\resolve_repo.ps1 -ResolveOnly
$RepoPath = & .\scripts\resolve_repo.ps1 -Branch '<branch>' -ExpectedCommit '<sha>'
```

Temporary directories remain valid for disposable validator snapshots.

## Task Pickup

1. Read `AGENTS.md`, `harness/reports/CURRENT_STATE.md`, `harness/CODEBASE_MAP.md`, `harness/manifest.v1.json`, and `ARTIFACT_REGISTRY.md`.
2. Resolve durable repository state when platform location matters.
3. Inspect current branch, relevant history, open PRs, and canonical owners.
4. Search existing helpers, contracts, validators, skills, reports, and output conventions before creating replacements.
5. Declare repo/branch, lane/mission, owned scope, forbidden scope, expected artifacts, validation commands, dependencies/collision risks, and proof ceiling.
6. Keep one writer per branch; isolate parallel lanes.
7. Make the smallest mutation that advances the mission.
8. Register new durable artifacts and update maps/workflows when authority changes.
9. Run validation in manifest order before committing.

## Application Form Intake

Application pages are modular collections of semantic questions. Employer, ATS vendor, page count, page number, and DOM order are not canonical identity.

1. Read `harness/contracts/application-form-taxonomy.v1.json`.
2. Read `harness/contracts/application-preference-cache.v1.json`.
3. Follow `harness/workflows/APPLICATION_FORM_INTAKE.md`.
4. Use `skills/application-form-mapping/SKILL.md` for unknown/reworded questions.
5. Resolve fields to canonical question IDs by semantic aliases.
6. Resolve saved state with precedence `session_confirmation` → `opportunity_override` → `profile_preference`.
7. Leave unknown or option-mismatched questions blank and surface them for mapping.
8. Never infer sensitive demographic/accommodation values.
9. Require current per-application confirmation for legal/compliance facts.
10. Keep certification/attestation manual-only.
11. Never commit real preference values, browser-local cache contents, or selected answers.
12. Validate with `python scripts/validate_application_harness.py`.

This workflow does not authorize scraping, automatic navigation, submission, or attestation.

## Application Companion

The companion is an adapter around the canonical user-owned career-state contract, not a second career database. The same state boundary must survive browser-extension, Microsoft Store, Play Store, and local-web delivery choices.

1. Read `contracts/application-companion.v1.json` and `contracts/career-state.v1.schema.json` before changing companion/runtime behavior.
2. Keep real profile, application-answer, resume, and evidence content out of tracked source and distribution bundles. Synthetic fixtures only.
3. Treat the user's local logical store as primary. A public website and public profile are optional; neither is required for normal operation.
4. A local web surface should use a stable logical/origin identity so an upgrade does not orphan browser-owned state. Do not bind state lifetime to a generated HTML path.
5. Before recording application progress, require one of the registered evidence sources: explicit user action, same-session page confirmation, or user-confirmed external evidence. Never infer status from a URL alone.
6. Validate the resulting `escapehatch-career-state/v1` state before committing a progress update, and append or link evidence with the change.
7. Do not submit an application, navigate past the submission boundary, or accept/apply certification or attestation. Those remain user actions.
8. Keep remote synchronization disabled until the user explicitly enables and authorizes it.
9. For Google Drive, sync only to a user-selected file/folder; do not store provider credentials in career state or require public sharing.
10. Compare state identity/revision before synchronization. If both sides diverged, preserve both and surface a resolution flow; never silently overwrite divergent truth.
11. Preserve explicit export/import as a provider-independent escape route. Validate imported data before replace/merge, never execute imported content, and preserve current state on an invalid import.
12. Keep profile/application-content telemetry off. Authorized sync is data portability, not permission to repurpose content as telemetry.
13. Validate with `python scripts/validate_application_companion.py`, then run the manifest validation order.

Prompt Kit portability is a donor pattern, not a runtime dependency: preserve stable local identity across upgrades, keep transfer explicit and validated, treat imported content as data, and avoid making one hosted artifact the owner of user state.

## Application Assist Session

Use the unpacked Manifest V3 extension under `browser/application-assist` for same-application assist. Do not wholesale-merge the stale autofill PR; the current-main assist contract owns the control loop.

1. Read `contracts/application-assist-session.v1.json` and `docs/APPLICATION_ASSIST_SESSION.md`.
2. Load unpacked `browser/application-assist` in Chrome or Edge developer mode.
3. Open the target application page, then **Start Assist** so the session binds to that origin.
4. Save or import only user-owned profile values in the browser; never commit real PII.
5. Choose **Fill Allowed Fields**. The runtime must build a canonical Fill Plan, pass the policy gate, and only then write the DOM.
6. Navigate pages manually. Never allow the extension to click Next/Continue or submit.
7. Use **Pause** / **Resume** across review. Cross-origin transitions must pause automatically.
8. Use **Emergency Stop** to latch cancellation of future writes.
9. Use **Undo Last Fill** only to reverse untouched EscapeHatch-inserted values.
10. After the operator manually submits, optionally **Record Confirmation Evidence** as metadata for companion progress.
11. Validate with `python tests/test_application_assist_session_contract.py` and `node tests/test_application_assist_session.mjs`.

## Resume Presentation

Resume content is user-owned private state. The repository owns the presentation contract that agents must use to avoid silently degrading a polished current resume into a generic template.

1. Read `contracts/resume-presentation.v1.json` before creating, refreshing, tailoring, exporting, or synchronizing a resume or CV.
2. Resolve the canonical private resume/source and existing current projections before creating anything. Reuse established Drive file IDs and current workspace owners instead of creating duplicate `Resume 2` files.
3. Keep real names, phone numbers, email addresses, street addresses, and resume text out of this public repository. The presentation contract and synthetic validation data may be tracked; the user's resume may not.
4. Preserve the registered ATS-conservative structure unless the user explicitly approves a different style: one column, selectable text, no sidebar, no layout tables, no text boxes, no graphical skill bars, no semantic icons, and no meaningful content hidden in headers/footers.
5. Preserve the registered visual hierarchy rather than falling back to a generic document default: Trebuchet MS for name/headline/section and title hierarchy, Arial for body copy, restrained navy/slate accents, and the contract's exact sizes/spacing/margins.
6. Do not shrink body text below the contract minimum merely to force a page count. Tighten weak wording before reducing readability.
7. For an agentic/AI-automation target lane, keep evidenced software and agentic systems visually ahead of conventional employment history. Never manufacture employment titles or turn target-lane language into fake job history.
8. Produce both DOCX and text-preserving PDF projections when the current workflow owns those outputs. Derived projections must match the canonical private content and current contact identity.
9. When replacing current Drive projections, preserve existing file IDs when possible so tracker/application references do not break.
10. Render the DOCX to page images and inspect every page for clipping, overlap, broken glyphs, spacing, hierarchy, and page balance. Run an accessibility audit when supported and verify that PDF text extraction succeeds.
11. If a tailored resume intentionally departs from the master hierarchy, record the explicit user/role reason; do not treat generic agent taste as authorization to regress the master style.
12. Validate the repository rule set with `python scripts/validate_resume_presentation.py`, then run the manifest validation order. Validation of the contract does not substitute for inspecting the actual private resume artifacts.

A resume can be ATS-conservative without being visually anonymous. The registered quality floor uses typography, whitespace, thin rules, and content hierarchy rather than parser-hostile graphics. No repository validator can guarantee universal ATS-vendor parsing, recruiter preference, or application success.

## Product Release Versioning

`VERSION` is the sole human-facing EscapeHatch product release authority. Exact freshness is the Git commit SHA (and any annotated tag that points at that commit). Schema/protocol versions stay independent.

1. Read `VERSION` and `contracts/product-release.v1.json` before claiming, bumping, or tagging a product release.
2. Classify each accepted change as `major`, `minor`, `patch`, or `none` using the contract bump matrix. Do not ask automation to invent the classification.
3. Compute the next version with `python scripts/product_version.py next --change <class> [...];` highest classification wins; repeated identical inputs are idempotent.
4. Apply a release bump with `python scripts/product_version.py bump --change <class> [...] --notes '...'` so VERSION, declared mirrors, and CHANGELOG stay synchronized.
5. Validate with `python scripts/validate_product_version.py` and `python tests/test_product_version.py`.
6. Create a Git tag only after owning validation succeeds. Dry-run with `python scripts/product_version.py tag-plan`; never reuse a released version or rewrite published tags.
7. Treat rollback as redeploying a previously tagged commit/artifact. Document withdrawn releases in CHANGELOG instead of erasing history.
8. GitHub Release creation and store submission remain downstream publication gates after repository tag identity is valid.

Docs-only, tests-only, internal tooling, generated-only, and schema-only changes default to `none` unless a mirrored product surface or user-visible installable behavior also changes.

## Repository Promotion

Promotion is provider-agnostic at the contract and bound to one concrete host adapter at runtime. The contract at `contracts/repository-promotion.v1.json` owns the validation DAG, required-check manifest, triggers, and fail-closed gates; `.github/workflows/promotion.yml` is the GitHub Actions adapter for observed host `github.com`.

1. Read `contracts/repository-promotion.v1.json` and `.github/workflows/promotion.yml` before changing promotion gates or destinations. Resolve the observed SCM host; fail closed if no adapter exists for that host.
2. Capture exact candidate identity before promotion: `head_sha` (git rev-parse HEAD), `base_sha` (PR base or merge-base), `merge_base`, `VERSION` authority, and lock/mirror identities. Every required job must be attributable to that candidate; invalidate and rerun if head/base/validator/artifact moves after proof.
3. Run the cheapest-to-strongest DAG through canonical commands — never duplicate test logic in provider YAML: `validate_governance` → compile/lint → unit (`test_product_version`, `test_repository_promotion`, `test_study_guidance_export`) → integration (`validate_application_harness`, `validate_application_companion`, `validate_resume_presentation`, `validate_career_state`) → build (`validate_harness`) → `harness-e2e` (`validate_harness`) and `application-e2e` (`test_application_assist_session_contract` + `node test_application_assist_session.mjs`) as distinct required gates → release-gate (`validate_product_version` + `tag-plan`) → promotion (guard + provider merge).
4. Keep harness E2E and application E2E distinct and report each separately. Harness E2E validates repository contracts/validators together; application E2E validates browser Fill Plan → policy gate → DOM writer. One cannot substitute for the other.
5. Query provider truth directly for the exact candidate SHA: required checks (exact names from manifest), review decision, unresolved thread count, PR state/head/base, draft, mergeability, queue eligibility. Treat missing/renamed/pending/SKIP/neutral/cancelled/timed-out as blocking. Do not infer readiness from an aggregate green badge.
6. Enforce stale-proof invalidation: immediately before mutation, re-read provider truth and compare current head/base with the proven candidate; reject on `expected_head_sha` mismatch. Never promote whatever is currently on the branch after validating an earlier SHA.
7. Use least-privilege permissions (read/validate jobs `contents:read` + `checks:read`; promote job `contents:write` + `pull-requests:write` only), serialize with `concurrency` or merge queue, and guard recursion so a bot promotion commit cannot trigger another writer. Reject unauthorized destinations even if the token could technically write.
8. Keep explicit required-check names in the tracked manifest (policy versioned). A renamed/missing check is a contract mismatch that blocks until policy is deliberately updated.
9. Prefer build-once/promote-the-same artifact; record SHA + run ID + checksum. Caches may not masquerade as fresh validation. Failed gates feed development: emit candidate SHA, failing check, artifact/log, owning surface, and proof ceiling; hand to P115 for repair but never reuse proof from a failed candidate.
10. Validate degraded-provider handling: `PROVIDER_UNAVAILABLE` / `PROVIDER_RATE_LIMITED` / `PROVIDER_PARTIAL_TRUTH` block mutation while preserving harness receipts; bounded backoff only for transient provider failures.
11. After provider merge/tag/release/deploy, refresh provider truth and verify containment: `git merge-base --is-ancestor <proven-integration-sha> origin/main` for branch integration, or artifact identity for release/deploy. A queued command is not success.
12. Validate with `python scripts/validate_repository_promotion.py`, `python tests/test_repository_promotion.py`, and `python scripts/promotion_guard.py self-test`, then the manifest order.

The durable promotion system must own the last-mile mutation via the adapter (GitHub Actions workflow + `scripts/promotion_guard.py` with `expected_head_sha` compare-and-set, idempotency, and queue fallback). A local `git merge` or branch tip is not provider promotion.

## Pre-commit validation

Required manifest floor:

```text
python scripts/validate_governance.py
python scripts/validate_product_version.py
python scripts/validate_repository_promotion.py
python scripts/validate_application_harness.py
python scripts/validate_application_companion.py
python scripts/validate_resume_presentation.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
git diff --check
```

Also run product-specific tests for changed scope, including `python tests/test_product_version.py` when versioning surfaces change and `python tests/test_study_guidance_export.py` when the guidance bridge changes.

Enable optional repo-local hooks with:

```text
git config core.hooksPath .githooks
```

The hooks validate isolated staged/committed snapshots through the harness validator. The harness validator invokes the application-harness, companion, and resume-presentation validators, so preference/question boundaries, local-first privacy/sync boundaries, and resume-presentation regression rules are enforced without reading or printing real user state.

## Failure Recovery

1. Stop completion claims.
2. Preserve the failing command and salient non-sensitive output.
3. Determine whether failure is inside owned scope.
4. Repair the smallest owned surface and rerun the failing check first.
5. If outside scope, name owner/dependency and the exact advancing action.
6. For an unknown application question, do not guess; map it through the application-form workflow.
7. For stale legal/current answers, require a new session confirmation rather than silently reusing cache.
8. For an attestation boundary, require operator action.
9. For a Drive/local divergence, preserve both state copies and create/surface conflict metadata; do not pick a winner silently.
10. For an invalid import, keep the current local state unchanged.
11. For a resume-style regression, restore the registered presentation contract first, then regenerate/recheck the private artifact rather than compensating with ad hoc formatting.
12. If durable repository work landed in temporary storage, preserve unique/dirty work and reacquire through the resolver before cleanup.
13. Never weaken validators, force-push, or expand scope silently.
14. Rerun the complete declared validation order after repair.

## Artifact discipline

- Tracked canonical artifacts have one owner path.
- Generated/runtime artifacts must be registered before reliance.
- Resolve paths through the registry/manifest/owning producer.
- Durable Windows repo paths come from `scripts/resolve_repo.ps1`.
- Real application preferences and career/application state are user-owned local data and never tracked repository artifacts.
- Real resume content and contact data are user-owned private inputs; the repository may track presentation rules but not those values.
- Current resume DOCX/PDF projections should preserve their established Drive IDs when refreshed so tracker references stay stable.
- Distribution artifacts must not seed real user profiles, application answers, resume content, provider tokens, or credentials.
- Sanitized question text/aliases and synthetic companion fixtures may be tracked only when real selected answers/user state are absent.
- A Google Drive synchronized copy remains user-owned and private unless the user separately changes Drive sharing; public sharing is not a product requirement.
- Schemas/manifests/contracts require explicit versions.
- Product release identity requires the `VERSION` authority; schema versions are not product releases.
- Do not commit secrets, credentials, caches, personal browser state, transient evidence, or generated junk.

## Handoff

A handoff includes repo/branch, sprint/lane, scope, files/artifacts, validators/results, skipped checks, proof ceiling, commit SHA, push/PR state, gaps/risks, preserved parallel work, and one exact next command.

For application-form work also include canonical question IDs added/reused, alias changes, privacy/freshness policy, unresolved questions, and whether live browser proof was observed. Never include saved personal preference values.

For companion work also include surface(s) exercised, career-state revision/identity handling, progress evidence source, sync authorization state, conflict disposition, and whether Google Drive/store/local-web runtime proof was actually observed. Never include provider credentials or real profile/application content in handoff prose.

For resume work also include the presentation-contract version, private source owner, generated/current projection identities, rendered-page QA performed, PDF text-extraction result, any explicit style override, and unresolved artifact proof. Do not paste private contact values into repository handoff prose.

On Windows, advancing commands that require a checkout/worktree must resolve the durable `Desktop\Dev` root.

## Product-runtime introduction gate

A product runtime must register real source/config entry points, build/test/deploy commands, durable outputs, focused validation, and applicable Lua constraints before runtime proof is claimed.

Application automation must additionally preserve the harness boundaries: semantic/order-independent question matching, user-owned clearable preference state, unknown-question fail-closed behavior, no inferred sensitive values, current legal confirmations, and manual certification/attestation.

A companion runtime must additionally preserve `contracts/application-companion.v1.json`: local-first private state, no public-host requirement, distribution/state separation, explicit optional Drive synchronization, divergence preservation, provider-independent export/import, no profile/application-content telemetry, and user-owned submission/attestation boundaries. Store packaging, live OAuth, cross-device sync, and live local-web/browser behavior require their own observed runtime proof before those claims are made.

A resume-generation runtime must additionally preserve `contracts/resume-presentation.v1.json`: ATS-conservative structure, registered typography/spacing/page rules, private content isolation, stable current-output identity, and actual rendered-artifact QA. Repository contract validation alone cannot certify a private DOCX/PDF that was not rendered and inspected.
