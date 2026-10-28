# Broadcastwell: one-page application completion and first live transition canary

**Parent:** [Application Assist P04 issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69). **Candidate PR:** forthcoming; read latest provider truth on each local bootstrap. **Host:** current remote GitHub/CI work is separate from the operator's local Windows managed Chrome session. **Active job:** [Broadcastwell — AI Automation Engineer](https://broadcastwell.com/careers/ai-automation-engineer). **Excluded:** Magnet Forensics. **User local state:** do not copy, reset, replace or force-update active local edits, private résumé files, user data, or Chrome profiles.

## Authoritative operator decisions recovered October 27, 2026

1. The operator reviewed the existing **staged, two-page Broadcastwell résumé PDF** and accepts using that reviewed copy **for this application**, while a separate agent may polish the professional summary later. Do not block the current application for another unnecessary résumé-approval loop. Confirm actual staged document identity/digest locally before any action; this public repository does not contain private PDF bytes or an external-hosting authorization.
2. Their **portfolio URL** is `https://www.perezparallax.dev`. The offered `https://www.perezparallax.dev/static/resume/current.html` is **HTML, not a PDF**; Broadcastwell's optional résumé field explicitly asks for a public PDF URL. Either establish/verify a real public PDF URL separately with operator authorization, or leave the optional résumé-link field blank; never mislabel HTML as PDF or leak a private local PDF to a public repo.
3. **Why this role** is at most five sentences. The current UI's discovered-answer field accepts at most 512 characters, so use the operator-approved/tailored concise answer from the private answer store; if missing, ask for an explicit local answer. Never fabricate the operator's motivations, personal details, qualifications, legal attestations or a made-up résumé URL.
4. The active opportunity **must remain Broadcastwell**, not Magnet. Before any write or listener arm, compare the selected opportunity ID, URL, browser tab origin/path and in-memory listener scope with actual provider/runtime evidence.
5. User wants a **pre-Submit -> attempt -> employer confirmation -> durable local receipt -> tracker sync** observation, not another proof-of-click or screenshot-only summary. The desired local workflow is a single page. The existing governance retains operator control of legal/consent answers and **final Submit**; do not let a generic agent silently click terminal controls. The user can explicitly complete final submission in the exact bound tab after reviewing the form and privacy-consent checkbox.
6. The screenshot shows an insecure managed Chrome flag `--no-sandbox` on the browser banner. Inspect actual local launch flags and restore Chrome sandbox protections through supported launch configuration; do not normalize an insecure workaround as a readiness PASS.
7. The local agent previously reported six modified files and a staged résumé. Those local file edits are **not** implied to be in `main`; refresh provider and reconcile local dirty changes non-destructively.

## Canonical owners and new work

- `artifacts/escape-hatch/managed-listeners.ts` — exact-site adapter for inline Broadcastwell **Submit** button, not the default **Submit Application** label. The site-scoped adapter must only recognize `broadcastwell.com` or `www.broadcastwell.com` on the exact `/careers/ai-automation-engineer` path. Confirmation remains evidence-based (visible unique status with explicit application-received words); an attempt alone is NEVER Applied.
- `artifacts/escape-hatch/browser-assist-control.ts` — bind and arm listener on exact inline job form when opened, even when no intermediate Apply entry page exists; question-catalog capture observes *labels only*.
- `harness/contracts/application-form-taxonomy.v1.json` — map explicit portfolio/LinkedIn and role labels. Fill must preserve existing nonempty employer values and review-once choices.
- `artifacts/escape-hatch/src/components/application-preferences.tsx` — Chick identifies a genuinely blank discovered question and offers multiline local answer entry in the existing Answer Memory surface; explicit Save Preferences persists before guarded Fill.
- `artifacts/escape-hatch/managed-listeners.test.ts` — exact-site negative checks and a synthetic end-to-end inline **ARMED → answer completion/fill → terminal attempt → CONFIRMED receipt** without sending any real employer application.
- `artifacts/escape-hatch/src/components/guided-start.tsx` owns the existing Today avatar overlay; do not spawn a competing onboarding implementation.

## Local agent execution contract (single next critical path, not a new plan)

**Refresh:** fetch `main` and active PRs, identify local dirty files and current running instance. Use safe merge/worktree; never force-reset. Do not claim the local browser is attached from screenshots or a repository commit.

**Identify:** find the actual saved Broadcastwell opportunity and the managed Chrome page on `https://broadcastwell.com/careers/ai-automation-engineer`. If Chrome is not attached to the local EscapeHatch managed context, bind the exact tab through the existing supported listener mechanism; do not attach a second unmanaged Chrome and claim continuity.

**Recover facts:** verify the operator's private profile already contains the website and previously approved answers, without copying personal data into this public repo. Discover **Why this role** through the form question catalog. If it is missing, show the chick prompt in Reusable application answers, accept the real operator-entered text, save explicitly, and use guarded Fill to populate only the empty exact-match field. Verify the field's actual read-back. The résumé link is optional and must be a genuine publicly accessible PDF URL or blank; the separate reviewed local PDF can be attached ONLY if a real file-upload field exists.

**Arm FIRST:** query the local `/__escapehatch/managed-assist/status` provider-backed endpoint. Record session/opportunity/path, listener connected, `submission.state=ARMED`, and `recordingAnswers=true` before final submission. If not armed, execute the supported bind-existing flow; do not click Submit while `DISARMED`/`NOT_BOUND`/`BLOCKED`. Do not advance another unrelated job.

**Submit and observe:** final consent and Submit remain operator-confirmed. Take a fresh **ARMED** snapshot, then observe trusted terminal click/Enter in the same bound session. Record **PENDING** then look for explicit employer confirmation. A route change, button click, disabled control, disappearing form or generic "Thank you" does not confirm acceptance. If confirmation is ambiguous, preserve pending evidence and request review; do not claim Applied.

**Persist:** only a confirmed same-session employer receipt changes local Applied state. Verify the receipt ID in the private receipt store, then inspect tracker reconciliation/outbox separately. Capture safe user-entered preferences into private local storage (no secrets, files, consent, EEO, legal answers). Do not automatically reuse employer-specific motivational prose for a different employer; treat it as a candidate requiring fresh review.

**Verify:** on Windows use the repo's launcher and safe disposable synthetic tests first; check application parent/scene validators, `npm run test:managed-assist`, `npm run typecheck`, `npm run test:browser` as applicable. After the operator's real submission, take an exact local-runtime event readback and persisted-receipt/tracker sync readback. Prove no Magnet contamination or private data in public commits.

## Exact proof ceiling

Remote repository/CI PASS proves only the code and synthetic browser fixture. The real Broadcastwell **operator-installed Chrome** session, final application submission, confirmation receipt, persistence and external tracker sync each require separate provider/runtime observation. If the form returns another post-submission shape, introduce a bounded exact-host success adapter with negative cases, not an overly broad root/body success claim. Do not mark the entire P04 parent outcome complete based on one ATS form.

**Design upstream:** operator's private Upstream Intelligence Library Registry and START HERE guide; relevant `impeccable` (clear progression, honest feedback), `UP-60B0939CC` (Playwright browser proof), `UP-60FBA76B5` (accessibility). Do not copy workbook or private portfolio details to code unnecessarily. **Governance routing:** TokenCorridor current exact P04 + P08/P82/P07, not memorized aliases; execute bounded iteration through mainline convergence with receipts.
