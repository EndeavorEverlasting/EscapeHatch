# P04 — Private application-answer persistence and cross-session synchronization

**Parent:** [EscapeHatch Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) — deterministic real ATS preparation, final Submit operator-only.
**Operator correction:** 2026-10-27. **Disposition:** P04 plan/distribution, not a claim that live synchronization exists.
**Canonical implementation owners:** `harness/contracts/application-preference-cache.v1.json`; `artifacts/escape-hatch/preference-file.ts`; `artifacts/escape-hatch/src/lib/application-preferences.ts`; `artifacts/escape-hatch/managed-answer-memory.ts`; `artifacts/escape-hatch/src/lib/answer-recovery.ts`; existing career state and managed browser. This plan does **not** create a competing answer store.

## Launch order — exact dependency graph

**Wave 0 EH-S0 (one writer):** reconcile existing persisted schema/adapter and sync truth, then extend the existing canonical contract to support private, versioned, cross-session answer changes. Reuse schema v1 compatibility; no personal data in Git. Must precede writes to consumers.

**Wave 1 parallel group {EH-S1 || EH-S2 || EH-S3}:**
- EH-S1: provider-bound private synchronization adapter, authorized Google Drive source/account binding and revision/ETag read/write, with a local-only fallback.
- EH-S2: conflict-safe local transactional merge, opportunity-scoped overrides, explicit correction/tombstone semantics, compatibility with existing v1 imports/exports.
- EH-S3: privacy/security and deterministic synthetic validation (cross-account isolation, sensitive/manual-only gates, offline/version/replay/revocation), new test files only.

**Wave 2 parallel group {EH-S4 || EH-S5} after S1+S2:**
- EH-S4: managed browser planner reads the resolved user-approved values *from the existing store* and honors actual question scope, operator edits, attestation, consent and eligibility rules.
- EH-S5: existing cockpit profile/preferences UI shows source, saved/unsaved, syncing, synced, offline, conflict, needs review; one-tap correction propagates via the same canonical store.

**Wave 3 EH-S6:** integrate exact validated branches without wiping competing work; P08 actual installed Windows process → private local store → authorized Drive carrier → restore in second authorized session/device → real ATS form pre-review. Remain OPEN if any parent gate is not proven.

**Graph width:** Wave 1 = 3 independent writing lanes once Wave 0 is accepted; Wave 2 = 2. Same-file changes remain serialized by EH-S0/EH-S6. **Current transport:** GitHub provider access inside ChatGPT, not local Windows/Chrome. **Current dispatch:** PLAN DURABLE, implementation lanes NOT launched; no local agent adapter/host execution observable here. The run-scoped manifest is adjacent to this plan. Do not misreport concurrent `Promise.all` reads or GitHub commits as local independent agents.

## Why current EscapeHatch is not yet the desired answer memory

- `application-preference-cache.v1.json` explicitly specifies `browser-local` and `remote_sync: not_required`, plus optional JSON export/import. This is a real structured local store, **not** remote sync.
- `preference-file.ts` stores validated, atomic JSON under `userDataRoot()`, migrates legacy local preferences and serializes writes. Good foundation; do not replace it with a new app database just because cross-device transport is missing.
- `application-preferences.ts` has known canonical question IDs and `confirmation_policy`; `managed-answer-memory.ts` captures a constrained subset of trusted user interactions; `answer-recovery.ts` presents a read-only reconciliation of existing owners. These should converge through the existing private preference authority, not another document, sheet or duplicated browser-local authority.
- In the real applicant workflow, earlier answers and corrections were repeatedly reconstructed through chat/Google Docs. This cannot be treated as installed application persistence.
- GitHub `main` inspected at `43de6758806539394787e409eb0a49ce5f2cc463`. PR #110 owns submission reconciliation, #112 onboarding UX, #64 old unmerged preference work, #76 old UX planning; do not absorb/overwrite their separately owned files. PR #109 is reported merged in the operator's supplied private document; refresh GitHub and local exact refs before advancing.

## Target durable record — ONE authority, scoped answer projections

The **canonical record** is the installed user's own existing preference/workspace store. Keep legacy v1 compatible. Each value should carry canonical question ID (or reviewed exact-question key), source kind, user approval/confirmation, scope (`profile_preference`, `opportunity_override`, `session_confirmation`), stable opportunity identity if scoped, revision, `updated_at`, source revision, and tombstone where deleted. Do not reinterpret a `proposed` AI answer as approved.

Stable reusable values include identity, education, explicitly confirmed citizenship/work-authorization fact, business-tool experience and live coding preference. Employer-specific previous employment, how-found channel and salary amount MUST NOT bleed into unrelated applications. Salary is a **policy** of selecting the actual verified role-specific published maximum, not a globally cached numeric amount. Final privacy consent, truth certification, signatures, voluntary EEO, and accommodation declarations are operator-only actions; an earlier visible selection is neither blanket consent nor permission to refill a later blank form.

A sync carrier contains a versioned serialized projection of this **same** owner; it is not an independent editable user profile. Files in Google Drive are transport/backup, never the canonical application model. Google Docs are historical readable audit/import sources only.

## Transport, privacy, account binding, concurrency

1. Resolve and use existing locally authorized Google access or a user-selected private synced location. Preferred direct Google Drive implementation: user-granted minimum `drive.file` access to an exact owned JSON object or an appropriately assessed app-data scope, not broad Drive or the ChatGPT connector credentials. Bind account principal + stable provider file ID. Never infer auth from a visible Drive link.
2. Bootstrap from local store and current selected sync source, review discrepancies, and only then write cloud. A live, nonempty current user store must never be overwritten with a synthetic/blank/older snapshot.
3. Use HTTPS/provider auth, private permissions, atomic local writes, remote ETag/revision conditional write, bounded retries, and optimistic compare-and-swap. Never use time-only last-write-wins to overwrite simultaneous divergent corrections. Surface exact conflicts for operator resolution and record revisions. Offline edits remain queued with durable dirty/sync status.
4. Protect access: per-user account isolation, explicit disconnect/revoke, no cross-account fallback, no published data, no real values in logs/CI/issues/PRs/fixtures. Do not sync credentials, MFA/OTP, authorization tokens or protected EEO responses automatically. Keep local private paths outside Git and treat Drive account access as distinct from the local user.
5. Backup/export is an optional user action. Sync must happen on normal app read/update/restart without asking for Google Doc transcription, JSON copy/paste, local-agent intervention or manual file shuttling.

## Acceptance contract — observable, conjunctive

A. **Presence and provenance:** app starts with actual installed profile; readback proves current local user store, known question IDs, version and correction provenance. Empty fixture identity must not silently replace it.

B. **First sync:** user chooses/authorizes one private carrier; local values are written to an exact verified account-bound object and read back with provider revision. UI identifies source and sync status without exposing values publicly.

C. **Second session:** a distinct authorized browser session or device reads the same carrier and finds the same approved values without re-entry; not a downloaded manually imported JSON test.

D. **Conflict/recovery:** conflicting edits or deletions on devices A/B do not vanish. Test concurrency, stale revision, offline/reconnect, invalid schema, truncated source, provider auth expiry/revocation, and preserving last-good state.

E. **Scope:** second employer inherits reusable facts but **not** Magnet salary amount, prior employment or recruitment source. User corrections supersede stale candidates; answer data carries `approved/proposed/manual_only` authority.

F. **Browser consumer:** actual ATS application reads resolved values and verifies DOM/radio/multiselect/file state; operator-only consent and final Submit remain untouched.

G. **Lifecycle:** app restart/update/uninstall preserves selected private source and local answers; deletion requires explicit user control. Synced != submitted. Last-sync timestamp and `SYNCED / UNSYNCED / OFFLINE / CONFLICT / AUTH_REQUIRED` statuses reflect observed provider state.

H. **Security:** no private applicant bytes appear in public repository, CI logs, telemetry, synthetic fixtures or unapproved providers.

I. **Parent:** rerun application parent, journey, managed assist, typecheck, build, privacy and P08 real Windows proof. An isolated module test or PR is not installed/real-application acceptance. Report every remaining Issue #69 gate honestly.

## Ownership, collisions and exact commands

| Lane | Primary owner / mutation | Forbidden | Proof gate |
|---|---|---|---|
| EH-S0 | existing preference cache contract + one assigned schema owner | new second store | canonical & compatible parser |
| EH-S1 | new Google Drive/private carrier adapter + focused tests | `preference-file.ts`, UI, OAuth secrets | authenticated exact-file read/write revision |
| EH-S2 | `preference-file.ts` transaction/merge + scoped records | provider adapter/UX | conflict-safe local revision/idempotency |
| EH-S3 | isolated sanitized fixtures / validators | production storage writes | negative test matrix |
| EH-S4 | `managed-form.ts`, approved-answers hydration | page submit automation, owner S5 components | employer-side field readback |
| EH-S5 | existing application-preferences component | S4 managed browser and PR #112 files | reliable sync state and correction UX |
| EH-S6 | integration + P08 on installed host | dirty/foreign worktrees, process 21033 | two-session private sync + real pre-submit |

**Current protected overlap:** PR #110 changes browser and submission reconciliation; #112 changes onboarding/branding; #64 remains a historically unmerged preference branch. Freshly inspect all PR heads, Git status/worktrees and installed source before editing overlaps. Preserve active browser and user answers. No app-ready claim from public provider access.

**First execution on the installed Windows host (after reading its AGENTS.md):**
```powershell
git fetch --all --prune --tags
git status --short
git worktree list
python scripts/validate_application_autofill_parent.py
python scripts/validate_application_journey.py
```
Then launch the earliest dependency-ready EH-S0 ownership-safe sprint from an isolated worktree. After integration, validate `cd artifacts/escape-hatch && npm run test:managed-assist && npm run typecheck && npm run build`, followed by P08 actual installed profile → cloud source → restored profile → real form review.

**Proof ceiling 2026-10-27:** provider-main code/contract inspection and durable implementation routing only. No direct local Windows process, Google OAuth inside EscapeHatch, private remote storage write/readback, second-device access, or live ATS runtime was observed by this chat. The privately generated v1 JSON from this same conversation is a **migration/backup candidate**, not live sync nor a new canonical store. Do not publish its values to Git.
