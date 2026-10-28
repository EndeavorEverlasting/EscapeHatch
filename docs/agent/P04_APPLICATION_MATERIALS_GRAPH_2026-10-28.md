# P00 + P01 + P08/P82/P07 (trifecta) + P04 — Supporting documents & narrative answers (2026-10-28)

## LAUNCH ORDER — do not substitute another plan for execution
1. **MAT0 — exact current repo / owner floor**: recover AGENTS, Issue #69, P04 job-board and domain résumé graph, open agent-2 PR #115, current main and exact-head CI. Local branch/runner must not overwrite agent-2 or the already approved career master.
2. **MAT1 — document graph**: validate merged `application-materials-graph.ts`, shared evidence provenance, owner isolation and 1/2/3 observed-capacity semantics. Run synthetic tests. Reuse the existing resume graph, career artifact propagation, and Answer Library; do not create duplicate career authorities.
3. **MAT2 — document storage / form inspection**: verify existing OpportunityDocumentStore persists independent resume, cover, case-study revisions with review and bytes hash. Detect exact named case-study controls, never treat generic Supporting Documents/Add as a confirmed capacity or type. Reinspect after SPA transitions; record observed slot meaning, count, accepted MIME and persistent-vs-isolated effect.
4. **MAT3 — actual browser binding**: wire `proposeApplicationMaterials` as a **mandatory** preflight in the managed attachment controller for generic supporting-document slots and match reviewed narrative answers to exact employer questions. Its current type/policy is implemented, but full employer DOM/slot receipt integration is **NOT DONE**. No default platform résumé substitution. Preserve operator-selected answer/attachment and distinct job identities. Attach only approved exact PDF bytes when permitted and operator-initiated; never attest or final Submit. After binding, verify employer accepted names and review status.
5. **MAT4 — P08**: observe a real authorized Indeed SmartApply Supporting Documents Add widget in a safe operator-owned session. One file cover, two files cover + isolated job résumé (when allowed), third case study (when actually permitted). Verify optional no-file outcome and independent “why me / why this role” text fields. Observe ZipRecruiter/Glassdoor/custom ATS effects rather than assuming cross-site parity.
6. **MAT5 — P07 converge**: run exact-head CI, managed tests, contract validator, application parent and source-propagation validators. Repair until green, integrate through repo promotion, inspect provider readback, then P08 Windows installed runtime. Parent #69 remains OPEN until full workflow proven.

## Operator correction (overrides obsolete agent-2 instruction)
The operator explicitly **restores** application supporting documents to the parent scope. Prior steering that suppressed cover-letter uploads, custom job résumés, case studies, or “why me/why this role” answers was a **regression**, not an approved product decision. Do not treat one supporting section as the same thing as a shared account-wide primary résumé. Do not blindly upload one custom role résumé to an account-wide master. The user’s preference hierarchy when the form *actually allows* those choices is: **one supporting attachment → cover letter; two → cover letter + job-specific résumé, if isolated; third → relevant reviewed case study.** Extra capacity is not evidence that a document is accepted. For specific named slots, that slot’s semantic label and accepted file types take precedence.

The private screenshot shows a generic optional Supporting documents → Add control and a separate Questions from the employer section. It **does not prove** the capacity or file type constraints; the user proposed an adaptive policy, not current DOM telemetry. Real inputs and user answers must not be copied to this public repository.

## Existing canonical owners and changed implementation
- `harness/contracts/application-materials-graph.v1.json` — typed artifact and answer node relationships and fail-closed slot-capacity policy, P01 validator.
- `artifacts/escape-hatch/src/lib/application-materials-graph.ts` — approved artifact candidates and reviewed narrative-answer IDs, versioned digests, opportunity/owner graph validation, no upload, no submit.
- `artifacts/escape-hatch/opportunity-documents.ts` — existing private per-opportunity case-study PDF staging, exact version review and hash check, no new external document owner.
- `artifacts/escape-hatch/src/components/opportunity-documents.tsx` — reviewable case-study third input, retaining résumé/cover previews and source integrity.
- `artifacts/escape-hatch/application-requirements.ts` / `src/lib/application-puzzle.ts` — classify only explicitly labelled case study; generic file remains `file`, so no guessed attachment type or maximum.
- `artifacts/escape-hatch/browser-assist-control.ts` — existing named case-study upload path extended, but **generic Add** remains review-required until exact live form adapter behavior is observed and integrated.
- `artifacts/escape-hatch/managed-prepare-fallback.ts` — unknown employer acceptance stays REVIEW_REQUIRED even when a case-study file input was populated.
- `artifacts/escape-hatch/src/lib/answer-recovery.ts` and `artifacts/escape-hatch/src/lib/assist-contract.ts` are the **existing** canonical answer source; do not duplicate or mutate them in a PR that only repairs materials selection.
- `harness/contracts/resume-selection-graph.v1.json`, `harness/contracts/career-artifact-propagation.v1.json`, `contracts/career-claim-fidelity.v1.json` remain authorities for reusable domain master, approved derivative and claim revision lineage.

## Parent acceptance and exact negative gates
- No supporting file slot => no optional document blocker and no fabricated file control.
- Observed one/two/three slots => cover, optional isolated job résumé, optional case study in that order, only when the exact site accepts the type and user has reviewed it.
- Unknown Add/widget/number, anonymous input or shared account-wide résumé persistence => REVIEW_REQUIRED; do not guess slot meaning.
- Protected named résumé slot delegates to résumé-selection-graph; a role-specific PDF never silently becomes the global master.
- A generated cover letter and “why this role” text use the same evidence graph; different surface outputs retain separate review, revision, and employer question binding.
- Mixed applicants/developers, stale source hashes, changed opportunity, missing source claim, unreviewed or duplicated document => fail closed.
- A populated input isn't an employer acceptance receipt. Navigation and final Submit stay operator-controlled. Keep observed, prepared, reviewed, attached, accepted and submitted statuses distinct.

## Runtime partition & P04 record
CURRENT_CHAT_RUNTIME + GitHub provider owns generic implementation, CI, branch/PR and repo handoff; LOCAL_AGENT_RUNTIME owns host-specific DOM probe, browser integration and P08 actual Chrome validation; OPERATOR_OR_PHYSICAL_RUNTIME controls document choices, legal/EEO attestations and terminal Submit. P04 graph has independent document-provenance and form-inspection successors, but no independent local agent/process launch was observed here; parallel-execution proof remains UNPROVEN. Manifest: `Outputs/prompt-parallel-dispatch/runs/escapehatch-materials-20261028/manifest.json`. Do not ask the operator to shuttle code or private files between agents: reuse committed repo and authorized private provider documents.

**First parent gate after this commit:** inspect current managed browser plugin on Windows, bind the reviewed application-materials policy to generic Supporting Documents DOM with a verified slot observation receipt, then P08 test actual Indeed Add. Record tool/lane/commit/CI/merge/deploy/live evidence separately.
