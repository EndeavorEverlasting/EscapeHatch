# Answer memory and submission observation handoff

Parent: https://github.com/EndeavorEverlasting/EscapeHatch/issues/69. This checkpoint contributes to the existing application preparation workflow; it does not close the parent or any of its nine conjunctive gates.

## Delivered behavior

The managed cockpit recognizes a generic portfolio website, optional pronouns and interview accommodation as separate canonical answers. Optional omission is persisted and respected unless the employer requires the field. Trusted user edits on the exact bound job path feed reusable answers. Encountered safe unknown questions are remembered even unanswered; user-provided unknown answers stay reviewable and require acceptance before reuse. Sensitive/legal prompts remain excluded. Scripted field assignments do not become user answers. Employer relationship answers cannot become global cross-employer facts.

A managed listener can arm before the user's native Submit click. The click starts Pending, never Applied. A same-session, same-job explicit receipt after that click produces a minimal private durable receipt. Only validated bound receipts reconcile the cockpit's local application queue. Validation failures, the observed possible-spam rejection language, stale confirmations, generic thanks, route-only navigation, page-forged binding calls, sibling jobs and foreign origins cannot establish completion. Fresh listener fixtures accept the observed success sentence including the subsequent next-steps sentence.

Preference read/modify/write operations use a shared per-file transaction queue. Clear pauses answer recording, drains accepted writes and then deletes the store. Compact persistence uses the same byte limit as the reader. Queue reconciliation is idempotent; stale Ready snapshots cannot erase Applied, and later provider Closed/Follow-up states and instructions can still advance while preserving receipt evidence.

The optional MV3 extension has isolated-world submission observation, arm/pause/check controls and same-path reinjection after reload using the existing activeTab grant. It adds no broad host permissions. Its receipts are extension-local and are not synchronized into the cockpit queue. Its Submit proxy is deliberately unavailable until a host-owned terminal-action adapter exists.

## Actual application evidence and proof limits

The operator supplied a rejection screenshot followed by an employer success screenshot and reported personally reloading and submitting successfully. The agent preserved both privately with hashes and source provenance, and recorded the Applied milestone through EscapeHatch's existing explicit milestone UI. No retroactive same-session listener receipt was fabricated. No employer submit action was performed by the agent. The screenshots establish rejection and later acceptance; they do not establish why the first attempt was flagged. No retry loop or anti-spam bypass was added.

The revised observer was tested on disposable browser fixtures. It was not installed before the actual operator submission. Vite's session cache retains existing closures; changing source does not retrofit already-installed listeners. A fresh bound session is required for the next live proof. Approved application documents and the completed employer browser session remain protected and unchanged. Private documents, screenshots, profile values and source locations are excluded from this remote handoff.

## Validation

Run from artifacts/escape-hatch:

```powershell
npm run typecheck
npm run build
npm run test:unit
npm run test:tracker
npm run test:managed-assist
npx playwright test tests/managed-browser-assist.spec.ts
npx tsc --noEmit --target esnext --module esnext --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck --types node --lib esnext,dom browser-assist-control.ts managed-listeners.ts managed-answer-memory.ts managed-submission-observer.ts
```

Run from the repository root:

```powershell
node --test tests/test_application_operator_submit.mjs
python -m unittest discover -s tests -p test_application_assist_session_contract.py
python scripts/validate_application_harness.py
python scripts/validate_application_companion.py
python scripts/validate_application_autofill_parent.py
python scripts/validate_governance.py
git diff --check
```

Validation outcomes and commit/PR identity are recorded in the remote PR. Browser tests use disposable synthetic data; they are not proof of live employer behavior. The extension's worker tests use a simulated Chrome API, not a packaged installed extension. The build has an existing bundle-size warning.

P08 protected the actual employer session and retained the operator's separate evidence. P82 exercised native input, SPA/reload, negative receipts, answer persistence and queue regression fixtures. P07 publishes the checkpoint and this handoff. Native independent branches were used for memory, observation and extension contract work, followed by a second read-only integration review. This is not a contract-valid parallel-run PASS: EscapeHatch lacks the prompt-parallel-dispatch script/contract named by the prompt bundle.

## Next bounded boundary

First review and integrate this remote checkpoint with required checks; do not overwrite separately owned root dirty work or the completed employer session. Start an isolated successor branch from the reviewed checkpoint. Recover the canonical contracts application-assist-session.v1.json, application-companion.v1.json, application-navigation-authority.v1.json and managed-browser-progression.v1.json, plus the owning plan docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md.

The next implementation lane is an operator-invoked terminal-action adapter: define an exact one-shot, job/session/form/control-bound user grant, consequence proof, attestation refusal and receipt reconciliation before exposing an extension Submit control. A button label alone is insufficient authority. Add rejection/reload/retry, duplicate prevention, expiry, origin drift, preexisting success and forged-message tests through the canonical owners. Preserve operator-only final submission and the current automatic-submit prohibition. No adapter or confirmation means fail closed; do not substitute a generic click.

Then prove the new listener and protected fill/document path in a fresh operator-approved live application session on the user's workstation, with final submit personally controlled. Observe actual success-container structure and validate the installed extension separately. External tracker writes require a dedicated verified sync path; local Applied is not proof of external tracker update. Do not reapply to the already-completed job to obtain proof.

All parent gates remain UNPROVEN at the parent contract level: SOURCE_TO_APPROVED_PROFILE, MANAGED_BROWSER_LAUNCH, SEMANTIC_CROSS_FORM_MAPPING, DETERMINISTIC_FILL_AND_PDFS, CONSEQUENCE_SAFE_MULTISTEP, SESSION_CONTINUITY, ADVERSARIAL_CROSS_ARCHETYPE, P08_REAL_BROWSER_USER_JOURNEY, MERGED_AND_LIVE_OBSERVED. Local feature tests and one operator-confirmed application do not satisfy their full product proof.

## Published checkpoint

PR: https://github.com/EndeavorEverlasting/EscapeHatch/pull/90. Integration commit 6177e2a; portable CI adjustment 23ce343. The local implementation checkout was fast-forwarded to the pushed checkpoint after the employer submission was complete. The running cockpit was reloaded, explicit reusable preferences were saved through its UI and verified by the canonical preference reader, and the Applied queue row remained Applied after reload. This establishes local cockpit persistence, not a fresh employer listener session or installed-extension proof. The completed employer page was not reopened or resubmitted.

Local results: 49 managed-assist tests, 30 unit tests, 15 tracker/source tests, 10 cockpit browser tests, 19 focused observer tests, 8 session-contract tests, extension worker policy test, typecheck/build, standalone runtime TypeScript and the four named validators passed. The portable CI launch adjustment uses the Chrome channel and explicitly installs it in managed-assist CI. Remote CI status is authoritative in the PR; no pending check is counted as passed.

## Changed-file manifest

This consolidated PR includes the earlier unpushed career/title, document-review and Ashby mapping work as well as this sprint. The following tracked files differ from the fetched main baseline; private application assets and local test outputs are excluded.

- `.github/workflows/managed-browser-assist.yml`
- `AGENTS.md`
- `artifacts/escape-hatch/browser-assist-control.ts`
- `artifacts/escape-hatch/career-preferences.ts`
- `artifacts/escape-hatch/managed-answer-memory.test.ts`
- `artifacts/escape-hatch/managed-answer-memory.ts`
- `artifacts/escape-hatch/managed-form.ts`
- `artifacts/escape-hatch/managed-listeners.test.ts`
- `artifacts/escape-hatch/managed-listeners.ts`
- `artifacts/escape-hatch/managed-preferences.test.ts`
- `artifacts/escape-hatch/managed-preparation-driver.ts`
- `artifacts/escape-hatch/managed-submission-observer.test.ts`
- `artifacts/escape-hatch/managed-submission-observer.ts`
- `artifacts/escape-hatch/opportunity-documents.test.ts`
- `artifacts/escape-hatch/opportunity-documents.ts`
- `artifacts/escape-hatch/package.json`
- `artifacts/escape-hatch/preference-file.ts`
- `artifacts/escape-hatch/src/App.tsx`
- `artifacts/escape-hatch/src/components/application-preferences.tsx`
- `artifacts/escape-hatch/src/components/career-records.tsx`
- `artifacts/escape-hatch/src/components/managed-browser-assist.tsx`
- `artifacts/escape-hatch/src/components/opportunity-documents.tsx`
- `artifacts/escape-hatch/src/lib/application-preferences.ts`
- `artifacts/escape-hatch/src/lib/assist-contract.ts`
- `artifacts/escape-hatch/src/lib/assist.test.ts`
- `artifacts/escape-hatch/src/lib/resume-import.ts`
- `artifacts/escape-hatch/src/lib/storage.test.ts`
- `artifacts/escape-hatch/src/lib/storage.ts`
- `artifacts/escape-hatch/src/lib/submission-reconciliation.test.ts`
- `artifacts/escape-hatch/src/lib/submission-reconciliation.ts`
- `artifacts/escape-hatch/src/lib/tracker-bridge.test.ts`
- `artifacts/escape-hatch/src/lib/tracker-bridge.ts`
- `artifacts/escape-hatch/tests/managed-browser-assist.spec.ts`
- `browser/application-assist/manifest.json`
- `browser/application-assist/popup.html`
- `browser/application-assist/popup.js`
- `browser/application-assist/submission-observer.js`
- `browser/application-assist/worker.js`
- `contracts/application-assist-session.v1.json`
- `contracts/application-companion.v1.json`
- `contracts/managed-browser-progression.v1.json`
- `docs/MANAGED_BROWSER_ASSIST.md`
- `docs/agent/ANSWER_MEMORY_COMPLETION_HANDOFF.md`
- `docs/agent/TRIFECTA.md`
- `harness/contracts/application-form-taxonomy.v1.json`
- `harness/reports/reusable-career-records-and-title-selection-20261018.md`
- `tests/test_application_assist_session_contract.py`
- `tests/test_application_operator_submit.mjs`
