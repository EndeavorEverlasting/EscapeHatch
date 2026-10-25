# Career artifact propagation — P01 operational harness

**Domain:** EscapeHatch career material preparation. **Owner governance:** root `AGENTS.md` (P00). **Validator:** `scripts/validate_career_artifact_propagation.py`. **Contract / artifact registry:** `harness/contracts/career-artifact-propagation.v1.json`. **Evidence:** `fixtures/career-artifact-propagation.v1.example.json` (synthetic only).

## Trigger and workflow
Trigger this harness whenever the operator corrects career facts, confirms a newly reported accomplishment, updates a master/tailored résumé or cover letter, or changes an application attachment. Do not wait for the operator to enumerate all derivative outputs.

1. **Orient and isolate.** Resolve the actual source document and current provider revision, the active writer and approved document boundaries, destination account, current development checkout, active local runtime, and existing application state. Never use guessed Drive IDs, reused credentials, or historical local paths as proof of current bindings.
2. **Inventory.** Read the registry; record the `changed_node` and `source_revision`; calculate its transitive descendants. Confirm which documents exist for the current opportunity. Do not mutate a protected cover letter merely because it is in the graph.
3. **Reconcile in dependency order.** Start with current editable source and master/target résumés. Make only authorized fact-preserving edits; preserve distinct employer chronology and the owner's approved language. Export derived PDFs only after their source is verified; inspect PDF page count, rendered pages and extracted text. Rebuild downstream packet manifests/hashes, preserve existing destination file IDs through verified exact-provider updates. Browser drafts are user-controlled: do not overwrite active edits or submit.
4. **Generate the complete dependency checklist before claiming completion.** Run `python scripts/validate_career_artifact_propagation.py --scaffold reviewed_source --source-revision <actual-provider-revision> > <private-untracked-receipts.json>` (or change `reviewed_source` to the specific changed node). It emits every affected dependent as `BLOCKED`, with actionable next steps; update those receipts only after real provider readbacks. Never store the filled manifest in tracked files.
5. **Receipt every descendant.** `UPDATED_VERIFIED` and `VERIFIED_UNCHANGED` require source revision, destination revision, digest and provider readback. `PROTECTED_NO_EDIT` is for user-approved material; `BLOCKED` needs a concrete next action; `NOT_APPLICABLE` is only allowed for optional nodes. Record non-current statuses instead of claiming universal synchronization.
6. **Test / report / hand off.** Store *real* receipts only in an operator-private untracked location; run `python scripts/validate_career_artifact_propagation.py --input /path/to/private-receipts.json`. Default `python scripts/validate_career_artifact_propagation.py` proves only synthetic graph semantics. Report changed/untouched/protected/blocked outputs, provider readback, export proof, packet hashes, and remaining live-browser gate.

## Codebase and canonical path seam
- Existing career content checks: `contracts/career-claim-fidelity.v1.json`, `scripts/validate_career_claim_fidelity.py`, `contracts/resume-presentation.v1.json`.
- Existing career-state validator: `scripts/validate_career_state.py`; CI owner: `.github/workflows/career-state.yml`.
- Browser application parent: `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`, `harness/contracts/application-autofill-parent.v1.json` and issue #69; this harness does **not** replace that parent's nine gates.
- Repository authority: `AGENTS.md`. Remote branch/PR and local workstation/browser are distinct runtimes.
- Canonical checkout, temporary worktree root, production/use path and observed browser entrypoint **cannot be verified by GitHub provider writes**. Resolve them via local host evidence before any workstation mutation; do not introduce another mutable clone. Existing canonical path owner must be reused when discovered, with P92 handling deeper path registry repair. A merged PR does not make the running EscapeHatch instance current.

## Failure traps / handoff
- **Wrong:** update one résumé, claim every PDF and application packet is synchronized.
- **Wrong:** edit an author-approved cover letter to match a new résumé without express authorization.
- **Wrong:** infer project duration from a dated fragment or weaken staff-development impact.
- **Wrong:** report the local application as filled, submitted or production-current based on synthetic CI.
- **Right:** list every reachable artifact with a verified, protected, blocked, or genuinely inapplicable disposition and show the first actionable outstanding gate.

**Privacy:** the tracked registry and fixture use generic synthetic roles only; no names, source document IDs, addresses, emails, career text, secrets or private packet bytes.

## DESIGN PROPOSAL — Narrative evolution without master drift

**State:** Proposed policy, NOT an implemented feature or approval to mutate private candidate documents. **Parent:** application-preparation issue #69. This extends the existing P01 career-artifact propagation harness, career-claim fidelity contract, existing reviewed-proposal model, and user-owned career state. It must not create a competing master resume, source-of-truth ledger, or data silo.

### Problem and authority order

A new opportunity can reveal better phrasing for an already true accomplishment, a role-specific emphasis, a previously undocumented fact, or a correction to a previous factual statement. These are separate events. The master resume is the approved GENERAL rendition of a career, not an unchangeable text template or evidence registry.

Keep distinct owners:
1. **Private documentary evidence and chronology:** factual anchor, with documentary, first-person user statement, and hypothesis classifications kept separate.
2. **Reviewed career claims:** approved facts and qualifications, each with provenance, date/scope constraints, contradiction notes and proof state.
3. **Narrative and voice preferences:** user's approved communication principles, accepted alternatives, explicitly rejected framings; preferences are never evidence of a fact.
4. **Editable master resume:** canonical current general expression of approved claims and voice, with source revision and stable Google document identity.
5. **Role packet:** opportunity-specific resume, required cover letter and answers derived from pinned master/claim/voice/posting revisions. Accepted local improvements stay local until separately promoted.
6. **Projections and application draft:** revision-pinned DOCX/PDF files, package manifest and employer form state. Already approved/sent items are protected.

### Proposed private narrative-change event

Record event ID and owner profile; event type (WORDING_REFINEMENT, ROLE_EMPHASIS, NEW_FACT, FACT_CORRECTION, VOICE_RULE, REJECTION); affected claim IDs; originating opportunity; original and proposed text; base source ID and exact revision/digest; semantic risk category; evidence reference or typed missing-evidence state; chosen scope (OPPORTUNITY, ROLE_LANE, REUSABLE_VOICE, MASTER); review decision (PENDING, APPROVE, REVISE, REJECT, DEFER); supersession link; downstream impact and actual provider readback receipts.

Private text, account credentials and provider locators remain in the user's approved private data owner, never a public repository fixture, agent logs or shared model memory. Public Git may hold a generic schema, synthetic examples and validators only.

### Review UI: minimum useful experience during a job application

1. Recover current approved claims, private master revision, role posting, and approved voice preferences. Pin base revisions before drafting. Do not use an easier-to-read old PDF as master authority.
2. Produce a focused role-specific draft with claim/provenance links. Different wording or order is welcome; unsupported titles, metrics, scope, dates and achievements are not.
3. Present a short side-by-side ORIGINAL / SUGGESTED diff and a one-line explanation: same meaning, role emphasis, unsupported expansion, or substantive factual correction. Semantic equivalence is a model hypothesis, not source proof.
4. Make the choices explicit: **Use here only**; **Reuse this style for this role lane**; **Propose master revision**; **Remember this voice rule**; **Reject this framing**. A NEW_FACT or FACT_CORRECTION must travel through claim-evidence review first, even if the wording is persuasive.
5. Approval to adopt a sentence does NOT authorize publication, PDF replacement, Google Drive overwrite, ATS upload, certification, or final application submission. The operator decides these separately.
6. On a master change, compute all affected artifacts using existing career-artifact-propagation.v1 graph. Preserve APPROVED_LOCKED documents. Reconcile each descendant as UPDATED_VERIFIED, VERIFIED_UNCHANGED, PROTECTED_NO_EDIT, BLOCKED or NOT_APPLICABLE. Current state requires provider readback and document/PDF verification, not just a passing synthetic test.
7. Retain rejections and earlier accepted wording. Allow rollback to an approved revision without altering previously submitted packets.

### Hard invariants for trustworthy and public use

- **A better phrase is not a new career fact.** Facts need evidence and operator review. Local stylistic approval never auto-promotes to master.
- **Don't fight the user over their canonical story.** A user correction overrides derivative agent prose but cannot silently change documentary records. If an older draft contradicts the correction, cite the conflict and offer a review diff rather than replaying the rejected wording.
- **Scope controls are real.** One role's emphasis does not become universal; general voice preferences do not force an identical cover letter for unrelated roles. Save reusable improvements for draft suggestion, not automatic release.
- **Preserve chronology, full ownership, direct contributions, training outcomes, author voice, and realistic scope.** Do not infer total program duration from a short observed evidence window, conflate employers, insert unverified numbers, or expose private employment disputes in public prose.
- **Safe concurrent revisions.** If the actual master changed since the proposed edit, show BASE / CURRENT / PROPOSED and block blind overwrite. Protect any in-progress browser form and previously approved letter.
- **Projection freshness is a separate assertion.** Source Doc modified after PDF/DOCX is a POTENTIALLY_STALE dependency until compared. Different modified dates are not themselves proof of different content. Never silently attach stale projections.
- **User's ongoing applications are the priority.** Freeze each approved application packet to source revisions so new global narrative work can continue asynchronously without clobbering active employer forms.
- **Public multi-user:** profile-scoped tenancy and storage; independent audit and consent, least privilege, private-data minimization, encryption and revocation, export/delete, adversarial file/prompt-injection tests, accessible review, recovery/rollback, no cross-user remembered claims, no résumé content in telemetry. Avoid hardcoding any particular user's life or career objective.

### Acceptance floor and delivery sequence (synthetic until real user approval)

**N1 — Contracts + migration:** Extend existing reviewed-proposal provenance/career state and propagation contract with typed wording-vs-fact events and explicit promotion scope. Add schema migration and rollback from existing v1 profiles; do not create parallel owners. Test changed facts, style-only edits, rejected language, and concurrent writes.

**N2 — Review experience:** Role packet compares before/after wording, links approved claim IDs, displays meaning change warnings, and lets users accept LOCALLY without altering master. A separate promote-to-master control displays the transitive impact graph. Rejected framing persists across agent sessions.

**N3 — Verified promotion + PDFs:** Persist only authorized private revisions. Use provider compare-and-swap, preserved Drive ID, provider revision readback, PDF render+extractable-text verification, and dependency status receipts. Protect sent letters and browser drafts.

**N4 — Public-readiness proof:** Two independent synthetic user profiles exhibit complete data isolation; rejected claims never regenerate from old versions; conflicting edits cannot silently overwrite one another; users can export/delete/revoke; no private data in logs. Verify an end-to-end approved packet on a real ATS reaching REVIEW_READY without Submit, plus a different ATS archetype. Parent #69 must not be declared complete from these narrative tests alone.

**Pending operator decisions (not assumed):**
- Should reusable role-lane phrasing be silently offered in future DRAFTS, or only when a user explicitly requests alternatives? It never silently modifies an approved document either way.
- Should approved global master wording changes require a separate confirmation per change, or can they be accepted in a single review batch after the impact preview?

**Validation owned by existing contract and harness:** career claim fidelity, career artifact propagation, resume presentation, career state, and application-autofill parent checks; add contract tests when implementation begins. A plan-only PR/CI pass is planning evidence, not provider, PDF, runtime, or public-ready proof.
