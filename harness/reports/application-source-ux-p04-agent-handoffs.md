# P04 Execution Handoffs — Integrated Google Sources and Browser Applications
2026-10-18 · **Portable fallback**, not proof of actual parallel dispatch.

## Launch order
1. **F0 — Recover repository/provider/runtime floor** (FIRST; block mutation until owned worktrees established).
2. **Parallel wave after F0:** **A1 TokenCorridor auth/read**, **B1 EscapeHatch source bridge**, **C1 EscapeHatch Sources UI**, **D1 EscapeHatch managed browser executor**. Each uses different branches and owners. If separate local agents/worktrees are not established, execute serially.
3. **I1 — Single-writer integration and convergence.**
4. **R1 — P08 real Windows user journey and second ATS archetype.**
5. **M1 — Second account/hosted readiness after actual local proof.**

## Canonical read-first (every lane)
- Main repo: `EndeavorEverlasting/EscapeHatch`. Parent `https://github.com/EndeavorEverlasting/EscapeHatch/issues/69`; canonical `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`; specific `docs/APPLICATION_SOURCE_INTEGRATED_UX_P04_P82_2026-10-18.md`; contract `harness/contracts/application-source-integration.v1.json`; machine graph `harness/reports/application-source-ux-p04-dispatch.v1.json`.
- Real PR topology at planning: #63 managed Chrome, stacked #64 preferences, #66 source locators, #75 deterministic prepare-to-review OPEN; #67/#68 merged nav classifier/fixture. TokenCorridor #73/#220 owns extant Google authorization work. Refresh this snapshot.
- P04 = repo-aware factoring/dispatch; P82 = falsifiable Prototype→Measure→Refine; P07 = bounded repo execution; P08 = live runtime proof. Resolve exact prompts from TokenCorridor's current registry, not this prose.
- **Non-negotiable:** no second candidate store, no separate standalone Google website, no credentials/PII in public Git, no repeat Cloud Console setup by default, no Chrome agent filling live form, no final Submit/attestation. Private source READ is not metadata or token readiness; a green PR is not a live product.

## PARALLEL DISPATCH MANIFEST
`harness/reports/application-source-ux-p04-dispatch.v1.json` is the repository-scoped, machine-readable dependency graph. It is explicitly `PLANNED_NOT_DISPATCHED`. Native TokenCorridor dispatcher must translate/validate against its CURRENT schema and collect execution receipts; do not claim a launch without observed actual agents/worktrees. 

---

## F0 — Floor and writers

Repo: EndeavorEverlasting/EscapeHatch. Phase: 0 / SERIAL. Sprint: integrated-source-floor-20261018. Branch: isolated from main; do not reuse dirty checkout. Owner: coordinator. Dependencies: none.
MISSION: recover both operator intent and current repo/provider/runtime truth, create a collision-free execution map, certify latest parent and P04/P82 baseline.
OWNED: only private/local sanitized floor receipt and needed integration tests in coordinator branch. FORBIDDEN: any #63/#64/#66/#75 files actively written elsewhere, real employer actions, public user data, token resets.
READ FIRST: root AGENTS.md, canonical source integration spec+contract, parent 9 gates, #69, PRs #63/#64/#66/#75, TokenCorridor #73/#220, active worktrees.
EXECUTE: (1) git fetch --all --prune --tags, resolve origin/main, git status --porcelain=v1, git worktree list; (2) fetch exact PR heads and compare stacked bases; identify active writer and running EscapeHatch process with repository lifecycle only; (3) validate `python scripts/validate_application_source_integration.py`, `python -m unittest discover -s tests -p test_application_source_integration.py -v`, `python scripts/validate_application_autofill_parent.py`, `python scripts/validate_harness.py`; (4) enumerate branch owners and safe lane start SHAs; (5) create sanitized private receipt and a precise dependency handoff.
PROOF: exact main/head/worktree/runtime identity and tested governance. No downstream run or browser proof. NEXT: dispatch A1+B1+C1+D1 only into truly isolated worktrees.

---

## A1 — Existing Google identity and exact content read

Repo: EndeavorEverlasting/TokenCorridor. Phase: 1 / parallel lane A. Sprint: existing-google-live-read-P08. Branch: own clean worktree from current eligible PR #73/#220 lineage; preserve existing writer. Dependency: F0.
MISSION: prove existing authorized local account can read two actual selected résumé documents and an exact tracker as bytes/text, without telling returning user to reconfigure Cloud Console.
OWNED: Google adapter/auth recovery, read-only certification and sanitized private receipts. FORBIDDEN: EscapeHatch UI/browser files, tracked secrets, private résumé text in Git, new OAuth project/client by default, cross-account token borrowing.
READ FIRST: current TokenCorridor main/AGENTS, #73 refreshable transport, #220 cert, tooling/connectors/google/**, current installed Google/ADC/OAuth paths, operator-selected private sources (not title-search guesses).
EXECUTE: (1) inspect already configured authorization and registered client without printing secrets; (2) identify authenticated Google `sub` or equivalent stable verified account; (3) read exact metadata for two real selected résumés+tracker; (4) read actual nonempty text/bytes via authorized API or selected synced file, MIME/size/revision checked; (5) retry refresh only as permitted, distinguish 401/403/404/scope/revocation; (6) produce redacted receipt with provider, account binding checksum, source revision, content nonzero and hash; (7) test wrong-account, expired token, missing scope and empty text.
PROOF: two exact successful user-authorized content reads and tracker, not a token file or metadata count. An unavailable token is AUTH_RECOVERY_REQUIRED only after other available paths investigated; new user OAuth belongs M1. NEXT: deliver provider port and private receipt to I1/B1.

---

## B1 — Canonical source-to-career bridge

Repo: EndeavorEverlasting/EscapeHatch. Phase: 1 / parallel lane B. Sprint: career-source-provider-domain. Branch: new isolated feature worktree, not PR #66 writer branch. Dependency: F0.
MISSION: wrap PR #66 source locators in a typed account-scoped CareerSourceProvider and connect verified source contents to existing reviewed candidate+application identity without cloning storage.
OWNED: proposed `artifacts/escape-hatch/src/lib/career-source-provider.ts` (or canonical existing equivalent found first), source binding/revision/preview adapters and tests, `scripts/career_source_directory.py` reconciliation only after ownership resolution.
FORBIDDEN: second profile DB, `src/App.tsx` during concurrent phase, PR #63/#64 managed browser writer paths, credentials in code, broad Google OAuth new clients.
READ FIRST: source PR #66, `artifacts/escape-hatch/src/lib/storage.ts`, `src/lib/resume-import.ts`, `contracts/career-state.v1.schema.json`, source integration contract.
EXECUTE: (1) inspect source locator normalization; (2) implement principal+connection+file+revision binding and receipt enum, no caller-owned principal; (3) implement local-file proof using *synthetic* PDF and tracker sources; (4) parse through existing importer and preview conflicts without modifying approved fields; (5) approve controlled diff, attach to existing opportunity, reimport to show idempotency; (6) prove stale revision conflict and multiaccount negative fixtures; (7) run relevant Python/TS tests, typecheck, parent/source validators, patch hygiene.
PROOF: synthetic/local read→preview→approved package, no real Google read claim. NEXT: hand typed port to A1/C1/I1; reserve App wiring for I1.

---

## C1 — Sources and Identity UX

Repo: EndeavorEverlasting/EscapeHatch. Phase: 1 / parallel lane C. Sprint: sources-identity-in-cockpit. Branch: own feature worktree. Dependency: F0, agreed contract.
MISSION: implement source connection, account picker, source selection, readable extraction statuses, conflict preview, approval/disconnect IN THE EXISTING EscapeHatch React/Vite shell. Not a new website to migrate.
OWNED: new proposed `artifacts/escape-hatch/src/components/career-sources/**` (or documented repo pattern) + isolated UI tests; route entry change only in serialized I1 lane. FORBIDDEN: duplicate React app, second career store, replacing /assist, changing active managed browser PR, inventing live Google status, public secrets.
READ FIRST: current `src/App.tsx` and UI components/tokens, `src/lib/storage.ts`, integration contract and normative DTO section, PR #66.
EXECUTE: (1) prototype two-state interactive screen for connected and no account; (2) add loading, cancelled picker, consent denied, metadata-only, exact-content-read, unsupported-file, revision-change, conflict and disconnect states; (3) render Source & Identity view responsive and accessible with keyboard/screen-reader test; (4) verify user can select files, see exact revision, preview approved diff and connect result to shared ApplicationPackage contract with synthetic data; (5) no fake successful provider read or credential fields; (6) run component/browser tests, typecheck, build, accessibility check.
PROOF: prototype UI compiled and state machine tested, not real Google onboarding. NEXT: pass route and view to I1 for App.tsx wiring after no competing writer.

---

## D1 — Deterministic ATS runner integration

Repo: EndeavorEverlasting/EscapeHatch. Phase: 1 / parallel lane D. Sprint: browser-prepare-to-review-integration. Branch: separate isolated integration worktree. Dependency: F0.
MISSION: merge/adapt capability from #63→#64 with #75 and merged #67/#68, preserving browser-derived deterministic Fill Plan and trusted consequence authorization. Agent writes TESTS/CODE only; NEVER fills real site directly.
OWNED: `artifacts/escape-hatch/browser-assist-control.ts`, `managed-form.ts`, `application-autopilot-executor.ts`, versioned managed-browser navigation policy and synthetic tests only after branch ownership readback. FORBIDDEN: sources UI, Google tokens, changing legacy MV3 session v1, final Submit, attestation, arbitrary label-based clicks, destructive rebases.
READ FIRST: PRs #63/#64/#75, `contracts/application-navigation-authority.v1.json`, `contracts/application-assist-session.v1.json`, `fixtures/application-navigation-ats/**`.
EXECUTE: (1) establish PR stack and exact base SHAs, integrate with collision owners; (2) implement typed Production PreparationDriver using existing DOM fill+PDF writers, never AI fill; (3) read adapter evidence from trusted registry, not observed page-provided claims; (4) before any click reobserve live control+page, enforce scoped auth/time/POST classes; (5) synthetic actual Chromium native/SPA/dynamic/decoy fixture tests assert HTTP journal terminalCommits=[]; (6) run build/typecheck and protected regression; repair inherited #start/#startAssist suite failure separately, never silence tests; (7) write sanitized proof and mergeable PR status.
PROOF: synthetic navigation and managed UI integration; no real employer run. NEXT: pass ready browser lane to I1 then R1.

---

## I1 — Serial integration and mainline convergence

Repo: EndeavorEverlasting/EscapeHatch. Phase: 2 / SERIAL. Sprint: sources-and-assist-real-integration. Branch: isolated shared integration branch, single writer of collisions. Dependencies: A1+B1+C1+D1 (or explicit evidence-backed blockers).
MISSION: get ONE running EscapeHatch with both UI-A Sources and UI-B Applications consuming ONE principal/candidate/opportunity/file revision package; safely merge reviewed code to default branch when gates pass.
OWNED: serialized `artifacts/escape-hatch/src/App.tsx`, `vite.config.ts`, canonical shared data integration and packaging, routing/CI regressions, compatibility mapping as needed. FORBIDDEN: switching another agent's worktree, silently overwriting approved data, inventing signed-in identities, changing Google credentials, final Submit.
READ FIRST: F0 collision map, A1 provider receipt, B1 source bridge, C1 view, D1 browser, current origin/main and all four PR exact heads.
EXECUTE: (1) refresh current main; (2) compare/reconcile stacked PRs and file overlaps, integrate one writer at a time; (3) wire /sources and /assist into same shell, share canonical state; (4) implement local loopback adapter and provider-specific auth behind it while keeping separate portable hosted security boundary; (5) prove two views consume one source version+opportunity with no export/import shuttle; (6) run full unit/harness/typecheck/build/browser and security tests, compare baseline failures; (7) commit/push, review, integrate into main only with actual branch authority and passing gates, then use repo launcher to observe exact revision.
PROOF: committed/pushed/merged state must be reported separately from runtime live state. NEXT: R1 on the actual Windows host.

---

## R1 — P08 real Windows source-to-application journey

Repo: EndeavorEverlasting/EscapeHatch. Phase: 3 / runtime proof. Branch: exact integrated main head or reviewed candidate. Dependencies: I1; authenticated source availability.
MISSION: prove local EscapeHatch program itself selects real source content, builds user-approved opportunity package and deterministically fills/advances a real browser application to final review, NEVER final submission. Then prove a second ATS archetype.
OWNED: private read-only source verification and sanitized runtime receipts (only approved app-owned form writing). FORBIDDEN: local agent directly filling real ATS as substitute, final Submit/attestations, copying secrets, recording private data in public artifacts, killing foreign runtimes.
READ FIRST: P08 current TokenCorridor resolver, repo Windows launcher/process ownership, parent 9 gates, C1/D1/I1 handoff, user's privately selected opportunity+PDFs.
EXECUTE: (1) identify owner of existing runtime/ports and run launcher safely; (2) prove exact nonempty source read and current revisions; (3) inspect user-reviewed changes and package binding; (4) start managed Chrome via EscapeHatch UI; (5) agent observes only, app performs deterministic form filling and scoped intermediate transitions; (6) stop at classified real terminal action, capture zero terminal requests, check all attachments; (7) repeat another distinct ATS or document blocker; (8) report real P08 proof and unresolved parent gates with no false submitted status.
PROOF: genuine Windows browser read-to-final-review, with explicit limitations if ATS site changed or auth blocked. NEXT: M1 once real base flow passes.

---

## M1 — New-user OAuth and hosted isolation

Repo: EndeavorEverlasting/EscapeHatch (+ TokenCorridor provider as adapter where proven). Phase: 4 / public readiness. Branch: scoped new worktree after R1. Dependencies: I1+R1.
MISSION: turn existing-owner-only local Google auth into a re-usable product capability for each newly enrolling user without asking them to create Google Cloud Console credentials; preserve a single shared front-end product.
OWNED: product-owned Google OAuth consent/account-picker runtime, encrypted per-user credential backend, selected-file-scoped Google Picker, account/disconnect UI, two-tenant negative tests, compliance prep. FORBIDDEN: reusing operator/ChatGPT tokens, broad-drive scope by default, public hosting without explicit release authority, hardcoded app secrets, leaking other user's docs/IDs, final ATS Submit.
READ FIRST: Google Drive scopes+Picker+OAuth web-server and verification documentation, integration contract section 4, current server/session architecture, existing local read adapter.
EXECUTE: (1) use product-owned registered OAuth client, state+PKCE where supported, exact redirect and anti-CSRF; (2) authorize disposable Google test account A and B independently; (3) choose explicit docs with Picker `drive.file`, prove read+revoke+refresh and refusal to access an unselected sibling; (4) test cross-tenant forged sourceId and session switching with 0 leaks; (5) run secure store/revocation/deletion and server-side bound principal tests; (6) assess Google verification/legal/privacy requirements for target rollout; (7) only if operator authorizes production go-live, deploy and observe actual hosted session.
PROOF: two-user runtime isolation and consent on exact deployed candidate, not mock or design. NEXT: close remaining parent gates only on live receipts; otherwise report first actionable gate.

## Shared closeout contract
Report **CHANGED | PROVED | NEXT** with exact repo, branch SHA, PR state, owned files, tests actual output, environment, proof ceiling and first remaining parent gate. Never rename a blocker into a plan; recover and execute the next safe gate. Use structured, redacted receipts. Only an explicitly authorized user can consent to Google permissions, approve imported facts, certify legal truth and press final Submit. No new user should have to be a Google Cloud developer.
