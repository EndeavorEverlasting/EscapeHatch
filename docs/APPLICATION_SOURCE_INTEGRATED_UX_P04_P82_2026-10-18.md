# P04 + P82 — Integrated Sources and Application UX
2026-10-18 · Parent: https://github.com/EndeavorEverlasting/EscapeHatch/issues/69

## 0. Decision and execution status

**SELECTED:** One EscapeHatch product/application shell, two integrated route-level interfaces, one account/connection/source/opportunity provenance contract. Develop independent, nonconflicting lanes IN TANDEM. Do **not** create a second Google website, candidate database, job tracker, profile store, or migration path. The existing browser-based local cockpit is the first website. Public hosting is a later independently proven deployment mode of the SAME product contracts, not a greenfield rebuild.

**STRENGTH OF EVIDENCE:** Design and machine contract written; dedicated validator/negative test pending until attached CI proves them. No source importer, OAuth production flow, new Sources route, real multi-user tenancy, or live Thyme Care journey is established by this spec. Parent's nine gates remain authoritative at `harness/contracts/application-autofill-parent.v1.json`.

**Owner:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md` retains product/plan ownership. This is a subordinate integration specification; it does not replace the parent. Index contract: `harness/contracts/application-source-integration.v1.json`. Agents MUST work from these owners and freshest refs, not chat memories or old plan floor SHAs.

## 1. Verified starting point (read before any changes)

- EscapeHatch `main`: `artifacts/escape-hatch/src/lib/storage.ts` holds current local profile, answers, applications; `src/lib/resume-import.ts` performs the actual PDF extraction/review path. Existing `/assist` is the application interface.
- PR #63: separate managed Chrome cockpit launch and attachments, OPEN/DRAFT; PR #64 stacks on #63 with reusable answers, observed live Savantage form, OPEN; no proof of generic end-to-end navigation. Preserve their existing writers.
- PR #66: `scripts/career_source_directory.py` supports private local/Drive locators and metadata; OPEN. It **does not read Google content** and is not a second career store. Reuse it (after reconciliation) as source registry, not as a complete integration.
- PR #75: bounded deterministic prepare-to-review core, OPEN/DRAFT. Focused CI at `0c40a469` proved actual Chromium against SYNTHETIC native and SPA ATS with zero terminal commits; not wired to the managed Chrome UI nor proved on real Ashby.
- PR #67 merged classifier and #68 merged persistent-Submit/decoy fixture. Old `contracts/application-assist-session.v1.json` still prohibits navigation in the MV3 extension. Versioned managed-browser navigation authority must avoid silently weakening MV3.
- TokenCorridor PR #73: refresh-capable Sheets/Google bridge, OPEN and not equivalent to live Drive content access; PR #220: Drive/Google Doc live read cert, OPEN and not live certified. Their historical docs contain create-new-OAuth instructions; this user's already-created credentials are recovery candidates, not a reason to repeat setup.
- Local source files and user-supplied private bundles can exercise document import immediately; they are NOT permission to read another user's Drive.
- **Provider boundary:** the ChatGPT-connected Drive account, TokenCorridor's local OAuth/ADC credentials, and future EscapeHatch user OAuth credentials are separate principals. Do not copy credentials or assert portability without proven token ownership/authorization.

Refresh via `git fetch --all --prune --tags`, inspect origin/main, `git status`, `git worktree list`, upstream PR heads, active writer and actual running instance before touching source. Never hard-reset/clean someone else's checkout. Inspect the listed files and compare branch SHAs immediately before integration. Do not trust this dated snapshot as current runtime proof.

## 2. Two UIs, one experience

### UI-A: **Sources & Identity** — NEW proposed `/sources` route, SAME existing EscapeHatch React/Vite application

Purpose: connect and diagnose a Google Account or private local folder; choose *specific* résumés, cover letters, career master/ledger and tracker; preview content extraction; approve profile changes with provenance and conflict decisions. One-screen no-agent experience for a normal user.

**Primary layout:** top account switcher + connection status (account identity, provider, scope, real last-successful-read, expiry/revoked/error); left source explorer (Google Picker or local file selection), right selected source manifest and preview/diff; footer `Import approved changes` with exactly named target areas. Display metadata only until an authorized content read. Explain what will/won't be shared. A distinct `Disconnect / Forget source` flow must clarify the difference between revoking a token, removing locators and deleting approved local career facts.

**States / transitions:**
`NOT_CONNECTED → EXISTING_AUTH_DISCOVERED → READ_PROVEN` for returning local user, or
`NOT_CONNECTED → ACCOUNT_PICKED → CONSENT_GRANTED → READ_PROVEN` for new account.
`READ_PROVEN → FILES_SELECTED → METADATA_READ → CONTENT_READ → EXTRACTED_PREVIEW → CONFLICT_REVIEW → APPROVED_IMPORTED`.
Recoverable: `PERMISSION_REVOKED`, `AUTH_EXPIRED`, `READ_DENIED`, `UNSUPPORTED_MIME`, `FILE_REVISION_DRIFT`, `NO_RELEVANT_CONTENT`, `OFFLINE`. Retry only bounded eligible failures, preserve previously approved content, never imply sync when only a locator or token exists.

**UX should never display or need:** OAuth client secret, access token, refresh token, user-provided Cloud Console JSON, local developer credentials. New users choose Google account and consent to the product; they don't register a Cloud project.

### UI-B: **Applications / Browser assist** — EXISTING `/assist` and existing applications/career context

Purpose: pick opportunity → verify posting freshness → resolve active candidate and role-specific artifact revisions → show document/answer provenance and outstanding questions → launch managed browser → deterministic fill + trusted intermediate progression → pause on uncertainty → `REVIEW_READY_NOT_SUBMITTED` state. It must use the exact approved source version selected/reviewed in UI-A, never a guessed latest PDF or whichever file happens to be first in Drive.

**Primary layout:** left applications queue/status, central opportunity and readiness checklist, right browser progress/evidence and unresolved issues. Context header: current user/account and selected opportunity. User can return to UI-A to fix source/provenance without losing active progress; changing a source revision invalidates affected pending fill/attachments until re-approved. No separate JSON export/import as normal UX.

**Safety:** for every automated form operation, the deterministic app—not local LLM agents—executes the canonical Fill Plan and checks the DOM. Unknown question, unsupported control, conflicting existing value, CAPTCHA/MFA/attestation or unverified intermediate effect pauses with actionable typed reason. Only user clicks the final Submit. Never infer applied status from a filled field, navigation, or speculative ATS confirmation.

### One Shell / Navigation map

`EscapeHatch cockpit → Sources (/sources) → approved career package → Applications (/assist) → managed Chrome → review-ready`

The same account, candidate model, source-provenance ledger and opportunity ID are rendered in both routes. Shared components: account indicator, current identity, source health, conflicts and status explanations. The first deployment is local-loopback as today; hosted deployment reuses the UI and domain adapters, replacing only auth/storage transport with a properly secured multi-tenant backend.

## 3. Identity, tenancy and data authority (no migration debt)

**Authoritative keys:** principal ID (local OS-bound or verified hosted user) → Google account subject/connection ID → provider file ID/revision/hash → approved source ID → canonical résumé/candidate field revision → canonical opportunity ID → attachment package revision → browser session. Every read/write is tenant-scoped on the server/provider boundary; never accept user IDs directly from browser requests as authority. Local account A cannot reuse account B's token or documents; two concurrently connected Google accounts must remain distinguishable.

**Single owner map:** existing EscapeHatch reviewed candidate/profile, applications ledger and resume-import are authoritative; PR #66 registry is a *source locator/index* not profile truth; TokenCorridor Google code or compatible adapter owns protocol/OAuth transport; `harness/contracts/application-form-taxonomy.v1.json` and preference cache own semantic answer policies; merged nav classifier plus #75 executor owns bounded intermediate navigation. No UI keeps its own diverging copy of approved facts.

**Portability:** introduce a versioned `CareerSourceProvider` boundary: `getConnectionStatus / listSelected / getFileMetadata / readSelectedContent / revokeOrDisconnect`, return typed redacted receipts. Implement `local_files` and `google_drive` providers behind this boundary. The provider contract is a *thin adapter*, not a new data store or new OAuth project for the operator. After read, route parsed text and provenance through existing user-reviewed import. Use conflict-aware idempotent source revision keys, never silently overwrite already approved values or user edits.

**Local → hosted:** local private credential store may use OS-protected user-secret storage; hosted mode requires server-side encrypted refresh-token storage, audited access policies, authenticated sessions, nonce/CSRF protections, connection/user isolation and secure account deletion. Browser must not receive refresh tokens. LocalStorage is currently a local-first prototype convenience, not sufficient hosted user isolation. Define shared domain schemas before adding a network API, then test one user and two users against the SAME application semantics. Do not copy local credential files to cloud as migration.

## 4. Google authorization and content-read contract

**Returning operator (reuse-first):** read evidence from active TokenCorridor PRs #73/#220, existing local OAuth/ADC/refreshable connector, exact stored connection identity and user-selected synced files. Attempt benign status then metadata then nonempty exact content read under *one verified user identity*. A token file or `READY` flag is NOT a content read. If one path fails inspect existing other authorized paths first. Request sign-in only after real AUTH_REQUIRED/expired/insufficient-scope evidence. Never request repeated Cloud Console credential creation by default.

**New user (product OAuth):** EscapeHatch product registers and owns its OAuth client configuration; user chooses Google account. For a selected-files first release, Google Picker + `drive.file` is preferred. This scope is per-file and cannot be treated as blanket authorization to enumerate arbitrary user folders. Check whether chosen folder selection actually grants its nested children; if not, offer explicit per-file selection or locally synced directory rather than escalating secretly. If whole-Drive discovery/bulk sync becomes essential, propose restricted `drive.readonly` scope as a **separate** consent/verification/security initiative, not default scope.

**OAuth protections:** state tied to a live initiating session and expiry; PKCE where supported; exact redirect allow-list; account subject validated on callback; anti-CSRF, anti-open-redirect and host-origin checks; encrypted token at rest; revocation/refresh/reconnect with clear status; least privilege; no secrets in console logs, receipts, screenshots, source or synthetic fixtures. Never use user-provided OAuth bearer tokens in frontend localStorage.

**Read types:** identify MIME before content action; Google native Docs export approved text/PDF; Google Sheets via authorized exact-range API or eligible export; raw PDF/DOCX via Drive media download; local PDF/DOCX/TXT through local-only parser; XLSX/CSV source through existing tracker normalization. Enforce payload/time limits, malware/untrusted-document handling, nonempty extraction and typed extraction errors. Store provenance `provider/account/file ID/mime/revision/last verified time/content hash` privately. If metadata revision changes before import, invalidate prior preview. Metadata-only listing must never set CONTENT_READ.

**Sync:** V1 explicit on-demand refresh before application; background incremental `changes.list` is optional post-V1 and must respect Google scope/quotas, tombstones, retries and revocation. Last-sync labels must describe whether they reflect metadata or content. Never overwrite an approved profile from a background read.

**Launch gates for a public hosted website:** domain/redirect registration, Privacy Policy/data deletion policy, OAuth scope classification/Google verification as applicable, token encryption/security review, secure account isolation and two-user red-team test. No public production rollout is authorized merely by this design document.

## 5. P82 experiment admission record (selected thesis, bounded falsifier)

**THESIS H1:** Two route-level interfaces sharing the existing canonical candidate/opportunity data and a versioned Google source adapter can accomplish one complete import→application handoff without an independent source website or a migration layer.

**Baseline/comparator:** Today's `src/lib/storage.ts` cockpit store and PR #66 locator-only source registry are disconnected. Alternative A = independent Google portal + separate data model + later migration; B = one giant shared UI rewrite that collides with #63/#64; C = one EscapeHatch shell with non-overlapping contract/provider/UI lanes and shared domain owner.

**Prototype #1 boundary:** architecture contract and automated guard asserting exactly one existing shell, two correctly scoped views, canonical owner references, operator-only final submission, credential/tenant separation and no deceptive content-read or completion claims. No fake OAuth authorization or screenshots passed off as live user tests.

**Measurement:** contract validator + adversarial mutations must flag duplicate owners, second app shell, forced new Cloud project per user, ChatGPT-token transfer, cross-tenant fallback, unrestricted Drive by default, auto submit, false live read, and false parent completion. Demonstrate one structural mapping `file revision → reviewed profile → opportunity → package → review-ready` without inventing a parallel store.

**Decision rule:** KEEP C only if all negative tests fail closed and it preserves the prior parent policy. REFINE if the contract cannot express a boundary; REJECT if real prototype requires duplicate identity or unresolvable migration despite shared schema. Architecture contract success is NOT UX or provider runtime validation.

**Next P82 experiment:** implement the smallest real `CareerSourceProvider` port against one existing local source and fake Google adapter with contract tests, then replace fake transport with a *real authorized* Google read on Windows (existing account), then a second disposable Google account. Compare field/provenance equality, zero tenant bleed, zero unapproved mutation, and successful read-to-review path with the same rubric. Keep last known good and remove mock-only paths before release.

## 6. P04 factoring ledger and collision-safe launch order

**Phase 0 — Coordination / isolated proof floor** (one writer): refresh remote+local state; establish clean worktrees/owners; read source branch topology; verify parent contract, core classifier and new shared UX contract. Expected: merge graph, collision map, sanitized baseline report. Forbidden: changing existing dirty branches; new Google credentials; real application mutation.

**Phase 1 — Safe parallel group:**
- **Lane A / Auth recovery (TokenCorridor owner):** inspect existing #73/#220, refreshable OAuth/ADC readiness, effective scopes and exact document read certificate; report `CONTENT_READ` only after nonempty text. Owned: TokenCorridor adapter/tests/receipt only. Forbidden: EscapeHatch UI, tokens in Git, new Cloud setup unless true consent blocker. Gate A1: real user-selected content without credential recreation.
- **Lane B / Source domain bridge (EscapeHatch isolated worktree):** reconcile PR #66 and canonical `storage.ts` / `resume-import.ts`; implement typed `CareerSourceProvider` interface, versioned per-user source references, revisions, parser routing, idempotency, conflict staging. Owned: source bridge module/contract/tests. Forbidden: #63/#64 managed browser files and duplicate candidate store. Gate B1: local file → reviewed candidate + bound opportunity using existing helpers.
- **Lane C / Sources UI design + implementation (EscapeHatch isolated worktree):** create proposed `/sources` route **in existing React shell**, with account/status, picker, selected files, preview/diff, approve/revoke flows. Depend on agreed interface from Phase 0; mocks are explicitly synthetic and cannot certify the provider. Owned: new route/components/tests, defer `src/App.tsx` route entry modification to integration owner if concurrent browser UI writer active. Gate C1: UI state/a11y/error screen tests.
- **Lane D / Managed application navigation (EscapeHatch isolated worktree):** integrate PR #75 with #63→#64 and existing #67/#68 into a versioned managed-browser navigation authority; implement actual deterministic Playwright driver; run both synthetic ATS archetypes, no final post. Owned: managed-browser integration/tests. Forbidden: new source UI and Google tokens. Gate D1: browser synthetic/journal proof with no regressions.

**Phase 2 — Integration owner, serialized where files collide:** coordinate rebases/reviews and only one writer at a time for `src/App.tsx`, `vite.config.ts`, source registry merge and canonical profile schema; bridge UI-A to real provider read and UI-B to approved package; ensure stable principal/source/opportunity identity and no hidden re-export. Run full static/unit/browser/security suite. Advance *green reviewed implementation* to main only with repo/branch authority and requirements satisfied; PR open ≠ merge.

**Phase 3 — P08 local real runtime:** use repository-owned Windows launcher and owned runtime lifecycle. Confirm real browser, real selected Google docs full text and tracker, two resume revision hashes, reviewed mapping, Thyme Care `READY_FOR_REVIEW` (no final click); then a second genuinely different ATS layout. Local browser agent may INSPECT/DEBUG and build deterministic code, but is FORBIDDEN from typing answers or clicking through the user's real employer form in lieu of the application implementation. Record sanitized DOM/effect and account-scope receipts; protect real private data.

**Phase 4 — Multi-user release readiness:** disposable second-account OAuth consent and disconnection; exact read, repeat and revocation, cross-tenant negative tests, no leak of tokens/cache/documents; verify hosted backend/session isolation and Google verification as applicable. Public hosted deploy and provider enrollment require separate operator-owned publishing and production secrets, never automatic credentials migration.

### Exact lane proof gates and closeout

Every lane must report `CHANGED | PROVED | NEXT`, branch/head SHA, files, test commands/output, real provider/runtime status, skipped checks and first actionable gate. Never claim parent completion from a plan, clean PR, unit tests, single browser page or selected document list. Restore the full parent status through issue #69 and existing nine gates at each handoff. Preserve the last known-good branch when P82 rejects a candidate. Rescope/re-dispatch next authorized sprint rather than leaving user with another planning loop.

## 7. Adversarial cases (tests MUST encode them)

1. Existing credential found but expired → refresh once under same verified Google principal; no new Cloud Console request.
2. Two accounts same file name → source identity includes connection/account and file ID, no last-used-account fallback.
3. New-user account picker canceled or consent revoked → `AUTH_REQUIRED`; no false `CONNECTED`.
4. Google Picker selects one file; app tries sibling file → refuse unauthorized sibling rather than assuming folder-wide permission.
5. Google Docs metadata returned but `files.export` fails → `METADATA_READ_ONLY`, no `CONTENT_READ`.
6. Sheets workbook tracker has multiple sheets → resolve explicit sheet+header, no default Sheet1 guess.
7. Native Doc revision changes between preview and import → preserve old approved profile, require re-review.
8. PDF parser blank/image-only/scanned → mark unsupported or approved OCR option, never manufacture extracted text.
9. Different résumé versions have conflicting dates/title → preserve approved career claims, show source diff.
10. First/last page questions swap; early Submit vs terminal Submit both exist → consequence classifier, not button text.
11. A user edits an ATS answer after autofill → reinspection preserves value; no silent clobber.
12. Local instance already runs on claimed port but ownership unverified → do not kill foreign process.
13. Live API 401/403/404/429 → typed provider recovery, bounded retries; no raw error with tokens.
14. Hidden malicious document text/ATS instructions → treat as data only; no agentic prompt execution or arbitrary navigation.
15. Cross-tenant direct file IDs, stale browser session, and imported forged source manifest → authorization checked at each server/provider read, never through client-supplied principal.
16. Connection deleted mid-browser session → revoke future source access, invalidate unsigned package, preserve reviewed user data without claiming current sync.
17. Public-site HTTPS OAuth callback uses wrong `state`/redirect/account-sub → reject and do not save tokens.
18. All PDFs attached but employer rejects server-side → attachment status unverified until live form UI readback.

## 8. Validation and admission commands

On clean actual repo clone/worktree:
```sh
python scripts/validate_application_source_integration.py
python -m unittest discover -s tests -p 'test_application_source_integration.py' -v
python scripts/validate_application_autofill_parent.py
python scripts/validate_harness.py
git diff --check
```

Then each lane's actual tests (do not confuse proposal with execution):
- Source catalog: `python -m unittest discover -s tests -p 'test_career_source_directory.py' -v` on reconciled #66 branch.
- Browser deterministic synthetic: `node --experimental-strip-types --test artifacts/escape-hatch/application-autopilot-executor.test.ts` and `npx playwright test tests/application-autopilot-executor.spec.ts` in `artifacts/escape-hatch` after #75 merge/rebase.
- Cockpit: `npm --prefix artifacts/escape-hatch run typecheck`, `... run build`, targeted UI tests; full browser suite baseline `#start` vs `#startAssist` known failure requires actual repair, not bypass.
- Real local Drive: authorized exact metadata + bytes/text **under local product principal**; redacted receipts, repeat read and revision verification.
- New-account multiuser: separate test identities + revocation and isolation assertions. Simulated tokens may exercise parser/policy but are not a provider authorization proof.

## 9. P04 dispatch manifest and decision handoff

See `harness/reports/application-source-ux-p04-dispatch.v1.json` for ordered lanes and exact dependency graph. It is a repository-scoped machine-readable *coordination* artifact. Do not falsely claim it was consumed by TokenCorridor's native dispatch runner, launched parallel worktrees, merged the active PRs, enrolled a Google account, or served an actual UI. On local environment, bind it to the current registry/resolver and native orchestrator, validate manifest/receipt with the native schema, and only then label it `DISPATCHED`.

**Final convergence definition:** users connect their own Google account (or re-use existing authorized path), choose files and verify content, review controlled profile import, pick an opportunity, and have EscapeHatch—not an AI agent—prepare a real application through the nonterminal stages with final Submit untouched. Works without rekeying Cloud credentials for returning operator and without individual Google Cloud projects for new users; preserves isolation between two users. P08 evidence + reviewed main + live runtime; no claim until then.

## 10. Normative cross-interface seam — no agent design latitude

Build a *single* transport-independent product API and bind both views to it. These are proposed contracts until implemented and versioned in product code; no claim that these TypeScript interfaces already exist:

```ts
type UserPrincipal = { principalId: string; mode: "local_user" | "hosted_authenticated" };
type SourceConnection = {
  connectionId: string; principalId: string; provider: "google_drive" | "local_files";
  providerSubject: string | null; // never an access token or email as database key
  status: "NOT_CONNECTED" | "AUTH_RECOVERY_REQUIRED" | "AUTHORIZED" |
          "CONTENT_READ_PROVEN" | "REVOKED" | "ERROR";
  scopeIds: string[]; lastContentReadAt: string | null;
};
type SelectedSource = {
  sourceId: string; principalId: string; connectionId: string;
  fileId: string; role: "master_resume" | "role_resume" |
    "cover_letter" | "application_tracker" | "other";
  mimeType: string; revision: string; fingerprint: string | null;
  status: "SELECTED" | "METADATA_READ" | "CONTENT_READ" |
    "PREVIEW_REVIEW" | "APPROVED" | "STALE" | "UNAVAILABLE";
};
type ContentReadReceipt = {
  sourceId: string; connectionId: string; revision: string;
  status: "CONTENT_READ" | "METADATA_ONLY" | "AUTH_REQUIRED" | "DENIED" |
          "UNSUPPORTED" | "EMPTY" | "STALE" | "TRANSIENT_FAILURE";
  byteCount: number | null; extractedTextLength: number | null;
  contentHash: string | null; verifiedAt: string | null;
};
type ApprovedArtifactBinding = {
  sourceId: string; revision: string; contentHash: string;
  canonicalProfileRevision: string; reviewedByPrincipalId: string;
  approvalAt: string; approved: true;
};
type ApplicationPackage = {
  principalId: string; opportunityId: string;
  masterProfileRevision: string; resume: ApprovedArtifactBinding;
  coverLetter: ApprovedArtifactBinding | null;
  answerPreferenceRevision: string; freshnessCheckedAt: string;
  status: "READY_TO_PREPARE" | "REVIEW_REQUIRED" | "PREPARING" |
          "REVIEW_READY_NOT_SUBMITTED";
};
interface CareerSourceProvider {
  getConnectionStatus(principal: UserPrincipal, connectionId: string): Promise<SourceConnection>;
  listSelected(principal: UserPrincipal, connectionId: string): Promise<SelectedSource[]>;
  getFileMetadata(principal: UserPrincipal, sourceId: string): Promise<SelectedSource>;
  readSelectedContent(principal: UserPrincipal, sourceId: string): Promise<ContentReadReceipt>;
  disconnect(principal: UserPrincipal, connectionId: string): Promise<void>;
}
```

**Enforcement:** `readSelectedContent` returns a *receipt* plus a private content stream/handle available only to the existing import pipeline; do not return résumé text, raw file bytes or credentials through public status endpoints. The caller cannot claim `CONTENT_READ` unless the provider read and parser actually returned usable content, identity/revision remained consistent and the receipt was persisted privately. `principalId` is derived from authenticated server/local runtime, never trusted from client input. `ApprovedArtifactBinding` cannot be created from a raw locator or document title.

**Exact UI-A→UI-B operation:**
1. A user selects a file with Google Picker or local chooser. The source registry creates an idempotent private `SelectedSource`.
2. Adapter reads exact metadata and then content under the connection's verified user principal; source revision and MIME are checked.
3. Existing résumé importer creates a staged, source-grounded diff against the canonical candidate profile. User approval updates only explicit affected fields with durable per-field provenance.
4. Tracker importer maps an exact existing opportunity ID (no guessed new employer). The user binds the role résumé and cover-letter revisions.
5. The application package is valid only when source hashes/revisions match approval, posting freshness is verified, unanswered required fields are surfaced and the browser session binds the same opportunity.
6. The existing deterministic browser writer fills approved data; nav classifier/driver advances **only** evidence-verified intermediate controls. It stops at `REVIEW_READY_NOT_SUBMITTED`; no ATS terminal POST can occur.
7. A later source revision or account disconnect invalidates the *currentness of dependent unsubmitted packages* with traceable revision conflict; historical approved facts remain intact until explicitly revised. The user sees exact stale dependency, not a silent sync.

**API responsibility:** One domain layer may be exposed through local loopback handlers initially and secure hosted endpoints later; the transport changes, the identifiers/policies do not. Local loopback endpoints retain existing Host/Origin/CSRF controls and must never be exposed as public endpoints. Hosted requests derive principal from the authenticated session, enforce per-tenant authorization in database and provider adapter, and are auditable without logging PII. Unknown connection/source/opportunity IDs fail closed without cross-account fallback.

**P82 next falsifier:** if two views cannot round-trip the SAME `ApplicationPackage` without copying approved candidate text into a second store, do not “solve” it with a migration adapter or manual re-export; refactor the shared model and rerun the prototype comparison.

