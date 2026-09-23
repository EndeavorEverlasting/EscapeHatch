# EscapeHatch Ambient Companion — Presence

Presence makes active participation ambiently visible on the work page without intrusive popups. It is a **projection** of canonical application-assist session state, not a second state machine.

- **Beacon:** compact circular indicator at an edge anchor (Shadow DOM isolated, 44px touch target, safe-area insets). Slow pulse only for `observing` / `working_fill` / `working_account` / `working_advance`; static for `ready`, `waiting_user`, `blocked`, `paused`, `error`, `stopped`. `prefers-reduced-motion` disables pulse.
- **Peek:** brief widen to a short phrase after a material transition; auto-collapses (2400ms working, 1800ms step_complete). `waiting_user` / `blocked` / `error` remain legible until resolved.
- **Companion Details:** opened only by intentional click/tap/keyboard on the beacon. Shows **Now**, **Why** (when waiting/blocked/error), **Last** completed metadata, and existing session controls. Dismisses via Escape, outside tap, or browser Back; never steals focus or auto-opens on state change.
- **Anchoring:** deterministic fallback `lower-right → lower-left → mid-right → mid-left` tested against fixed/sticky chat/footer widgets; operator side choice wins for session.
- **States (12):** `dormant`, `ready`, `observing`, `working_fill`, `working_account`, `working_advance`, `waiting_user`, `blocked`, `paused`, `step_complete`, `error`, `stopped`. Copy is warm, one sentence, ≤48 chars, no rotating fake thinking, typed reasons only.
- **Persistence:** only `presentationPreference` (`quiet | dot_only | hidden_for_session`) and `sidePreference` (`left | right`) persist; transient working state is reconstructed from canonical session on reload. `hidden_for_session` survives ordinary state changes.
- **Hard rule:** No UI timer may promote semantic state; timers only control dwell/collapse.
- **Privacy:** snapshot and DOM never contain profile values, temporary credentials, or employer PII.

**Projection adapter:** `browser/application-assist/presence.js` exports `projectPresence(canonicalState, lastEvent) → PresenceSnapshot` with fields `state`, `shortLabelKey`, `reasonCode`, `startedAt`, `lastCompletedActionKey`, `canExpand`, `presentationPreference`, `sidePreference`. Render uses isolated Shadow DOM host `escapehatch-companion-host`.

**Validation:**
```
python tests/test_application_assist_presence_contract.py
node tests/test_application_assist_presence.mjs
```

**Proof ceiling:** repository contract/projection and synthetic fixture geometry; no universal ATS or physical-phone claim.
