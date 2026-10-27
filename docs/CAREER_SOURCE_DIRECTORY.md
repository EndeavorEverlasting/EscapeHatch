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

The source registry and selected-PDF connector-export ingress have synthetic coverage. The document UI previews saved snapshots and exposes an explicit refresh action. This does not certify native Drive OAuth, a Drive picker, automatic folder ingestion, or generalized end-to-end application readiness. Each actual connected read, private import, UI review and employer attachment requires its own runtime evidence. Preserve parallel worktrees/PRs and keep final submission manual.

## Selected PDF ingress and early review

`artifacts/escape-hatch/import-context.ts` extends the existing `import:context` entrypoint with `document`. It stages a selected PDF into the existing `OpportunityDocumentStore`; it does not create a competing résumé library or import career facts. This is a connected-agent export path, not native EscapeHatch Google authorization. An authorized connector may list candidate résumés and present their source links for early review while the agent prepares the rest of an application. Discovery, operator approval, private staging, and employer attachment are separate evidence events.

For a Drive file, read provider metadata and fetch actual PDF bytes using the existing authorized connector. For a native Google Doc, export the selected revision as PDF, then have the operator review that exported PDF. Never treat approval of mutable source text as approval of a later rendered export. Do not persist credential files, signed download URLs, or provider tokens. For local intake, use the existing chooser/drop area or the same ingress command with `source.provider=local`.

The agent creates a **private**, non-repository JSON export with this shape (synthetic example):

```json
{
  "opportunityId": "saved-opportunity-id",
  "url": "https://jobs.example.test/role/apply",
  "kind": "resume",
  "name": "review-candidate.pdf",
  "filePath": "C:/private/review-candidate.pdf",
  "expectedSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "expectedPreviousSha256": null,
  "source": {
    "provider": "google_drive",
    "fileId": "selected_provider_file_id",
    "modifiedTime": "2026-01-01T00:00:00Z"
  }
}
```

Resolve `opportunityId` and the application URL from the user's existing saved opportunity. Compute `expectedSha256` from the exact materialized PDF bytes; never copy the synthetic digest. Use `expectedPreviousSha256=null` for an empty slot; replacement requires the currently stored digest. A repeat import of identical bytes is idempotent. Local sources use exactly `{"provider":"local"}`. Drive origin is recorded connector-export metadata, not independent certification by the importer.

From `artifacts/escape-hatch`, execute `npm run import:context -- document <absolute-private-export.json>`. Nonzero exit means import failed; original package contents remain. The command prints no private contents. Its stable destination is the existing Windows-account data root; test runs must set `ESCAPEHATCH_DATA_HOME` to disposable state. Shared per-opportunity write locks follow the existing workspace SQLite lock pattern, reject overlapping CLI/UI mutations, and release on process exit without manual lock-file cleanup.

Select the saved opportunity in Application Assist, choose **Refresh saved documents**, preview the saved PDF, then confirm **I reviewed this résumé**. This can happen before opening the employer form. Source links open mutable Drive originals; the preview serves hash-verified staged bytes. Changing the bytes clears prior review; switching opportunities never carries approval to another package. CLI ingress never records approval, changes the review policy, fills the form or activates Submit. After employer attachment, verify the actual filename and acceptance indicator independently.

Native in-app Drive browsing/account consent, automatic provider freshness polling, and a cross-opportunity approval library remain unimplemented. A source locator or a successful connected read alone does not prove those capabilities.
