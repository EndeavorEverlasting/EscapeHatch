# Ambient Application Assist — Scheduled Profile Hydration + Zero-Click Autofill

**Status:** SUCCESSOR DESIGN / NOT IMPLEMENTED  
**Parent product owner:** `docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md`  
**Convergence owner:** `docs/ESCAPEHATCH_CONVERGENCE_CONTROL_PLAN.md`  
**Baseline implementation:** PR #47 on the integration branch  
**Operator outcome:** EscapeHatch keeps application data current in the background and fills safe fields on eligible application pages without the user opening the extension popup or pressing Start Assist.

## 1. Scope correction

PR #47 implemented:

```text
open popup
-> Start Assist
-> load AutofillPreference (default ON)
-> canonical Fill Plan
-> safe field writes
```

Ambient Application Assist requires:

```text
background profile hydration
        +
event-driven application-page observation
        +
canonical Fill Plan
        =
zero-click safe autofill
```

A periodic scheduler must **not** repeatedly poll or mutate browser DOM. Scheduling owns profile freshness. Browser lifecycle events own fill requests.

## 2. Current constraints from the integration floor

Current extension manifest:

- Manifest V3;
- permissions: `activeTab`, `scripting`, `storage`;
- no background service worker;
- no declared `content_scripts`;
- no host permissions.

Therefore, today's permission model is intentionally user-gesture-centered. True zero-click page observation cannot be claimed without a deliberate permission/runtime change.

Current local runtime:

- owns `127.0.0.1:21031` by default;
- exposes runtime identity and authenticated shutdown semantics;
- stores an instance receipt under user-local application data;
- is launched/managed through the Windows lifecycle manager;
- does **not** currently expose a profile/autofill data bridge.

This makes the installed runtime a strong candidate scheduler owner, but not yet a proven browser-data bridge.

## 3. Architectural split

```text
PRIVATE CAREER / PROFILE STATE
            |
            v
+-----------------------------+
| AmbientProfileScheduler     |  local installed runtime
+-----------------------------+
            |
            v
+-----------------------------+
| ProfileHydrator             |
| validate / normalize /      |
| resolve current profile     |
+-----------------------------+
            |
            v
+-----------------------------+
| AutofillSnapshot            |  derived cache, not authority
+-----------------------------+
            |
        bridge
            |
            v
+-----------------------------+
| Browser Application Observer|
+-----------------------------+
            |
            v
      requestAutofill()
            |
            v
      canonical Fill Plan
            |
            v
      existing policy gate
            |
            v
        DOM writer
```

The browser never becomes the career-state authority.

The scheduler never becomes a second Fill Plan.

## 4. User-visible defaults

### Global settings

- **Keep application profile synchronized:** ON by default.
- **Autofill eligible application fields automatically:** ON by default.
- **Manual Fill now:** always available when safe.
- **Final submit / certification / signature:** always operator-controlled.

Turning autofill OFF:
- persists explicitly;
- stops future automatic fill triggers;
- does not erase values already filled;
- does not automatically disable background profile synchronization.

Turning profile synchronization OFF:
- stops scheduled/provider refresh;
- does not silently turn autofill ON/OFF;
- causes freshness rules to determine whether the existing snapshot remains usable.

## 5. Effective automation state

The user-facing control may remain a simple ON/OFF toggle, but runtime state must distinguish:

- `ENABLED`
- `DISABLED_BY_USER`
- `SUSPENDED`

Examples of `SUSPENDED`:

- malformed or unverifiable snapshot;
- source conflict;
- emergency stop;
- unsupported application surface;
- unexpected cross-origin transition;
- required sensitive/current answer lacks authority.

A system suspension must not overwrite the user's persistent preference.

## 6. Scheduled profile hydration

### 6.1 Scheduler owner

Canonical scheduling policy should be provider-agnostic.

Windows adapter may use:
- runtime startup;
- logon/startup integration;
- a per-user scheduled task;
- an in-process timer while EscapeHatch is healthy.

Do not make Windows Task Scheduler the semantic owner of hydration policy.

### 6.2 Trigger floor

Hydration should run on:

1. installed runtime startup;
2. successful source/provider synchronization;
3. explicit profile revision change;
4. manual "sync now";
5. periodic fallback cadence.

**Prototype cadence:** 15 minutes as a bounded reconciliation fallback. This is a prototype parameter, not an immutable product truth; retain only if resource/freshness testing supports it.

Source-change events should not wait for the periodic timer.

### 6.3 Hydration call stack

```text
scheduler trigger
 -> read canonical private career/profile state
 -> reconcile provider revisions where authorized
 -> validate current field authority/freshness
 -> normalize autofill-safe projection
 -> write AutofillSnapshot atomically
 -> write non-secret freshness receipt
 -> notify bridge consumers of snapshot revision
```

## 7. AutofillSnapshot

The snapshot is a derived, local, replaceable projection.

Minimum metadata:

```json
{
  "schema": "escapehatch/application-autofill-snapshot/v1",
  "snapshot_revision": "...",
  "source_revision": "...",
  "generated_at": "...",
  "last_successful_sync": "...",
  "profile_state": "CURRENT",
  "fields": {}
}
```

Field entries should carry enough metadata to enforce:

- provenance/source family;
- freshness class;
- automation policy;
- sensitivity/manual-only status;
- opportunity override scope where applicable.

Do not place raw secrets, passwords, signatures, protected-class inference, or attestation decisions into the snapshot.

## 8. Freshness classes

At minimum:

- `CURRENT`
- `STALE_BUT_USABLE`
- `BLOCKED_STALE`
- `CONFLICTED`

Freshness is field-aware.

Stable identity fields may tolerate greater age than legal/current/compensation/application-specific answers.

The snapshot should fail closed per field rather than making one stale answer invalidate unrelated stable identity data.

## 9. Browser observer

The browser side is event-driven.

Candidate triggers:

- document load;
- same-application route transition;
- recognized form mount;
- meaningful DOM mutation that adds eligible fields;
- snapshot revision change while an eligible page is open.

Every trigger converges on one API:

`requestAutofill(trigger, pageFingerprint, snapshotRevision)`

No trigger owns direct DOM writes.

## 10. Deduplication

A fill request identity should include, at minimum:

- application/opportunity binding when available;
- origin;
- page fingerprint;
- snapshot revision;
- recognized field-set fingerprint.

Rule:

```text
same stable page + same snapshot + same recognized field set
=> no second automatic FillBatch
```

New eligible fields or a new snapshot revision may create a new bounded plan.

EscapeHatch writes must not create a mutation-observer feedback loop.

## 11. ApplicationSurfaceGate

Zero-click autofill must not treat every web form as a job application.

Strong evidence may include:

- active/known opportunity binding;
- verified tracked apply URL/origin;
- recognized ATS/application-domain evidence;
- strong application-form semantic signature.

Examples:

- tracked ATS application -> eligible;
- checkout form -> ineligible;
- newsletter form -> ineligible;
- ordinary login page -> ineligible unless part of a recognized application/auth flow already owned by Application Assist.

## 12. Browser permission decision — AA0-PERM

The current `activeTab` model is insufficient for truly zero-click observation.

AA0 must prototype and decide the smallest acceptable persistent authority.

### Candidate A — persistent host/content-script authority

Declare content scripts/host permission broad enough to observe supported application pages without a click.

Pros:
- simplest zero-click lifecycle;
- works after browser/page navigation.

Risks:
- broad browsing-page authority;
- install-time permission UX;
- larger privacy blast radius.

If selected, the ApplicationSurfaceGate and no-telemetry/private-data contracts become critical.

### Candidate B — ATS/domain-bounded persistent authority

Ship a bounded supported ATS/domain list.

Pros:
- smaller permission surface.

Risks:
- incomplete coverage;
- frequent domain maintenance;
- cannot seamlessly handle arbitrary employer-hosted application domains.

### Candidate C — keep `activeTab`

Rejected as sufficient for the requested zero-click default because user gesture is required to acquire authority.

It may remain as a restricted/fallback privacy mode.

**No agent may silently add `<all_urls>` or equivalent without the AA0-PERM decision and explicit operator-facing permission rationale.**

## 13. Runtime/browser bridge decision — AA0-BRIDGE

The installed runtime owns the strongest background profile/scheduler position. The extension needs a safe local snapshot channel.

Prototype these candidates:

### Bridge A — authenticated loopback API

Extend the existing `127.0.0.1:21031` managed runtime with a read-only profile-snapshot endpoint and a dedicated bridge-auth mechanism.

Do **not** reuse the shutdown token as the profile-data bearer token.

Must prove:
- loopback-only access;
- origin/client authorization;
- bounded read-only API;
- no CORS leakage to arbitrary webpages;
- restart/token rotation behavior;
- extension permission requirements.

### Bridge B — Chrome/Edge Native Messaging

Installer registers a native host and the extension communicates through `nativeMessaging`.

Pros:
- purpose-built extension/native-app channel;
- no general localhost HTTP data endpoint.

Costs:
- stable extension identity/registration;
- browser-specific installation plumbing;
- packaging complexity.

### Bridge C — extension-local snapshot only

Profile projection is written only when an explicit extension/user sync path occurs.

This is a useful fallback but **does not satisfy the full scheduled background-provider hydration outcome**.

### Selection preference

Prototype A first because EscapeHatch already owns a strongly identified loopback runtime. Select it only if dedicated authorization and browser-origin constraints prove adequate. Otherwise prefer Native Messaging over a weak/open localhost profile API.

## 14. Site controls

Global default:

`autofill_enabled = true`

Allow persistent site overrides:

```json
{
  "global": true,
  "site_overrides": {
    "example.com": "disabled"
  }
}
```

A site override narrows the global policy. It does not create a second Fill Plan or independent automation engine.

## 15. Existing-value rule

Automatic behavior remains:

```text
EMPTY + KNOWN + AUTHORIZED -> fill
NONEMPTY -> preserve
UNKNOWN -> preserve
MANUAL_ONLY -> preserve
```

A future discrepancy-review feature may tell the user that an existing page value differs from current profile truth. That is review UX, not authority to overwrite automatically.

## 16. Submission boundary

Ambient mode may increase how much of an application becomes ready without interaction.

It does **not** change:

- signature policy;
- certification/attestation policy;
- final submission ownership;
- unknown/sensitive answer fail-closed behavior.

Target experience:

```text
open application
 -> safe fields fill automatically
 -> EscapeHatch surfaces only unresolved/review items
 -> user resolves judgment items
 -> user reviews
 -> user submits
```

## 17. Local evidence receipt

Record metadata, not a transcript of private application values.

Example shape:

```json
{
  "kind": "AUTOFILL_BATCH",
  "application_id": "...",
  "page_fingerprint": "...",
  "snapshot_revision": "...",
  "recognized": 14,
  "filled": 9,
  "preserved_existing": 3,
  "manual_review": 2,
  "blocked": 0,
  "observed_at": "..."
}
```

This should support local debugging and user-visible status without becoming behavioral telemetry.

## 18. Work decomposition

### AA0 — contracts + executable seams

**Runtime:** local implementation/prototype lane, remotely reviewed  
**Owns:**
- snapshot contract;
- scheduler contract;
- permission decision prototype;
- bridge decision prototype;
- dedupe/page fingerprint seam;
- synthetic fixtures/tests.

**Does not own:**
- broad production manifest permission change before decision;
- full browser implementation;
- provider credentials;
- final submission.

### AA1 — local profile scheduler/hydrator

Depends on AA0.

Owns:
- installed-runtime scheduler adapter;
- atomic snapshot generation;
- freshness receipt;
- source-change + periodic triggers.

### AA2 — browser ambient observer

Depends on AA0 permission + bridge decisions.

Owns:
- extension background/service-worker or equivalent;
- application surface gate;
- lifecycle events;
- deduplicated `requestAutofill`;
- existing Fill Plan integration only.

### AA3 — convergence + live proof

Depends on AA1 + AA2.

Proves:
- cold/restarted Windows runtime keeps profile hydrated;
- opening a supported application page fills allowed fields without opening popup;
- user OFF persists;
- site OFF persists;
- unknown/manual fields stay untouched;
- no final submit;
- browser restart/runtime restart recover correctly.

## 19. Collision map

### Shared with COMP0 / future QMEM

Potential collision:
- career-state/profile provenance;
- taxonomy/preference semantics.

Therefore:
- AA0 contract/prototype can proceed on new isolated files;
- production mutation of shared career-state/taxonomy surfaces waits for COMP0 integration or must explicitly rebase/reconcile.

### Shared with P95

Potential collision:
- `manifest.json`;
- user settings;
- popup status projection;
- Application Assist fill triggers.

PR #47 is the baseline. AA2 extends it; it must not fork a second fill engine.

### Shared with recovery PR #29

Any runtime work touching the same session/progression/recovery files must reconcile #29 before integration.

## 20. Proof taxonomy

- **DESIGNED:** this plan.
- **CONTRACT PROVED:** schemas + negative/positive fixtures.
- **BRIDGE PROVED:** authenticated local bridge works in a bounded prototype.
- **PERMISSION PROVED:** zero-click observer works with the selected permission model.
- **IMPLEMENTED:** scheduler + browser observer landed.
- **INTEGRATED:** exact candidate contained in current integration tip.
- **OBSERVED:** real workstation opens supported application and safe fields fill without EscapeHatch interaction.
- **OPERATOR ACCEPTED:** behavior is useful and controls are understandable.

Do not infer OBSERVED from tests or INTEGRATED.

## 21. Remote vs local execution

### REMOTE runtime can:
- maintain this plan;
- review AA0/AA1/AA2 PRs;
- inspect manifest/permission diffs;
- verify CI and integration containment;
- reject unsafe authority widening;
- update convergence status.

### LOCAL runtime must:
- prototype loopback/native bridge;
- run Windows scheduler/runtime behavior;
- exercise actual Chrome/Edge permissions;
- observe event lifecycle;
- perform live zero-click application proof.

## 22. First successor gate

Do **not** start by adding a timer to `content.js`.

First AA0 action:

1. preserve the current PR #47 live baseline;
2. prototype the permission model and runtime bridge independently;
3. select the smallest mechanism that can actually satisfy zero-click behavior;
4. only then build scheduler + observer production code.

## 23. Completion condition

Ambient Application Assist is not done when:
- a cron/scheduled task exists;
- the profile snapshot exists;
- a content script exists;
- autofill works after clicking Start Assist.

It is done only when a real supported application page can be opened on the operator workstation and eligible safe fields fill from a current background-hydrated profile **without opening the EscapeHatch popup or pressing a fill/start control**, while the user's global/site opt-out and manual-only/final-submit boundaries remain intact.
