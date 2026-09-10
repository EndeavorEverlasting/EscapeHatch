# EscapeHatch Operational Workflows

These workflows implement `AGENTS.md`; they do not override governance.

## Workflow selection

Use **Repository Location** for durable Windows checkout/worktree acquisition. Use **Task Pickup** for every writing sprint. Use **Application Form Intake** when application questions/pages are being mapped or automated. Use **Application Companion** when an installable/local client records career/application progress or synchronizes user-owned state. Use **Failure Recovery** when a required command fails. Use **Handoff** before changing owners/chats or when an external blocker stops the lane.

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

## Pre-commit validation

Required manifest floor:

```text
python scripts/validate_governance.py
python scripts/validate_application_harness.py
python scripts/validate_application_companion.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
git diff --check
```

Also run product-specific tests for changed scope, including `python tests/test_study_guidance_export.py` when the guidance bridge changes.

Enable optional repo-local hooks with:

```text
git config core.hooksPath .githooks
```

The hooks validate isolated staged/committed snapshots through the harness validator. The harness validator invokes both application-harness and companion contract validators, so preference/question and local-first privacy/sync boundaries are enforced without reading or printing real user state.

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
11. If durable repository work landed in temporary storage, preserve unique/dirty work and reacquire through the resolver before cleanup.
12. Never weaken validators, force-push, or expand scope silently.
13. Rerun the complete declared validation order after repair.

## Artifact discipline

- Tracked canonical artifacts have one owner path.
- Generated/runtime artifacts must be registered before reliance.
- Resolve paths through the registry/manifest/owning producer.
- Durable Windows repo paths come from `scripts/resolve_repo.ps1`.
- Real application preferences and career/application state are user-owned local data and never tracked repository artifacts.
- Distribution artifacts must not seed real user profiles, application answers, resume content, provider tokens, or credentials.
- Sanitized question text/aliases and synthetic companion fixtures may be tracked only when real selected answers/user state are absent.
- A Google Drive synchronized copy remains user-owned and private unless the user separately changes Drive sharing; public sharing is not a product requirement.
- Schemas/manifests/contracts require explicit versions.
- Do not commit secrets, credentials, caches, personal browser state, transient evidence, or generated junk.

## Handoff

A handoff includes repo/branch, sprint/lane, scope, files/artifacts, validators/results, skipped checks, proof ceiling, commit SHA, push/PR state, gaps/risks, preserved parallel work, and one exact next command.

For application-form work also include canonical question IDs added/reused, alias changes, privacy/freshness policy, unresolved questions, and whether live browser proof was observed. Never include saved personal preference values.

For companion work also include surface(s) exercised, career-state revision/identity handling, progress evidence source, sync authorization state, conflict disposition, and whether Google Drive/store/local-web runtime proof was actually observed. Never include provider credentials or real profile/application content in handoff prose.

On Windows, advancing commands that require a checkout/worktree must resolve the durable `Desktop\Dev` root.

## Product-runtime introduction gate

A product runtime must register real source/config entry points, build/test/deploy commands, durable outputs, focused validation, and applicable Lua constraints before runtime proof is claimed.

Application automation must additionally preserve the harness boundaries: semantic/order-independent question matching, user-owned clearable preference state, unknown-question fail-closed behavior, no inferred sensitive values, current legal confirmations, and manual certification/attestation.

A companion runtime must additionally preserve `contracts/application-companion.v1.json`: local-first private state, no public-host requirement, distribution/state separation, explicit optional Drive synchronization, divergence preservation, provider-independent export/import, no profile/application-content telemetry, and user-owned submission/attestation boundaries. Store packaging, live OAuth, cross-device sync, and live local-web/browser behavior require their own observed runtime proof before those claims are made.
