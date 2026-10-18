# Career artifact propagation — P01 operational harness

**Domain:** EscapeHatch career material preparation. **Owner governance:** root `AGENTS.md` (P00). **Validator:** `scripts/validate_career_artifact_propagation.py`. **Contract / artifact registry:** `harness/contracts/career-artifact-propagation.v1.json`. **Evidence:** `fixtures/career-artifact-propagation.v1.example.json` (synthetic only).

## Trigger and workflow
Trigger this harness whenever the operator corrects career facts, confirms a newly reported accomplishment, updates a master/tailored résumé or cover letter, or changes an application attachment. Do not wait for the operator to enumerate all derivative outputs.

1. **Orient and isolate.** Resolve the actual source document and current provider revision, the active writer and approved document boundaries, destination account, current development checkout, active local runtime, and existing application state. Never use guessed Drive IDs, reused credentials, or historical local paths as proof of current bindings.
2. **Inventory.** Read the registry; record the `changed_node` and `source_revision`; calculate its transitive descendants. Confirm which documents exist for the current opportunity. Do not mutate a protected cover letter merely because it is in the graph.
3. **Reconcile in dependency order.** Start with current editable source and master/target résumés. Make only authorized fact-preserving edits; preserve distinct employer chronology and the owner's approved language. Export derived PDFs only after their source is verified; inspect PDF page count, rendered pages and extracted text. Rebuild downstream packet manifests/hashes, preserve existing destination file IDs through verified exact-provider updates. Browser drafts are user-controlled: do not overwrite active edits or submit.
4. **Receipt every descendant.** `UPDATED_VERIFIED` and `VERIFIED_UNCHANGED` require source revision, destination revision, digest and provider readback. `PROTECTED_NO_EDIT` is for user-approved material; `BLOCKED` needs a concrete next action; `NOT_APPLICABLE` is only allowed for optional nodes. Record non-current statuses instead of claiming universal synchronization.
5. **Test / report / hand off.** Store *real* receipts only in an operator-private untracked location; run `python scripts/validate_career_artifact_propagation.py --input /path/to/private-receipts.json`. Default `python scripts/validate_career_artifact_propagation.py` proves only synthetic graph semantics. Report changed/untouched/protected/blocked outputs, provider readback, export proof, packet hashes, and remaining live-browser gate.

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
