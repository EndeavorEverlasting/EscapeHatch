# P04 — Secure cross-device applicant preference sync

**Parent:** #69. **Mission:** desktop, laptop, and Android phone reuse one applicant's approved answers (including Cognizant talent-community values) without reentry. **Canonical owner:** existing OS-private EscapeHatch preference writer, never a competing cloud profile.

**Status:** PR #184 is an unverified cryptographic foundation, NOT active sync. Preserve the existing Cognizant submitted job and accepted talent-community enrollment. No real applicant values, passwords, MFA, tokens, browser cookies, legal/EEO data or device consent flags in GitHub or the transport.

## Launch order — execute in repository

1. **EH-S0 · read/verify floor:** identify installed EscapeHatch checkout, owner-bound workspace, worktrees, current main, open PRs and local preference file. Read `AGENTS.md`, `docs/agent/P04_PRIVATE_APPLICATION_ANSWER_SYNC_2026-10-27.md`, `harness/contracts/application-preference-cache.v1.json`, `docs/agent/EMPLOYER_PROFILE_MILESTONES_2026-11-03.md`; preserve active/private state. No fixture replacement.
2. **EH-S1 · crypto/transaction writer:** finish `private-sync-crypto.ts`, `private-sync-carrier.ts`, `private-sync-chain.ts`, `private-sync-device.ts`; add a guarded CLI, bound files/JSON, handle missing first folder, test wrong key/tamper/replay/forks, crash and concurrent local edits. All local preference writes use existing `updatePreferences` lock. Raw key file is prototype ONLY: protect with Windows DPAPI and Android Keystore before enabling live sync.
3. **EH-S2A · cloud carrier** and **EH-S2B · Android pairing**, parallel only after S1 in separate worktrees. 2A: user-granted minimum-scope Google Drive/private carrier, ciphertext-only, exact principal/object, ETag/CAS, offline queue, errors, revoke; no ChatGPT token reuse. 2B: Android AES-GCM/HKDF same versioned envelope, JCA test vectors, QR/SAS pairing, Keystore protection, real companion UI; no automatic employer-browser actions.
4. **EH-S3 · UI/host integration:** connect existing saved-answer view (PR #179) to real observed provider status: LOCAL_ONLY / PAIRING_REQUIRED / SYNCING / SYNCED / OFFLINE / CONFLICT / AUTH_REQUIRED / REVOKED. Preserve user- and opportunity-scoped privacy, unknown taxonomy IDs, and unsaved edits. Never silently merge divergent concurrent corrections or globally sync consent.
5. **EH-S4 · Trifecta P08/P82/P07 certification:** after secure implementation, check two Windows devices plus one real Android phone (3/3), encrypted provider readback, exact three saved Cognizant values and timestamps, offline conflict with no lost edits, restart/revocation/wrong owner, and unchanged submitted Cognizant job. Run parent #69 validators, managed-assist tests, typecheck, build, Android compile and known-good application control. No terminal Submit.
6. **EH-S5 · P04 dispatch handoff:** register executable isolated lane manifest and receipt under `Outputs/prompt-parallel-dispatch/runs/`; run available real local harness/CI adapters (not simulated parallelism), reconcile PRs, merge only after review and exact-head green; report CODE / CI / MERGED / INSTALLED / PROVIDER / DEVICE states distinctly.

## Hard security gates

Only approved reusable `profile_preference` values may enter the encrypted capsule; provider receives authenticated ciphertext and opaque metadata. The 256-bit vault secret must be transferred solely by explicit device pairing, never as a cloud file, command argument, environment log, or Git content. Wrong account, vault, parent hash, AEAD tag, stale remote revision, concurrent offline branch or rollback => fail closed, preserve local last-known-good. Compromise of an unlocked paired device can expose its data; support key rotation and explain limits of remote revocation.

**Current proof ceiling:** this ChatGPT/GitHub writer can inspect and commit public source, but cannot access the user's local private values, Windows credential store, Android unlock or Google Drive OAuth selected for the app. Do not claim device sync from a GitHub PR.

**First local commands:** `git fetch --all --prune`; `git worktree list`; `git status --short`; `node --experimental-strip-types --test artifacts/escape-hatch/private-sync-crypto.test.ts`; `npm --prefix artifacts/escape-hatch run test:managed-assist`; `npm --prefix artifacts/escape-hatch run typecheck`; `python scripts/validate_application_autofill_parent.py`; `python scripts/validate_application_journey.py`.

**Closeout:** CHANGED | PROVED | NEXT; enumerate actual device readbacks, provider account/revision (private opaque reference), conflicts, OS key protection, exact commit/PR/CI and first unproven gate. Keep parent #69 open.
