# Android Application Assist capability matrix (EH-M1)

**Owner:** `docs/APPLICATION_ASSIST_ANDROID_CAPABILITY_MATRIX.md`
**Lane:** EH-M1
**Evidence sources:** Android Developers Bubbles / Conversation docs; Play Console sensitive-permission policy; host-side spike receipt `harness/reports/android-assist-presence-spike-receipt.v1.json`
**Companion contract surface:** `android_store_app` in `contracts/application-companion.v1.json`

## Decision summary

| Rank | Mechanism | Recommendation |
| --- | --- | --- |
| 1 | Quiet notification + optional foreground service + companion activity | **Primary V1** |
| 2 | Sharesheet / deep link / App Link handoff | **Required handoff path** |
| 3 | Android Bubbles (`Notification.BubbleMetadata`) | Optional later enhancement |
| 4 | `SYSTEM_ALERT_WINDOW` draw-over overlay | **Rejected as V1 primary** |
| — | Accessibility Service | **Forbidden as V1 dependency** |

## Matrix

### 1. Android Bubbles

| Dimension | Finding |
| --- | --- |
| Supported versions | API 29+ (`Notification.BubbleMetadata`); reliable conversation bubbling expects API 30+ rules |
| Permissions | Notification posting; `POST_NOTIFICATIONS` on API 33+ |
| Play policy | Uses notification API (not special draw-over). Conversation requirements (MessagingStyle + long-lived sharing shortcut) apply for apps targeting API 30+ |
| Browser coexistence | Can float above browser when system allows; OEM variance exists |
| Persistence across navigation | Tied to notification lifecycle; canceling notification removes bubble |
| UX cost | Medium — conversation/person framing is a semantic mismatch for job applications; risk of nag if used as chat-style prompts |
| Complexity | High |
| Security | System-managed; lower spoof risk than raw overlays |
| Doctrine fit | Medium — only if quiet, user-invoked, non-conversation-spammy |
| Recommendation | **Optional enhancement after quiet notification baseline** |

### 2. Draw-over / `SYSTEM_ALERT_WINDOW`

| Dimension | Finding |
| --- | --- |
| Supported versions | Special app access via Settings |
| Permissions | `SYSTEM_ALERT_WINDOW`; user must visit system settings |
| Play policy | Sensitive special access; core-function justification; do not auto-grant; high review scrutiny |
| Browser coexistence | True overlay above browser tabs |
| Persistence | Service-managed overlay view |
| UX cost | High onboarding friction; attention competition; spoofing concerns |
| Complexity | High |
| Security | Elevated overlay spoofing risk |
| Doctrine fit | Low for default “presence not nag” |
| Recommendation | **Rejected as V1 primary** — spike H5 shows lower-authority path sufficient |

### 3. Notification / foreground-service affordance

| Dimension | Finding |
| --- | --- |
| Supported versions | Notifications universal; FGS patterns API 26+ with modern type restrictions; `POST_NOTIFICATIONS` API 33+ |
| Permissions | `POST_NOTIFICATIONS`; optional `FOREGROUND_SERVICE` / typed FGS permission when durable process needed |
| Play policy | Standard if channel is honest and non-spammy; no special overlay access |
| Browser coexistence | Visible while other apps foregrounded without drawing over their pixels |
| Persistence | Ongoing quiet notification + local session store |
| UX cost | Low when importance is LOW and actions are operator-invoked |
| Complexity | Medium |
| Security | User-controllable channel; no overlay spoof |
| Doctrine fit | **High** |
| Recommendation | **Primary V1 presence mechanism** |

### 4. Companion activity

| Dimension | Finding |
| --- | --- |
| Supported versions | All |
| Permissions | None beyond install |
| Play policy | Standard |
| Browser coexistence | Requires app switch unless paired with notification/bubble |
| Persistence | Same `escapeHatch.applicationAssistSession.v1` logical session |
| UX cost | Medium alone; low as expansion target from quiet affordance |
| Complexity | Low |
| Security | App sandbox |
| Doctrine fit | High as expanded command sheet host |
| Recommendation | **Required expansion surface** |

### 5. Sharesheet / intents / App Links

| Dimension | Finding |
| --- | --- |
| Supported versions | All; verified App Links optional |
| Permissions | None for custom `escapehatch://` scheme; https verification for App Links |
| Play policy | Standard |
| Browser compatibility | Chrome, Firefox, Samsung Internet Share actions; **no desktop Chrome extension APIs on Android Chrome** |
| Persistence | Handoff seeds context into session store |
| UX cost | One explicit share gesture (acceptable; user-mediated) |
| Complexity | Low–medium |
| Security | Validate/sanitize shared text; never treat as credential channel |
| Doctrine fit | High for context capture without scraping |
| Recommendation | **Required V1 handoff path** |

### 6. Browser-specific integration options

| Browser | Reality at EH-M1 |
| --- | --- |
| Chrome Android | No MV3 extension parity with desktop; use Share / Custom Tabs / intents |
| Firefox Android | Share + limited add-on ecosystem — do not depend on add-ons for V1 |
| Samsung Internet | Share intents; no EscapeHatch desktop-extension assumption |
| In-app browsers | Prefer share/copy URL fallback |

### 7. Accessibility Service (anti-pattern)

| Dimension | Finding |
| --- | --- |
| Product temptation | Read employer forms / auto-fill across apps |
| Policy / trust cost | Extreme; disability-use justification expected; high misuse risk |
| Doctrine / safety | Conflicts with password/field safety and least authority |
| Recommendation | **Forbidden as V1 dependency** |

## Scoring used by spike (higher is better)

| Mechanism | Quiet presence | Session resume | Policy | Onboarding | Total |
| --- | --- | --- | --- | --- | --- |
| notification_foreground_service | 5 | 5 | 5 | 4 | **19** |
| companion_activity | 2 | 5 | 5 | 5 | 17 |
| sharesheet_intent_applink | 1 | 4 | 5 | 5 | 15 |
| android_bubbles | 3 | 4 | 4 | 3 | 14 |
| system_alert_window_overlay | 2 | 4 | 1 | 1 | **8** |

## Permissions for selected V1

**Required / likely:**

- `POST_NOTIFICATIONS` (API 33+)
- Optional typed foreground service permissions if durable quiet assist needs a live process

**Not required for V1:**

- `SYSTEM_ALERT_WINDOW`
- `BIND_ACCESSIBILITY_SERVICE`

## Proof ceiling

This matrix is repository + public platform documentation evidence plus host-side spike scoring. OEM bubble behavior and Play review outcomes require device/Play receipts in EH-M2+.
