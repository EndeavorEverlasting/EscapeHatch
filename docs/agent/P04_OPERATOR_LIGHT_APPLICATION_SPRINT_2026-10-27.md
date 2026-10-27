# P04 operator-light real-application sprint — local agent execution handoff

**Active mission for the local EscapeHatch agent, October 26–27, 2026.** The operator is tired and needs to rest. **Do the autonomous, safe work now and leave a short, accurate review queue.** Do not require them to stay up, live-test synthetic accounts, type their saved answers again, drive an installer, copy files between apps, or approve each minor agent engineering step.

This is a subordinate execution handoff, not a replacement for [parent Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69), `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`, `contracts/application-journey-scenes.v1.json`, `docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md` §§9.7–9.8, or `AGENTS.md`. Respect [P94 browser isolation PR #105](https://github.com/EndeavorEverlasting/EscapeHatch/pull/105) and the [operator-first recovery PR #106](https://github.com/EndeavorEverlasting/EscapeHatch/pull/106), both integrated into main at the October 27 floor. Refresh repository truth before execution.

## End condition — applications move, not just code

In the existing real, saved EscapeHatch workspace:

1. Locate **up to three** still-actionable, not-yet-submitted opportunities whose genuine employer pages still accept applications and whose requirements match the current approved career targets. Start from the **most advanced real opportunity with a viable posting**, not a stale score, a synthetic fixture, or a generic manager role.
2. For each: restore its existing private answer/profile context and versioned document package, resolve all safely answerable questions, and use the production managed Chrome application controller to launch, fill, recover across sign-in, stage **only previously reviewed/approved** files, and advance **only evidence-proven nonterminal controls**. A review-required document can be rendered/prepared locally but **not uploaded** until actually approved.
3. Leave each application at **REVIEW_READY**, **REVIEW_REQUIRED**, **SIGN_IN_REQUIRED**, **AUTH_OR_MFA_REQUIRED**, **NEEDS_DOCUMENT_APPROVAL**, **EMPLOYER_CLOSED**, or **BLOCKED_WITH_RECOVERY**, with a single user-facing next action and **a resume link into the same opportunity**, never a restart requiring re-entry.
4. Write a short private checkpoint per opportunity and a one-screen morning summary: **Ready for your review / Needs one decision / Skipped with reason**. Keep the actual employer application URL, private documents, answer values and review notes **only in local approved storage**, never GitHub.
5. Explicitly distinguish **PREPARED / REVIEW_READY** from **SUBMITTED / APPLIED**. The agent does not apply that latter status without actual employer/operator submission proof. Give the operator their time back; don't ask them to supervise the build.

If fewer than three candidates remain usable, prepare as many as real evidence allows. **A real, usable prepared application beats three synthetic green tests or three stale employer links.**

## Career source authority — never publish private data

On the authenticated local host, enter through the existing private Google Drive **Career Agent Start Here — Canonical Context Index**, load its **Career Search Operating Profile**, then the **primary long-lived Job Application Tracker 2026** and opportunity-bound reviewed files. Use the already-authorized Drive/TokenCorridor bridge or the last versioned local approved tracker snapshot with its real freshness timestamp. ChatGPT's connector access is not local application OAuth; do not assume access or recreate credentials. **Never send data through Gmail** or use email to bypass the employer workflow.

**Selection bias is target-driven, not record-order-driven.** First lane: AI Automation Engineer; AI Systems Engineer; software/workflow Automation Engineer; AI Solutions Engineer. Bridge: Systems Automation, Integration/Implementation Engineering, Technical Operations Engineering, and Product Engineering only when genuine duties fit. Technical PM is selective rather than the central destination. Default to fully remote, then remote-first. Flag location, NY eligibility, compensation, PMP requirement, professional SWE tenure, and exact experience gaps per posting; don't invent the user's credentials or a minimum salary not explicitly present in the approved profile. Treat technical operations, healthcare implementations, leadership and agentic repository work as evidence of the user’s real ability, not an excuse to present them as a conventional senior SWE.

**Current-tracker targeting:** prioritize a viable existing **Resume Ready** opportunity before creating a brand-new packet; next inspect **Research** items with an already staged truthful role-specific PDF or approved source. Newly staged or `REVIEW` PDFs are **not automatically approved for upload**. A low-priority **Ready to Apply** side-lane may follow only if higher-fit builder opportunities cannot be safely progressed. The source tracker may change daily: determine actual statuses live, rather than copying a chat’s old shortlist into source code or this public handoff.

**Exclude** `Submitted`, `Applied`, `In Process`, `Interviewing`, `Offer`, `Closed`, `Follow-Up` and unresolved `Verify Submission` from new-application launching; unresolved submission state calls for reconciliation, not a duplicate submit. Treat a recorded `Research` opportunity as *candidate only* until employer acceptance/freshness and the matching package are verified. Explicitly prevent reapplication to previously submitted employers/role requisitions or closed postings. Recheck exact ATS identity and job URL; company-title matches alone do not prove same/different application.

## Phase A — orient and recover without waking the operator

1. Read `AGENTS.md` and `skills/harness-operations/SKILL.md`; resolve P04, P08, P82, P07 and P94 from the installed TokenCorridor prompt registry, not from guessed shorthand. Declare one writing agent per branch/worktree; independent readers may inspect in parallel. Do not use the operator’s occupied dirty worktree as a scratchpad.
2. Read `%LOCALAPPDATA%\EscapeHatch\installation\install.v1.json` only enough to identify the **installed selected source**. From that source, run `Status-EscapeHatch.ps1` via `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Status-EscapeHatch.ps1`. Inspect ownership of 21031 and sanitized `/__escapehatch/workspace/status`; use `Launch-EscapeHatch.cmd` **only when ownership-safe**. Do not terminate foreign processes or touch the protected 21033 browser. Test ports 21039/21040/21041 and their disposable profiles are never career data.
3. Confirm on the real UI that approved profile/answers, submitted history and saved opportunities hydrate; if synthetic or blank, execute scene-system §9.8, **repair the actual source/launcher/data owner**, and add regression coverage. No importing dummy data, overwriting private stores, or declaring readiness from HTTP 200 alone.
4. Read the primary tracker and the career profile under the operator's existing authorization. Privately record source revision, last genuine read, opportunity row identity and one exact employer posting. If source access fails, use an existing approved private snapshot only with STALE labeling and revalidation before external form mutation. Do **not** generate a second tracker.

## Phase B — do real preparation, then move to the next candidate

For each up to three candidates:

1. **Qualify:** submitted/closed dedupe, work arrangement, pay where published, posting still accepting, role requirements and role-specific experience fit, correct employer domain, exact requisition. Reject unsupported or stale entries with a concrete reason; do not silently turn historical Research into Ready.
2. **Recover packet:** choose the opportunity’s saved résumé/cover version and reviewed answer taxonomy; validate file bytes, PDF readability/revision, factual claims and doc-to-job binding. Prepare truthful missing drafts in the **private staging area**. Do not rewrite the master résumé or approve a `REVIEW` document on the user's behalf.
3. **Operate the existing product:** select the exact saved opportunity under real `/applications` and `/assist`; use the production managed application actions in `src/components/managed-browser-assist.tsx` and `browser-assist-control.ts` (`Launch application`, scoped `Fill approved profile and answers`, reviewed PDF `Attach selected PDFs`, guarded `Prepare to final review`). Use the existing `managed-auth-checkpoint.ts` for authentication return; `managed-preparation-driver.ts` + `application-autopilot-executor.ts` own *trusted nonterminal* transitions. Do not invent uncontrolled Playwright clicks, direct API posts or a new parallel ATS agent. If the local agent has UI automation, it should exercise this **existing app**; if not, implement the smallest deterministic existing-controller entry point on an isolated branch and test it.
4. **Handle sign-in gracefully:** the operator may be asleep. Reuse a still-authorized employer session only if it belongs to the selected real opportunity. At credential, MFA, CAPTCHA, SSO or consent boundaries, checkpoint and continue to the **next unrelated candidate**. No credential guessing, silent account creation, browser profile hijack, CAPTCHA workarounds, or notification demanding an immediate response.
5. **No false “Next”:** advance only when current page effect and origin have existing trusted fingerprints, uploaded file acceptance is verified, validation errors are resolved, and no manual gate remains. A button reading “Submit” is not sufficient effect evidence. The terminal action always stays operator-only. Unknown action, divergent job URL, misleading terminal label or loop => review/stop, not optimistic click.
6. **Private checkpoint:** persist selection, phase, safe field readback evidence, required human question (if any), reviewed vs staged attachments, and exact resume/continue affordance. Do not log actual answer text, credentials, employer personal info or private file bytes in a public artifact. Never call a locally selected file an employer-accepted upload without browser evidence.
7. **Keep momentum:** on any human-only gate, record it, leave that opportunity intact, and proceed to the next candidate. Do not run a long infrastructure sprint while a usable real employer draft can be staged immediately.

Maximum active opportunity set per run: **three**. Maximum two safe retries for a transient step; no unbounded browser navigation, artificial wait loops, destructive cleanups, or attempts to bypass provider access controls. No unsolicited device power-management changes. If local agent/background continuation was already launched by the operator, let that session finish safe work while they rest; a GitHub merge alone does not start anything on Windows.

## Phase C — fix only a demonstrated blocker and prove no regression

If an actual candidate fails due to product code, establish one **before/after** behavior and patch the canonical owner, without resetting the real browser. Test:
- fresh/warm *real* installed source and profile restored, separate from prominent **synthetic** fixture banner;
- same selected opportunity and saved answers after restart/login;
- no duplicated submitted/closed application from stale tracker;
- exact opportunity PDF approval/revision gate and no unwanted upload;
- already-entered employer values preserved, visible DOM readback for claimed fills;
- unknown Next/Submit and job drift stop, zero terminal commits;
- interrupted candidate checkpoint allows next candidate to proceed;
- one-screen queue counts derive from real statuses, not invented totals.

Run from the isolated checkout:
```powershell
python scripts/validate_application_journey.py
python scripts/validate_application_autofill_parent.py
python scripts/validate_governance.py
npm --prefix artifacts/escape-hatch run typecheck
npm --prefix artifacts/escape-hatch run test:unit
npm --prefix artifacts/escape-hatch run test:managed-assist
npm --prefix artifacts/escape-hatch run test:tracker
npm --prefix artifacts/escape-hatch run test:browser
npm --prefix artifacts/escape-hatch run test:bootstrap:browser
git diff --check
```
All Playwright fixture tests must use isolated test storage/ports and never the real 21031. A green synthetic test is **not** evidence of a completed employer draft. If a legitimate code repair is needed, commit/push a small focused PR and obtain exact-head checks before integration under existing promotion rules; **do not delay independent real application prep behind that PR**.

## Checkpoint & morning report contract (private, concise)

Store a durable, private `application-sprint-YYYY-MM-DD.json` (or existing approved equivalent) under `%LOCALAPPDATA%\EscapeHatch\application-sprints`. Create the directory without overwriting prior runs. It contains no credentials, raw DOM, answer bodies, screenshot bytes or résumé text. Values such as real opportunity IDs and URLs must remain private; **the public GitHub commit contains only this schema description**.

Each entry requires: `opportunityRef`, `sourceReadAt`, `sourceRevision`, `employerPostingCheckedAt`, `fitVerdict`, `state`, `scopedDocuments` (staged/reviewed/approved/accepted), `filledFieldsVerifiedCount`, `pendingHumanActions` (short labels), `resumeLocation`, `submissionEvidence` (boolean), `lastSafeStep`, `nextAction`, `blockerReason` if relevant. Never fabricate values: use `null` and `UNVERIFIED` honestly.

The final **one-screen** report format is:

```text
APPLICATION SPRINT | REAL WORKSPACE [verified / blocked]
Ready for your review: N
Needs a decision/sign-in: N
Skipped (submitted/closed/stale): N

1) [Role/company privately] — [REVIEW_READY | REVIEW_REQUIRED | SIGN_IN_REQUIRED | NEEDS_DOCUMENT_APPROVAL | ...]
   Done: [2-3 verified results]. One next action: [exact control]. Resume: [real saved opportunity].
2) ...
CHANGED | PROVED | NEXT: [true workspace/source/branch/CI state; no private values in GitHub]
```

**P94 failure receipts** must distinguish: designed, code committed, PR merged, installed source selected, 21031 healthy, real profile observed, exact employer browser observed, draft saved, documents accepted, reached final review, submitted with evidence. **Do not jump levels** or pretend the sprint ran because this handoff was merged.

## Exact agent invocation

Operator can give their existing OpenCode/Codex/Cursor local session this short command:

> **P04 + P94 application sprint. Read AGENTS.md and docs/agent/P04_OPERATOR_LIGHT_APPLICATION_SPRINT_2026-10-27.md. Execute Phase A–C on my existing real EscapeHatch workspace, prepare up to 3 genuine unsubmitted role-matched applications, checkpoint each human gate and continue to the next while I rest. Do not submit, invent, or run synthetic accounts. Leave me one concise review queue with direct resume links. Commit only necessary repairs.**

**Agent next machine action:** enter the installation-selected EscapeHatch checkout non-destructively, inspect the installation receipt and run its `Status-EscapeHatch.ps1`; immediately progress to the first real candidate as soon as the saved user workspace is visible. **Do not hand the operator another action plan as the deliverable.**
