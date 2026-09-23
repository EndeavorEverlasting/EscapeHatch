# EscapeHatch Ambient Companion Presence Plan

**Sprint:** EH-U1 — Ambient Companion Presence  
**Canonical plan owner:** `docs/APPLICATION_ASSIST_AMBIENT_COMPANION_PLAN.md`  
**Parent plan:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`  
**Plan date:** 2026-09-23  
**Provider planning branch:** `plan/application-assist-autopilot-20260923`  
**Execution dependency:** EH-A0 contract floor  
**Disposition of this document:** detailed implementation plan and handoff; no runtime behavior is changed merely by this plan.

## 1. Product problem

EscapeHatch can participate in an application session without making that participation legible enough. The current browser-assist experience is concentrated in the extension popup and status text. Once the operator returns to the employer page, the app largely disappears from perception.

That creates two UX failures:

1. **Silence looks like inactivity.** The operator cannot tell at a glance whether EscapeHatch is actively scanning/filling/advancing, paused, waiting for them, or no longer involved.
2. **The only obvious interaction surface risks becoming an interruption surface.** A modal, toast, repeated popup, or attention-grabbing assistant bubble would solve visibility by creating a new annoyance.

The target is **ambient companionship**:

> EscapeHatch should feel present beside the operator while work is happening, but never stand in front of the work. Presence is continuous; interruption is exceptional.

The indicator is not an advertisement, notification campaign, chatbot prompt, or fake personality layer. It is truthful operational state with a warm interaction language.

## 2. User intent captured by this sprint

The operator's requirements are binding:

- make EscapeHatch's active participation in the workflow substantially more obvious;
- do not imitate intrusive enterprise popups or repeated notification banners;
- default to a subtle indicator that can be ignored;
- allow the operator to intentionally inspect or interact with it;
- make the app feel like a buddy/friend/companion rather than a nag;
- preserve user control over whether the richer presence surface is used;
- apply the same semantic presence language to mouse, keyboard, and phone-native modes;
- research proven open-source patterns first so implementation does not reinvent the interaction model.

## 3. Open-source pattern research

This sprint is informed by implementation patterns from active/open repositories. These are **pattern references**, not permission to copy assets or code blindly. A local agent must review the applicable license before importing source; the intended implementation is repository-native.

### 3.1 OpenHands — compact execution-status presence

Repository: `OpenHands/OpenHands`

Relevant sources inspected:

- `src/components/features/conversation/conversation-name-with-status.tsx`
  - current fetched content SHA: `12b97a6f98668ad3661276d29883ec53c4c8b108`
- `src/hooks/use-app-title.ts`
  - current fetched content SHA: `187721c8e6af5f2c589fe1d68717d2faee5b5c12`
- `__tests__/components/features/home/automation-run-activity-sparkline.test.ts`
  - current fetched content SHA: `208b360d505187d751d092998e425842bc2276bc`

Observed pattern:

- a compact status glyph sits beside the conversation name instead of opening a modal;
- the state is derived from actual execution state;
- hover/tap can expose controls without making those controls permanently dominant;
- the browser title can carry an additional lightweight state signal;
- active automation uses pulse only for the running state, rather than animating everything.

**Adopt:** compact truthful state, on-demand disclosure, active-only animation.  
**Do not adopt literally:** modifying employer-page titles or copying OpenHands iconography.

### 3.2 assistant-ui — state-driven loading/status primitives

Repository: `assistant-ui/assistant-ui`

Reference:

- `apps/docs/content/docs/ink/primitives.mdx`
- inspected repository revision in search evidence: `aa83d87d860b9fa427256ca3b54367253572004b`

Observed pattern:

- loading presence renders only while the runtime says the thread is running;
- status is modeled as explicit semantic state rather than inferred from arbitrary timers;
- status UI is composable: a tiny indicator can exist independently from the full conversation surface.

**Adopt:** the presence renderer consumes canonical runtime state; it does not invent state.

### 3.3 assistant-ui/tool-ui — progressive disclosure and receipts

Repository: `assistant-ui/tool-ui`

Reference:

- `apps/www/app/docs/progress-tracker/content.mdx`
- inspected revision in search evidence: `49a870286facdbf28160cd647f0d337ebdc9b275`

Observed pattern:

- pending / in-progress / completed / failed are distinct;
- the current step receives subtle visual emphasis and `aria-current="step"`;
- completed work collapses into a receipt rather than leaving a large progress surface open forever.

**Adopt:** state transition -> brief legible feedback -> collapse back to ambient presence.

### 3.4 AgentHUD — working versus waiting

Repository: `neochoon/agenthud`

Relevant sources inspected:

- `README.md`, fetched content SHA `a3530eee5ea66d0a62614c4ef7dfde38e8a1b51f`
- `FEATURES.md`

Observed pattern:

- `[working]` and `[waiting]` are first-class and immediately legible;
- the currently active operation gets a spinner/bold treatment, while inactive history does not;
- ambient tracking is explicitly user-controllable;
- user navigation disables tracking rather than fighting the operator.

**Adopt:** distinguish **EscapeHatch is working** from **EscapeHatch is waiting on you**. Never use one generic “active” state for both.

## 4. Design doctrine

### 4.1 Ambient first

The smallest useful surface is always the default. EscapeHatch does not open a panel merely because a state changed.

### 4.2 Truth before personality

Friendly wording is allowed only after state is proven. A breathing dot must mean real active work. “Your turn” must mean the workflow is actually blocked on operator input.

### 4.3 One companion, one state machine

Presence does not create another application/session state machine. It projects canonical state owned by Application Assist, account bootstrap, and progression.

### 4.4 Progressive disclosure

Three layers:

1. **Beacon** — always-small ambient status.
2. **Peek** — brief inline state phrase during material transitions.
3. **Companion details** — operator-invoked anchored panel showing what is happening and why.

There is no automatic fourth layer such as a modal dialog.

### 4.5 User sovereignty

The companion may be ignored, collapsed, switched to dot-only, or hidden for the current session. It never chases the pointer, steals focus, reopens itself after manual dismissal, or requires acknowledgement for ordinary progress.

### 4.6 Warm, not chatty

The voice should feel like a competent coworker nearby, not an engagement bot.

Preferred examples:

- `Checking this page…`
- `Filling the details I know…`
- `Setting up the account…`
- `Moving to the next step…`
- `Your turn — this one needs you.`
- `I stopped here so I don't guess.`
- `Done with this step.`
- `Ready when you are.`

Avoid:

- repeated greetings;
- exclamation-heavy copy;
- fake urgency;
- congratulations for trivial actions;
- motivational filler;
- “I noticed you haven't…” nag language;
- countdowns except where the underlying workflow truly has one;
- anthropomorphic claims unsupported by actual state.

## 5. Canonical presence state model

EH-U1 introduces a projection contract, proposed owner:

`contracts/application-assist-presence.v1.json`

The presence contract consumes canonical events/state. It does not own workflow decisions.

### States

| Presence state | Meaning | Default visual | Default copy | Persistence |
| --- | --- | --- | --- | --- |
| `dormant` | no assist session owns the current page | hidden | none | until session starts |
| `ready` | session is active but no operation is executing | small steady beacon | `Ready` only on intentional reveal | persistent |
| `observing` | page is being classified/scanned | slow pulse | `Checking this page…` | while true |
| `working_fill` | approved fields are being written/re-gated | slow pulse | `Filling the details I know…` | while true |
| `working_account` | account bootstrap is executing | slow pulse | `Setting up the account…` | while true |
| `working_advance` | a gated intermediate progression action is executing | slow pulse | `Moving to the next step…` | while true |
| `waiting_user` | safe continuation requires operator input | steady ring + short label | `Your turn — this one needs you.` | until resolved |
| `blocked` | progression stopped because a gate failed or state is ambiguous | warning marker + label | `I stopped here so I don't guess.` | until resolved |
| `paused` | operator paused assist | hollow/static beacon | `Paused` | until resume |
| `step_complete` | a bounded step completed | check / gentle settle | `Done with this step.` | short dwell then `ready` |
| `error` | operation failed unexpectedly | static error marker | `I couldn't finish that step.` | until acknowledged/retry |
| `stopped` | emergency stop is latched | stopped marker | `Stopped` | until new session |

### Hard rule

No UI timer may promote one semantic state to another. Timers may only control **presentation dwell/collapse** after the canonical state transition has already occurred.

## 6. Primary surface: in-page Companion Beacon

The primary visual presence should live on the page where the operator is doing the application work.

### 6.1 Rendering boundary

Proposed owner:

- `browser/application-assist/presence.js`
- optional `browser/application-assist/presence.css` if repository conventions prefer stylesheet separation

Render inside an isolated **Shadow DOM** host so employer styles cannot accidentally restyle the companion and the companion cannot leak CSS into the employer page.

The presence renderer receives typed state only. It must not independently inspect job-form semantics to decide whether work is safe.

### 6.2 Collapsed beacon

Desktop/fine-pointer default:

- compact circular/rounded indicator at an edge anchor;
- visual footprint should remain small enough not to compete with the application form;
- active state may use one slow pulse/breathing animation;
- idle/ready/paused/waiting/error states are static;
- no bouncing, shaking, flashing, expanding loops, or notification badges that repeatedly demand attention.

Phone/coarse-pointer default:

- minimum 44px touch target around the small visual indicator;
- safe-area insets honored;
- no hover dependency;
- tap expands details;
- no text input autofocus.

### 6.3 Peek behavior

A **peek** is not a popup. It is the beacon temporarily widening to include a short status phrase.

Rules:

- allowed after a material state transition;
- normal working peeks auto-collapse after a short dwell;
- `waiting_user`, `blocked`, and `error` remain legible until the operator resolves or deliberately collapses them;
- repeated identical state events do not retrigger the peek;
- operator collapse suppresses further cosmetic peeks until the semantic state materially changes;
- peeks never overlap the page's active form control if collision detection can select another anchor.

### 6.4 Companion details

Intentional click/tap/keyboard activation opens an anchored non-modal panel.

Minimum contents:

- **Now** — current state and current bounded action;
- **Why** — only when waiting/blocked/error;
- **Last** — last completed action, metadata only;
- **Controls** — only existing semantic actions the user is already authorized to invoke, e.g. Pause/Resume/Stop/Retry/Open commands.

The details surface may not invent new workflow authority.

Dismissal:

- Escape closes details;
- click/tap outside closes details;
- browser Back on phone returns to the prior EscapeHatch surface when applicable;
- dismissing details does not pause/stop the session.

## 7. Anchor and collision behavior

Job sites frequently already occupy the lower-right corner with chat widgets, cookie controls, accessibility tools, or sticky application CTAs. EscapeHatch must not blindly claim that corner.

Preferred anchor search order:

1. lower-right;
2. lower-left;
3. mid-right;
4. mid-left.

The renderer should test a small reserved rectangle at each candidate against visible high-priority fixed/sticky elements. If the preferred region is occupied, choose the next candidate.

The operator can manually switch side from Companion Details. User choice wins over automatic preference for the remainder of the session.

Do not implement free-form draggable positioning in the first version; it adds gesture/state complexity without proving more value.

## 8. Secondary ambient surfaces

### 8.1 Extension toolbar status

When an existing canonical extension execution context can update `chrome.action`, mirror coarse presence into the extension action:

- no badge when dormant;
- small dot/short marker for working;
- distinct marker for waiting/blocked;
- clear after session end.

**Do not introduce a background service worker solely to paint a badge.** If EH-A1/EH-A3 introduce a resident coordinator for actual workflow reasons, EH-U1 may bind to it.

### 8.2 EscapeHatch cockpit

The local cockpit may project the same presence state as a thin companion strip/status chip. It must consume the same projection contract and copy catalog.

Do not create independent wording/state logic in `App.tsx`.

### 8.3 Employer page title/favicon

Do **not** modify employer page title or favicon in V1. OpenHands demonstrates that title-level state can be effective inside an app that owns the page, but EscapeHatch does not own the employer page chrome. Avoid confusing the site's identity or breaking title-based workflows.

## 9. Phone-native behavior

The existing owner is `contracts/application-assist-modality.v1.json`.

EH-U1 extends the phone grammar; it does not create “mobile EscapeHatch” as a separate product.

Phone rules:

- collapsed beacon is reachable by one tap;
- details are a bottom/edge sheet only after intentional activation;
- 44px minimum target;
- safe areas honored;
- status copy wraps without horizontal scrolling;
- no hover-only explanation;
- no long-press-only action;
- no swipe gesture required;
- software keyboard does not appear when opening presence/details;
- touch/click synthesis uses the existing dedupe contract;
- browser Back dismisses details before changing session state;
- reduced-motion preference disables pulse and replaces it with a static state treatment.

## 10. Interaction capabilities added to the modality layer

Proposed semantic additions:

- `open_companion_details`
- `dismiss_companion_details`
- `set_companion_presentation` with allowed values `quiet | dot_only | hidden_for_session`
- `set_companion_side` with `left | right`

These are **UI state only**. None may start, pause, resume, advance, submit, or change account state by themselves.

Existing actions such as Pause/Resume/Emergency Stop may be *rendered* inside Companion Details, but they still invoke their existing shared handlers.

## 11. Copy contract

Create one canonical copy map, not inline prose scattered across renderers.

Proposed owner:

`browser/application-assist/presence-copy.js`

or a typed object within `presence.js` if repository convention favors a single module.

Properties per semantic state:

- `short`
- `detail`
- optional `reason_prefix`
- accessibility label

Constraints:

- short copy <= 48 visible characters where practical;
- one sentence maximum in peek;
- no punctuation animation (“Working… … …”);
- no rotating fake “thinking” messages;
- no random copy variants in V1;
- failure reasons come from typed gate/error reason mappings, not raw stack traces;
- no employer/application PII in generic presence text.

## 12. Motion and visual semantics

### Motion

- one slow pulse/breath only for canonical working states;
- recommended cycle: roughly 1.4–2.0 seconds, low amplitude;
- no fast spinner for long-running ambient presence unless inside the expanded details panel;
- `prefers-reduced-motion: reduce` -> no pulse; use static ring/fill differences;
- completion may settle once, then become `ready`; no celebratory burst/confetti.

### Color

Use semantic repository tokens, not hard-coded “AI purple.”

Suggested semantic roles:

- ready/active;
- working;
- waiting/user-action;
- warning/blocked;
- error/stopped;
- neutral/paused.

Do not rely on color alone. Shape/icon/label semantics must also differ.

### Attention budget

Red is reserved for actual error/emergency stop, not routine manual review. `waiting_user` should feel calm, not alarming.

## 13. Accessibility contract

- collapsed beacon is a button only when it is interactive; otherwise expose appropriate status semantics;
- intentional control must have a stable accessible name such as `EscapeHatch companion — working`;
- use `aria-live="polite"` only for material state changes that benefit from announcement;
- do not announce every scanner/fill substep;
- `waiting_user`, `blocked`, and `error` get one announcement per material transition;
- expanded details use a non-modal popover/dialog pattern with deterministic focus return;
- Escape dismisses details without mutating session state;
- keyboard path exists for open/dismiss and every control shown inside;
- high-contrast/forced-colors mode remains legible;
- pointer target and safe-area rules inherit the modality contract.

## 14. Privacy and safety

Presence is a projection surface, not a data collection surface.

Forbidden:

- network requests solely for presence;
- telemetry added by this sprint;
- employer-page content copied into generic status text;
- passwords/tokens/account secrets rendered in beacon/details;
- raw form values in logs or presence receipts;
- DOM mutation outside the isolated host except where the existing canonical application-assist pipeline already owns it;
- final-submit authority;
- attention-grabbing behavior after the operator selects `hidden_for_session`.

## 15. Implementation ownership

### EH-U1 owned mutation surfaces

Preferred new files:

- `contracts/application-assist-presence.v1.json`
- `browser/application-assist/presence.js`
- optional `browser/application-assist/presence.css`
- `docs/APPLICATION_ASSIST_AMBIENT_COMPANION.md`
- `fixtures/application-assist-presence-demo.html`
- `tests/test_application_assist_presence_contract.py`
- `tests/test_application_assist_presence.mjs`

Conditional shared owner after EH-A0 refresh:

- `contracts/application-assist-modality.v1.json` for presence-only semantic actions.

### Forbidden mutation surfaces in EH-U1

- `assist-core.js` workflow decisions;
- progression/account state-machine implementation;
- popup/content shared integration when another active lane owns those files;
- final-submit logic;
- profile/import/export behavior;
- Windows lifecycle files;
- repository promotion/version files.

EH-A5 owns final integration into shared `content.js`, `popup.js`, `popup.html`, and cockpit `App.tsx` if those files are also being changed by EH-A1/A2/A3.

This prevents “UX polish” from becoming a collision-heavy rewrite.

## 16. Required canonical inputs

Read before implementation:

1. `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`
2. EH-A0's exact integrated/pinned contract revision
3. `contracts/application-assist-session.v1.json`
4. `contracts/application-assist-modality.v1.json`
5. `browser/application-assist/assist-core.js`
6. `browser/application-assist/content.js`
7. `browser/application-assist/popup.js`
8. existing assist tests/fixtures
9. `ARTIFACT_REGISTRY.md`
10. the OSS pattern references in Section 3

Do not implement against this planning branch if EH-A0 has materially changed the session/progression state model without first reconciling the projection table.

## 17. Event-to-presence adapter

EH-U1 should expose a pure adapter similar to:

`projectPresence(canonicalState, lastEvent) -> PresenceSnapshot`

A `PresenceSnapshot` should contain only presentation-safe metadata:

- `state`
- `shortLabelKey`
- optional `reasonCode`
- `startedAt`
- optional `lastCompletedActionKey`
- `canExpand`
- `presentationPreference`
- `sidePreference`

No profile values, answers, usernames, passwords, tokens, or employer-specific question text.

Input reasons must be typed. Unknown reason -> safe generic copy.

## 18. Persistence

Persist only UI preference:

- quiet / dot-only / hidden-for-session;
- left/right side;
- optionally whether details were manually collapsed.

Do not persist transient `working_*` state separately from the canonical session. On reload/reconnect, reconstruct presence from canonical session/runtime state.

This avoids a stale “working” beacon after a crash.

## 19. Regression fixture matrix

The sprint is incomplete without fixtures/tests covering:

1. dormant -> session start -> ready;
2. ready -> observing -> working_fill -> step_complete -> ready;
3. account bootstrap -> working_account;
4. gated advance -> working_advance;
5. safe work transitions do not open Companion Details automatically;
6. waiting_user persists visibly;
7. blocked persists with safe generic reason;
8. error does not display raw stack/PII;
9. paused is static and non-alarming;
10. emergency stop is visually distinct;
11. repeated identical events do not retrigger peek animation;
12. hidden-for-session remains hidden through ordinary state changes;
13. a materially different waiting/error state may update accessible status without forcibly reopening UI;
14. reduced-motion disables animation;
15. keyboard open/dismiss returns focus correctly;
16. coarse pointer target >= 44px;
17. safe-area offsets are applied on phone layout;
18. employer page with lower-right floating widget causes anchor fallback;
19. employer page with sticky bottom CTA does not get covered by the beacon;
20. Shadow DOM isolation prevents host CSS leakage;
21. beacon/details never include profile values or temporary credentials;
22. final submit/manual-only state is represented as waiting_user, not working_advance;
23. operator navigation wins; presence never steals focus;
24. step completion collapses to ambient ready state without leaving a large panel behind.

## 20. Browser proof

Synthetic browser proof should include a fixture with:

- dense application form;
- sticky footer action;
- fake chat widget in lower-right;
- SPA transition;
- validation error;
- manual-review question;
- account bootstrap page;
- final Submit button;
- mobile viewport;
- reduced-motion emulation.

Assertions:

- exactly one companion host exists;
- anchor fallback is deterministic;
- no layout shift in host form;
- no automated panel opening;
- status maps to canonical events;
- final Submit is never activated;
- state is visible without opening the extension popup;
- phone interaction does not summon the software keyboard merely by inspecting status.

## 21. Acceptance criteria

EH-U1 is done only when:

- active participation is visible directly on the work page without opening the popup;
- the default surface remains compact enough to ignore;
- working and waiting are unmistakably different;
- presence is driven by canonical state, not fake timers;
- ordinary state changes do not produce modal/pop-up interruption;
- operator can inspect details on demand;
- operator can select dot-only or hide for the session;
- phone-native interaction is reachable and non-hover-dependent;
- reduced-motion and keyboard accessibility pass;
- fixture coverage proves no overlap with common sticky/chat-widget regions;
- no profile/credential leakage is possible through presence state;
- shared integration is handed to EH-A5 when it would collide with active application-logic lanes.

## 22. Dependency and parallel safety

Parent graph becomes:

`EH-A0 -> { EH-A1 || EH-A2 || EH-A3 || EH-A4 || EH-U1 } -> EH-A5 -> EH-A6`

EH-U1 is parallel-safe after EH-A0 **only if** it stays on its new contract/module/test surfaces.

If EH-U1 needs to modify `content.js`, `popup.js`, `popup.html`, or cockpit `App.tsx` while A1/A2/A3 are active, it must stop at the adapter/module boundary and leave those edits to EH-A5 convergence.

Graph width after EH-A0 is therefore **5** at the design/module level.

## 23. Validation order

Focused EH-U1:

1. `python tests/test_application_assist_presence_contract.py`
2. `node tests/test_application_assist_presence.mjs`
3. existing modality contract/runtime tests
4. existing assist-session contract/runtime tests
5. browser fixture proof
6. `git diff --check`

Convergence at EH-A5:

1. all EH-A1/A2/A3/A4/U1 focused checks;
2. combined browser flow;
3. phone/coarse-pointer emulation;
4. reduced-motion pass;
5. local unpacked-extension observation.

Physical phone/browser ergonomics remain a live acceptance ceiling until observed.

## 24. Proof ceiling

Repository proof can establish:

- state projection correctness;
- DOM isolation;
- geometry/collision behavior in fixtures;
- keyboard/touch-emulation semantics;
- reduced-motion behavior;
- no secret/profile data in snapshot payloads;
- non-modal progressive disclosure.

Repository proof cannot establish:

- every ATS site's fixed-widget geometry;
- physical-phone comfort;
- subjective “friendliness” for all users;
- live employer-site compatibility.

Those belong to EH-A6 observed acceptance.

## 25. First executable implementation action

After EH-A0 is integrated or pinned:

1. refresh provider/local truth;
2. create an isolated EH-U1 worktree/branch from that exact floor;
3. add `contracts/application-assist-presence.v1.json` first;
4. add negative/positive contract fixtures/tests;
5. implement the pure state projection;
6. implement the isolated Shadow DOM beacon against the synthetic fixture;
7. prove reduced-motion, keyboard, phone geometry, collision fallback, and no-secret output;
8. stop before shared-file integration if A1/A2/A3 still own overlapping files;
9. return the proven module/contract to EH-A5 convergence.

## 26. Operational closeout for this planning artifact

- **COMPLETED / PROVEN:** OSS patterns inspected; current EscapeHatch modality/popup/manifest inspected; ambient-companion UX doctrine, state model, ownership, fixture matrix, and dependency placement defined.
- **REMAINING GAPS:** no presence runtime has been implemented or observed.
- **RISKS:** overlay collision, attention overuse, stale state after crash, and accidental duplication of workflow state; each has an explicit prevention rule above.
- **BLOCKERS:** implementation waits for EH-A0's canonical progression/account state vocabulary so presence does not fossilize stale state names.
- **PROOF CEILING:** durable plan/research evidence only.
- **INTEGRATION STATE:** parent planning PR only; no runtime integration.
- **NEXT ACTION:** EH-A0 first; then EH-U1 may execute in parallel with A1-A4 on isolated new-file surfaces.
