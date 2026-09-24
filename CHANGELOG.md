# Changelog

All notable EscapeHatch **product** releases are recorded here.
Product identity is owned by `VERSION`. Exact freshness is the Git commit (and any release tag pointing at that commit), never this file alone.

Schema/protocol versions (`escapehatch-*/vN`, contract `version` integers) are independent and are not product releases.

## [1.1.0]

### Added

- EH-A0: Progression & account-flow contract floor — typed Progression Plan with 12-gate AUTO_ADVANCE_SAFE / REVIEW_REQUIRED, terminal forbidden including submit/apply/finish/certify/attestation/captcha/mfa, and account-bootstrap states (APPLICATION_ENTRY through APPLICATION_FORM plus terminal AUTH_MISMATCH/CAPTCHA_REQUIRED/MFA_REQUIRED/REVIEW_REQUIRED) with session-scoped secret invariants.
- EH-A1: Safe intermediate progression engine — page archetype detection, candidate intermediate control classification, live re-scan/re-gate, validation-error and unresolved-required-field detection, loop guard, page-transition observation, navigation only through gated Progression Plan (browser/application-assist/progression.js).
- EH-A2: Deterministic profile bootstrap — one-action Sync from EscapeHatch via activeTab + scripting + storage, validated projection into extension store (64 KiB cap, field-whitelist, legacy schema compatibility), and path hygiene with canonical generated-output root Outputs/application-assist/ (browser/application-assist/profile-sync.js, ARTIFACT_REGISTRY.md).
- EH-A3: Account bootstrap & temporary credential lifecycle — email-probe/login/create-account routing, high-entropy temporary password generation only in ACCOUNT_CREATION, session-scoped secret storage with user-visible reveal/copy handoff, synthetic fixtures only (browser/application-assist/account-classifier.js, account-flow.js, credential-generator.js, session-secret.js).
- EH-A4: Adversarial validator floor — 12 sanitized multi-page fixtures encoding live-run failures (email-probe through final Submit never auto-activated, plus validation-error, unknown-field mismatch, file-upload, captcha/mfa, attestation, SPA loop, user-edited preservation) and gating regression.
- EH-U1: Ambient companion presence — 12-state projection contract (dormant/ready/observing/working_fill/working_account/working_advance/waiting_user/blocked/paused/step_complete/error/stopped), Shadow DOM isolated beacon with anchor fallback, peek/details progressive disclosure, reduced-motion/phone/coarse-pointer coverage (contracts/application-assist-presence.v1.json, browser/application-assist/presence.{js,css}).
- EH-Q0: Career-state queue & evidence contract floor — backward-compatible opportunity freshness (SNAPSHOT/LIVE_VERIFIED/STALE/CLOSED/BLOCKED/UNKNOWN) and application execution semantics (READY_TO_APPLY/FILLED/AWAITING_OPERATOR/BLOCKED/SUBMITTED), typed channel (web_form/email/external_provider), no-promotion invariants with 31 negative fixtures.
- EH-Q1: External tracker/provider reconciliation adapter — provider read-back before synchronization claim, stale/closed deactivation without history deletion, auth-failure to BLOCKED/AWAITING_OPERATOR never SUBMITTED, draft-not-sent guard, idempotent conflict preservation (contracts/application-companion.v1.json, scripts/companion_reconciliation.{py,ts,mjs}).
- EH-Q2: Batch Apply coordinator & evidence close loop — single dependency-ready item selection per priority, freshness re-verification before fill, stale/closed retirement, channel routing through progression/email/external adapters, distinctions FILLED vs AWAITING_OPERATOR vs SUBMITTED, per-transition receipt and companion reconciliation hooks (scripts/batch_coordinator.{py,ts,mjs}, artifacts/escape-hatch/src/lib/batch-coordinator.*).
- EH-A5: Product convergence — shared session integration, popup/cockpit controls, account + progression handoff, mismatch messaging and resume, integrated synthetic/Browser proof.

### Classification

- MINOR per contracts/product-release.v1.json bump_matrix aggregation highest_wins: greatest accepted change is user_visible_compatible_feature across the above additive surfaces.
- Not PATCH: more than a compatible fix; new backward-compatible capabilities (gallery above).
- Not MAJOR: no breaking installable behavior/config/CLI or required migration; public schema/protocol contracts remain versioned v1 with additive optional fields; product SemVer MAJOR reserved for breaking operator/user migration which was not introduced.

### Compatibility ceiling and promotion

- Proof ceiling remains synthetic fixture + local validator proof; no universal ATS/site compatibility is claimed.
- Live workstation browser acceptance is gated and recorded separately as sanitized evidence at docs/EH-A6-ACCEPTANCE-RECEIPT.md (EH-A6), which enumerates observed synthetic scenarios and remaining workstation-observed proof.
- Mirrored surfaces synchronized: browser/application-assist/manifest.json version mirrors VERSION via product_version sync.

## [1.0.0] - 2026-09-11

### Cutover

- Established repository-native SemVer product-release authority at `VERSION`.
- Ratified existing `browser/application-assist/manifest.json` package version `1.0.0` as the cutover release.
- Classified schema/protocol versions as non-authoritative for product releases.
- No prior Git tags or GitHub Releases existed at cutover; none were rewritten.
