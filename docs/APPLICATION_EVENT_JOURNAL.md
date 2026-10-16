# Application Event Journal — EH-EVT0 (current-document MVP)

**Owner:** `contracts/application-event-journal.v1.json`
**Repo:** `EndeavorEverlasting/EscapeHatch`
**Scope:** browser/application-assist, explicit opt-in for the active application tab.
**Status:** Windows headed synthetic acceptance passed on 2026-10-16; live activation observed on a posting document only. Application-form coverage, final-head CI and submission remain separate gates. See `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md` for the sanitized evidence and owned dependencies.

## Why this exists

A job seeker should not have to forward screenshots to an agent to preserve application progress. The event journal emits typed JSONL receipts in order as the user fills a form. It separates observation, control, evidence, and application-state promotion. This is **not** Google Analytics, a remote monitoring service, or a screen recorder.

`page activity → allowlisted metadata → sequential local journal → explicit JSONL export → later validated career-state projection`

The journal schema is **not** the existing `application-companion-session/v1` submission confirmation schema. It records **metadata observations only**, which can be useful inputs to an eventual evidence reducer but never authorize status `submitted`.

## What V1 actually implements

- An explicit **Listen on This Page** command in the existing shared mouse/keyboard/phone modality registry; it creates or uses an active Assist session with separate opaque opportunity/application/session IDs and a same-origin guard. Origin is not application identity. It does not autofill.
- A programmatically injected observer in Chrome/Edge using existing `activeTab` + `scripting` + `storage` permissions; no new host permissions, resident service worker, page content-script registration, or automatic activation.
- Document-level `change` and `submit` event listeners, and a coalesced MutationObserver for dynamic fields.
- A sequential browser-local event journal at `escapeHatch.applicationEventJournal.v1` (max 1000 events). Full journal stops capturing rather than silently evicting events.
- Explicit **Export Event JSONL** and confirmed **Clear Event Journal** controls. No provider sync.
- The journal contains synthetic IDs, monotonically increasing per-session sequence numbers, causal links to the prior event in the session, event type, timestamp, fixed evidence class, and only allowlisted metadata.
- The existing evidence-review owner validates append/export and storage changes. Corruption, missing runtime, failed storage and full capacity fail closed; existing data is preserved for explicit recovery, not silently replaced.
- Popup health probes the consented document while open. **LISTENING** requires a successful live observer response backed by a persisted browser-local event receipt, not just an installed extension or saved session. Document and observation IDs are independent random UUIDs, never URLs.
- Pause/Stop/Clear invalidate queued reads and drain dispatched writes before acknowledgment. Full navigation disconnects; a durable receipt does not prove observation survived unload/restart.

### Separate authorities

- **Behavior Listener:** read-only metadata observation; observations are not approved answers.
- **Application Assist:** explicit, validated Fill Plan → policy gate → DOM writer; preserve operator edits.
- **Progression Controller:** no implementation or navigation authority in this MVP. Next/Continue remain operator actions. Final review, submission and attestation are always operator-owned.

Event classes:

| Event | Stored meaning |
| --- | --- |
| `observation_started` | This document was explicitly authorized |
| `page_snapshot` | Counts of forms/known/unknown fields, missing required fields, invalid controls, file controls, submit controls |
| `field_completed` / `field_cleared` | Canonical known identity field ID and a Boolean presence indication only |
| `upload_presence_changed` | File-control attachment presence only; not filename/content |
| `submit_attempt_observed` | Form emitted submit event; explicitly `submission_verified: false` |

**Never stored:** raw answers, keystrokes, DOM HTML, employer form labels/names/IDs, arbitrary text, filenames, documents, passwords, uploaded documents, page query strings, validation messages, auth tokens, or personal contact values. Journal data remains local and private unless the operator intentionally exports/shares it.

## Use after browser-local install

1. Update your checked-out EscapeHatch repository to a reviewed/merged build; do **not** assume this branch has been deployed to your Chrome/Edge extension.
2. Open Chrome/Edge `chrome://extensions` / `edge://extensions`, enable Developer mode, Load unpacked `browser/application-assist`, or reload the already-installed development extension after updating.
3. Navigate to an application form. Optionally enter existing opaque opportunity/application IDs before starting a session; otherwise independent local IDs are generated. Use a new explicit session for another application, even on the same ATS origin. Click **Listen on This Page** and check **LISTENING** with origin, session, document, observation and last persisted receipt before editing.
4. Use **Fill Allowed Fields** only if desired; listening does not trigger fills.
5. After a full-page navigation, click **Listen on This Page** again. A same-document SPA update can be observed without reinjection.
6. At any point choose **Export Event JSONL**. Preserve the file privately. Use **Record Confirmation Evidence** only when you have actually verified submission.
7. **Pause** or **Emergency Stop** in the existing Assist controls stops recording; Clear purges existing journal only after confirmation.

## Proof / limitations

**Executable checks:** `python tests/test_application_event_journal_contract.py`, `node tests/test_application_event_journal.mjs`, `node tests/test_application_event_observer.mjs`, `node tests/test_application_event_evidence_review.mjs`, existing Application Assist suite, and `npm --prefix artifacts/escape-hatch run test:browser -- event-journal.spec.ts` (headed Chromium; Linux uses Xvfb).

**Local browser proof:** two reordered synthetic layouts, Chromium `156.0.8078.4`, 11 events each, zero private test markers in stored/exported metadata, ordered causal links, duplicate activation, SPA mutation, Pause/Resume/Stop/Clear, full reload requiring consent, and denied corrupt/null export. The temporary harness adds loopback-only host permission and a discovery worker to a copied manifest; it does **not** prove production `activeTab` permission UX. A separate actual Chrome activation proved only the then-current posting document, not a real application form or submission. Do not publish live journal contents or private binding IDs.

**Still unproven:** multi-vendor real forms/custom controls, continuous cross-page observation, crash/restart/replay recovery, live submission, Edge runtime, traffic-level audit and provider read-back. A submit event may precede server rejection; it never implies success. No automatic career-state/tracker/Drive update is implemented here.

## Successor gates

Issue #60 remains the execution ladder; the automation state report names each existing owner and executable proof gate. Synthetic acceptance and popup receipt health are implemented, not universal product certification.

1. Operator navigates to the real application form and explicitly enables **Listen on This Page** there. Verify a fresh current-document persisted receipt before claiming coverage. Do not advance the form for the operator.
2. EVT1: durable session/opportunity/application recovery, replay/deduplication and corruption handling. Independent IDs alone do not prove this gate.
3. EVT2: origin-scoped optional permission **only with explicit user authorization** if continuous cross-navigation observation is required. Never add `<all_urls>`; exclude login, IdP, payments, medical and unrelated sites.
4. EVT3: approved private semantic answer candidates and review UI; never promote observed values into reusable authority automatically.
5. EVT4/EVT5: validated idempotent private career-state reducer, then separately authorized conflict-preserving Drive/Sheets sync with provider read-back. Neither may infer `submitted` from observation.

**Next live gate:** on the application-form document, the operator clicks **Listen on This Page** and verifies its fresh receipt. Until then, application-form listening is not established.
