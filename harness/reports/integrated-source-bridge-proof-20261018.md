# Integrated local source bridge — bounded proof

Date: 2026-10-18. Planning base: b3e94bec79649558cd80093a8815d86e2aedf50f (PR #76); provider main recovered at 3213369a036dd443c8b79559353596ef4c709944. Branch: feat/integrated-source-package-20261018. This report is synthetic local evidence, not parent completion.

## Declared scope and recovery

F0 + B1/C1 shared local source seam. The original education-eligibility checkout has separately owned dirty work and read-only Git metadata. It was preserved. A clean independent clone inside the writable private directory isolates this writer. No existing worktrees were edited. P07/P08/P82 canonical prompts were recovered read-only from neighboring TokenCorridor. One read-only delegated lane inspected provider availability and then reviewed the implementation; the coordinator alone wrote this branch. No claim of full P04 manifest dispatch or parallel product implementation is made.

The implementation uses the existing Profile, AssistProfile, opportunity tracker and resume-import helper. File selection is local chooser authorization, not a Google connection or a hosted principal. Immutable byte-snapshot SHA-256 revisions and per-claim provenance feed explicit approval; persisted bindings contain references, not a second candidate. Sources and Assist share the same lifted candidate and source-reference state. No source bytes are written, no resume is generated or restyled, no employer page is touched, and no submission behavior is added.

## P82 iterations

Stable rubric: no candidate mutation before explicit approval; same candidate/opportunity in both views without re-export; rejected/unknown content cannot imply read or readiness; concurrent user edits fail closed; repeated imports do not duplicate claims; persistence failures cannot report successful approval.

Pass 1 implemented the local read/review/bind journey and focused tests. Pass 2 read-only review exposed stale-review renewal deadlock, subset duplication, approval after unmount, stale summary display and unacknowledged storage failures. Repairs added fresh-preview renewal, per-source claim deduplication, generation/state guards, input-bound status results and publish-reference-last writes with failure rollback. Tests cover renewal, subset expansion, changed profile, missing opportunity, forged proposal, no approval, unsupported/empty/oversized file, repeat binding, and storage failure. KEEP this bounded local slice; broader integration remains INCONCLUSIVE until provider and managed-browser gates are observed.

## Executed proof

- Integrated architecture validator: PASS; 16 adversarial Python tests: PASS. The Python tests now specify UTF-8 so Windows cp1252 does not prevent execution.
- TypeScript product typecheck: PASS.
- Production build: PASS with `npm --prefix artifacts/escape-hatch run build -- --configLoader runner`. Default config bundling fails because the sandbox denies esbuild ancestor-directory reads; runner uses the canonical Vite config successfully.
- Seven new domain tests compiled with TypeScript and executed by Node: PASS. All 32 emitted cockpit unit tests also passed. The standard tsx launcher is blocked by sandbox `uv_os_get_passwd ENOMEM`; compile-then-Node was used. Compiling all existing tests surfaces a pre-existing storage.test.ts:209 mock type diagnostic; the product typecheck and new domain test compilation are clean.
- P08 synthetic production Chromium: four tests PASS (2.2s): source read/approve/opportunity handoff/Assist/reload/forget; empty read negative; protected existing resume preview and edited-approval/reload controls. The real production bundle was served through canonical `npm run serve -- --host 127.0.0.1 --port 21031 --configLoader runner`. A disposable private Playwright config attached to that owned server; all assertions ran in real Chromium. Earlier dev-server dependency scanning failed under sandbox permissions; earlier selector failure prompted an explicit accessible opportunity name. Neither earlier run is counted as PASS.
- Governance/manifest validation and diff checks are recorded in the commit closeout. No remote CI result is inferred from local tests.

## Remaining gates and risks

Google recovery audit found separate existing refreshable Sheets code and an access-token-only Drive certifier in TokenCorridor. The checked canonical credential file and supported token/environment pointers were absent. No credential contents were read, no Google request was made, no new client was created and no ChatGPT connector credential was transferred. Alternate existing authorization still requires recovery; this is not proof that none exists. TokenCorridor is outside this workspace mutation boundary. The Sources UI truthfully reports Google unavailable.

This is a single-browser local slice, not tenant isolation or hosted authentication. File snapshots do not monitor later filesystem/provider changes. Storage uses existing separate canonical keys with checked writes and rollback; browser/process crash between keys is not an atomic database transaction. Binding revision checks fail closed after partial state, but crash recovery is not certified. No complete ApplicationPackage, source-provider service, tracker-source import, cover-letter attachment, posting freshness or managed navigation integration is claimed. PRs #63/#64/#66/#75 have separate owners; their product code was not silently absorbed. Real Google-to-candidate proof and R1/M1 remain UNPROVEN. No real ATS was populated in this sprint and no scale/throughput claim is made.

## Integration

This implementation depends on the unmerged PR #76 planning base. Push/PR/main integration state must be read from the execution closeout; no release, deployment or mainline inclusion is implied by this report. Original dirty work and all other worktrees remain preserved.
