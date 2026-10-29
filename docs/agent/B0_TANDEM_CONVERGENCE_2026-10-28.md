# B0 tandem development: recognize the correct user, keep everyone's data separate

**Owner:** EscapeHatch parent [Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69), B0 from [one-download handoff](P04_ONE_DOWNLOAD_EXTENSION_AND_PRIVATE_PROFILE_BOOTSTRAP_2026-10-28.md). **Prompts invoked:** P95 (program/call-stack architect), P08 (live proof), P82 (prototype/measure/refine), P07 (execute), P04 (repo-aware parallel dispatch). **Date:** 2026-10-28.

## Coordination is the contract, not an inferred Git conflict

**Common user outcome:** when Applicant A opens the app, A's approved profile loads. Applicant B and Developer C cannot be substituted, even if they share a workstation, Chrome process, repository checkout or AI agent. If the app cannot identify the currently selected workspace from trusted local evidence, it asks for owner confirmation rather than guessing. A developer's source-code access grants no implicit applicant data access.

**This provider-side agent has chosen B0 and is actively implementing B0-C as a complementary, non-overlapping sublane.** Posted ownership notifications to [PR #134](https://github.com/EndeavorEverlasting/EscapeHatch/pull/134) and [parent #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) before implementation. The local agent can proceed independently on B0-L; it is not a competing implementation. Provider-authored branch: feat/b0-complement-extension-admission-20261028, forked from verified main 6379c4d5904de9f44fc75fdb9d9ed07ab8b84021. No developer/real applicant profile is included in public files.

| Contributor | Exact ownership | Forbidden overlap | Integration |
| --- | --- | --- | --- |
| ChatGPT / GitHub-provider writer (B0-C) | NEW src/lib/extension-profile-admission.ts, NEW src/lib/extension-profile-admission.test.mjs, this new convergence doc | Do not edit existing owner binding, workspace-file/control/bootstrap, popup, PR #132/#134 branches, live Chrome/Windows | Commit isolated prototype, give documented signature, synthetic proof and review notes |
| Local agent (B0-L) | Existing owner-binding and context-guard source on PR #132/#134 plus private workspace persistence, trusted local admission gateway, installed profile/extension bridge | Do not edit B0-C's three new files before convergence; do not copy a private applicant into Git or duplicate the owner schema | Integrate B0-C prototype only after owner binding is verified in actual runtime; own final write + readback tests |
| Integrator (one named writer once ready) | Exact-head dependency merge/rebase/cherry-pick, CI checks, P08 installed Windows/Chrome proof, parent receipts | No force/reset/foreign process termination and no claim of full auth from these synthetic tests | Release after actual same-owner and cross-owner tests, preserve parent #69 |

**Collision routing:** if an exact path/signature conflict emerges, record it in PR comments with owner, branch/head and reproduction; choose one writer, let both keep their work, and adapt the interface. Never treat a complementary PR as a conflicting user request. Never force-push or accept automatic branch absorption of active local agent code.

## P95 candidate evaluation — one selected architecture

Three materially different approaches were considered against owner isolation, friction, privacy, versioning, and Chrome extension privileges:

1. **Direct extension file scan or Chrome-profile surgery:** rejected. MV3 extension cannot legitimately read arbitrary filesystem files by default; extending its privilege or modifying another Chrome profile creates privacy and release/security risks.
2. **Ask user to export/import JSON manually:** preserves an explicit choice but violates the one-download/no-folder requirement, can become stale and can mix files if operator picks the wrong workspace. Keep as manual recovery only.
3. **Verified per-user local workspace service -> scoped owner admission -> narrow pure projection -> authorized browser pairing/write + exact readback:** selected. Reuses PR #134's owner-binding schema and existing profile field policy; minimizes new state and keeps browser privilege boundaries explicit.

Chosen runtime authority stays with the canonical private workspace. PR #134 supplies the immutable owner/session admission contract; the installed host is responsible for proving which Windows user/workspace and Chrome profile are actually selected. This B0-C module deliberately does not authenticate or establish trusted evidence. It consumes a *trusted prior admission result* and verifies equality of all scoped identities plus profile revision before projecting approved identity fields. No backend, IPC, network listener or Chrome write is introduced by B0-C.

## Exact P95 call-stack seam and ownership

Planned path to value:

    USER chooses/resumes explicitly bound private workspace
      -> installed local runtime authenticates/validates current workspace binding [B0-L]
      -> versioned authorizeAgentContext (PR #134; trusted source only) [B0-L]
      -> trusted private profile snapshot, revision and field approvals [B0-L]
      -> authenticated first-party Chrome pairing / browser context [B0-L]
      -> admitExtensionProfileProjection(...) [B0-C pure function]
      -> PROJECTION_READY | ALREADY_CURRENT | DENY(reason)
      -> existing chrome.storage.local identity projection (not implemented here) [B0-L]
      -> extension current profile + exact field/owner revision readback [B0-L/P08]
      -> user sees their approved profile, not someone else's information

**Terminal user value:** correct fields actually appear in the installed extension after preserving any divergent previously saved content. A pure PROJECTION_READY result is only an intermediate decision; it is not an installed/live completion.

**Module interface:** admitExtensionProfileProjection(input) where input includes prior owner admission decision, trusted private workspace {ownerId, workspaceId, installationId, profileRevision}, verified extension pairing {same IDs, extensionId, browserProfileId, pairingConfirmed}, source profile snapshot {same IDs, profileRevision, approvedFields, profile}, and optional existing extension-bound profile. Result: denial code (no personal values) or approved identity field subset with action PROJECTION_READY / ALREADY_CURRENT. No side effect. Only owner-approved fields in the source may pass; phone authority remains unconfirmed unless reviewed separately. Wrong-owner, missing prior admission, mismatched installation/browser, stale revision, unknown or duplicated approvals and nonempty conflicting extension data fail closed. Unknown owner and live source conflicts remain human-review states, not silent last-write-wins.

**Trusted boundary warning:** the module does not prove a caller-supplied "pairingConfirmed" boolean or owner IDs. Only a server-side owner-verified adapter may construct these arguments; no untrusted webpage/extension message may assert its own authorization. The actual transaction must recheck owner/source and revision immediately before the browser storage write to prevent owner switch between decision and side effect. This is a necessary *additional* gate beyond the pure prototype. Do not expose a network endpoint that blindly forwards untrusted input to this function.

## P82 prototype → measure → refine

**Falsifier:** one test permits a wrong applicant or developer, stale profile, changed Chrome profile, duplicate/unauthorized field or a divergent existing profile to be projected, or silently infers phone authority from presence of a phone number.

**Prototype files:**
- artifacts/escape-hatch/src/lib/extension-profile-admission.ts
- artifacts/escape-hatch/src/lib/extension-profile-admission.test.mjs

**Experiment run in isolated CURRENT_CHAT_RUNTIME scratch (not the user's workstation):**
- Command: node --experimental-strip-types --test extension-profile-admission.test.mjs
- First pass: 18/19 (one test incorrectly compared boolean false to string "false"; product rule was unaffected).
- Repaired assertion then reran: **19/19 PASS**, zero failed, no real profile read.
- Command: tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions extension-profile-admission.ts, with a **synthetic Profile type stub** reflecting main's inspected Profile fields: **PASS**. This does not replace the actual repository exact-head typecheck.
- Unit tests run against local prototype source with equivalent synthetic helper fixtures. Post-publication, GitHub provider blob readback is required; full repo CI / installed Windows proof are separate gates.

**P07 successor verification (installed local agent):**

    node --experimental-strip-types --test artifacts/escape-hatch/src/lib/extension-profile-admission.test.mjs
    npm --prefix artifacts/escape-hatch run typecheck
    npm --prefix artifacts/escape-hatch run test:unit
    npm --prefix artifacts/escape-hatch run test:bootstrap:browser
    python scripts/validate_application_autofill_parent.py
    python scripts/validate_application_journey.py

Then run an integration test with the actual PR #134 authorizeAgentContext trusted service and the extension storage writer in an isolated two-applicant/two-developer fixture. The B0-C module is not executable authentication and must not be used as a substitute for verified owner binding. The local agent should not disable or rewrite the B0-C tests to make an integration pass.

## P08 installed acceptance

In two distinct user profiles (and two developer environments as negative controls), prove:
1. Profile A preexists; current installed runtime identifies exact owner/workspace ID, source revision, selected Windows user and browser pairing.
2. The approved fields appear in extension chrome.storage.local *only after* trusted owner admission and field projection; a new-profile install with empty browser extension is supported.
3. Profile B or Developer C has a different owner; A's profile never appears in their browser; unknown or mixed binding refuses to hydrate.
4. Change owner or profile revision *between* decision and write; no stale write. Conflict preserves both copies. No real names, contact data or application notes enter logs/PR/CI.
5. Existing app event tracking, mascot, mouse mode, browser extension permissions, and manual final Submit remain unaffected.

**Status distinctions:** B0-C implementation/prototype test is not owner migration, browser pairing, app integration, merge, deployed install or live-observed proof. PR #132/#134 remains the original owner of its existing files. Parent #69 remains OPEN.

**Next exact local gate:** on the actual owner branch, make the canonical trusted admission + private workspace retrieval return the exact inputs required by admitExtensionProfileProjection, add transactional pre-write revision recheck, then run the dual-user installed extension proof. Independently, this provider writer hands over code and tests with no duplicate implementation.
