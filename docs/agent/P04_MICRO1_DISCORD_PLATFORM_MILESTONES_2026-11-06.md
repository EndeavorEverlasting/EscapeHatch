# P04 — micro1 certified talent, Discord and multi-platform milestones

Date: 2026-11-06. Parent: [EscapeHatch #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69). Discord work owner: [#204](https://github.com/EndeavorEverlasting/EscapeHatch/issues/204).

## Verified operator-provided source

A saved October 30 micro1 message titled **Your Next Steps with micro1** confirms certification, reports an active talent profile, offers matching against certified skills, and directs the operator to **https://talent.micro1.ai/dashboard?discord=join** for an exclusive community. This is a **partner portal**, NOT a direct Discord invite. The email and screenshots DO NOT prove Discord membership, a new application, or a live role match. Never commit the operator's name, address, personal certificate URL, raw message, cookies or auth material.

Use `python scripts/import_micro1_milestone_eml.py --input "<private .eml path>"` with the already-provided private EML on the Windows host. The importer is offline/read-only, yields a sanitized digest and separate states, and never invokes Gmail/Contacts. `reportedDkimPass` is only a header claim and not independently verified cryptography.

## Unlimited independent milestones, not a fixed three-checkbox funnel

The existing connected Google Sheet `Applications` has: A job Applied; AS Internal Platform Submitted; AT Discord Community Joined. They must remain independent. Additional opportunities can involve certification, eligibility, skills, interviews, matching, contractor onboarding, training or legal acknowledgments. Treat each as independently scoped evidence with identity and date; do not add an automatic inference that completing one means all are done. Do not count locally stored candidate answers or a visible link as accepted employer responses. A checked AT field needs a separate real membership receipt in the private host proof store. Blank means not assessed.

For the micro1 email: **certification SOURCE_CONFIRMED; talent profile SOURCE_REPORTED_ACTIVE; community NOT_VERIFIED; role matching SOURCE_REPORTED_PENDING; further application NOT_ASSESSED.** Preserve micro1 job/interview submissions separately, with no reapplication.

## Source changed in this sprint

- `artifacts/escape-hatch/src/lib/discord-community-flow.ts` + focused tests: partner vs Discord URL allowlists; stages for partner login, invite discovery, Discord login, consent, screening and actual membership; exact opportunity/user/guild/session identity and freshness; no self-bots, automated joins or terminal Submit.
- `src/lib/discord-membership-verifier.ts` + tests: read-only official Discord OAuth2 `identify` and `guilds.members.read` endpoints (`/users/@me`, `/users/@me/guilds/{guild.id}/member`), exact user+guild binding, 48-KiB bounded responses, 8-second timeout, pending-screening check and no token in proof. Host must supply an explicitly consented OAuth access token and verified guild ID; no OAuth client credentials are included in the repository.
- `scripts/import_micro1_milestone_eml.py` + unittest: extract source-grounded states locally without mailbox access, PII in output, or generic link-clicking.
- `scripts/windows/EscapeHatch-Discord-Bootstrap.ps1`: optional status, expressly approved install and operator-initiated official portal/invite opening. Discord desktop installation is NOT required for a browser join. Never run foreground launch as a silent cron action.
- `scripts/windows/EscapeHatch-micro1-community.ps1`: one-shot partner-dashboard launch through the **existing managed EscapeHatch Chrome session**, without requiring the operator to reenter an unrelated submitted job URL. Status read is side-effect free; Prepare needs explicit user initiation and preserves active submission listeners.
- `tracker-refresh.ts`, `src/lib/tracker-bridge.ts`, `tracker-refresh.test.ts`, `src/App.tsx`: expand read-only projection through AT; leave job submission writer's A:AJ/36-column write authority unchanged. Add independent cockpit statuses.
- `artifacts/escape-hatch/package.json` and `.github/workflows/harness.yml`: register TypeScript unit tests, Python importer tests, and Windows PowerShell AST/consent guard tests.

## Execute next: local agent P04 with P08/P82/P07

1. Refresh actual origin/main/branch/open PR state, preserve dirty work and active browser. Read `AGENTS.md`, `harness/WORKFLOWS.md`, `ARTIFACT_REGISTRY.md`, `docs/agent/TRIFECTA.md`, `docs/agent/P04_ZERO_FRICTION_APPLICATION_EXECUTION_2026-10-20.md`, `contracts/application-journey-scenes.v1.json`, `harness/contracts/application-autofill-parent.v1.json`, parent #69 and issue #204. Do not restart an in-progress employer session.
2. Use existing private account and opportunity binding to import the already-supplied EML into the canonical private host evidence owner; no second answer store. Open the real micro1 Talent dashboard via existing managed Chrome entrypoint; if login appears, hand over password/MFA/CAPTCHA to operator and wait for authenticated stable same-origin return. Do not scrape Discord or employer credentials.
3. From authenticated micro1 portal, inspect `Join Discord` CTA to resolve the *actual* server identity. Do not treat a click, redirect or OAuth callback as joined. Obtain explicit consent to that named server; let normal Discord UI handle it or use supported approved OAuth2/bot API with correct scopes and permissions; never automate normal-user/self-bot actions. If membership screening is pending, do not call complete.
4. Require host-trusted fresh exact user/guild/session/opportunity membership readback. Store minimal receipt only in private `%LOCALAPPDATA%\\EscapeHatch\\proof`. On verified join, use a dedicated AT-column writeback, check original Sheet readback, and update the cockpit. Do NOT let job submission sync touch AS/AT.
5. Return to the exact existing job/application controller; re-inspect employer origin, current approved answers, document SHA, required/dynamic controls, privacy and legal gates, and protected final button. The user has requested potential conditional auto-submit, but that is **not** authorized by a confident prediction or Discord consent: requires separately explicit opportunity-scoped approved authority and its own guarded tests. The current doctrine retains operator-only terminal Submit.
6. Run synthetic plus app regression tests and local installed Windows P08: verify the new portal flow, trusted guild membership, old Cognizant employer enrollment and earlier application submission interlocks. Merge only exact validated head with required CI/reviews, then test installed copy. Record clear written/validated/merged/installed/live proof dimensions.

### Exact validation commands

```sh
cd artifacts/escape-hatch
node --experimental-strip-types --test src/lib/discord-community-flow.test.ts src/lib/discord-membership-verifier.test.ts
npm run test:tracker
npm run test:unit
npm run typecheck
npm run build
cd ../..
python -m unittest discover -s scripts -p 'test_import_micro1_milestone_eml.py' -v
powershell -NoProfile -File tests/windows/Test-EscapeHatch-Discord-Bootstrap.ps1 # Windows runner only
python scripts/validate_application_journey.py
python scripts/validate_application_autofill_parent.py
git diff --check
```

P04 factoring: Windows bootstrap, managed Chrome authentication, community membership provider bridge, app-controller handback, private proof/ledger, tracker projection and independent milestone writer, and P08 Windows live certification each have distinct owners. Parallel writers require separate worktrees and real manifest/receipt evidence; chat synthesis is not dispatch proof.

**Proof ceiling:** The email supports only its claims; isolated TypeScript/Python unit tests support synthetic behavior; connected Google Sheet readback supports AT column; GitHub commits prove branch source. Neither CI nor a branch/PR proves Discord login/join, installed Windows behavior, micro1 matching or employer application Submit. Preserve this repository handoff so the next agent can act without making the operator repeat the message.
