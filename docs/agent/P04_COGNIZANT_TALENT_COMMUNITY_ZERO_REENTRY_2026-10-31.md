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
