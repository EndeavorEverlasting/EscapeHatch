# EH-EVT0 — P04/P82 Local-Agent Browser Acceptance Sprint

**Date:** 2026-10-11
**Repository:** `EndeavorEverlasting/EscapeHatch`
**Upstream PR:** [#59](https://github.com/EndeavorEverlasting/EscapeHatch/pull/59) (draft, not merged at handoff)
**Follow-on:** [Issue #60](https://github.com/EndeavorEverlasting/EscapeHatch/issues/60)
**Verified starting PR head:** `b9c8a8df2a59408064034eb8c0899f28903d304b` (refresh before starting; never blindly reuse)
**Canonical source:** `contracts/application-event-journal.v1.json`, `docs/APPLICATION_EVENT_JOURNAL.md`, `AGENTS.md`.
**Upstream prompt consumption:** TokenCorridor `prompt-invocation-upstream/v1` resolver, P04 source blob `848728632c1243ebba023fa0012292a2ad33cada`, P82 blob `5926a198a14567de55110ed19e922fc444b4dec7` at catalog inspection. Fetch live provenance anew; do not restate these as an immutable future floor.
**Mission:** PROVE AND HARDEN A PRIVATE, OPT-IN, BROWSER-OBSERVED JSON EVENT JOURNAL ON A SYNTHETIC MULTISTEP APPLICATION. EXECUTE; DO NOT SUBSTITUTE A PLAN OR SCREENSHOTS FOR TESTED BEHAVIOR.

## Launch order — P04, dependency-first

1. **G0 — One coordinating parent:** resolve exact P04/P82 through upstream when available; refresh repository truth, worktrees/dirty state, PR #59, Issue #60, CI; check and declare the runtime host. Preserve unrelated work. Choose an isolated child branch/worktree based on the **verified PR #59 head**. Never write to main.
2. **Group 1 — two independent bounded lanes, only when a safe autonomous adapter can launch both:**
   - **BROWSER (fixtures/proof):** own `artifacts/escape-hatch/tests/*event-journal*.spec.ts` or a dedicated synthetic test subfolder, plus minimal non-production test helpers. Reuse the existing Playwright persistent-context/Chromium extension loader in `artifacts/escape-hatch/tests/assist.spec.ts` from PRs #54/#55. Reuse test-only service-worker/host-permission injection **only in a temporary test copy**; production manifest MUST remain unchanged. Prove actual extension behavior, measure browser observed results. **Forbidden:** extension runtime JS, policy contracts, career-state sync.
   - **CAPTURE (correctness/privacy):** own `browser/application-assist/event-journal.js`, `browser/application-assist/event-observer.js`, `tests/test_application_event_journal.mjs`, `tests/test_application_event_journal_contract.py`, and only if needed `contracts/application-event-journal.v1.json`. Reproduce and repair ordering, stop/clear races, failures, retries, allowlist leakage, duplicate injection, storage-full behavior. No unmeasured architectural redesign. **Forbidden:** Playwright browser fixture, production permission expansion, provider sync, submit automation.
3. **G1 — Single integration owner after Group 1 returns:** integrate on one isolated candidate branch; fix boundary interactions in popup/modality ONLY when needed by a reproduced failure; update `docs/APPLICATION_EVENT_JOURNAL.md` and `ARTIFACT_REGISTRY.md` if applicable. Run targeted checks, browser acceptance and strongest practical full CI. Open/update a PR against #59 branch (stacked) or rebase once #59 is merged **only after checking current remote truth**. Do not auto-merge without explicit authorization.
4. **G2 — Next gate (execute when safe, not just propose):** after browser proof and a reviewable EVT0 PR are established, start the narrowly scoped EVT1 stable application identity/replay milestone from Issue #60 on a **different isolated branch** if no collision/authority blocker exists. Bind synthetic `opportunity_id` and `application_id` independently of origin, build restart/replay/dedup fixtures and prove canonical career-state status remains unpromoted by an observed submit attempt. Reuse existing schema owners; do not create an independent database. Push its own evidence-backed PR if validation passes. Defer automatic cross-page permissions, reusable raw answer capture, Drive/Sheets sync and live career-state writeback until their separate authority/proof gates.

**Runtime partition:** source/PR/CI inspection can run in a provider or remote agent; actual local browser install, headed Chromium instrumentation and local extension storage proof require LOCAL_AGENT_RUNTIME; employer submission and private real-application acceptance require OPERATOR_OR_PHYSICAL_RUNTIME. Providers are routes, not hosts. Never claim current ChatGPT/provider work executed on a workstation.

**P04 parallel dispatch rule:** graph width is at least two only after explicit file ownership and no test-runner/fixture collisions are confirmed. Probe native delegated workers → repository-proven OpenCode/Cursor/AgentSwitchboard wrappers → provider workers → CI fan-out → genuine concurrent local deterministic processes. If a safe adapter is available, dispatch rather than asking operator to create chats. Use the upstream `prompt-invocation-upstream/v1` and P04 dispatcher/manifest schema if available; an actual `run` and verified receipt, not a prose JSON template, proves dispatch. If adapters are unavailable, record `PARALLEL EXECUTION: DEGRADED` plus evidence for each exhausted rung and an `AUTONOMY_GAP`, then make serial progress rather than abandon execution. Do not create a competing dispatcher inside EscapeHatch.

## Read-first, preflight, and scope

Read:
- `AGENTS.md`, `ARTIFACT_REGISTRY.md`, `harness/reports/CURRENT_STATE.md`
- `docs/APPLICATION_EVENT_JOURNAL.md`; `docs/APPLICATION_ASSIST_SESSION.md`
- `contracts/application-event-journal.v1.json`; `contracts/application-assist-session.v1.json`; `contracts/application-companion.v1.json`
- `browser/application-assist/{manifest.json,event-journal.js,event-observer.js,assist-core.js,popup.js,modality.js}`
- `tests/test_application_event_journal.mjs`; `tests/test_application_event_journal_contract.py`
- `artifacts/escape-hatch/tests/assist.spec.ts`; `artifacts/escape-hatch/playwright.config.ts`; `.github/workflows/{application-assist,web-cockpit}.yml`
- current GitHub PR #59 checks/files/reviews and Issue #60.

Inspect `hostname`, `git rev-parse --show-toplevel`, remotes, branch/HEAD, `git status --porcelain=v1`, `git worktree list --porcelain`, `git fetch origin --prune`, remote PR head and baseline checks before deciding whether to continue a branch or make a new isolated worktree. Verify JavaScript, Python launcher (`py -3` vs `python`), Node/npm, installed browsers, Playwright and required dependencies; do not guess a PTop/DTop/Admin Box identity or resurrect stale paths. Leave dirty worktrees untouched. Do not forcibly install or overwrite unrelated toolchains. Use repository-native installers if possible.

If TokenCorridor is accessible, run `python scripts/prompt_invocation_resolver.py --text "invoke P04 and P82 to execute the EscapeHatch event journal browser acceptance sprint"` from that repository (or its supported Python launcher), confirm both exact IDs and prompt provenance, and apply their workflow. EscapeHatch consumes upstream instructions; it does not fork Prompt Kit prompt definitions or mutate canonical prompt bodies.

## P82 experiment admission (locked, falsifiable)

**One thesis:** the existing PR #59 explicit-opt-in MV3 observer, hardened only where evidence demands it, can produce a strictly ordered, private metadata-only JSONL sequence for a controlled application form with no false submission promotion or post-stop capture.

**Baseline/comparator:** before edits, run existing Node/Python tests and the existing browser harness. Record what it proves and what remains untested; use the unmodified PR #59 observer as baseline and repeat the **same synthetic browser fixture/workload** on the candidate.

**Smallest real prototype:** copied unpacked production extension in a real Chromium/Edge persistent context, fixture served from loopback. The fixture may contain fake first/last/email/password, EEO/attestation, a file input, unknown free-text question, Next/Continue controls, dynamically added fields, SPA navigation and a submit listener that does NOT claim server acceptance. No real employer credentials, real contact details, private resumes or medical/identity documents.

**Measurements** (before and after, with counts and exact pass/fail, not impressions):
- 100% expected allowlisted event categories observed and order strictly increasing per session, no duplicate listeners/events after double injection.
- 0 forbidden strings/values/filenames/SSNs/passwords/free-text answer contents present in extension local storage or exported JSONL. Deny unknown fields; test hostile/surprising field labels.
- 0 `submitted` promotions after click/submit event alone; the event must have `submission_verified: false`.
- 0 new stored events after Pause/Emergency Stop, after clearing the journal, or on unrelated origins; explicitly test a pending asynchronous append when stop/clear happens.
- SPA/dynamic changes observed where supported; full reload requires explicit new authorization; no automatic cross-origin re-authorization.
- Near/full capacity 1000-event behavior fails closed visibly and preserves previously persisted events. Corrupt/malformed stored journal must not be overwritten with a fake clean state.
- Export is parseable JSONL, preserves sequence and event-count equality, and does not contain prohibited private content.

**Disproof:** any unapproved capture, unobserved/duplicated event, silent event loss, false submission state, permission broadening, or actual browser control-loop failure falsifies the thesis; classify and fix or REJECT/REFINE rather than relabeling unit tests as browser proof.

**Cycle:** HYPOTHESIS → BUILD/PROBE → MEASURE → CRITIQUE → DECIDE (KEEP/REFINE/DISCARD) for each meaningful iteration. Preserve the baseline SHA and a separate scored result for the last known-good candidate. Limit to three substantive iterations on the same failing gate; when further repair needs unavailable credentials/device/browser, block the gate truthfully and continue independent safe work.

**Proof classification:** synthetic fixture + Node test = repository/host proof, not browser proof. Only a real browser context executing the extension earns browser-observed evidence. Neither proves a live ATS or a real submission. Follow existing `scripts/p82_evidence.py` capability/attestation logic when suitable, without misusing Android-specific evidence claims.

## Execution tasks

1. Run exact existing baseline:
   - `python tests/test_application_event_journal_contract.py`
   - `node tests/test_application_event_journal.mjs`
   - `python tests/test_application_assist_session_contract.py`
   - `node tests/test_application_assist_session.mjs`
   - `python tests/test_application_assist_modality_contract.py`
   - `node tests/test_application_assist_modality.mjs`
   - `python scripts/validate_harness.py`
   - `git diff --check`
2. Construct real browser acceptance using existing `artifacts/escape-hatch` Playwright infrastructure; inspect whether an existing legacy test still references obsolete `#start`/`#scan` controls. Do not use a fake DOM, old alternate extension, or harness service worker as proof of production permissions. If the existing test is stale, add a current-product test instead of weakening coverage.
3. Run tests against the first unchanged baseline; preserve sanitized counts, paths, timestamps, browser/version, exit code, actual observed extension state and controlled failures. Never commit captured sensitive output.
4. Fix only reproduced errors with negative tests and re-run same fixture: especially storage append overlap, listener reconnect, Stop/Clear async work, field classification across DOM rerenders, export completeness, and errors surfaced to the operator.
5. P82 decide KEEP/REFINE/DISCARD using the locked rubric. Rerun focused tests; run `npm --prefix artifacts/escape-hatch run typecheck`, `npm --prefix artifacts/escape-hatch run test:browser` (use the existing repo setup for local or CI headed Chromium/Xvfb), `python scripts/validate_harness.py`, relevant P82 validators, `git diff --check`. Do not claim a command ran if an interpreter/tool is missing: classify exact blocker and use a safe available runner, not a substituted assertion.
6. Produce a **tracked, synthetic-only** result in `harness/reports/` or another pre-registered report owner with schema or Markdown: baseline and final SHA, host, browser/version, exact commands/results, event totals, privacy sentinel checks, duplicate/stop/clear outcomes, proof class, residual risk, and chosen P82 disposition. Put any screenshots, raw browser profiles, downloaded application JSONL containing sensitive data, or logs with tokens in an ignored private directory, **not Git**.
7. Update doc/registry owner only after concrete integration. Commit and push the isolated candidate. Open/update an explicit reviewed PR. Observe CI against the exact pushed head; do not auto-merge, force-push, reset other authors' work, touch open PRs #29/#30/#31, submit a real application, widen host permissions, upload sensitive events, or write to Google Drive.

## Hard acceptance / no-shortcut gates

- No broad capture (`<all_urls>`), no silent activation, no domain-independent content script or auto-running background worker without separately authorized design.
- Never store or transmit profile values, keys, cookies, passwords/OTP, raw questions, protected demographic selections, attestation answers, file contents/names or hidden-field data.
- No claim that pressing Submit means the employer accepted the application. Operator's final submission stays manual.
- Evidence must distinguish `OBSERVED`, `TESTED`, `INFERRED`, `BLOCKED`. No promotion by ranking alone.
- Runtime trace must prove an actual extension was active on the fixture page, not merely a runner that simulated browser events.
- Shared PR work and worktrees preserved; one writer per owned branch. Avoid broad cleanup and unvalidated registry/schema proliferation.
- No work on private Google Drive state or Gmail boundary.

## Final response contract

Use exactly:
- **CHANGED:** real files, test artifacts, branch/PR and commit SHA.
- **PROVED:** exact commands, test counts, real browser version, acceptance matrix and provenance.
- **UNPROVEN:** explicit runtime/provider/ATS/replay/Drive and privacy gaps.
- **P04 DISPATCH:** graph width, capability ladder, adapter/lanes, execution receipts or degraded autonomy gap.
- **P82 DECISION:** baseline, hypothesis, observed metrics, dispositions for iterations and final KEEP/REFINE/DISCARD; required capability proof.
- **INTEGRATED SHA:** validated current branch SHA, remote push/PR status; separate from main merge status.
- **NEXT LIVE GATE:** one executable command/action on the next unproven dependency, not “please run these yourself.”

Never call a plan, tests, a green PR, or an uninstalled unpacked extension a deployed live listening system.
