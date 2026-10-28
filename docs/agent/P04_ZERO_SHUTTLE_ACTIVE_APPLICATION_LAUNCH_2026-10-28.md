# P04 — Zero-shuttle active-application startup and ambient guide

**Parent outcome:** [P04 end-to-end application preparation #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69), `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`, and the `P08 + P82 + P07` trifecta defined in `docs/agent/TRIFECTA.md`. This is a narrow additive implementation and proof plan; it does not replace those owners.

**Sprint PR:** [#124](https://github.com/EndeavorEverlasting/EscapeHatch/pull/124), isolated branch `feat/active-application-launch-coaching-20261028`, rooted at main `5dadf650b8262b84feb0fcd80002ba890b7b79cc`. Scope is one coherent app startup and selected-application journey, not a general application-marketplace or agent redesign.

## 0. Launch order FIRST — inspect, execute, converge

1. **P07 / recovery:** inspect live default branch, AGENTS, current PM/ATS guards, open PRs, Windows installer, local status protocol and the TokenCorridor CURRENT catalog. Use a single branch writer; do not reset a dirty checkout, mutate foreign runtime processes, overwrite private local state, or touch submitted opportunities.
2. **P82 / hypothesis and comparator:** an installer should ship the exact approved bird without manual file transfer; one fresh verified high-priority Ready entry should appear consistently in Home, the tutorial and Assist, not be lost to an old hard-coded employer or array order; sound should be opt-in and route-persistent. Before: mascot required historical hand-transfer in some local workflows, Guide only offered a single-click sound, Ready selection could disagree. After: asset is a checked-in Vite public resource; route-persistent synthetic birdsong and contextual guide; shared eligibility/ranking.
3. **P07 / implementation lanes:** (A) first-party mascot and optional Web Audio shell control; (B) source-truth selection, local tracker refresh, guided puzzle navigation; (C) safe, consentful main checkout fast-forward, cold-install asset parity. These code lanes are integrated on **one writer-owned branch**. This is sequencing, NOT an unobserved claim of separate worker dispatch.
4. **P08 / proof:** first reproduce with deterministic unit and browser fixtures, then run actual source/installer and managed Chrome on a Windows host when available. Only the host can prove the selected source, browser origin, live employer field readbacks, uploaded files and review-ready status. Never treat a GitHub green test as that proof.
5. **P04 / publish and continue:** run exact-head CI; repair failures; integrate if required checks and ownership permit. Read back main after merge, and open the existing installed app on the selected Windows source to prove it. Record every distinct state: authored, pushed, tested, merged, deployed, host-observed, employer-form-observed. Keep the parent issue open until the actual application reaches a safe manual final-review boundary.

## 1. Product contract — a cheerful, competent companion

- Bundle `artifacts/escape-hatch/public/escapehatch-mascot.webp` through Vite's public asset pipeline, nav, Today guide and accessible puzzle modal. Do NOT ask a developer/operator to ferry a PNG, WebP, separate sound file, JSON answer packet or unpacked extension between installations.
- Keep the tutorial and **Your next puzzle pieces** available at startup. Name the selected active opportunity. Show actual locally missing reusable profile details separately from **employer form observations**, which are only available after managed-browser inspection.
- Place the `Birdsong on/off` control in the persistent shell, not inside a page that unmounts on navigation. Generate a small original chirp with Web Audio and no downloaded bird recording. Silent by default; first activation is an actual user gesture per browser audio rules, then periodic soft chirps until switched off or closed. No modal/focus theft, automatic playback, or hidden calls.
- The default suggested job is drawn from fresh verified local Google-tracker status: `Ready to Apply`, unchecked, valid HTTPS employer link, high priority first and latest row among peers. No employer name, user-specific spreadsheet row, private résumé URL or desired pay is embedded in public source code. A user-selected or valid remembered opportunity overrides the suggested job; no already-submitted role auto-launches.
- Show exactly what can be verified: local tracker freshness, selected employer name and role, document attachment review state, managed Chrome running state, page requirements inspection, and terminal boundary. `PREPARED`, `REVIEW_REQUIRED`, `REVIEW_READY` and `SUBMITTED` are separate.
- Only scoped, approved contact/profile/answer values may fill employer fields. Employer sign-in/MFA/CAPTCHA, protected declarations and final Submit are operator actions. A route change or filled DOM field is never an employer submission receipt.

## 2. Implemented branch surfaces (source changes, not live proof)

- `src/lib/tracker-bridge.ts` and its tests: remove the historical named-job preference and unsafe first-row suggestion. Select the newest eligible high-priority Ready role; fail closed on invalid links and submitted/checked rows.
- `src/components/managed-browser-assist.tsx`: choose the same fresh verified suggested tracker identity when there is no stronger explicit or remembered selection. Automatic managed Chrome launch remains gated by its existing click-issued one-shot intent.
- `src/components/birdsong-control.tsx`, `src/App.tsx`, `src/components/guided-start.tsx`, `src/lib/mascot-guidance.ts`: original chirp UI across routes and a tutorial tied to the current safe opportunity; preserve guide's earlier single-chirp action.
- `src/lib/tracker-refresh-client.ts` and Home integration: on startup, only with a previously bound local tracker and local Google authorization, POST to managed same-origin `/__escapehatch/tracker/refresh` (no user-supplied target), then read back the provider-bound snapshot. Keep previous data intact on auth/network errors. Do not confuse this separate local authorization with the ChatGPT connector.
- `Get-EscapeHatch.cmd`: retain official clone path for a clean install; on an existing `main` checkout with no changes, a proven stopped managed runtime and operator consent, `git fetch` plus `merge --ff-only`. Any dirty, custom-branch, running/unknown, foreign origin or incompatible state means **preserve**; never reset/clean/kill/rebase. Installer still owns dependencies/shortcuts/runtime.
- `BRAND_IDENTITY.md`, `tests/test_escapehatch_installer_source_delivery.py` and `tests/mascot-guidance.spec.ts`: codify and regression-test these surfaces.

**Unfinished integration seam:** the direct `/assist` route does not yet perform the startup background Google-tracker refresh; it reads the last snapshot. This route works when Home has refreshed first, or the selected job is already in a fresh snapshot. A proposed direct-route refresh edit was rejected by the connected GitHub write guard, so it is **not** counted as implemented. Treat this as a guarded next repair if reproduced, not a claim of a complete direct-entry path.

## 3. Exact acceptance and fail-closed checks

| Gate | Command / observation | Required assertion |
| --- | --- | --- |
| R01 repository artwork | `npm --prefix artifacts/escape-hatch run test:unit`, `npm --prefix artifacts/escape-hatch run build` | checked-in WebP hash correct; `/escapehatch-mascot.webp` loads desktop/mobile; no manual asset transfer |
| R02 selected opportunity | `npm --prefix artifacts/escape-hatch run test:tracker` and `test:browser` | current eligible Ready role appears identically in Home, tutorial and Assist; old/submitted/insecure roles do not displace |
| R03 ambient accessibility | `npm --prefix artifacts/escape-hatch run test:browser` | starts silent, user may enable sound, route navigation retains state, off ends audio, no focus theft |
| R04 existing installation | `python tests/test_escapehatch_installer_source_delivery.py`, Windows `Get-EscapeHatch.cmd` from **clean, stopped, owned** checkout | source fast-forwards with consent; dirty/custom/running paths preserve work; next boot owns correct mascot bytes |
| R05 application preparation | `npm --prefix artifacts/escape-hatch run test:managed-assist`; `python scripts/validate_application_autofill_parent.py`; `python scripts/validate_application_journey.py` | trusted fields/files only; page/URL locks; unknown actions stop; no final Submit |
| R06 Windows real startup | canonical `Status-EscapeHatch.cmd`, `Launch-EscapeHatch.cmd`, localhost runtime status and browser readback | installed source is updated, genuine profile remains, current tracker fresh, selected opportunity visible; no synthetic fixture passed as user data |
| R07 employer live observation | use the existing managed Chrome controller at user's selected genuine ATS | inspect actual page, fill verified approved values, stage exact reviewed PDFs if approved, pass trusted nonterminal actions only, return a true review checkpoint |
| R08 integration | exact-head required PR checks, integration readback and runtime observation | merged code and actual working user installation verified independently; no false `SUBMITTED` state |

## 4. Proof ledger at PR creation — evidence ceilings

- **CHANGED:** code files and tests committed to the isolated PR branch; existing first-party mascot already tracked and referenced; Windows updater changed under preservation guards.
- **PROVED:** GitHub provider accepted commits and opened PR #124. Original canonical career tracker and application documents existed in a separate authorized private Google Drive workflow; they are not mirrored here. This run has **not** observed a Windows GUI, Chrome employer form or accepted attachment. PR checks were queued/started on the first PR read.
- **NOT PROVED:** exact-head typecheck/build/browser/Windows gates pending; full data sync on directly entering Assist; updated user-installed checkout; employer form handling; actual application review-ready state; any final submission.
- **NEXT:** follow PR checks and repair failures on the exact branch; wire the new tracker refresh and selection tests into required CI if they are missing; settle direct Assist refresh when the write gate permits; certify clean and warm Windows startup against the preserved original private workspace. Then use existing controller on the genuine saved employer application, with user-controlled login/attestations and final Submit.

## 5. P04 routing / continuation contract

- **Current authoring/runtime adapter:** connected GitHub API for read/write; Drive connector was used to ground existing private source state, not to publish it. This adapter cannot interact with the user's Windows processes, local Chrome, private local `%LOCALAPPDATA%` store, or UI audio. Do not fabricate P08 live observation.
- **Local host adapter:** Windows PowerShell 5.1/7 + verified canonical checkout and owned runtime on 127.0.0.1:21031. The next safe step is to open the app through the canonical launcher after an ownership preflight, NOT ask the operator to move any bird or résumé by hand.
- **Explicit operator boundary:** a user gesture may be required once to enable browser sound; employer authentication, personal/legal attestations and final Submit remain manual. Those are the **only** necessary handoffs in the desired journey.
- **P04 dispatch status:** P08, P82 and P07 were resolved against the current TokenCorridor catalog and implemented through this GitHub writer lane. No separate parallel agent dispatch or manifest validation was executed. The expected canonical prompt-dispatch contract path was unavailable to read from TokenCorridor during this pass, so do not issue or claim a validated prompt-parallel manifest. Repair through the canonical resolver/contract owner; avoid populating the globally reserved manifest with guessed fields.

**Principle:** Ship the bird *with the app*, ship the instructions *with the app*, launch the right job *from the user's verified tracker*. A beautiful green demo is not the finished application journey; the terminal quality gate is a live, preserved, reviewable employer form.
