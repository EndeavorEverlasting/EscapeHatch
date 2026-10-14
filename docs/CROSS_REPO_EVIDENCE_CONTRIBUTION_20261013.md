# Cross-repository contribution — FileSteward ↔ EscapeHatch (P04 / P82)

Date: 2026-10-13. Status: **candidate code; synthetic proof pending CI**.
Source: FileSteward `main@09597b68`; EscapeHatch event-journal draft PR #59,
head `61885fca` when branched. The two repos keep independent product authority.

## Transfer A — FileSteward → EscapeHatch

The FileSteward cleanup engine distinguishes `CleanupDisposition` (what the
machine has evidence for) from `AuthorizationState` (what the user approved)
and from verified execution. EscapeHatch must make the same distinction
for observed ATS form activity:

`DOM observation → redacted event → verified journal → optional evidence review
→ separately authorized CareerState transition → optional private tracker projection`

Implement the first portable portion in
`browser/application-assist/event-evidence-review.js`. It rejects malformed
envelopes, sequence gaps, hostile/unapproved payloads and false submit receipts.
Its output intentionally contains `career_state_transition=null` and
`submission_authorized=false`, even after a submit attempt. No job
application may be marked submitted by this module.

**Not copied:** FileSteward file paths, deletion UI, Windows ownership
adapters, reclaim bytes, or destructive approvals. **Not built:** an
independent career reducer; the canonical owner remains
`contracts/career-state.v1.schema.json` and EH-EVT1/EVT4
[Issue #60](https://github.com/EndeavorEverlasting/EscapeHatch/issues/60).

## Transfer B — EscapeHatch → FileSteward

FileSteward [PR #54](https://github.com/EndeavorEverlasting/FileSteward/pull/54)
adopts the relevant *pattern* of opt-in, locally scoped metadata review,
explicit user control, no inference of verified outcome. Applied to Android
and iOS, the result is a read-only mobile storage classifier that never
manufactures bytes recovered or deletion authority.

**Not copied:** EscapeHatch DOM listeners, career-status semantics, profile
values, site permissions or applicant event data. The donation is a safety
interface pattern, **not** a shared runtime dependency.

## P04 lane graph and collision policy

- **EH-G0 (this PR):** reverse donation guard, negative tests and CI on a
  branch stacked on PR #59; no modifications to the existing observer or
  real private journal. Owner: EscapeHatch event integrity.
- **FS-M0 (PR #54):** independent mobile classification code + cross-platform
  safety contract and synthetic matrix. Owner: FileSteward mobile policy.
- **EH-G1** after EVT0 live browser proof: integrate `review()` only in the
  canonical event-projection boundary; bind stable opportunity/application
  identity before any write, never infer `submitted`.
- **FS-M1/M2** independent Android/iOS adapters after M0 safety tests; native
  permission/platform evidence required before production UX.
- **Convergence:** adapt contracts and shared idioms only. No circular module
  imports, cross-repo private data movement or duplicated authoritative
  reducers. Each repo has its own CI and runtime gates.

Runtime partition: CURRENT_CHAT_RUNTIME + connected GitHub provider for these
tracked source changes. Browser extension installation, local private state,
and physical Android/iOS runtime require distinct local/device proof and
remain unobserved here. No user-local files are touched.

## P82 experiment admission and decision rule

**Thesis:** FileSteward's evidence/authorization separation can be imposed
on EscapeHatch's existing event-journal envelope without a second state
machine or employer submission authority.

**Baseline:** PR #59 already sets `submission_verified:false` on attempt
events but has no independent strict review of a stored/replayed event list.
**Candidate:** pure guard module and synthetic Node fixtures. **Measure:**
legitimate 4-event journal stays observational; corrupted/redacted payloads,
sequence gaps, duplicates, type spoofing and false submission claims all
reject; no reviewed input can produce transition or submission authority.
**Falsifier:** any fabricated success or unvalidated private event contents
accepted as trusted. **Decision:** KEEP only if exact-head CI runs the new
test and regression tests; otherwise REFINE. Browser proof and privacy
behavior in a real ATS remain separate unproven gates.

### Run order (upstream prompt ownership)

Resolve P04, P82 and P16 from TokenCorridor's current registry when continuing;
do not fork prompt text. Run
`node tests/test_application_event_evidence_review.mjs`,
`node tests/test_application_event_journal.mjs`,
`python tests/test_application_event_journal_contract.py` and current
Application Assist CI. Then perform the existing EH-EVT0 headed synthetic
browser acceptance and EVT1 replay gates. Do not merge PR #59 or its
dependent work based on these pure Node tests alone.

## Wider P04 cross-pollination inventory

This is a contribution registry **for decisions and source ownership**, not a
shared package. Only rows marked IMPLEMENTED have current candidate code.
Neither repository should autonomously consume the other's private state.

| Donor (canonical source) | Transferable mechanism | Consumer, target seam | Disposition / P82 next proof |
| --- | --- | --- | --- |
| EscapeHatch `browser/application-assist/event-journal.js` (PR #59) | Opt-in append-only metadata events, bounded retention, JSONL export, causal ordering | FileSteward `src/filesteward/deletion/receipt.py` and review UI audit history | **INVESTIGATE.** Compare current action receipts vs synthetic event replay; no rename/file contents or PII in a shared journal. FileSteward remains audit owner. |
| FileSteward `src/filesteward/models.py`, `src/filesteward/ownership/actions.py` | Evidence and authorization are different types; stale dependency evidence fails closed | EscapeHatch `event-evidence-review.js` | **IMPLEMENTED CANDIDATE** this PR. Strict, pure journal review; never grants submitted state. CI and browser integration separate. |
| FileSteward `harness/contracts/storage-ownership-evidence-graph.v1.json` | Multi-source attribution, most-protective-edge-wins, no absence→proof | EscapeHatch application source/session/opportunity attribution at EH-EVT1 | **INVESTIGATE.** Test fake ATS same-origin different opportunities and cross-origin handoffs before defining binding; do not reuse filesystem graph node types. |
| EscapeHatch `contracts/application-assist-modality.v1.json` | One semantic action registry across pointer, keyboard, phone | FileSteward `src/filesteward/visualization/` and mobile reviews | **INVESTIGATE/P129.** Compare equivalent inspect, review, revoke, export flows on desktop/touch. Do not duplicate FileSteward action/review state. |
| FileSteward `src/filesteward/deletion/{preflight,receipt}.py` | Re-check current evidence immediately before consequence; bind receipts to exact revision | EscapeHatch browser assist Fill Plan / later CareerState transitions | **INVESTIGATE.** Test paused/stale session, operator-edited field, unknown receipt and tab drift; never copy a destructive deletion executor. |
| EscapeHatch `contracts/application-companion.v1.json` | Local user-owned state, optional explicit provider sync, conflict preservation | FileSteward private mobile inventory/review state | **INVESTIGATE.** Synthetic provider conflicts and revocation; no Drive write without separate operator selection. |
| FileSteward `src/filesteward/profiles/` | Host-bound observation and privacy-separated performance receipts | EscapeHatch mobile/browser capability and diagnostic evidence | **REFERENCE ONLY.** Prove useful browser/device adaptation before transferring; no hardware profiling or workstation IDs in public applicant journal. |

### A single prioritized hypothesis per P82 lane

- **EH-EVT:** imported consequence/authority type separation makes it
  impossible for a valid or hostile observation to promote `submitted`.
  Observable assertion: 0 transitions from every synthetic journal fixture;
  preserve prior valid event counts and rejected corrupt payloads.
- **FS-MOBILE:** a platform-aware protected-scope reducer can present honest
  next actions without claiming access to restricted Android/iOS storage.
  Assertion: no authority/no estimated reclaim over 160 platform×surface×
  permission×residency combinations; exact-heading CI receipts required.
- **FS-JOURNAL (successor only):** current FileSteward action receipts might
  already be sufficient. Measure event reconstruction/retention/replay on the
  same synthetic workload first; **reject** a second event store if it adds
  duplication without improving recovery or explainability.
- **EH-ATTRIBUTION (successor only):** current session source binding may be
  enough for a single page but not different applications at the same origin.
  Falsify with ATS cases before promoting an event stream to one opportunity.

**Parallel dispatch:** EH-EVT and FS-MOBILE are independent repositories and
owners (width 2). They were executed as distinct GitHub-provider mutation
lanes within CURRENT_CHAT_RUNTIME, not fictional delegated workers. Each has
separate PR + CI; actual local browser/device proof cannot be transferred
through the provider. Remaining lanes have dependency edges and are not
treated as independently completed.

**Why we reject blind copying:** a browser `change` event is not a
filesystem mutation; an app file is not an employment application; local
bytes are not a submission receipt. Transfer consent, provenance, replay,
idempotence, verification and UX semantics through adapters and tests; keep
the owning domain models independent.
