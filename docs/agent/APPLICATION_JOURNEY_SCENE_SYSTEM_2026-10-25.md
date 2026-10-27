# EscapeHatch application journey: canonical scene system and execution specification

**Date:** 2026-10-25. **Parent:** https://github.com/EndeavorEverlasting/EscapeHatch/issues/69. **Registry:** `contracts/application-journey-scenes.v1.json`. **Repository governance:** `AGENTS.md`. **Owner plan:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`. **Runtime source:** `artifacts/escape-hatch/browser-assist-control.ts`. **UX owner:** `artifacts/escape-hatch/src/components/managed-browser-assist.tsx`.

**Decision status:** The design and permitted behaviors below are decided; local agents own implementation, integration, test evidence, and deterministic repairs, not new strategic or aesthetic decisions. No final submission, MFA/CAPTCHA answer, password collection, live VPN toggle, or unapproved alteration of career text is authorized.

## 1. Product commitment

One downloadable Windows entrypoint -> prerequisite diagnostics and explicit installation choices -> preserved private workspace -> paste a public HTTPS job URL -> visualize current readiness and next prerequisite -> contextual question bubbles that save approved answers directly to canonical user-owned state -> one managed Chrome browser -> user authenticates there -> always-on auth checkpoint readback -> resume an authorized nonterminal preparation action in the same Chrome session -> confirm field and document effects -> stop for user final review.

**Do not open a second browser after login.** Do not infer signed-in status merely because a credential field vanished, a redirect completed, or a button was clicked. A stable recognized employer form is evidence of readiness to resume *that page*, not proof of the user's identity or completed application.

## 2. Scene IDs, transition authority and recovery

The JSON registry declares exactly 14 ordered IDs:
`INSTALL_ACQUIRE`, `INSTALL_PREFLIGHT`, `INSTALL_APPROVAL`, `INSTALL_VERIFY`, `HOME_READY`, `OPPORTUNITY_INTAKE`, `PREREQUISITES`, `APPLICATION_ENTRY`, `AUTH_HANDOFF`, `AUTH_RECHECK`, `FORM_PREPARATION`, `MANUAL_DECISION`, `FINAL_REVIEW`, `RECOVERY`.

Each scene has entry evidence, required evidence, copy, a primary action, resume key, exit rule, and route to recovery. The root validator blocks deletion, reordering, dangling transitions, missing recovery, removal of user-owned final submit, or loss of runtime/UI/installer/agent links. Consumers must derive decisions from this registry or from its canonical runtime owners rather than maintaining competing copy-based scene definitions. Scene aliases, future localization, and component placement may not change the ID/authority contract silently.

The authored wireflow is:
`INSTALL_ACQUIRE -> INSTALL_PREFLIGHT -> [INSTALL_APPROVAL if missing] -> INSTALL_VERIFY -> HOME_READY -> OPPORTUNITY_INTAKE -> PREREQUISITES -> APPLICATION_ENTRY -> [AUTH_HANDOFF -> AUTH_RECHECK] -> FORM_PREPARATION -> [MANUAL_DECISION -> FORM_PREPARATION]* -> FINAL_REVIEW`. Any scene may enter `RECOVERY`, which may return only to an explicitly registered predecessor after readback. A URL field, route change, spinner disappearance or API 200 is not completion evidence.

### Scene-specific contracts

| Scene | User sees | Readback proof | Correct next action on insufficiency |
|---|---|---|---|
| Install acquisition | one canonical download, provenance and safety warning | verified downloaded file/source and git remote | source access/permission question |
| Install preflight | explicit Git/Node/install-root readiness, preserved-data notice | installer toolchain and folder inspection | collect exactly the missing item |
| Install approval | actionable native OS permission/choice | operator approval of dependency install | stop cleanly when declined |
| Install verify | owned-health state and Start shortcut | canonical runtime status, not process presence | ownership diagnostics |
| Home ready | URL intake primary focus | validated workspace, no profile swap | recovery if source corrupted |
| Opportunity intake | pasted URL with observed vacancy freshness vs unknown | exact URL/opportunity identity and site availability | review unresolved posting freshness; don't pretend OPEN |
| Prerequisites | one question at a time, why, destination, skip only if optional | user-confirmed value or trusted source readback; reviewed file hash | ask, upload/preview exact version, or defer |
| Application entry | managed Chrome launched and bound | observed browser/session/origin | clarify login/entry state |
| Auth handoff | credential work clearly belongs to employer Chrome | same managed session, visible login/email-first gate or SSO origin | show sign-in instructions and **I've signed in — check again** |
| Auth recheck | subtle detecting state, same-window continuation | two stable observations of same recognized form and origin | poll again or user-triggered Check again |
| Form preparation | current and pending mapped fields, document effects | per-field DOM readback, file-picker state and separate employer accepted receipt | ask one missing allowed question |
| Manual decision | explicit question, impact, destination and provenance | user-entered saved value or protected manual-only decision | never guess eligibility, EEO, attestation |
| Final review | reviewed details and employer final action | trusted final boundary; no terminal automation | user personally reviews/ submits |
| Recovery | exact blocked step with retry/resume, never silent reset | typed error, safe same-session/installation readback | re-enter named preceding scene |

### Authentication continuity acceptance

- Detect password form and email-first Continue form as auth handoff, including the micro1-style entry. Credential fields and SSO page DOM values are never collected or logged.
- On identity-provider cross-origin navigation, observe the origin only; user stays in the existing browser. No autofill, document upload, or navigation on that external origin.
- When returned to original employer origin, classify visible *application fields*, not the absence of password inputs; require **two stable readbacks** of same page URL/form signature before `APPLICATION_FORM_READY`.
- Poll every 1.5 seconds while Chrome remains open. Also provide a prominently labeled, keyboard-accessible **I've signed in — check again** action; neither an extra click nor polling can falsely certify success.
- A prior explicit Launch may authorize one post-login bounded Fill and only that Fill. An explicit subsequent **Resume filling this application** action must also be available and must operate in the existing Chrome page without relaunch.
- The POST `/resume` endpoint must re-inspect immediately, require the current bound employer origin and application path, and fail closed on page drift. A login redirect returning to an unexpected same-origin application path requires the UI's explicit **Yes, same job — resume filling** confirmation, which calls the guarded `/resume/bind` route before `/resume`. This never reassigns opportunity identity or grants Submit authority. Synthetic regression and actual Windows employer proof of this route are still required before broad ATS claims.
- Persist user-owned answers and document state separately from auth credentials. No code may ask for the user's password, MFA, CAPTCHA or protected legal certification in a coach bubble.
- A browser closure, window restart, changed account, source collision, or unsupported ATS must surface `RECOVERY` / `REVIEW_REQUIRED`; never report application submitted.

## 3. Prerequisite coach / thought-bubble interaction

**Chosen component language:** a compact contextual conversational panel named **Your next step**. It sits directly above the opportunity's document panel and remains visible through login. It is *not* a chatbot with discretion to invent facts or expand automation authority. Its spoken-copy equivalent is available as accessible status text.

Every question must have: `question_id`, `why_needed`, `destination`, `current_provenance`, `required_or_optional`, `choices`, `on_save_validation`, `readback`, `blocks_step`. Display one actionable question at a time, show the next incomplete step below it, and allow revisiting prior approved answers in the existing preferences UI.

**Canonical destination routing:**
- Application email -> existing private `Profile.email`; validate format; use the existing profile setter. No email auto-change if already approved.
- Approved identity contact -> existing `AssistProfile` / `ApplicationPreferences` owner, preserving contact authority.
- Reusable non-sensitive employer questions -> existing `preference-file.ts` and scoped `ApplicationPreferences` UI; never add a second answer store.
- Employer-specific answer -> opportunity override; stale or unverified values block automation.
- Role documents -> existing private `OpportunityDocumentStore` per opportunity, exact SHA review; no public commits.
- Password/MFA/CAPTCHA -> no local value; handoff instruction in Chrome.
- Attestations/eligibility/EEO/accommodation -> explicit operator-only experience, never auto-choice from résumé.
- Git/Node/dependency consent/install directory -> installer receipts/OS dialog, never save credentials in scene state.

**First implemented question:** if approved application email is missing, show *Which email should employers use to contact you?* with a real `type=email` input and **Save email to profile**. Valid save updates the existing private state; neither save nor form fill is characterized as employer acceptance. If email exists, move to the active auth or document prerequisite instead. Subsequent questions use the same typed destination/validation pattern, not freeform prompt text.

**Microcopy on login:** *Finish signing in to the employer website in Chrome. Your password and verification codes stay there.* Button: *I've signed in — check again*. On verified return: *Application form recognized. Continue where you left off.* Button: *Resume filling this application*.

UI acceptance: one primary CTA per scene, explicit Current/Next/Blocked/Done progress, no hidden key operation, focus remains sane, no loss of typed answer when a status poll fires, keyboard and screen reader readback, reduced motion, 320px/mobile and 200% zoom checks. Use existing React styling; native browser View Transitions only as optional 120–180ms progressive enhancement. Never add GSAP, Three.js, ReactFlow, CSS libraries, or stock images to solve basic form completion.

## 4. Download and bootstrap decision

**Target:** a user can download a single `Get-EscapeHatch.cmd` from the root README and run it as a Windows command executable. This is not advertised as a signed `.exe`/MSI; Windows download prompts must be respected. No automatic elevated command without the user's action.

The self-contained entrypoint asks for an empty source destination, diagnoses Git and Node, prompts before invoking official winget packages, clones the repository into the chosen isolated location, verifies the canonical `EscapeHatch-Install.ps1` is present, then delegates to the versioned installer from PR #95 for installation and managed launch. It refuses existing non-git folders and foreign remotes, does not update/reset a dirty existing repo, and preserves user workspace data. Missing PATH/tool after install must ask for a re-run instead of guessing installation success.

**Release coupling:** PR #95 currently owns installer and workspace preservation; PR #98 owns launcher fixes. This branch owns only the standalone acquisition wrapper, README entrance, scene controller and seam. It is intentionally based on PR #95. The live public main download is **NOT READY** until the stacked branch, current-main Application Puzzle and #98 launcher changes have been reconciled, all exact-head checks pass and Windows clean-machine proof is observed. No link to main is evidence the bytes are there.

**First-run user journey:** Start URL -> Runtime Health -> Resume previous verified session OR Paste a job URL -> show missing prerequisites. Installer and app must use the same scene IDs/receipts, not independent ad-hoc wizards.

## 5. Upstream registry adjudication (attached snapshot as of 2026-10-20)

Source: **00 - Upstream Intelligence Library — Registry.xlsm**, read without editing source. Workbook tabs: Start Here, Curated Sources (97), Idea Trace (150), URL Occurrences (306), Mathematical Transforms, Gaps and Next Gates. Research authority only, not code/asset approval. Sources retain provenance and adoption status.

| Registry ID | Mechanism | Decision for EscapeHatch | Reason/evidence gate |
|---|---|---|---|
| `browser-view-transitions` / public-source record | native View Transitions | ADAPT | scene continuity only, graceful no-animation fallback |
| `motion-animate-presence` / public-source record | React enter/exit sequencing | ADAPT ONLY IF PRESENT | no new dependency for primary flow; preserve focus and user input |
| `xyflow-reactflow` | diagram canvas | DEFER | useful for developer diagram, too heavy for applicant's simple progress scenes |
| `mattpocock-wayfinder` | decision map | ADAPT | typed blockers and explicit gates; never a sole runtime rule |
| public-source record | component critique/design briefs | REFERENCE | extract usability tests; respect licenses before copying code |
| public-source record | Playwright visual snapshots | ADAPT | screenshot diff across logged-out/logged-in/error/ready states |
| public-source record | WCAG animation | ADAPT | reduced motion and keyboard/assistive technology gate |
| public-source record | browser animation performance | REFERENCE | animation never blocks input, network or installer state |
| `gsap-flip` | FLIP animation | DEFER | unnecessary until core form journey passes |
| Three.js / Drei | graphics | REJECT for core journey | no graphics infrastructure on application critical path |
| public-source record | OpenCode | USE AS EXECUTION CONTEXT ONLY | not a runtime login state owner |
| public-source record | validation before push | ADAPT idea | enforce validator + CI rather than borrowing donor implementation |

### Directly relevant preserved Idea Trace themes

The source workbook records **150 preserved ideas**. The following concepts matter more to this app than cinematic donor pages. This public summary intentionally omits private registry IDs and the user's internal workbook coordinates; it is not implementation or source-code authorization:

| Theme | Original title | Implemented response / gate |
|---|---|---|
| preserved concept | *Escape Hatch one-click application autofill bridge* | Install -> paste URL -> reviewed profile -> managed Chrome -> verified fill is an integrated user journey, not isolated agents |
| preserved concept | *Escape Hatch application-proof alias protocol* | Typed scene + page effects and employer receipt must be distinct; never label an attempted fill or navigation as application success |
| preserved concept | *Bridge browser/chat sprint context gaps* | Versioned scene contract, preserved opportunity binding, validator and durable handoff replace chat-only context |
| preserved concept | *Capture personal browser-tab cycling algorithm* | Preserve the one managed Chrome context and focus; never open another browser merely to restart after login |
| preserved concept | *Use interface chronology as context evidence* | Record typed timestamped auth -> form readback events; do not infer state from model narration |
| preserved concept | *Graph repository scenes and transition coverage* | Canonical graph with 14 scene IDs, 33 allowed arcs, source-level validator and per-scene tests |
| preserved concept | *Codify reusable use-case scenes and cinematic transition coverage* | Separate scene authority from motion; all scenarios have entry, recovery, effect evidence, reduced-motion fallback |
| preserved concept | *Prototype tactile Bézier transitions and ambient scene states* | DEFER heavy motion; optional contained microtransition only after keyboard and browser proof |

The original Idea Trace is a **title and locator index**, not the full underlying Idea Inbox bodies. Only the themes and evidence statuses have been verified from the private attachment; full private source IDs and locators are deliberately not published, and underlying idea bodies have not been reconstructed. Source snapshot is dated October 20, 2026.

Workbooks' own pending gates remain: some upstream licenses unverified, examples not screenshot-tested, source coverage incomplete, Usage Matrix cached formula portability issue. We neither transfer private source IDs into public artifacts nor claim upstream code installed. The source file is not modified.

## 6. Test and integration order (agents execute; no strategy choices)

**Runtime partition:** GitHub/provider reads and branch writing in connected runtime; Node/Python synthetics in current container when source available; actual Windows PowerShell, installer, desktop Chrome, VPN and employer application live evidence on user Windows host only. Cloud provider != Windows runtime.

**Stage 1 — structural floor:** On isolated branch, run `python scripts/validate_application_journey.py`, `python scripts/validate_application_autofill_parent.py`, `python scripts/validate_governance.py`, `python scripts/validate_application_companion.py`; repair any source/routing failure. No real private career content in fixtures.

**Stage 2 — deterministic components:** From `artifacts/escape-hatch`, `npm run test:managed-assist`, `npm run typecheck`, `npm run build`, and appropriate Playwright synthetic browser tests. Add tests for email-first pages, SSO redirects, credential field never read, an unknown page, mid-poll rerender, login return, stale same-origin other job, browser close/reopen, manual Check Again, a previously authorized Fill and an unapproved auto-advance. Run on exact pinned HEAD and repair.

**Stage 3 — windows install:** On isolated Windows VM/host, download the *actual published* `Get-EscapeHatch.cmd`, choose an empty destination, approve test dependencies, install to isolated app-data, verify owned status and Start Menu shortcut, launch, paste synthetic URL, and relaunch/reload without losing user answers. Repeat with existing foreign folder, missing winget, denied dependency, stale Node, interrupted install, active foreign port, and protected dirty checkout. Confirm data never deleted. Use PR #95/98 own validators.

**Stage 4 — real browser (P08):** Use synthetic employer fixture and real managed Chrome in the exact launch path, then a real unsubmitted micro1-style email-first flow with the user's own login and two different ATS archetypes. Prove: field appears -> login user acts -> poll detects verified same-bound form -> approved fill resumes exactly once -> per-control readback -> staged PDF versus accepted file receipt separately -> user sees final review -> terminal Submit untouched. Record redacted UI screenshots and timestamps. Protect existing working fill and document controls as regression checks.

**Stage 5 — integration:** Reconcile independently owned #95 workspace/installer, #98 launcher, #100 progress/VPN/document QA, main's Application Puzzle and current branch. Do not silently replace main's newer Puzzle or weaken #69. Exact-head checks/PR review before merging; verify current main and an actually launched app after merge. A green new PR alone is not enough.

**Acceptance decision:** The parent remains OPEN until #69's nine gates are proven; this branch is a bounded foundational milestone, not a complete release. Mainline integration is authorized only after current provider protections, test and review gates pass. Application submission never automatic.

## 7. Resume-specific proof semantics

- LOGIN_VISIBLE: credential gate recognized, no secret capture.
- LOGIN_EXTERNAL: redirect observed; no IDP DOM data inspected.
- APPLICATION_FORM_CANDIDATE: first readback only, no fill yet.
- APPLICATION_FORM_READY: second stable form readback on employer origin, not submission or identity-certification proof.
- RESUME_ISSUED: explicit user action or surviving earlier Launch-only fill authority.
- FIELDS_READBACK: actually returned verified field identities; empty array means zero fields filled.
- DOCUMENT_INPUT_STAGED: file-control insertion only, not employer acceptance.
- EMPLOYER_DOCUMENT_ACCEPTED: requires ATS-specific independent acceptance signal.
- FINAL_REVIEW: independent trusted terminal control, operator-only.
- SUBMITTED: requires external employer receipt after the operator's action, never route inference.

## 8. Exact next handoff command

From a preserved local canonical checkout, create an isolated worktree for the pushed `feat/p04-resumable-scene-journey-20261025` branch and run:
```powershell
git fetch origin --prune
git worktree add ..\EscapeHatch-journey-probe origin/feat/p04-resumable-scene-journey-20261025
Set-Location ..\EscapeHatch-journey-probe
python scripts/validate_application_journey.py
python scripts/validate_application_autofill_parent.py
python scripts/validate_governance.py
Set-Location artifacts\escape-hatch
npm run test:managed-assist
npm run typecheck
npm run build
```
If the branch is already checked out elsewhere or locked by a worker, select a fresh isolated worktree path without resetting or replacing existing work. Never claim these commands ran merely because they appear in this handoff.

## 9. October 26 canonical local sprint handoff

**Purpose:** Continue and integrate the existing 14-scene/33-transition journey; do not create another architecture, career database, launcher, or agent-only promise. Owner: this runbook plus contracts/application-journey-scenes.v1.json, rooted in parent issue #69 and docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md. Parent outcome: install, recover approved career data, choose role/job URL, inspect requirements, ask only missing questions, sign in in the managed browser, recognize the returned form, resume safe verified filling/attachments/nonterminal steps, and stop for operator final review. Login, user absence, and missing information are routine resumable scenes, never reasons to erase context.

### 9.1 Provider floor and merge collisions (refresh again when sprint starts)

Observed 2026-10-26: main @ 4372430650d434338ca844a9e77eb2910c2c0e2a; draft #101 @ 3576b7bb4957f16f672619dd6913abf46a25a272 is stacked on draft #95 @ 57e2046aa406a69a04c60448a0a592c35c2d3118; draft #95 currently has dirty mergeability against main. Draft #98 owns launch front-door diagnostics. Draft #100 owns evidence-correct field/attachment states, VPN diagnosis and resume QA. Current main owns the Application Puzzle. On #101's observed SHA, five workflow runs completed successfully: Application Autofill Parent Integrity, Career State Validation, Deterministic Application Autopilot Core, Managed Browser Assist Validation, Harness Validation. Later heads and real Windows operation are NOT proven by these historical checks. Do not erase, overwrite, auto-close or quietly discard other active worktrees.

### 9.2 First unproven gate: durable private context, not another fresh form

PR #95 contains workspace-file.ts, workspace-control.ts, workspace-bootstrap.ts and workspace-startup.tsx. Integrate their existing single per-user local store, startup hydration before React state writers mount, revision compare-and-set, backup/archive and recovery/conflict handling. Browser localStorage is a cache/projection, not the sole authority. Switching between 127.0.0.1:21031 and 127.0.0.1:21033 or changing browser on the same machine must preserve the actual user workspace and opportunity binding; compare saved revisions/content, not just HTTP 200 or a screenshot. Identify exact checkout, PID, socket owner, runtime endpoint and signed instance before touching a listener. Never kill foreign processes, delete localStorage or flatten divergent edits. Across machines, real sign-in/source authorization is needed; do not claim independent local stores sync automatically.

The visible /answers empty state is misleading when the app has previously approved information elsewhere. Main App.tsx passes only ANSWERS_KEY to AnswersPage, whereas Assist also uses ASSIST_ANSWERS_KEY, accepted AssistProfile, saved career preferences and question memory. Add a provenance-bearing, read-only projection of **approved reusable** knowledge to the existing Answer Library without creating another canonical answer store or writing generated guesses into approved records. Render Recovered, Needs review and Missing, with exact source ownership. Test fresh-browser /answers recovery, no duplicate cards, conflicting versions, role-specific scoping, persistence after restart and no sensitive-question inference. Eligibility, sponsorship, EEO, legal attestations, salary and privacy choices remain question- or opportunity-scoped and operator-approved.

### 9.3 Preserve and finish login-to-resume

Maintain #101's same Chrome context, stable two-observation employer-form recognition, automatic continuation of at most one previously authorized nonterminal Fill, visible I've signed in — check again and Resume filling this application, and guarded same-opportunity URL rebinding. Do not collect credential values or inspect external identity-provider DOM content. Reconcile #100's field-progress and attachment evidence so zero verified fields are never called filled and staged file controls are not called employer-accepted uploads. Integrate with main's current Application Puzzle without regressing verified safe form navigation. Preserve operator-only Submit and every #69 adversarial control; buttons labeled Submit can be intermediate or terminal depending on independently proven effect.

### 9.4 Guided interface and search discovery (downstream of durable state)

Give new users one obvious README entry and install link, one guided setup executable, and one canonical owned runtime. Add a persisted Guided mode toggle, visible next safe action, why this step matters, provenance and current progress, optional restrained glow/focus guidance, keyboard accessibility and reduced-motion fallback. Animations never block input or falsify progress. Based on the inspected upstream research, borrow the graph *concept* but defer XYFlow as a dependency; adapt View Transitions and existing Motion patterns only as enhancements, and use Playwright visual/responsive comparison and WCAG motion guidance as gates. Logo artwork is a candidate needing product review, not an approved replacement.

After choosing a target title, discover postings through source adapters in the existing source/tracker/opportunity pipeline. Evaluate JobSpy or comparable open-source provider mechanics and license/maintenance, APIs and permitted scraping terms, then stage only permitted metadata with exact URL/source/freshness and dedupe by source ID + employer requisition. Never bypass CAPTCHA, anti-bot defenses, logins or access limits. Disqualifications must record user-selected reasons (fit, location, pay, seniority, closed, etc.) as explainable user-owned feedback; use that evidence to improve ranking without overwriting historical statuses or inventing eligibility. Discovery must not block the core application-critical release.

**Provider mechanism readback, October 26:** [ZipRecruiter's first-party Job Search MCP documentation](https://api.ziprecruiter.com/mcp/docs) describes structured `search_jobs`, US/Canada filters, bounded pagination and HTTP transport without end-user OAuth. This is the first candidate for a deterministic source adapter; protocol/schema, integration rights, attribution, retention and exact URL/freshness/dedupe still need verification before durable import is claimed. A documentation read is not live search or import proof. A bounded public initialize-only capability probe returned HTTP 429; no tool schema or job search was obtained, and no retry/bypass was attempted. [JobSpy's upstream MIT license](https://github.com/speedyapply/JobSpy/blob/main/LICENSE) licenses its code; it does not establish provider data-access rights. [Indeed's current terms](https://www.indeed.com/legal?hl=en) restrict automated access except expressly permitted access, and [Glassdoor's current terms](https://www.glassdoor.com/about/terms/) require express permission for automated scraping. Do not treat a scraper dependency or successful request as that permission. No discovery adapter is certified by this readback.

### 9.5 Execution lanes and acceptance

F0 (first): refresh remote default, PR heads, CI, worktrees, branch owners and overlap; map conflicts. F1: reconcile #95's persistence against main and #98 launcher with protected startup tests. F2: integrate read-only approved-answer projection and no-re-entry tests using the same workspace. F3: reconcile #101 browser resume with #100 progress evidence and main Application Puzzle; run managed browser regression. F4: optional guided mode/discovery adapters in distinct safe lanes. F5: typecheck/build/validators/Playwright, exact-head CI, Windows clean start and existing-user restart, then one real unsubmitted employer-form login-return and a second ATS; final Submit remains untouched. F1 precedes cross-port F2 and F3 claims; F2 and F3 may run in parallel only with separate writer worktrees and no overlapping owned files. Review and converge to actual default only after exact-head tests and applicable approvals.

Acceptance scenarios: (1) returning user sees approved answers and saved pending application automatically on a fresh port/browser; (2) install -> select title/URL -> collect only missing prerequisites -> sign-in -> safe resume -> approved attachment -> human final review; (3) interruption, SSO redirect, browser restart and URL drift retain or safely invalidate the same opportunity; (4) concurrent edits, stale documents, unknown ATS, false Submit labels, VPN suspicion, disconnected sources and corrupted workspace preserve progress and show one deterministic recovery action; (5) disabling guided glow preserves complete keyboard-readable instruction and navigation. None of these is a PASS until observed in the appropriate real environment.

### 9.6 First executable command sequence (Windows, inside existing canonical checkout)

    git fetch --all --prune --tags
    git status --short
    git worktree list
    gh pr view 95 --json number,state,isDraft,mergeStateStatus,headRefOid,baseRefName,statusCheckRollup
    gh pr view 98 --json number,state,isDraft,mergeStateStatus,headRefOid,baseRefName,statusCheckRollup
    gh pr view 100 --json number,state,isDraft,mergeStateStatus,headRefOid,baseRefName,statusCheckRollup
    gh pr view 101 --json number,state,isDraft,mergeStateStatus,headRefOid,baseRefName,statusCheckRollup
    python scripts/validate_application_journey.py
    python scripts/validate_application_autofill_parent.py
    python scripts/validate_local_runtime_lifecycle.py
    python scripts/validate_governance.py

Then isolate #95's conflicting integration in its own safe worktree, preserving its current head and all dirty operator files; resolve its real merge conflicts without blind reset. Run current workspace/installer/Windows tests, reconcile #98, then continue with #100/#101 tests and Windows P08. The output receipt must be CHANGED | PROVED | NEXT with exact paths, SHAs, tests/exits, merge/deploy/live distinctions, preserved prior behavior and one next executable action. Do not ask the user to retype their existing answers or rehearse this plan instead of running it.


### 9.7 Executed continuity checkpoint — October 26

This checkpoint supersedes the initial F0/F1 launch sequence above for the integrated slices. Refresh provider truth before new work; do not reconstruct answers or replay already integrated branches from historical observations.

| Slice | Integrated provider evidence |
|---|---|
| Persistent workspace / installer, #95 | `133f677890297f3aaf1019442322e50ab636ad4a` |
| Recovered Answer Library, #102 | `eee46cf85ad4857014e2b2216fbbfebfe4b090b8` |
| Launcher diagnostics, #98 | `860a25c373c4c5ca96405e8315ea6136b902e413` |
| Evidence-correct progress, #100 | `ba070efc264fdfd5a10b3424618c65bf09441715` |
| Recovery CRUD/filter/source controls, #103 | `0d25f1a7c39897d8fa3e8c8b7ef44af1422effb3` |
| Resumable journey and durable selection, #101 | `c9260ac9f3739f2999ddecfbec3cce375193ae3e` |

**Observed local deployment:** The canonical installer selected a clean checkout pinned to the #101 merge artifact, without modifying the separately owned dirty prior checkout. Canonical Start/Status and the CMD front door returned owned-health readback on port 21031; reopening retained the same process. The actual installed Answer Library rendered recovered knowledge and retained it on reload with no source-unavailable warning. No answer values, credentials, documents, employer URLs or personal screenshots are published here. The preferences file stayed byte-identical. Startup's existing tracker sort changed application ordering; comparison against the matching prior workspace backup proved every opportunity record and every other workspace area unchanged. The installed checkout is a required source artifact: resolve it through the installation receipt and do not archive it while selected.

**Protected live session:** A separate legacy runtime/browser on 21033 was preserved. Do not infer that its Chrome session migrated into the new runtime. Real employer sign-in, login-return filling, accepted attachments and clean-machine installation remain UNPROVEN. The first user-only gate is finishing the protected legacy session, then signing in to a selected opportunity in the canonical managed browser; observe same-window continuation and per-field effects without terminal Submit.

**Validation evidence:** The journey candidate passed 103 unit tests, 73 managed-assist tests, both TypeScript checks, build, 13 bootstrap browser tests and the scene validator's ten Python tests. A full browser candidate passed 105 tests with one existing extension test skipped; the subsequent field-identity repair passed 23 targeted browser regressions. The closeout adds a real middleware/controller test for synthetic password login -> SSO -> stable employer form -> guarded resume -> actual field readback, preserving an existing field and never activating Submit. It also rejects same-origin job drift until explicit binding and keeps the same browser page. The three controller specs passed. These are synthetic proofs, not employer certification; exact-head CI and current validators remain authoritative for later commits.

**P00/P01 and execution:** Existing governance/harness owners were reused and validated. The Answer Library projector/component/tests are registered in the existing artifact registry and codebase map; no second answer database was created. Native isolated workers and concurrent deterministic checks were executed, with coordinator rejoin/review and one writer per branch. Formal dispatch-manifest certification remains UNPROVEN because `harness/contracts/prompt-parallel-dispatch.v1.json` and `scripts/prompt_parallel_dispatch.py` are absent. Do not label native execution as a contract-valid receipt PASS.

**Discovery gate:** Section 9.4 records the supported ZipRecruiter mechanism and provider access boundaries. The bounded initialize-only probe returned HTTP 429, and no search/import was performed. Do not bypass the rate-limit gate or treat JobSpy's code license as provider permission.

**Changed-file inventory:** The following exact tracked paths changed between the refreshed initial main floor `4372430` and integrated product artifact `c9260ac` (the closeout further edits this handoff and the already listed controller spec). Public source only; real user artifacts stay outside Git.

- `.github/workflows/harness.yml`
- `.github/workflows/managed-browser-assist.yml`
- `.github/workflows/web-cockpit.yml`
- `AGENTS.md`
- `ARTIFACT_REGISTRY.md`
- `Close-EscapeHatch.ps1`
- `Get-EscapeHatch.cmd`
- `Install-EscapeHatch.cmd`
- `Launch-EscapeHatch.cmd`
- `Launch-EscapeHatch.ps1`
- `README.md`
- `Status-EscapeHatch.ps1`
- `Uninstall-EscapeHatch.cmd`
- `artifacts/escape-hatch/browser-assist-control.ts`
- `artifacts/escape-hatch/import-context.ts`
- `artifacts/escape-hatch/managed-auth-checkpoint.test.ts`
- `artifacts/escape-hatch/managed-auth-checkpoint.ts`
- `artifacts/escape-hatch/managed-progress-evidence.test.ts`
- `artifacts/escape-hatch/managed-progress-evidence.ts`
- `artifacts/escape-hatch/network-navigation-diagnosis.test.ts`
- `artifacts/escape-hatch/network-navigation-diagnosis.ts`
- `artifacts/escape-hatch/opportunity-documents.test.ts`
- `artifacts/escape-hatch/opportunity-documents.ts`
- `artifacts/escape-hatch/package.json`
- `artifacts/escape-hatch/playwright.bootstrap.config.ts`
- `artifacts/escape-hatch/playwright.config.ts`
- `artifacts/escape-hatch/playwright.preview.config.ts`
- `artifacts/escape-hatch/preference-file.ts`
- `artifacts/escape-hatch/src/App.tsx`
- `artifacts/escape-hatch/src/components/career-source-status.tsx`
- `artifacts/escape-hatch/src/components/managed-browser-assist.tsx`
- `artifacts/escape-hatch/src/components/recovered-answers.tsx`
- `artifacts/escape-hatch/src/components/sources-page.tsx`
- `artifacts/escape-hatch/src/components/workspace-startup.tsx`
- `artifacts/escape-hatch/src/lib/answer-recovery.test.ts`
- `artifacts/escape-hatch/src/lib/answer-recovery.ts`
- `artifacts/escape-hatch/src/lib/application-journey-projection.test.ts`
- `artifacts/escape-hatch/src/lib/application-journey-projection.ts`
- `artifacts/escape-hatch/src/lib/assist-contract.ts`
- `artifacts/escape-hatch/src/lib/storage.ts`
- `artifacts/escape-hatch/src/lib/tracker-bridge.ts`
- `artifacts/escape-hatch/src/lib/workspace-bootstrap.ts`
- `artifacts/escape-hatch/src/main.tsx`
- `artifacts/escape-hatch/tests/application-requirements-control.spec.ts`
- `artifacts/escape-hatch/tests/managed-browser-assist.spec.ts`
- `artifacts/escape-hatch/tests/persistence.spec.ts`
- `artifacts/escape-hatch/tests/sources.spec.ts`
- `artifacts/escape-hatch/tests/standalone-startup.spec.ts`
- `artifacts/escape-hatch/tests/workspace-startup.spec.ts`
- `artifacts/escape-hatch/tracker-control.ts`
- `artifacts/escape-hatch/tracker-refresh.test.ts`
- `artifacts/escape-hatch/tracker-refresh.ts`
- `artifacts/escape-hatch/user-data.ts`
- `artifacts/escape-hatch/vite.config.ts`
- `artifacts/escape-hatch/vpn-recovery.test.ts`
- `artifacts/escape-hatch/vpn-recovery.ts`
- `artifacts/escape-hatch/workspace-bootstrap.test.ts`
- `artifacts/escape-hatch/workspace-control.ts`
- `artifacts/escape-hatch/workspace-file.ts`
- `contracts/application-companion.v1.json`
- `contracts/application-journey-scenes.v1.json`
- `docs/WINDOWS_RUNTIME_LIFECYCLE.md`
- `docs/WINDOWS_RUNTIME_LIFECYCLE_PLAN.md`
- `docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md`
- `docs/agent/P04_MICRO1_NETWORK_PROGRESS_AND_DOCUMENT_QA_2026-10-25.md`
- `harness/CODEBASE_MAP.md`
- `scripts/audit_resume_docx.py`
- `scripts/validate_application_journey.py`
- `scripts/windows/EscapeHatch-Install.ps1`
- `skills/harness-operations/SKILL.md`
- `tests/test_application_journey.py`
- `tests/test_escapehatch_launch_frontdoor.py`
- `tests/test_resume_docx_audit.py`
- `tests/windows/Test-EscapeHatch-Install.ps1`
### 9.8 Operator-first P94 handoff — exit synthetic account and resume real applications (October 26)

**Status and authority:** Execute this checkpoint immediately on the **operator's existing Windows workstation**. This is the current local-agent launch mission, not a proposal or request for the operator to test dummy data. The parent is Issue #69; current main after merged persistence PR #105 is `eaa529bfd7ebc5f4ff56bc7fadb6eee146f418b4` (recheck head). Earlier recovery checkpoint §9.7 remains historical evidence, not a fresh runtime PASS. The user reported that a **synthetic account was loaded and the app did not present an actionable real-application path**. Do not assume which process, browser, port, store, or identity produced that screen until local observation identifies it.

**Immediate operator outcome:** Restore the normal installed EscapeHatch entry point, display the user's *existing real* career state and viable opportunities, and take them to a selected job's actual employer application in managed Chrome. The user should spend their time applying, not certifying the synthetic test account, retyping 17 recovered answers, recreating 36 opportunity records, or doing an agent's diagnostics. The counts are **historical comparison evidence**, not current verified live counts. If the backend is unavailable, determine and repair the first actionable local blocker. Synthetic fixtures must never silently become the default onboarding experience.

**Use these real workflow links only AFTER verifying the 21031 process is owned and its workspace has real context:** `http://127.0.0.1:21031/answers` (recovered Answer Library), `http://127.0.0.1:21031/applications` (saved queue), `http://127.0.0.1:21031/assist` (Application Assist). The canonical entry point is `Launch-EscapeHatch.cmd` or the installation's Start Menu shortcut, **not** a developer `npm run dev`, Playwright server, or disposable screenshot fixture. The exact normal UI path in `src/components/managed-browser-assist.tsx` is **Saved opportunity → Launch application → employer-controlled sign-in if needed → I've signed in — check again / Resume filling this application → Fill approved profile and answers → review exact PDFs → Attach selected PDFs / Prepare to final review → operator's final Submit**. Never infer that a disabled control is operable; surface the actual missing prerequisite. If managed assist cannot reach the employer, let the operator use **Open in ordinary browser instead** immediately for manual applying while the agent repairs assisted continuity; retain ledger records without inventing a successful submission.

**Scope declaration for local agent:** Checkout `C:\Users\CheeksMcClappeth\dev\EscapeHatch` is a *starting locator*, not assumed installation selection. Identify installed `sourceRoot` from `%LOCALAPPDATA%\EscapeHatch\installation\install.v1.json` **read-only** and preserve selected checkout, all dirty worktrees, independent PR branches, and current browser windows. Owned mutation on a fresh agent worktree/branch: source-controlled launcher/bootstrap, managed workspace startup, navigation/action wiring, focused P94 persistence/identity regressions, and this section. Forbidden: user profile/answers/opportunity payloads, real résumé PDFs, raw storage exports, employer credentials, external submissions, original private browser profile, unknown port owners, destructive checkout resets, and interruption of the 21033 protected Chrome session. No user-data path or screenshot payload may be committed or echoed in logs. Do not make closing 21033 a prerequisite for opening an independent verified 21031 application path; preserve 21033 unless an exact technical dependency proves otherwise.

**Execute on the user's Windows host, retaining all failures as evidence:**

1. From the existing checkout, read `AGENTS.md`, this §9.8, `docs/WINDOWS_RUNTIME_LIFECYCLE.md`, the installation receipt, and protected browser/lifecycle statuses. Run:

   ```powershell
   git fetch --all --prune --tags
   git status --short
   git worktree list
   gh pr view 105 --json number,state,mergedAt,headRefOid,mergeCommit,statusCheckRollup
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Status-EscapeHatch.ps1
   ```

   Resolve selected `sourceRoot` without printing private receipt fields or modifying the installation. Compare `sourceRoot`, branch/HEAD, process/socket ownership on 21031, and environment variables `ESCAPEHATCH_DATA_HOME`, `LOCALAPPDATA`, `ESCAPEHATCH_PREFERENCES_FILE`, `ESCAPEHATCH_TRACKER_SNAPSHOT`, `VITE_ESCAPEHATCH_SYNTHETIC_TEST_WORKSPACE`; report only whether each is **live-root / test-root / unset / conflicting**, never private values. Distinguish **real runtime**, **Playwright isolated 21039/21040/21041**, **protected prior 21033**, and **unknown listener**. Never stop a foreign process or reuse fixture storage.

2. Use the **installed selected source** and **canonical Start/Status**, not whichever checkout contains newest code. Read `http://127.0.0.1:21031/__escapehatch/workspace/status` for *sanitized* health/readiness, then inspect UI at /answers, /applications and /assist through the user's existing ordinary/managed browser as permitted. Record whether the visible dataset is genuine, synthetic-flagged, empty/recovery-required or a divergent local copy. Establish source-to-data-owner mapping by **path classification and stable revision/hash**; never dump names, answer bodies, credentials, employer URLs, résumé text or personal identifiers. If 21031 is already an owned healthy runtime, reuse it without restart; if not, use `Launch-EscapeHatch.cmd` and the lifecycle's ownership-safe recovery. For `FOREIGN_CONFLICT`, stop and investigate ownership; never run broad `taskkill`. Do not auto-import/overwrite any private workspace to make the app look populated.

3. **Repair, rather than just describe, the first proven defect.** Possible causes to distinguish: shortcut points at old checkout; runtime's selected source differs from Git's latest accepted main; synthetic browser fixture launched instead of Start Menu app; injected `VITE_ESCAPEHATCH_SYNTHETIC_TEST_WORKSPACE` or `ESCAPEHATCH_DATA_HOME` on real runtime; normal /assist navigation obscured by startup/recovery; applications present but selection cannot bind/launch; protected 21033 session independently holds a page. Fix the actual canonical owner and add the smallest automated reproduction protecting both the real and synthetic cases. Don't solve the bug by hiding synthetic banners, pretending a current 21031 runtime is a test, deleting fixtures, force-closing browsers, or making the user re-create data. If a source upgrade is actually required, stage from a validated branch and use the documented installer selection/receipt; never silently replace an active selected source or restart a live browser.

4. Run the **protected P94 regression pair** on a disposable store and non-user ports: real-launcher selection uses the stable private workspace **without** synthetic markers or changed records; fixture startup **does** show a synthetic banner and never reaches the real store. Exercise cold/warm launch, fresh browser and port continuity, Answer Library reload and dedupe, pending-opportunity selection, authentication-return binding, refusal of job drift, storage conflict/rollback, no implicit Launch/Fill/Submit, and preservation of 21033. Run owned commands from repository root:

   ```powershell
   python scripts/validate_application_journey.py
   python scripts/validate_application_autofill_parent.py
   python scripts/validate_local_runtime_lifecycle.py
   python scripts/validate_governance.py
   npm --prefix artifacts/escape-hatch run typecheck
   npm --prefix artifacts/escape-hatch run test:unit
   npm --prefix artifacts/escape-hatch run test:bootstrap
   npm --prefix artifacts/escape-hatch run test:managed-assist
   npm --prefix artifacts/escape-hatch run test:browser
   npm --prefix artifacts/escape-hatch run test:bootstrap:browser
   npm --prefix artifacts/escape-hatch run test:preview:browser
   git diff --check
   ```

   Do not run browser test commands against the real `21031`; current P94 default is `21041` and reserved ports fail closed. Windows lifecycle checks and genuine real-workspace UI readback should also run on the operator host without mutating private evidence or opening an employer login automatically. The typed browser tests remain **synthetic-only** and are not proof of a genuine employer login.

5. **Deliver the working operator path, not a test assignment.** Have the normal installed shortcut open/resolve real 21031; verify the user's existing profile and Answer Library are recognizable and saved opportunities have real row identities (do not print them). Direct the user to **Applications → one actionable saved opportunity → Application Assist → Launch application**. Allow the user to sign in, handle MFA/CAPTCHA and perform final Submit. After explicit user sign-in, agent may observe/recover the guarded continuation on that exact selected job; record per-field/attachment readback only when actually observed. If employer/browser access is blocked or the user wants to apply immediately, give the **Open in ordinary browser instead** link from that selected real opportunity and leave the assisted repair running in safe state. Never silently submit or mark Applied before verified operator/employer evidence.

6. Commit repaired source and tests on one isolated owned branch, push, open/update a focused PR, wait for exact-head required CI, and integrate only when the repository's promotion policy allows. Return **CHANGED | PROVED | NEXT** with selected-source identity **without private path contents**, observed port and process ownership, visible operator path, specific before/after defect, unchanged-data checks, regression results, commit and merge state, installer/source version, and the **one exact first unproven parent gate**. If a user-only sign-in is the only remaining gate, stop at the employer's real login page and ask for that action only; never invent login-return proof.

**Regressions to prevent forever:** (A) normal launch resolving a synthetic account or test banner; (B) real startup using inherited fixture overrides; (C) synthetic Playwright run touching the operator's `%LOCALAPPDATA%\EscapeHatch` or occupied 21031; (D) broken continuation despite recovered answers; (E) UI offering only a synthetic workflow without clearly exposing real Applications/Assist; (F) P94 implementation declared complete merely because GitHub CI is green, with no local operator-readiness or usable manual escape path. Give each reproduced failure a durable test at its true owner, not an agent-only promise.

**One next executable command (local agent, safe read-only entry):** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Status-EscapeHatch.ps1` from the currently installed selected source, after non-destructively checking the installation receipt. Do not move directly to user-only employer sign-in or close 21033 before this host/runtime observation.
