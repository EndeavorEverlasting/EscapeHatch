# Employer profile milestones are separate from job applications

**2026-11-03 · Parent:** [P04 application assistance #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69)

## Operator outcome

The applicant's submitted Cognizant job application and accepted Cognizant talent-community enrollment are two independent facts. A company may additionally have an authenticated internal candidate account/profile; that state needs its own employer-side evidence. Answers saved in the private EscapeHatch preference store are a fourth independent dimension. A final "Thank you!" employer confirmation proves the enrollment event, but not which individual dropdown/checkbox values the employer accepted.

The operator's original, privately owned Google Sheet is the canonical job tracker. Do not clone it to repair this schema. Never embed personal answers, account IDs, contact data, local screenshots, private file paths or Drive IDs in this public repo.

## Existing tracker schema extension (Applications, columns AK:AR)

| Column | Header | Meaning |
| --- | --- | --- |
| AK | Talent Community Status | Not Assessed / Prepared / Confirmed / Disputed, independent of application status C |
| AL | Talent Community Confirmed On | Native date from employer confirmation; no guessed timestamp |
| AM | Talent Community Evidence | Human-readable source description/receipt reference; not a raw private payload |
| AN | Talent Community Answer Evidence | IDs and proof boundary of private answer store; never raw answer values |
| AO | Internal Employer Profile Status | Separate candidate-account profile stage, e.g. Not Assessed / Completed |
| AP | Internal Profile Completed On | Native date, independently evidenced |
| AQ | Internal Profile Evidence | Account profile readback or verified artifact, independent of enrollment |
| AR | Employer Profile Key | Stable company+program identifier, not private person ID |

The existing job stage/status, Applied?, submission proof and role portal profile fields A:AJ remain intact. **No automatic inference** from AK Confirmed to AO Completed, from job Applied to AK Confirmed, or from locally saved preferences to employer accepted answers.

## Code owners

- `tracker-refresh.ts` reads a bounded A1:AR1500 from the existing bound Google Sheet. It accepts older A:AJ snapshots without inventing profile completion. Parsed new values have separate typed fields in `src/lib/tracker-bridge.ts`.
- `src/lib/tracker-bridge.ts::computeTrackerMetrics` counts distinct confirmed profile keys only when a date and evidence are present, and counts distinct completed internal employer profiles only when their own date and evidence are present.
- `src/App.tsx` shows both counts and an employer-profile puzzle piece: accepted enrollment, separately stored answer evidence, and internal account progress. The answer review link leads to the local managed-assist preference owner.
- `tracker-writeback.ts` MUST keep the submission writer's hard cap of 36 columns. Existing job receipt replay is NEVER permitted to write AE:AR (including all the new employer-profile fields); new completion must have its own separate observed provider action.
- PR #179 owns the local saved-answer display, updated timestamps, reuse flags and explicit copy action. Do not copy private preferences into the tracker, commits or public issue/PR comments. Preserve that separately owned lane and integrate its exact tested head independently.

## Local-agent P08 continuation — actual answer values, no reentry

1. Resolve the installed EscapeHatch checkout and private workspace, not a test fixture. Recover the saved preference store with the existing local `GET /__escapehatch/managed-assist/preferences` owner, or open the `Reusable application answers` view after PR #179 is integrated. Read its disk-backed snapshot rather than unsaved editor state.
2. Verify **the actual values** and saved timestamps for `talent_community.primary_areas`, `talent_community.industry_preferences`, and `talent_community.new_graduate_interest` (and any other observed community question). Do not infer their values from the confirmation screenshot, repo tests, or metadata alone. Do not ask the operator to reenter known facts.
3. Preserve private answer values locally. Bind an internal profile evidence record to the stable community key, exact source revision/time and observed employer confirmation. The user can explicitly choose when to copy/export the values to a private destination; no automatic publication, no secondary applicant data store.
4. Load the bound tracker in EscapeHatch and verify the original Cognizant Data Collections Team Lead application remains submitted, its talent-community milestone is Confirmed, and the internal-account status is Not Assessed unless that separate profile is actually read back. The dashboard must show 1 confirmed community and 0 completed internal profiles at the current one-company evidence floor.
5. Verify the earlier already-working application status/receipt flow remains intact and that a submission sync cannot overwrite employer-profile columns. Observe the local UI (including saved values and milestone cards). Mark `INSTALLED_UI_PROVED` only after that real readback. A GitHub merge is not a Windows installation or an employer-accepted-values receipt.

## Status ontology

- `JOB_SUBMITTED` — employer's original job application accepted; job-specific.
- `COMMUNITY_ENROLLMENT_CONFIRMED` — employer returned the community acceptance state; company/program-specific.
- `INTERNAL_PROFILE_COMPLETED` — authenticated account/profile completed and independently read back.
- `PREFERENCE_SAVED_LOCAL` — actual value, ID, timestamp and authority persist in the user-scoped private store.
- `EMPLOYER_FORM_VALUE_VERIFIED` — actual employer control value observed, not inferred from saved preference.
- `CLOUD_TRACKER_SYNCED` — exact original Google Sheet read back after write.

These are separate statuses. No false equivalence, no blanket "all completed" when any dimension remains unresolved.

**Proof ceiling:** repository tests/CI prove parser, projection and write guards. The connected Google Sheet write/readback proves cloud metadata/ledger state. The current conversation screenshot + Cursor report establish Cognizant's visible thank-you confirmation. The actual saved preference values and local installed UI remain local-agent proof gates until observed.
