# EscapeHatch Career Store + Opportunity Import Plan

**Canonical plan owner:** `docs/CAREER_STORE_IMPORT_PLAN.md`  
**Plan date:** 2026-09-24  
**Planning branch:** `plan/career-store-import-20260924`  
**Target floor at planning PR creation:** `integration/replit-donor-b01f628-20260921@d0f89105ed6619263ca311df09abc2a7960f1a0d` (must be refreshed again before implementation)  
**Disposition:** planning / handoff durability only; no product-runtime implementation is authorized by this planning pass.  
**Planning PR:** #35 — `plan/career-store-import-20260924` → `integration/replit-donor-b01f628-20260921`  
**Run-scoped dispatch manifest:** `Outputs/prompt-parallel-dispatch/runs/escapehatch-career-store-import-20260924/manifest.json`

## 1. Mission

Give EscapeHatch a local, durable, database-like career store that can ingest the user's job-opportunity ledger and other users' local documents, normalize them into the same canonical career-state JSON, and make imported opportunities behave exactly like opportunities created inside the app.

The local database is a persistence adapter around `escapehatch-career-state/v1`. It is **not** a second career schema.

The required user flow is:

`local file -> decode -> map -> normalized opportunity candidates -> preview/conflict review -> transactional commit -> local career store -> ordinary EscapeHatch queue/tracking -> canonical JSON export`

## 2. Refreshed repository floor

### Provider truth

- Repository: `EndeavorEverlasting/EscapeHatch`.
- Provider default branch: `main`.
- Provider default head observed during this planning pass: `0824535b9dc1341def885a79a098d297df770ac8`.
- Provider integration branch at PR creation: `integration/replit-donor-b01f628-20260921@d0f89105ed6619263ca311df09abc2a7960f1a0d`.
- The integration branch is 119 commits ahead / 0 behind the observed default-branch head.
- Historical durable local path from repository plans: `C:\Users\pa_rperez26\OneDrive - Northwell Health\OG Laptop Backup\Desktop\dev\EscapeHatch`. A future local executor must re-resolve it rather than assume it.
- This runtime cannot resolve `github.com` from the container, so local checkout/worktree proof is unavailable here. Provider reads/writes remain available through the connected GitHub surface.

### Active overlapping work

Open work observed before this plan:

- PR #27 `feat(resume): make profile intake deterministic and zero-config`
  - touches `artifacts/escape-hatch/src/App.tsx`, `src/lib/resume-import.ts`, and persistence tests;
  - **collision:** cockpit UI, import UX, file parsing, persistence tests.
- PR #29 `recovery: align EH-A6 convergence after OpenCode Bun crash`
  - broad recovery/convergence owner;
  - **collision:** application companion, batch coordinator, docs/manifest/release surfaces.
- PR #30 `fix(batch): require provider-matched submission proof`
  - **collision:** batch coordinator and queue workflow.
- PR #31 `fix(companion): harden reconciliation evidence semantics`
  - **collision:** companion reconciliation, companion validator, queue workflow.
- Issue #26 `Route direct-email applications before browser automation`
  - routing defect is orthogonal to local import storage but consumes the same canonical application-channel semantics.

No implementation lane in this plan may overwrite those owners. Before any product mutation, refresh provider truth and either consume their integrated result or rebase an isolated lane onto the current canonical target.

### Existing canonical owners

- `contracts/career-state.v1.schema.json` already owns the durable domain graph:
  `profile -> opportunities -> resumes -> applications -> study_guidance -> evidence`.
- `contracts/application-companion.v1.json` already says the companion is a local-first adapter around canonical career state, with a `stable_user_owned_logical_store`, explicit validated import/export, and conflict preservation.
- `artifacts/escape-hatch/src/lib/storage.ts` currently owns a simpler cockpit-local `escape-hatch-workspace/v1` using browser `localStorage` for profile, answer library, and a flat application queue.
- Current cockpit persistence therefore has a **projection/adapter gap**: the visible app can persist jobs locally, but its flat `Application` shape is not the canonical career-state graph.
- `scripts/batch_coordinator.py` and companion reconciliation already operate on canonical `opportunities` and `applications`, so the new local store should feed those owners rather than create a third queue model.
- `skills/application-form-mapping/SKILL.md` is unrelated to source-document import and remains unchanged.

## 3. Architectural decision

### Canonical data model

`escapehatch-career-state/v1` remains the only canonical portable career JSON.

Do **not** invent a parallel "job database JSON" schema.

The existing cockpit `escape-hatch-workspace/v1` becomes a legacy/recovery projection. It must remain importable during migration but must not remain the long-term job-opportunity authority.

### Local database

Use a browser-local **CareerStateStore** abstraction backed by IndexedDB for the local web cockpit.

V1 intentionally stores the validated canonical career-state document as an atomic versioned record instead of prematurely splitting the graph into relational tables. IndexedDB supplies durable local database semantics while the career-state JSON remains the portable and testable contract.

Required store behavior:

- stable logical store identity across app upgrades;
- read/write canonical `escapehatch-career-state/v1`;
- monotonic `revision`;
- validate before every committed mutation;
- transactional import commit;
- preserve current state when validation/import fails;
- create an immutable pre-import/pre-migration recovery snapshot;
- deterministic export of the current canonical JSON;
- no dual-write after migration: legacy `localStorage` is read/migrated, then retired as the job-opportunity writer;
- private user data stays local unless an existing explicit sync adapter is invoked.

### Canonical opportunity coverage

The ledger contains information that is richer than the current opportunity schema. Extend `career-state.v1` backward-compatibly with optional opportunity metadata instead of flattening tracker rows into an opaque notes string.

Target optional fields:

- structured/display location;
- work mode;
- employment type;
- compensation text;
- fit rationale;
- general notes;
- discovered/found date;
- follow-up due date;
- source guidance.

Existing canonical owners continue to own these tracker concepts:

- priority -> `opportunity.priority`;
- fit score -> `opportunity.fit_score`;
- requirements/gaps -> `opportunity.requirements_gaps`;
- next action -> `opportunity.next_action`;
- apply/source links -> artifact refs;
- applied/submitted state and date -> `application` / `application.execution` / `submitted_at`;
- resume links -> `resumes`;
- study concepts/guidance -> `study_guidance`;
- confirmation/correspondence -> `evidence`.

Do not duplicate derived tracker columns inside the opportunity object merely because a spreadsheet has a column for them.

## 4. Import model

### Source classes

V1 must support local import without requiring a cloud account or agent:

1. canonical EscapeHatch career-state JSON;
2. legacy EscapeHatch workspace JSON;
3. CSV table/ledger;
4. XLSX workbook/sheet.

V1.1 extends the same pipeline to local document sources:

5. TXT / Markdown;
6. text-based PDF;
7. DOCX.

Scanned/encrypted/unsupported documents may fail closed with a clear local error. OCR is not required for the first release.

### Import pipeline

Each adapter emits a versioned, synthetic-testable `OpportunityImportPreview`, never a direct store mutation.

Required stages:

1. **decode** local file bytes without upload;
2. **identify** source format and candidate table/document region;
3. **map** source headers/fields into canonical career-state concepts;
4. **normalize** values without inventing absent facts;
5. **bind provenance** to source file + row/sheet/section;
6. **dedupe** against current local state;
7. **classify** each candidate as `NEW`, `UPDATE`, `DUPLICATE`, `CONFLICT`, or `SKIP`;
8. **preview** all changes before mutation;
9. **commit** only user-approved candidates transactionally;
10. **validate** the resulting career-state graph;
11. **receipt** the import locally without copying private source content into Git/telemetry.

### Mapping and confidence

Known tracker aliases are deterministic application logic. Examples include:

- Company / Employer / Organization -> organization
- Job Title / Role / Position -> title
- Location / Job Location -> location
- Work Arrangement / Work Mode -> work mode
- Application Status -> application/opportunity state mapping
- Link / Apply Link / Application URL -> apply/source artifact
- Date Applied -> application submitted date only when status/evidence supports it
- Requirements / Gaps -> requirements_gaps
- Key Observations / Why It Fits -> fit rationale
- Next Action -> next_action

Unknown headers stay unmapped and visible in preview. They do not silently flow into notes.

For freeform documents, extraction may produce confidence-bearing proposals. Low/ambiguous confidence requires review before commit.

### Dedupe / conflict floor

Prefer deterministic identity in this order:

1. explicit canonical opportunity/application ID from a valid EscapeHatch source;
2. exact canonical/apply/source URL identity;
3. normalized organization + role + location/work mode with corroborating source metadata.

Ambiguous matches are `CONFLICT`, not automatic updates.

Never choose the newer row/file merely because its timestamp is later.

## 5. Agent-harness factoring

This feature is normal product/application logic first. The app must work without an agent.

### Existing surfaces

- **KEEP** `skills/application-form-mapping/SKILL.md`; it maps employer application questions, not imported career documents.
- **KEEP / REWIRE INPUT** existing batch capabilities:
  - `verify_posting_freshness`
  - `reconcile_application_queue`
  - `route_application_channel`
  - `record_application_transition`
  They should consume snapshots from the local CareerStateStore after integration rather than a parallel cockpit-only queue.
- **KEEP** Application Companion as the portability/sync authority.
- **KEEP** provider adapters as adapters; local import must not pretend a local file is provider read-back.

### New capability wrappers

Only thin routing wrappers are needed; parsing and persistence remain in application code.

1. `import_career_source`
   - input: local file bytes/handle metadata, requested source adapter, current career-state revision;
   - output: `OpportunityImportPreview`;
   - side effects: none.
2. `commit_career_import`
   - input: preview identity + accepted candidate decisions + expected current revision;
   - output: new revision + import receipt;
   - guard: compare-and-set current revision and validate resulting canonical state.
3. `export_career_state`
   - input: current store identity/revision;
   - output: canonical `escapehatch-career-state/v1` JSON.

### Deterministic triggers

- `career_source_import_requested` -> `import_career_source`;
- `legacy_workspace_detected` -> migration preview;
- `career_import_conflict_detected` -> review UI, no commit;
- `career_import_commit_confirmed` -> `commit_career_import`;
- `career_store_revision_changed` -> refresh cockpit/queue projections.

No prompt or skill may become the only implementation of parsing, mapping, dedupe, or persistence.

## 6. Dependency graph and launch order

### Gate G0 — refresh and collision reconciliation

Before implementation dispatch:

- refresh `integration/replit-donor-b01f628-20260921`;
- resolve PRs #27, #29, #30, and #31;
- inspect Issue #26 only for shared channel semantics;
- verify the current `career-state`, `application-companion`, cockpit storage, batch coordinator, and resume-import floors;
- create isolated branches/worktrees per writer.

No lane may start from the stale planning SHA recorded in an older plan.

### Wave 0 — contract floor

#### EH-D0 — Canonical Career Import Contract

Mission: extend canonical career-state coverage for ledger-equivalent opportunity metadata and define the import-preview/commit contract.

Owned scope:

- `contracts/career-state.v1.schema.json`;
- `fixtures/career-state.v1.example.json`;
- `scripts/validate_career_state.py`;
- new `contracts/opportunity-import.v1.json`;
- new synthetic import fixtures/validator/tests;
- registry/map/workflow references required by the new contract.

Forbidden:

- cockpit UI;
- IndexedDB implementation;
- actual parser implementations;
- real user spreadsheets/documents;
- provider sync or final-submission behavior.

Done gate:

- backward-compatible existing fixture still passes;
- new ledger-equivalent fixture preserves all mapped canonical concepts;
- invalid/ambiguous import candidates fail closed;
- no user data is tracked.

### Wave 1 — three dependency-ready parallel lanes

#### EH-D1 — Local CareerStateStore + legacy migration

Mission: implement the stable logical local database around canonical career state.

Owned scope:

- new `artifacts/escape-hatch/src/lib/career-store.ts` and focused adapter modules;
- IndexedDB adapter;
- one-way legacy localStorage/workspace migration;
- store unit tests and recovery snapshots.

Forbidden:

- `App.tsx`;
- source-file parsing;
- batch coordinator/companion implementation;
- Drive sync;
- changing resume parser behavior.

Done gate:

- validated state survives browser restart;
- failed transaction leaves prior state byte-for-byte semantically intact;
- revision compare-and-set prevents stale overwrite;
- legacy cockpit applications migrate once without dual-write.

#### EH-D2 — Tabular source adapters

Mission: convert JSON/CSV/XLSX ledgers to deterministic import previews.

Owned scope:

- new import decoder/mapping modules;
- header alias registry;
- synthetic JSON/CSV/XLSX fixtures/tests;
- the minimum package dependency needed for XLSX parsing, if justified and license-compatible.

Forbidden:

- store commits;
- `App.tsx`;
- provider APIs;
- user-specific mapping code;
- freeform PDF/DOCX extraction.

Done gate:

- representative tracker columns map into canonical candidates;
- unknown columns remain visible/unmapped;
- row-level provenance is preserved;
- malformed files produce no mutation.

#### EH-D3 — Local document source adapters

Mission: locally decode TXT/Markdown/PDF/DOCX into reviewable opportunity proposals.

Dependency: PR #27 must be integrated or explicitly reconciled so generic document decoding does not fork the resume parser.

Owned scope:

- new generic local document-text decoder/extractor;
- opportunity-document candidate parser;
- synthetic document fixtures/tests.

Forbidden:

- OCR;
- network upload;
- direct state mutation;
- modifying resume semantics unless the shared decoder extraction is explicitly owned by convergence.

Done gate:

- text-bearing supported documents produce reviewable proposals;
- ambiguous/multi-job documents stay review-required;
- unsupported/scanned/encrypted inputs fail closed without freezing the cockpit.

### Wave 2 — import convergence

#### EH-D4 — Import Orchestrator + Dedupe/Conflict Engine

Mission: converge D1-D3 into one preview/commit pipeline.

Owned scope:

- `OpportunityImportPreview` application service;
- dedupe/conflict classifier;
- transactional commit coordinator;
- import receipt;
- unit/integration tests.

Forbidden:

- cockpit presentation;
- batch/provider mutation;
- silent merge on ambiguous identity.

Done gate:

- NEW/UPDATE/DUPLICATE/CONFLICT/SKIP are deterministic;
- commit requires accepted preview + current revision;
- re-import is idempotent;
- conflict leaves both truths preserved.

### Wave 3 — two parallel consumers

#### EH-D5 — Cockpit Import + Review UX

Mission: expose source import, mapping preview, conflict resolution, commit, and imported opportunity fields in the local cockpit.

Dependency: PR #27 integrated; EH-D4 complete.

Owned scope:

- `artifacts/escape-hatch/src/App.tsx` and narrowly related cockpit components;
- persistence/browser E2E tests;
- import/export controls.

Forbidden:

- batch coordinator internals;
- provider sync;
- hidden auto-merge;
- automatic application submission.

Done gate:

- user imports a ledger locally, sees exactly what will change, commits selected rows, reloads the browser, and sees the same opportunities;
- cancel leaves the current store unchanged;
- JSON export recreates the canonical state.

#### EH-D6 — Queue / Companion Store Integration

Mission: make imported opportunities participate in the same Batch Apply, freshness, channel, evidence, and reconciliation semantics.

Dependency: PRs #29/#30/#31 integrated; EH-D1 + EH-D4 complete.

Owned scope:

- smallest store adapters around batch coordinator and companion reconciliation;
- queue projection tests;
- no-promotion regression cases.

Forbidden:

- cockpit UI;
- source decoders;
- provider success invention;
- final submission.

Done gate:

- imported opportunity is indistinguishable from a manually created canonical opportunity to the batch coordinator;
- local import does not become provider proof;
- submitted state still requires qualifying evidence.

### Wave 4 — convergence / migration / release proof

#### EH-D7 — Career Store Acceptance + Compatibility

Mission: prove the whole local-store/import path and safely cut over legacy cockpit job persistence.

Owned scope:

- combined acceptance tests/fixtures;
- artifact registry, codebase map, workflow/operator docs;
- legacy export compatibility;
- release/version classification and promotion evidence when appropriate.

Required acceptance matrix:

1. legacy `escape-hatch-workspace/v1` -> canonical store migration;
2. canonical career-state JSON import/export round-trip;
3. CSV ledger import;
4. XLSX ledger import;
5. document proposal import with manual review;
6. duplicate re-import idempotence;
7. ambiguous conflict preservation;
8. invalid import leaves current state unchanged;
9. browser restart persistence;
10. imported opportunity enters ordinary batch queue;
11. local import does not falsely prove external tracker/provider synchronization;
12. no private source content appears in repo logs/fixtures/telemetry.

Proof ceiling: repository tests + local browser runtime. Live Google Drive/provider sync remains independently proven by its existing adapter owner.

## 7. Parallel capability disposition

Dependency graph width after EH-D0 is at least three: EH-D1, EH-D2, and EH-D3 are independently writable when their file ownership boundaries are honored.

Implementation-time parallel execution is therefore **REQUIRED**.

Current planning-runtime adapter probe:

1. native delegated/sub-agent writer API: not available in this chat runtime;
2. repo/local agent runners: repository history and user workflow evidence OpenCode/Cursor-style execution, but no callable local agent runner is exposed here;
3. connected provider/MCP: GitHub provider can mutate branches/files but does not independently execute bounded LLM implementation lanes;
4. CI matrix: available for deterministic validation, not authoring implementation;
5. local concurrent processes: container cannot clone/fetch GitHub in this runtime, so no safe independent repo writers can be launched here.

Result for this planning pass:

`PARALLEL EXECUTION: NOT_DISPATCHED — disposition is PLANNING_ONLY and no independent implementation-writer adapter is callable here.`

After explicit implementation authorization in a local repo-agent environment, the first safe rung with >=3 writer slots must dispatch EH-D1 || EH-D2 || EH-D3 immediately after EH-D0 passes.

## 8. Validation order

Each implementation lane runs its focused tests first, then the repository-owned validators relevant to touched surfaces. Convergence must include at minimum:

1. focused store/import tests;
2. cockpit unit tests;
3. cockpit Playwright persistence/import tests;
4. `python scripts/validate_career_state.py`;
5. `python scripts/validate_application_companion.py`;
6. batch/companion reconciliation tests when touched;
7. `python scripts/validate_harness.py`;
8. package typecheck/build;
9. `git diff --check`;
10. exact-candidate CI / promotion gates owned by the repository.

The repository currently does not contain `harness/contracts/prompt-parallel-dispatch.v1.json` or `scripts/prompt_parallel_dispatch.py` on the inspected integration floor, so canonical dispatch-manifest CLI validation/receipt proof is blocked by that missing harness seam. Do not impersonate that proof.

## 9. Durable artifacts and privacy

Tracked artifacts may contain only schemas, source-code behavior, synthetic fixtures, and generic mappings.

Never commit:

- the user's real job ledger;
- other users' documents;
- resume/application contents;
- addresses/contact values;
- employer application answers;
- provider tokens/credentials.

Import receipts may record source filename/type, content hash, row/sheet/section coordinates, counts, revision transition, and conflict/result codes; they must not mirror private source contents.

## 10. Deferred scope

The following are successor work, not prerequisites for the local database/import feature:

- direct Google Sheets API ingestion;
- automatic provider-side tracker synchronization;
- OCR for scanned documents;
- cloud-hosted/shared career database;
- multi-user collaborative writes;
- AI-only extraction as the sole parser;
- automatic final job submission.

The local canonical store and file import path must stand on its own first.

## 11. Completion semantics

This planning pass is complete only when:

- this plan is durable in a dedicated planning branch/PR;
- the run-scoped dispatch manifest points to this plan;
- current open-PR collisions are recorded;
- the implementation graph has explicit owners, dependencies, validation, proof ceiling, and parallel groups;
- no product implementation is falsely claimed.

The whole product outcome remains `PLANNED` until the implementation lanes are executed, validated, converged, and runtime-observed.
