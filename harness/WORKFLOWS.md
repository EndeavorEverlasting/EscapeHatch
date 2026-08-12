# EscapeHatch Operational Workflows

These workflows implement `AGENTS.md`; they do not override governance.

## Workflow selection

Use **Repository Location** for durable Windows checkout/worktree acquisition. Use **Task Pickup** for every writing sprint. Use **Application Form Intake** when application questions/pages are being mapped or automated. Use **Failure Recovery** when a required command fails. Use **Handoff** before changing owners/chats or when an external blocker stops the lane.

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

## Pre-commit validation

Required manifest floor:

```text
python scripts/validate_governance.py
python scripts/validate_application_harness.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
git diff --check
```

Also run product-specific tests for changed scope, including `python tests/test_study_guidance_export.py` when the guidance bridge changes.

Enable optional repo-local hooks with:

```text
git config core.hooksPath .githooks
```

The hooks validate isolated staged/committed snapshots through the harness validator. The harness validator invokes the application-harness contract validator, so preference/question safety is enforced without reading or printing real preference values.

## Failure Recovery

1. Stop completion claims.
2. Preserve the failing command and salient non-sensitive output.
3. Determine whether failure is inside owned scope.
4. Repair the smallest owned surface and rerun the failing check first.
5. If outside scope, name owner/dependency and the exact advancing action.
6. For an unknown application question, do not guess; map it through the application-form workflow.
7. For stale legal/current answers, require a new session confirmation rather than silently reusing cache.
8. For an attestation boundary, require operator action.
9. If durable repository work landed in temporary storage, preserve unique/dirty work and reacquire through the resolver before cleanup.
10. Never weaken validators, force-push, or expand scope silently.
11. Rerun the complete declared validation order after repair.

## Artifact discipline

- Tracked canonical artifacts have one owner path.
- Generated/runtime artifacts must be registered before reliance.
- Resolve paths through the registry/manifest/owning producer.
- Durable Windows repo paths come from `scripts/resolve_repo.ps1`.
- Real application preference data is user-owned browser-local state and is never a tracked repository artifact.
- Sanitized question text/aliases may be tracked only when selected answers are absent.
- Schemas/manifests/contracts require explicit versions.
- Do not commit secrets, credentials, caches, personal browser state, transient evidence, or generated junk.

## Handoff

A handoff includes repo/branch, sprint/lane, scope, files/artifacts, validators/results, skipped checks, proof ceiling, commit SHA, push/PR state, gaps/risks, preserved parallel work, and one exact next command.

For application-form work also include canonical question IDs added/reused, alias changes, privacy/freshness policy, unresolved questions, and whether live browser proof was observed. Never include saved personal preference values.

On Windows, advancing commands that require a checkout/worktree must resolve the durable `Desktop\Dev` root.

## Product-runtime introduction gate

A product runtime must register real source/config entry points, build/test/deploy commands, durable outputs, focused validation, and applicable Lua constraints before runtime proof is claimed.

Application automation must additionally preserve the harness boundaries: semantic/order-independent question matching, user-owned clearable preference state, unknown-question fail-closed behavior, no inferred sensitive values, current legal confirmations, and manual certification/attestation.
