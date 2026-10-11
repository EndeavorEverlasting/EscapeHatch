# Application Event Journal — EH-EVT0 (current-document MVP)

**Owner:** `contracts/application-event-journal.v1.json`  
**Repo:** `EndeavorEverlasting/EscapeHatch`  
**Scope:** browser/application-assist, explicit opt-in for the active application tab.  
**Status:** repository implementation pending CI + real Chrome/Edge acceptance.

## Why this exists

A job seeker should not have to forward screenshots to an agent to preserve application progress. The event journal emits typed JSONL receipts in order as the user fills a form. It separates observation, control, evidence, and application-state promotion. This is **not** Google Analytics, a remote monitoring service, or a screen recorder.

`page activity → allowlisted metadata → sequential local journal → explicit JSONL export → later validated career-state projection`

The journal schema is **not** the existing `application-companion-session/v1` submission confirmation schema. It records **metadata observations only**, which can be useful inputs to an eventual evidence reducer but never authorize status `submitted`.

## What V1 actually implements

- An explicit **Listen on This Page** command in the existing shared mouse/keyboard/phone modality registry; it creates or uses the active same-origin Assist session. It does not autofill.
- A programmatically injected observer in Chrome/Edge using existing `activeTab` + `scripting` + `storage` permissions; no new host permissions, resident service worker, page content-script registration, or automatic activation.
- Document-level `change` and `submit` event listeners, and a coalesced MutationObserver for dynamic fields.
- A sequential browser-local event journal at `escapeHatch.applicationEventJournal.v1` (max 1000 events). Full journal stops capturing rather than silently evicting events.
- Explicit **Export Event JSONL** and confirmed **Clear Event Journal** controls. No provider sync.
- The journal contains synthetic IDs, monotonically increasing per-session sequence numbers, causal links to the prior event in the session, event type, timestamp, fixed evidence class, and only allowlisted metadata.

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
3. Navigate to an application form. Click EscapeHatch **Listen on This Page**; the extension records metadata while you edit this page.
4. Use **Fill Allowed Fields** only if desired; listening does not trigger fills.
5. After a full-page navigation, click **Listen on This Page** again. A same-document SPA update can be observed without reinjection.
6. At any point choose **Export Event JSONL**. Preserve the file privately. Use **Record Confirmation Evidence** only when you have actually verified submission.
7. **Pause** or **Emergency Stop** in the existing Assist controls stops recording; Clear purges existing journal only after confirmation.

## Proof / limitations

**CI checks:** `python tests/test_application_event_journal_contract.py`, `node tests/test_application_event_journal.mjs`, `node --check browser/application-assist/event-observer.js`, existing Application Assist suite.

**Not proven from provider/CI alone:** Chrome/Edge extension injection on real ATS pages; permission effects, React page controls, data persistence across page unload, real employer submission, Windows install, cross-origin transitions, live browser UI and network traffic. A submit event may be raised before server acceptance; it does not imply success. No automatic tracker/Drive update is implemented here.

## Successor gates

1. Headed Chrome/Edge synthetic application fixture exercising observation, normal changes, unknown/sensitive fields, SPA transition, Pause/Stop, export/clear and duplicate injection.
2. Add a session health indicator, transport errors, and an explicit observer-disconnect/stop control. Verify bounded storage pressure and no loss of previously committed events.
3. Evolve origin-scoped optional permission **only with explicit user authorization** if continuous cross-navigation observation is required. Never add `<all_urls>` as a shortcut; exclude login, IdP, payments, medical and unrelated sites.
4. Add a validated, idempotent reducer from events into private `escapehatch-career-state/v1` with evidence provenance and no automatic `submitted` status. Provider Drive/Sheets sync is separately authorized and read-back verified.

**Next live gate:** merge after CI; reload the unpacked extension on a controlled synthetic employer page, then verify JSONL export and redaction before a real application.
