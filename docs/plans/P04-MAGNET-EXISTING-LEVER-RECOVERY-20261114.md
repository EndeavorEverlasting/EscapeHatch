# P04 — Magnet Forensics: recover the existing Lever application, finish safely

**Date:** 2026-11-14. **Owner:** EscapeHatch parent issue #69. **Canonical prompt:** Moonwake `P04 — [PARALLEL] Repo-Aware Sprint + Harness Factoring Distributor`, resolved from current `main` prompt registry. **Posture:** local runtime handoff; no live ATS control occurred in this GitHub planning pass.

## 1. LAUNCH ORDER — application first

1. **S0 — Recover the existing real applicant/browser session** (**first execution gate**). Inspect current local EscapeHatch/managed Chrome state without restarting Chrome, opening a duplicate application, clearing storage, or rewriting the applicant's prior inputs. Verify correct employer and role.
2. **Parallel group after S0:** **S1A — Finish the real application safely** (exclusive owner of existing ATS tab); **S1B — Run scoped required-field/resume-continuity regression checks** (read-only repo/tests, separate process, no live browser writes). Do not make S1B a dependency of S1A unless it finds a concrete safety defect.
3. **S2 — Operator final review and submission.** Only the applicant may accept privacy/attestations and activate the actual terminal Submit. The agent leaves the existing application intact and available.
4. **S3 — Original provider ledger reconciliation** only after independent employer receipt. Update the original private Google Sheet row and verify readback; no duplicate ledger or invented submission.

## 2. Floor — durable and already achieved

- The applicant **reviewed and explicitly approved the existing MASTER résumé PDF on 2026-10-27**. The local agent saw **Success!** when it attached that approved PDF to the **existing** real Magnet Lever application on 2026-10-27. This proves historical attachment success, **not attachment persistence in the live session today**, and **not employer submission**.
- A **different, Magnet-tailored résumé/PDF was created on 2026-10-28**. Its existence does not prove applicant approval. **Never overwrite the approved master attachment with that derivative** without a real reason and explicit delta approval.
- The private Magnet 33-field answer bank includes the prior applicant-corrected answer **No** for live coding, other prepared/verified answers, and protected choices. Hydrate the private source from the approved runtime; do not copy private identity, legal status, raw URLs, cloud document IDs or applicant answer bytes into this public repository.
- The original career tracker was read back on 2026-11-14 as **In Progress — Applicant**, Applied unchecked; next action is **recover and finish the prior form**. Submission requires a distinct receipt.
- Existing parent protections: EscapeHatch issue #69, merged PR #109 for required-field detection, and `docs/APPLICATION_ASSIST_SESSION.md` for DOM writer safety. Do not replay merged patches or expand the project into a new application framework before advancing the current form.

## 3. Runtime partition and collision owners

| Lane | Host | Provider | Owner and write surface | State/proof |
| --- | --- | --- | --- | --- |
| S0 | LOCAL_AGENT_RUNTIME | existing managed Chrome | local agent; read-only fingerprint/session audit | required before others; not executed from cloud |
| S1A | LOCAL_AGENT_RUNTIME | real ATS + private approved answer store | **only ATS writer**; safe verified fields | prior filled state must be preserved |
| S1B | LOCAL_AGENT_RUNTIME | git/local shell | **read-only validation** unless separate scoped code fix is warranted | can run alongside S1A after S0 |
| S2 | OPERATOR_OR_PHYSICAL_RUNTIME | real ATS | operator exclusively; privacy/legal/final submission | no automatic consent/submit |
| S3 | CURRENT_CHAT_RUNTIME or explicitly authorized local provider adapter | authenticated private Google Sheets | **only ledger writer** to original matching row | wait for independent employer receipt |

**Graph width after S0:** 2, from genuinely independent S1A/S1B. Repo-test success is not a dependency of safe already-established browser progress unless a material regression is found. Only claim parallel execution after two jobs actually overlap and return separate receipts. The present branch does **not** prove local dispatch.

## 4. First host action, then real browser work

1. In the **actual installed EscapeHatch checkout**, read the current `AGENTS.md`, inspect `git status --short`, HEAD, worktrees, current local branch and already-active browser/agent process. Preserve concurrent work and all existing browser user data.
2. Use the repo's **existing** managed browser/session attachment mechanism to select the already-open Magnet Forensics Lever form. Do **not** create a synthetic user, restart Chrome, navigate away, or assume earlier page state persisted. If the original tab is absent, recover its last private session checkpoint first; open the exact role URL only when recovery proves this is not a second application.
3. Match employer, job role, URL/origin, any opportunity/requisition identity, current form stage and non-sensitive page fingerprint. Cross-check the private **original answer-bank document**, applicant preference store, reviewed master résumé evidence and exact career ledger row.
4. Verify the **already approved master PDF** is still attached and the ATS shows its filename/attachment state. **If so, skip document review, file copying, reupload and new tailored PDF.** If the attachment genuinely disappeared, restore the *same approved bytes* from the protected original and verify upload readback; do not substitute the unapproved derivative.
5. Inspect **all currently required fields** and dynamic/conditional controls, including the already-selected user answers. Preserve any user-input value; fill only missing, genuinely authorized facts through the existing policy-gated writer. Never infer citizenship/legal status, platform tenure, years of experience or live-coding comfort from adjacent facts. Preserve **No** for live coding.
6. Reconcile the private four-sentence motivation derivative with the operator's final authored text before field use. The original five-sentence author source is not itself a four-sentence compliant form answer; preserve the original and use only a reviewed compliant derivative.
7. After every form transition, re-inventory required controls and verify value/checked/filename DOM state. Record a private field-level receipt with `REQUIRED_VERIFIED`, `REQUIRED_MISSING`, `REQUIRED_OPERATOR_ACTION`, `OPTIONAL_FILLED`, `OPTIONAL_SKIPPED`, `ATTACHMENT_VERIFIED` and `PAGE_INCOMPLETE`.
8. Stop before privacy notice acceptance, legal certification, protected declarations or final Submit. Present **only genuine residual operator-only items**, already verified safe fields and the real browser state. If the user completes final Submit, capture an employer confirmation and only then reconcile the original private tracker.

## 5. Parallel validation (independent, never an arbitrary block)

Check current installed source and relevant existing tests first, especially the merged required-field regression. Initial high-signal commands from the repository's previous parent receipts are:

```bash
python scripts/validate_application_autofill_parent.py
python scripts/validate_application_journey.py
```

For actual changed application-assist code, run repo-defined managed-assist tests, typecheck and build against the installed checkout; record true command/exit statuses, not generic PASS. Do not install new browser extensions, change account settings or rewrite protected documents as a proxy for submitting the application. Repair only an **observed** regression in an isolated owned branch with synthetic fixtures; do not commit applicant data.

## 6. Dispatch manifest and honest proof ceiling

Typed five-lane, public-safe **provisional** plan: `docs/plans/P04-MAGNET-EXISTING-LEVER-RECOVERY-20261114.dispatch.provisional.json`. It records placements, sanitized evidence aliases, dependencies, collision owners, adapter selection gates, and return contracts.

**Native P04 manifest validator missing at observed Moonwake `main` on 2026-11-14.** The canonical P04 source names `harness/contracts/prompt-parallel-dispatch.v1.json` and `scripts/prompt_parallel_dispatch.py`, but both paths were absent in direct authenticated GitHub reads. Therefore **do not describe this fallback JSON as schema-validated, executable-dispatched or merged**. At the local runtime, recheck the currently available Moonwake checkout/branch, resolve canonical P04 using `python scripts/prompt_invocation_resolver.py --text "Invoke P04 for existing Magnet application recovery"`, then if the native schema/CLI truly exists, project to `Outputs/prompt-parallel-dispatch/manifest.json`, validate and run it; record real receipts. If absent, **continue the existing ATS session now** and separately record the minimal autonomy adapter repair. An unavailable manifest tool is not evidence that the live application must restart.

## 7. Acceptance, convergence, and status reporting

- **CHANGED:** specific browser fields/attachments actually altered (if any), verified local tests, feature-branch commits and original ledger cells only when authorized and actually written.
- **PROVED:** exact current applicant/session, prior approved-master relationship, current attachment filename, full form readback, protected remaining gates; operator submission/employer confirmation only when observed independently.
- **NEXT:** first still-open executable gate on the parent objective; after form preparation, operator final review, then employer-receipt-to-ledger reconciliation.
- **Forbidden:** Gmail/contacts connectors, copying private applicant data to GitHub, replacing master résumé, publicizing private PDF, duplicate reapplication, synthetic applicant state, arbitrary profile reconfiguration, clearing live browser, auto-consent/attestation/final Submit, or claiming employer submission from “Success!” upload.

**First actionable local step:** attach read-only to the *existing* managed Chrome Magnet Lever tab using the runtime's currently verified browser/session mechanism, then verify the approved master PDF filename and live field state **before** any write or re-review request.
