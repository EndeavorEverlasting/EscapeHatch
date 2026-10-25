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
- The POST `/resume` endpoint must re-inspect immediately, require the current bound employer origin and application path, and fail closed on page drift. A login redirect returning to an unexpected same-origin application path needs **an explicit opportunity-rebinding review**, not arbitrary automatic posting reassignment. That reconciliation remains a required integration gate before claims of broad ATS portability.
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
| `browser-view-transitions` / `UP-698D174BC` | native View Transitions | ADAPT | scene continuity only, graceful no-animation fallback |
| `motion-animate-presence` / `UP-9391184B6` | React enter/exit sequencing | ADAPT ONLY IF PRESENT | no new dependency for primary flow; preserve focus and user input |
| `xyflow-reactflow` | diagram canvas | DEFER | useful for developer diagram, too heavy for applicant's simple progress scenes |
| `mattpocock-wayfinder` | decision map | ADAPT | typed blockers and explicit gates; never a sole runtime rule |
| `UP-1B0AFA8BE` / `UP-AFAEE2D9D` | component critique/design briefs | REFERENCE | extract usability tests; respect licenses before copying code |
| `UP-60B0939CC` | Playwright visual snapshots | ADAPT | screenshot diff across logged-out/logged-in/error/ready states |
| `UP-60FBA76B5` | WCAG animation | ADAPT | reduced motion and keyboard/assistive technology gate |
| `UP-F8DA7EE77` | browser animation performance | REFERENCE | animation never blocks input, network or installer state |
| `UP-F8D41DF99` / `gsap-flip` | FLIP animation | DEFER | unnecessary until core form journey passes |
| `UP-BF391E265` / Three.js / Drei | graphics | REJECT for core journey | no graphics infrastructure on application critical path |
| `UP-77F443024` | OpenCode | USE AS EXECUTION CONTEXT ONLY | not a runtime login state owner |
| `UP-40FE662CF` | validation before push | ADAPT idea | enforce validator + CI rather than borrowing donor implementation |

### Directly relevant preserved Idea Trace records

The source workbook records **150 preserved ideas**. The following rows matter more to this app than cinematic donor pages. Each is a captured idea reference, *not* evidence of implementation or authorization to copy code:

| Idea | Original title and locator | Implemented response / gate |
|---|---|---|
| `PS-0020` | *Escape Hatch one-click application autofill bridge* — `Idea Inbox!A25:R25` | Install -> paste URL -> reviewed profile -> managed Chrome -> verified fill is an integrated user journey, not isolated agents |
| `PS-0028` | *Escape Hatch application-proof alias protocol* — `Idea Inbox!A33:R33` | Typed scene + page effects and employer receipt must be distinct; never label an attempted fill or navigation as application success |
| `PS-0030` | *Bridge browser/chat sprint context gaps* — `Idea Inbox!A35:R35` | Versioned scene contract, preserved opportunity binding, validator and durable handoff replace chat-only context |
| `PS-0060` | *Capture personal browser-tab cycling algorithm* — `Idea Inbox!A58:R58` | Preserve the one managed Chrome context and focus; never open another browser merely to restart after login |
| `PS-0073` | *Use interface chronology as context evidence* — `Idea Inbox!A78:R78` | Record typed timestamped auth -> form readback events; do not infer state from model narration |
| `PS-0111` | *Graph repository scenes and transition coverage* — `Idea Inbox!A116:R116` | Canonical graph with 14 scene IDs, 33 allowed arcs, source-level validator and per-scene tests |
| `PS-0116` | *Codify reusable use-case scenes and cinematic transition coverage* — `Idea Inbox!A121:R121` | Separate scene authority from motion; all scenarios have entry, recovery, effect evidence, reduced-motion fallback |
| `PS-0145` | *Prototype tactile Bézier transitions and ambient scene states* — `Idea Inbox!A150:R150` | DEFER heavy motion; optional contained microtransition only after keyboard and browser proof |

The original Idea Trace is a **title and locator index**, not the full underlying Idea Inbox bodies. Only those titles, locators and evidence statuses have been verified from this attachment; detailed ideas have not been silently reconstructed. Source snapshot is dated October 20, 2026.

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
