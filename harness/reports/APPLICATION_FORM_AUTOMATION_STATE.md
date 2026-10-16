# Application Form Automation State

## Evidence reviewed

Observed application screens demonstrate that one hiring flow can split recurring questions across multiple pages and can place them in an order that another employer may not use. The harness therefore treats page grouping as advisory and canonical question meaning as authoritative.

The observed question families include:

- identity/contact;
- EEO and voluntary demographic questions;
- prior-employer/work-authorization/sponsorship questions;
- desired compensation and currency;
- education level;
- reasonable-accommodation need;
- restrictive-agreement/non-compete questions;
- government debarment/exclusion/investigation questions;
- truth/accuracy certification.

No real selected answers from the observed application are tracked in the repository.

## Working

- `harness/contracts/application-form-taxonomy.v1.json` defines order-independent, employer-independent canonical question IDs and aliases.
- `harness/contracts/application-preference-cache.v1.json` defines user-owned browser-local persistence, import/export bounds, precedence, and full-clear behavior.
- EEO/demographic preferences are explicit-user-only and never inferred.
- Opportunity-specific compensation values override profile defaults.
- Legal/compliance facts require per-application confirmation.
- Truth/accuracy attestation remains manual-only.
- Unknown questions fail closed to mapping rather than guessed answers.
- `scripts/validate_application_harness.py` checks observed coverage, privacy boundaries, references, automation policies, and negative fixtures.
- The Windows durable-root resolver from the superseded harness lane is preserved as `scripts/resolve_repo.ps1`.
- Current-main Application Assist Session (`browser/application-assist`, `contracts/application-assist-session.v1.json`) ports the proven identity/contact fill matching into a persistent same-application control loop with Fill Plan → policy gate → DOM writer, Pause/Resume/Stop/Undo, and confirmation-evidence metadata.

## Broken

No known harness-contract failure at this authored floor.

## Missing / intentionally not yet established

- Product support for questionnaire families beyond the identity/contact Application Assist lane.
- Automatic capture of a newly chosen preference from arbitrary ATS controls.
- Runtime semantic matching against every ATS framework/custom component.
- A local UI for reviewing stale legal/current answers before an application.
- Live proof that the same canonical question IDs survive multiple real employers/ATS vendors.
- Automatic navigation or submission. These remain forbidden at this harness floor.
- Automatic certification/attestation. This remains intentionally manual.

## Principal risks

- Encoding employer/page order instead of semantic question identity.
- Treating sensitive demographic answers as inferable facts.
- Reusing opportunity-specific salary expectations globally.
- Reusing stale legal/compliance answers without current confirmation.
- Committing real browser preference state or selected answers.
- Expanding alias matching until ambiguous questions are silently misclassified.
- Confusing successful field fill with authorization to submit an application.

## Validation

Run:

```text
python scripts/validate_governance.py
python scripts/validate_application_harness.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
python tests/test_application_assist_session_contract.py
node tests/test_application_assist_session.mjs
git diff --check
```

On Windows, also run:

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
```

## Proof ceiling

Repository contracts, validators, CI, and sanitized semantic coverage can prove harness readiness. They cannot prove third-party ATS behavior or the correctness/currentness of a user's private answers without observed browser runtime evidence.

## Listener certification — 2026-10-16 local Windows run

**Candidate branch:** `feat/listener-windows-browser-proof-20261016`.
**Source floor:** PR #59 plus PR #61 at `ec7cd429c5eadb0bd473fe73186b86d3ce5390d6`.
**Integration starting HEAD:** `4d0119b9a744c5f286fadf2aa9eecc54b6ce2f70` (capture hardening).
The commit containing this section identifies the reviewed candidate; use Git history rather than a self-referential commit hash in the file. Remote exact-head CI and human merge are separate from local acceptance. The original worktree and capture worktree are preserved.

### P82 result and proof ceiling

**Thesis:** opt-in current-document observation can produce ordered, private metadata without authorizing fills, navigation or submission. **Disposition: KEEP** the bounded MVP; **REFINE** claims of reusable cross-page product readiness.

- Pre-hardening negative testing exposed corrupt export despite passing baseline unit checks; do not describe that floor as fully accepted.
- Local synthetic final run: headed Chromium `156.0.8078.4`, two reordered layouts, **11 events/layout**, zero private test markers found in storage/export. This is browser-observed evidence, not merely a fake-DOM test.
- The copied test manifest has loopback-only host permission and a discovery worker. Production manifest retains only `activeTab`, `scripting`, `storage`; no host permissions/background/content scripts were added. Synthetic proof does not certify the real permission prompt.
- A separate actual Chrome install/activation produced a browser-local persisted receipt on the then-current posting document at `2026-10-16T06:57:13Z`. It was **not** the application-form document. Binding IDs, live journal, profile and private browser evidence are intentionally omitted here.
- Later source hardening is not proof of a hot update to an already-injected live observer. Do not silently reload the operator's extension/tab or interrupt their work to upgrade it.

| Acceptance | Observed result |
| --- | --- |
| Explicit activation / duplicate command | Initial persisted receipt; second command creates no duplicate events |
| Read-only activation | Form HTML unchanged; zero automatic button clicks or submit attempts |
| Canonical mapping in reordered layouts | Same three identity IDs; not proof for arbitrary wording/vendors |
| Field completion/clear / upload | Presence only; no values, names or file contents in JSONL |
| Dynamic SPA control | Snapshot reflects fourth known field without reinjection |
| Submit attempt | `submission_verified: false`; no career-state transition |
| Pause / Resume / Stop | No post-acknowledgment capture; only fresh events after Resume |
| Pending asynchronous work | Invalidated reads; control acknowledgment waits for dispatched writes |
| Clear / document reload | No resurrection after Clear; reload disconnects until explicit authorization |
| Export | Parsed JSONL equals captured events with contiguous sequence and causal links |
| Storage failure / capacity | Fault-injection stops capture, preserves prior data and reports Review Required |
| Stored corruption / null / extra data | Rejected append/export; changed corrupt storage terminates capture without rewriting it |

### Executed checks

Commands use the locally installed Node/npm and Python 3.13 runners; portable command names below identify the same checks.

| Command | Local result |
| --- | --- |
| `node tests/test_application_event_observer.mjs` | PASS, 23 lifecycle/fault tests |
| `node tests/test_application_event_journal.mjs` | PASS, ordering/privacy fixtures |
| `node tests/test_application_event_evidence_review.mjs` | PASS, valid and adversarial fixtures |
| `node tests/test_application_assist_session.mjs` | PASS, Fill Plan/control tests |
| `node tests/test_application_assist_modality.mjs` | PASS, shared modality harness |
| `python tests/test_application_event_journal_contract.py` | PASS, 4 tests |
| `python tests/test_application_assist_session_contract.py` | PASS, 8 tests |
| `python tests/test_application_assist_modality_contract.py` | PASS, 6 tests |
| `npm --prefix artifacts/escape-hatch run test:browser` | PASS, 58 tests; earlier stale legacy-popup test was repaired, not skipped |
| `npm --prefix artifacts/escape-hatch run typecheck` | PASS |
| `npm --prefix artifacts/escape-hatch run test:unit` | PASS, 25 tests |
| `npm --prefix artifacts/escape-hatch run build` | PASS |
| `python scripts/validate_application_harness.py` | PASS, 27 questions / 6 negative fixtures |
| `python scripts/validate_harness.py` | PASS, 87 registered artifacts |
| `python scripts/validate_career_state.py` | PASS, 14 negative fixtures |
| `node --check` on changed runtime JavaScript | PASS |
| `git diff --check` | PASS |

Delegated final-review launch failed with a transport error; it supplies no independent review proof. Local manual review and deterministic test runs continued. This does not replace earlier dispatch receipts or establish a new successful delegated lane.

### Changed-file inventory for the integrated certification

- Runtime: `browser/application-assist/assist-core.js`, `browser/application-assist/event-journal.js`, `browser/application-assist/event-observer.js`, `browser/application-assist/event-evidence-review.js`, `browser/application-assist/popup.js`, `browser/application-assist/popup.html`.
- Contracts: `contracts/application-event-journal.v1.json`, `contracts/application-assist-session.v1.json`.
- Tests: `tests/test_application_event_observer.mjs`, `tests/test_application_event_journal.mjs`, `tests/test_application_event_evidence_review.mjs`, `tests/test_application_event_journal_contract.py`, `tests/test_application_assist_session.mjs`, `artifacts/escape-hatch/tests/event-journal.spec.ts`, `artifacts/escape-hatch/tests/assist.spec.ts`.
- Integration/docs: `.github/workflows/application-assist.yml`, `.gitignore`, `ARTIFACT_REGISTRY.md`, `docs/APPLICATION_EVENT_JOURNAL.md`, `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md`.

## Remaining reusable-product gates — existing owners, not new authorities

Issue #60 owns the ordered EVT1–EVT6 ladder. Listener, Assist and progression authority stay separate; observation is never an approved answer or an instruction to navigate.

| Gate / state | Existing owner | Executable next proof |
| --- | --- | --- |
| First live dependency: application-form listening **UNPROVEN** | Operator + `contracts/application-event-journal.v1.json` | Operator opens the actual form, invokes Listen on This Page, verifies a fresh current-document persisted receipt; never agent-click Next |
| EVT1 durable identity / restart / replay **UNPROVEN** | `contracts/application-assist-session.v1.json`, `contracts/career-state.v1.schema.json` | Separate bounded branch adds crash/restart, same-origin separate applications, duplicate/out-of-order replay fixtures; prove no inferred submitted status |
| Semantic matching beyond identity **PARTIAL** | `harness/contracts/application-form-taxonomy.v1.json`, `skills/application-form-mapping/SKILL.md` | Add sanitized alternative wording/custom-control fixtures; unresolved ambiguity stays blank; run `python scripts/validate_application_harness.py` |
| EVT3 candidate approval / rejection **UNPROVEN** | `harness/contracts/application-preference-cache.v1.json`, `artifacts/escape-hatch/src/lib/assist-contract.ts` | Add explicit private review/provenance and rejected-candidate tests before promoting reusable values; never capture sensitive answers via listener |
| Approved answer hydration **IDENTITY ONLY** | `browser/application-assist/assist-core.js`, `contracts/application-assist-session.v1.json` | Extend canonical Fill Plan only after candidate approval; test freshness, exact option membership, unknowns and preserved edits across reordered controls |
| EVT2 continuous cross-page consent **UNPROVEN** | `contracts/application-event-journal.v1.json`, Issue #60 | Separate explicit permission UX and revoke/login/cross-origin tests; no permission expansion in this candidate |
| EVT4 progress reducer **UNIMPLEMENTED** | `browser/application-assist/event-evidence-review.js`, `contracts/career-state.v1.schema.json` | Build idempotent private projection with provenance/checkpoint and rejection tests; observed attempt alone never promotes submitted |
| EVT5 provider sync **UNPROVEN / SEPARATE AUTHORIZATION** | `contracts/application-companion.v1.json` | Explicit destination authorization, revision conflicts, provider write/read-back; no Gmail boundary crossing |
| Progression controller **NO AUTHORITY HERE** | Existing session/journal authority contracts | Keep Next/Continue/final review/submit/attestation operator-only; broader progression needs a separate explicit contract and proof |

**Next live action:** operator opens the application form and invokes **Listen on This Page** there. Until a fresh receipt is verified, say “application-form coverage unproven,” not “I am listening to your application.” A posting receipt is not continuous coverage or a submission receipt.
