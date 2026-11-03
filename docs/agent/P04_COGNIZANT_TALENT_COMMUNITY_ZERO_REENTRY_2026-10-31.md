# CURRENT EXECUTION CONTRACT — 2026-11-03 (P04 + P08 + P82 + P07)

**Mission:** EscapeHatch, aided by the local agent, prepares the **Cognizant US talent-community profile** without making the operator repeat career details. This is **not** another application for the already-submitted Cognizant Data Collections Team Lead (AR/VR) role. Treat a separately authenticated Cognizant candidate account/internal profile as a *distinct* employer surface if encountered; inspect and update that existing profile only under its actual account and independent state.

**Source truth / predecessor:** the dated 2026-10-31 handoff appears below as historical evidence. Its statements that the change is uncommitted or a patch must be applied are superseded. The implementation lives in the current Git branch; verify the installed source via GitHub/main and the installation receipt rather than running the older staging patch. Owner: Issue #69; existing code stores; this handoff is not a second applicant store or governance authority.

## Launch order FIRST — executable local-agent mission

1. **Recover installed source, do not switch user state.** From the Windows machine running EscapeHatch, locate the installation-selected checkout and current runtime per `docs/WINDOWS_RUNTIME_LIFECYCLE.md`. Fetch/check GitHub, compare PR/HEAD/status/worktrees, and use a safe forward-only integration or isolated worktree when a dirty or active version exists. Do not reset, stop a separately owned Chrome, reuse test fixtures, overwrite the submitted Cognizant record, or create a second applicant owner.
2. **Start and prove private context.** Use installed `Launch-EscapeHatch.cmd` when needed, `Status-EscapeHatch.ps1` and `GET /__escapehatch/workspace/status` at the owner-bound loopback port. Status must be `READY` with recovered profile; visible login state and application data must correspond to the correct private owner. Never equate HTTP 200, fixture data or an empty profile with readiness. Continue other independent work rather than asking the operator to retype known facts.
3. **Resolve the submitted Cognizant document source automatically.** In the existing private Applications workspace and approved document store, locate the *submitted* Cognizant Data Collections Team Lead opportunity (not the community enrollment). Verify exact workspace-owned opportunity ID/URL, employer, `applied`/`follow_up`/`closed` state, and one reviewed résumé with an intact SHA-256. If multiple Cognizant reviewed résumés exist, resolve the original job from local evidence and compare selected document; fail closed on genuine divergence. Keep source IDs, URLs, name, phone, email and résumé bytes out of GitHub issues, PRs, comments, logs and fixtures.
4. **Run the native zero-reentry front door.** From the **installation-selected** repository directory, the local agent supplies privately discovered values programmatically (not by asking the user to paste them) to:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\EscapeHatch-Cognizant-TalentCommunity.ps1 -Action Status
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\EscapeHatch-Cognizant-TalentCommunity.ps1 -Action Prepare -SourceOpportunityId $resolvedCognizantJob.Id -SourceUrl $resolvedCognizantJob.Url
   ```
   `Prepare` verifies a submitted Cognizant source in the existing workspace, reuses its **reviewed, hash-verified** PDF into an **independent scope** in the same private materials store, and opens or reuses the exact managed Chrome page without reload. Scope ID: `talent-community:cognizant:us-en`; URL: `https://careers.cognizant.com/us-en/talent-community/`. The completed job remains `applied`; resume input insertion is not employer acceptance.
5. **Complete all machine-authorized live form work.** Inspect *all* controls above and below the fold, including the real DOM, labels, conditional sections, required markers and currently offered dropdown/options. Use only existing approved identity, location, phone authority, résumé, sponsorship preference, languages and interests. Call existing managed-assist `/fill` and/or `/prepare` **with the separate scope ID and exact URL**, preserving user-entered values. Use the existing required-field and option-verification classifier. A missing approved fact remains an explicit local review issue rather than invented text. For the Cognizant anonymous résumé input, verify a unique Resume label and a unique file input; then observe the site's acknowledgment, not only local `input.files`. Do not use a submitted job's separate URL or listener binding to represent community registration.
6. **Consent and terminal controls stay protected.** Never auto-check Cognizant's combined Talent Community/communications/SMS/data-sharing consent; it is **not** the existing routine applicant-privacy-notice preference. Do not use generic labeled-checkbox automation, send, Submit, register, join, sign, attest or bypass MFA/CAPTCHA. Do not treat login, click, route change or HTTP 200 as enrollment. Only the operator can decide legally/marketing-material opt-in and perform terminal submission. If a site exposes an already existing candidate profile, update only nonterminal approved fields in that same owned session and leave the real protected action isolated.
7. **Observe and reconcile independently.** Keep the original Cognizant job application status and receipt immutable. Distinguish `COMMUNITY_PROFILE_PREPARED`, `EMPLOYER_UPLOAD_ACKNOWLEDGED`, `COMMUNITY_ENROLLMENT_CONFIRMED` (actual employer receipt only) and `CANDIDATE_ACCOUNT_PROFILE_UPDATED` (actual account readback only) as independent evidence dimensions. Save any real employer observation as a sanitized local-only per-user receipt; update an authorized private canonical tracker/ledger **only after** genuine confirmation, with no forged source timestamp. If no confirmation, report `REVIEW_REQUIRED`, not submitted. No unsolicited marketing opt-in or duplicate Cognizant job application.
8. **P08 protected control:** run the new path plus one different already-proven ATS/form behavior in **isolated synthetic** environments before claiming no regression; on live Windows, preserve other open applications and the previously completed Cognizant job. Never repeat a submitted application merely to test a confirmation.
9. **Report proof:** CHANGED (exact branch/main SHA and local artifact), PROVED (source revision, file-hash validation, form readbacks, actual accepted upload, terminal/consent state), NEXT (first genuinely operator-only action or runtime blocker). Track `SOURCE_REVIEWED`, `PRIVATE_MATERIAL_REUSED`, `BROWSER_PAGE_OBSERVED`, `LIVE_FIELDS_VERIFIED`, `EMPLOYER_UPLOAD_ACKNOWLEDGED`, `ENROLLMENT_SUBMITTED`, `EMPLOYER_CONFIRMATION_OBSERVED`, and `ORIGINAL_JOB_PRESERVED` separately.

## Implementation owner and acceptance checklist

- **Reuse, not re-entry:** `opportunity-documents.ts::reuseReviewed` copies reviewed exact-hash PDF inside the same private store; rejects unreviewed, source hash mismatch and divergent target material. `browser-assist-control.ts` checks submitted Cognizant identity before reuse, not merely a string or guessed filename.
- **Separate workflow identity:** `COGNIZANT_TALENT_ID` and exact HTTPS path block aliasing a completed job into community enrollment. Managed Chrome's restored-tab guard remains intact.
- **Identity/eligibility:** `derivedContactPreferenceValues` now feeds both Fill and Prepare; approved explicit full name/location wins, partial components do not invent a value; sponsorship matches only an existing employer option.
- **Other profile choices:** `application-form-taxonomy.v1.json` recognizes spoken/written languages, primary areas, industries and new-graduate interest **only from explicitly approved preferences**. Unavailable, multiselect or ambiguous controls are review items; never invent proficiency.
- **Protected actions:** exact marketing/Talent Community/privacy/legal consent is manual-only; a generic checkbox toggle rejects such labels. Existing routine privacy-notice classifier remains narrow; Submit remains operator-controlled.
- **Tests/validators:** `node tests/test_application_assist_session.mjs`; `npm --prefix artifacts/escape-hatch run test:managed-assist`; `node --experimental-strip-types --test artifacts/escape-hatch/browser-assist-control.test.ts artifacts/escape-hatch/opportunity-documents.test.ts`; `python scripts/validate_application_autofill_parent.py`; `python scripts/validate_application_journey.py`; `npm --prefix artifacts/escape-hatch run typecheck`; `npm --prefix artifacts/escape-hatch run build`; exact-head CI and `git diff --check`. Host-specific Windows/Chrome and Cognizant-site observations are a **separate** gate.
- **Runtime placement:** repository/tool code + CI are done in remote provider/CI execution; private workspace, installed Chrome, employer form and site acknowledgment belong to `LOCAL_AGENT_RUNTIME`. The two are dependency-ordered, not falsely recorded as parallel execution. No agent must ask the operator to act as scheduler.

**PROOF CEILING:** Public GitHub tests and synthetic Chromium can prove source integration, not the user's Windows installation or Cognizant enrollment. Record these separately even when all CI checks pass. Keep Issue #69 open until all original parent gates are independently proven.

---

## Historical 2026-10-31 handoff (superseded implementation state)

# P04 + Trifecta — Cognizant talent-community zero-reentry

**Date:** 2026-10-31
**Parent:** [EscapeHatch application-autofill Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69)
**Canonical implementation owner:** [`docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`](../APPLICATION_ASSIST_AUTOPILOT_PLAN.md)
**Target form:** https://careers.cognizant.com/us-en/talent-community/
**Status at handoff:** Bounded synthetic mapper evaluated; implementation package staged outside repository because connected GitHub source/issue writes were blocked by provider safety checks. No commit, merge, installed-runtime or employer-form proof is claimed.

## Operator objective and authorization

The operator has already completed or advanced a Cognizant job application. The subsequent talent-community enrollment requests much of the same applicant data. **EscapeHatch must reuse current, previously approved private user data and the selected approved résumé** instead of demanding that the user enter it again. The two employer actions must remain independently tracked: a job application is not a talent-community enrollment and vice versa. Do not ask for accessible profile facts again, introduce a second profile authority, or represent form preparation as submission. The operator retains final Submit, legally material attestations and optional marketing consent.

## Exact P-code routing

Read the **current** TokenCorridor root `AGENTS.md`, `harness/exports/prompt-invocation-catalog.v1.json`, and `scripts/prompt_invocation_resolver.py` before acting. At handoff, the verified IDs were **P04** Repo-Aware Sprint + Harness Factoring Distributor, **P07** Repo Sprint Executor, **P08** Live Runtime Proof Executor and **P82** Prototype-Measure-Refine Delivery Loop. EscapeHatch's existing `docs/agent/TRIFECTA.md` maps the Trifecta to P08 + P82 + P07. Preserve exact IDs and avoid competing prompt copies.

Execution boundary: P04 recover repo/parent, active lanes and scope; P07 apply/check the bounded implementation; P82 test/refine the behavioral fixture; P08 on the real installed Windows managed browser observe the employer form with the operator's existing identity; P07 reconcile merge and independent status receipts. The prompt sources are workflow guidance, not authority to bypass consent or submit an application.

## Verified page-visible fields and semantic ownership

| Cognizant form | Existing EscapeHatch source | Allowed preparation |
| --- | --- | --- |
| Full name * | Approved `identity.full_name`, else approved first + last | Fill only if complete; preserve user edit |
| Email address * | Approved `identity.email` | Reuse; preserve user edit |
| Location \| City, State/Province, Country * | Approved `identity.location_summary`, else all of city + region + country | Join components only if complete; never infer a generic Location |
| Phone number | Approved phone + confirmed-primary phone authority | Reuse under existing phone gate |
| LinkedIn profile URL | Approved LinkedIn URL | Reuse |
| Resume | Opportunity-bound, operator-reviewed PDF in existing document store | Bind only to unmistakable Resume file control and verify receipt; screenshot displays a maximum of 7 MB |
| Will you now or in the future require sponsorship to work in your current country/location? * | Explicit user-approved `employment.sponsorship_required` | Match an actual available option; otherwise leave for review |

The screenshot does **not** show the whole page below the sponsorship dropdown. A live DOM inspection must discover remaining required questions, selections, acknowledgments and final action without fabricating those unseen fields. The webpage's marketing-community purpose does not imply consent to promotional emails, newsletters, optional sharing or unrelated data processing. Routine applicant-privacy notice auto-acknowledgment applies only when the stored operator opt-in is active **and** the existing narrow notice classifier recognizes it. Talent-community marketing opt-ins remain manual.

## Canonical files and implementation contract

Extend, do not clone:

- `harness/contracts/application-form-taxonomy.v1.json` (`identity.full_name` and sponsorship already exist; add composite location semantic alias and exact sponsorship wording).
- `browser/application-assist/assist-core.js` (gated Fill Plan field classification, punctuation/`|`/`?` normalization, complete-component derived values, explicit eligibility preference).
- `artifacts/escape-hatch/browser-assist-control.ts` (`derivedContactPreferenceValues` before calling the existing `managed-form.ts`; bind the approved résumé only when the Cognizant origin/path and unique Resume uploader are verified).
- `tests/test_application_assist_session.mjs`, `artifacts/escape-hatch/browser-assist-control.test.ts` (positive and negative synthetic regressions).
- This document, as a subordinate child under Issue #69; no alternative governance, source of truth or competing data store.

A guarded patch file accompanies the handoff: `escapehatch_talent_community_apply.py`. It asserts current source anchors and a clean isolated branch before touching files; failure means reconcile newer mainline instead of force-applying. It does **not** push, submit, change account settings or access the installed personal workspace.

## Next executing agent: apply, test, commit and integrate

First locate the actual installation-selected EscapeHatch checkout. Preserve existing working trees and installed browser state. Refresh provider truth and detect concurrent owners. Use an **isolated worktree** of the verified branch or rebase a new clean branch only after reconciling changes already on main. The remote branch `feat/p04-talent-community-zero-reentry-20261031` was created at GitHub baseline `c2df3cbcff4f3542a892fdeaedb4c1786e8fe5f9`; source may have advanced since. Do not overwrite other PR authors.

From the clean feature worktree, with the two artifacts stored together in a temporary handoff folder:

```powershell
python C:\path\to\escapehatch_talent_community_apply.py --repo (Get-Location).Path --commit
```

The script applies the 6 owned files and runs `node tests/test_application_assist_session.mjs`, `python scripts/validate_application_autofill_parent.py`, `python scripts/validate_application_journey.py`, `npm --prefix artifacts/escape-hatch run typecheck`, `npm --prefix artifacts/escape-hatch run test:managed-assist` (including a synthetic Chrome upload-control guard), `npm --prefix artifacts/escape-hatch run build`, and `git diff --check`, stopping on failures. The executing agent must review the exact-head CI and preserve/re-test employer user edits. Review source/branch collisions and verify the new commit; then push and open/merge PR only through authorized, passing gates. **If a check fails, repair and rerun; do not treat this handoff as a passing CI receipt.**

## P82 / P08 acceptance matrix — real user experience, not proxy completion

1. **Synthetic identity:** complete first+last produces Full name; missing last name leaves Full name blank; explicit reviewed full-name value wins and never replaces a user-entered employer value.
2. **Synthetic location:** `City, Region, Country` derived only with all three components; generic `Location` ambiguous, partial locations blank; punctuation normalization is order independent and tolerates `|` and `?`.
3. **Synthetic eligibility:** unknown sponsorship remains blank; approved Yes/No maps only to the employer option with exact semantic match; changed options, missing approval or employer wording drift result in review.
4. **Synthetic document:** select the correct reviewed, opportunity-bound PDF; unknown, duplicate or wrong-origin uploaders remain manual; local file-input insertion alone is *not* employer upload acceptance.
5. **Consent and terminal boundary:** no automatic marketing enrollment opt-in, signature, certification, data-sharing choice or final Submit; active user edits and saved authority retain precedence.
6. **Live certification on the actual installed host:** launch via `Launch-EscapeHatch.cmd` and verify workspace readiness, user-approved profile and approved document. Use the existing Applications → Assist → managed employer browser path. Inspect the exact Cognizant form *including below the fold*, prepare its fields, confirm retained DOM values, document upload acknowledgment, unresolved required questions and a review checkpoint. Preserve the current browser session. The operator alone uses final Submit and handles employer-specific MFA or other certifications.
7. **Separate receipt reconciliation:** after operator submission, independently observe the Cognizant talent-community confirmation, distinguish it from the already submitted Cognizant job application, and update the canonical private tracker with evidence, timestamp, opportunity linkage, status owner and next action. A route change, HTTP 200 or local stored value is not a verified enrollment.
8. **Portability check:** corroborate no regressions to a second unrelated ATS archetype and all nine conjunctive parent gates before ever closing Issue #69.

## Proof and preservation receipt at authorship

- **FOUND / READ:** current EscapeHatch AGENTS, issue #69 parent owner/contract, Trifecta, extension form mapper, managed form, upload path, user-approved preference contracts and targeted tests; TokenCorridor P-code catalog/resolver.
- **SYNTHETIC OBSERVED:** modified existing extension mapper was evaluated in JavaScript with invented identities. Combined Full name and `City, Region, Country` projected correctly; `Location` alone did not match; sponsorship remained unfilled until an explicit saved preference selected a matching real dropdown option. The first two iterations caught separator and question-mark normalization regressions and were refined before the successful smoke gate.
- **NOT OBSERVED:** provider code commit, GitHub PR, independent Node/TypeScript suite, exact-head CI, local Windows browser, downloaded résumé, employer attachment receipt, enrollment submission or tracker writeback.
- **PROTECTED:** original GitHub `main`, other open PRs/worktrees, user's installed Chrome/profile/resume and private applicant data; no application was submitted.

**Parent state remains OPEN.** The first remaining gate is to land and validate the implementation on an authorized checkout; only then can the local agent's outstanding job be solely live employer-form certification.
