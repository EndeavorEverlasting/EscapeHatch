# Career Source Directory — reusable P04/P08 execution doctrine

EscapeHatch owns candidate state and opportunity mapping. TokenCorridor owns the Google connector. This capability MUST NOT create a second candidate database or another Google Cloud project or OAuth client.

## Existing systems and boundaries

- EscapeHatch: existing resume importer, reviewed assist profile, opportunity store and application policy gates remain authoritative.
- TokenCorridor: Google connector under `tooling/connectors/google/`. Draft PR #73 has refreshable OAuth and Sheets transport; draft PR #220 owns live Drive and document-read certification. Neither unmerged PR is sufficient live Windows proof.
- Other established access: existing Google application-default credentials, user-approved synced Drive folders, and connected provider adapters are recovery candidates. Never copy browser cookies or secrets, or pretend ChatGPT account authorization transfers to a local agent.
- The source registry at `scripts/career_source_directory.py` saves only user-selected local/Google folder and tracker locators in a private file outside Git. It supports idempotency and privacy-preserving local metadata counts. It does NOT yet import data into the UI or prove a cloud read.

## Mandatory live P08 steps

1. On the **actual Windows host**, recover active local branches, installed providers and existing credential stores; check existing OAuth readiness safely. **Do not re-create Google credentials.**
2. Use one existing authorized path to fetch full, nonempty content from at least two real resumes: the latest role-specific version and the canonical master. Respect document revision and approval state. A token file, file listing, synthetic READY, or ChatGPT-connected read is insufficient.
3. In a private runtime, feed the actual text into the existing resume importer, validate candidate proposals/education/experience with source provenance and human-review rules. Do not auto-answer legal, EEO, accommodation or other restricted questions.
4. Read the user-selected job tracker using its preexisting local/cloud authorization, link one opportunity to the correct document version, reimport to prove deduplication, then inspect actual local EscapeHatch profile and opportunity state.
5. Produce a **redacted** receipt containing host, branch SHA, provider proof, successful real document-read count, parser/import results, ledger/linking result, conflicts and unproven gates. Final submission remains manual.

If one token path is absent, inspect other existing authorized sources before calling ACCESS_RECOVERY_REQUIRED. Only after proving actual credential expiry or missing user authorization should an operator sign-in be requested; new Cloud project/client creation is not a default recovery.

## P04 product requirements

Support selectable local directories, synchronized cloud folders and provider-native Google Drive folders; CSV/XLSX/Sheets tracker sources; staged preview/review/import; deduplication, revision conflict preservation, source-forget, and source-to-application mapping. Use EscapeHatch's canonical CareerState/profile/ledger owners; cloud integration is opt-in and read-only until separately authorized. All changes require synthetic tests and separate real-provider and actual-browser gates.

## Current proof ceiling

Source registry implementation and tests are in this branch. Local ATS, UI integration, authenticated Drive imports and Windows P08 certification are NOT yet proven. Preserve parallel worktrees/PRs, fail closed and report CHANGED | PROVED | BLOCKED | NEXT.
