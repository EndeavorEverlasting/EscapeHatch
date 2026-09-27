# EscapeHatch Default Autofill + Windows Installer + Extension Action Popup Plan

**Status:** P95 DESIGN / IMPLEMENTATION-READY PLAN — product mutation not performed by this planning pass
**Plan date:** 2026-09-27
**Repository:** `EndeavorEverlasting/EscapeHatch`
**Fresh design floor:** `integration/replit-donor-b01f628-20260921@79e42c7ec0eb3eb059ea7f992cca343da19328e8`
**Planning branch:** `plan/application-assist-autofill-installer-popup-20260927`
**Primary product owners:** `browser/application-assist/*`, `contracts/application-assist-session.v1.json`, `contracts/application-assist-modality.v1.json`, Windows runtime lifecycle surfaces
**Method:** P95 — Program Design & Call-Stack Prototype Architect, recovered from Prompt Kit source `registry/prompts/spec-architecture-prompts.v1.json` at blob `5926a198a14567de55110ed19e922fc444b4dec7`

## 1. Operator outcomes

This plan exists to produce three user-visible outcomes without weakening the current application safety boundary.

1. **Autofill is on by default.**
   - Starting an Application Assist session should fill deterministic allowed fields without requiring the user to press **Fill Allowed Fields** as a second normal-path action.
   - Autofill remains policy-gated by the existing canonical Fill Plan.
   - The user can disable automatic filling persistently.
   - Disabling autofill stops future automatic fill triggers; it does not erase or undo already-filled values.
   - Manual **Fill now** remains available even when autofill is disabled.

2. **EscapeHatch has a Windows install path that ends in an actual executable.**
   - A user-facing `Install-EscapeHatch.cmd` is the one-action install entrypoint.
   - The CMD is a thin adapter; deterministic install/update/uninstall behavior lives in a canonical implementation owner.
   - Successful installation produces an operator-launchable `EscapeHatch.exe` or another explicitly selected native executable artifact. A CMD-only shim does **not** satisfy the final executable requirement.
   - Installation is user-level by default and does not require the user to know the repository path.
   - The browser extension payload may be staged with the installation, but the installer must not pretend it can silently bypass Chrome/Edge extension-install policy.

3. **The browser toolbar extension UI is cohesive and compact.**
   - The pictured surface is the browser extension **action popup** (also reasonably called the extension popup), not a separate phone app.
   - On desktop, the action popup must not be classified as phone merely because the popup viewport is narrow.
   - Primary session state and primary actions fit without a tall wall of full-width cards.
   - Advanced/profile controls remain reachable through progressive disclosure.
   - Keyboard, mouse, and actual phone/coarse-pointer semantics remain equivalent.

## 2. Fresh evidence and current defect

### 2.1 Current popup geometry

At the design floor, `browser/application-assist/popup.html` sets:

- `body min-width: 320px`
- `body max-width: 440px`

but phone-mode CSS later overrides the body with:

- `min-width: 0`
- `max-width: none`

The operator screenshot shows the desktop Chrome toolbar popup rendered as a very narrow column, with wrapped copy and large vertical cards.

### 2.2 Current modality misclassification is the first UI defect to fix

At the same floor, `browser/application-assist/modality.js` resolves phone mode when **any** of these are true:

- coarse pointer;
- viewport <= 640 px;
- standalone display mode.

That means the narrow browser action popup itself is sufficient to produce:

`Mode: phone`

even on a desktop with a fine pointer.

This couples two independent concepts:

- **input modality** — mouse/keyboard/coarse touch;
- **layout width** — compact/narrow/regular.

The screenshot is therefore not merely “ugly CSS.” It is evidence of a state-model defect. The desktop action popup is entering the phone interaction language because viewport width is being used as an input-device authority.

### 2.3 Current fill path is explicit/manual

At the design floor:

- `Start Assist` creates and stores the session.
- `Fill Allowed Fields` separately loads profile/preferences and invokes the canonical page `fill` command.
- there is no durable user setting for automatic filling;
- the Fill Plan, field policy gate, contact-authority rules, and final-submit boundary already exist and must be reused.

### 2.4 Windows lifecycle already has a canonical process owner

`docs/WINDOWS_RUNTIME_LIFECYCLE_PLAN.md` already defines:

- canonical start/stop/status/restart behavior;
- thin CMD adapters;
- positive instance ownership before destructive action;
- user-local runtime state;
- `Launch-EscapeHatch.cmd` as a thin adapter;
- no installer/store-distribution proof yet.

The new installer therefore extends that lifecycle owner. It must not implement a second process manager.

## 3. P95 domain vocabulary

The implementation should use these concepts consistently.

### Application Assist

- **AssistSession** — canonical same-application session.
- **AutofillPreference** — persistent user choice controlling whether safe fill is triggered automatically.
- **AutofillTrigger** — a bounded event that may request one Fill Plan execution.
- **FillPlan** — existing canonical set of proposed field writes.
- **FillPolicyGate** — existing authority that decides which Fill Plan items may write.
- **FillBatch** — resulting bounded write batch and undo boundary.
- **ManualFillCommand** — explicit user request to fill now, independent of automatic preference.

### Popup / interaction

- **SurfaceContext** — where controls are rendered:
  - `EXTENSION_ACTION_POPUP`
  - `IN_PAGE_COMPANION`
  - `COCKPIT`
- **InputModality** — how the user is interacting:
  - fine pointer / mouse;
  - keyboard;
  - coarse pointer / touch.
- **LayoutDensity** — compact vs regular rendering due to available geometry.
- **PhoneInteractionLanguage** — selected from actual coarse/standalone device evidence, not narrow width alone.

### Windows installation

- **InstallOrchestrator** — canonical install/update/remove decision owner.
- **InstallArtifact** — the actual operator-launchable executable plus required support files.
- **InstallReceipt** — user-local, non-secret record of installed version/path.
- **RuntimeManager** — existing Windows start/stop/status/restart owner; installation delegates to it and does not duplicate it.
- **InstallerAdapter** — `Install-EscapeHatch.cmd`, a thin user entrypoint.

## 4. Canonical state/data ownership

| State / decision | Canonical owner | Rule |
| --- | --- | --- |
| Allowed identity/contact writes | existing Fill Plan + policy gate | unchanged |
| Phone authority | existing Application Assist profile/contact policy | unchanged |
| Final submit / attestation boundary | existing Application Assist session/progression contract | unchanged; final submission remains manual |
| Autofill enabled/disabled | Application Assist user setting stored in extension-local state | **default=true when absent**; explicit user opt-out persists |
| Automatic fill eligibility | Application Assist orchestration | preference can request fill; Fill Plan/gate still decide writes |
| Manual fill | existing fill command | remains available regardless of automatic preference |
| Input modality | modality owner | must not be inferred from width alone |
| Popup density/geometry | popup surface/layout owner | width may change density, not semantic input mode |
| Windows runtime identity/process lifecycle | existing Windows lifecycle manager | unchanged |
| Install/update/remove | new installer orchestration seam under Windows lifecycle plan | must delegate runtime start/stop/status |
| Installed version/path receipt | user-local installer state | never repository authority |

No prompt or agent text becomes the only implementation owner for these decisions.

## 5. Autofill design

### 5.1 User-visible contract

Default state:

`Autofill allowed fields: ON`

The user can switch it off in the extension popup.

When ON:

- **Start Assist** should immediately attempt the same canonical fill behavior as the explicit fill command.
- subsequent recognized same-application page transitions should request fill automatically when a valid runtime trigger exists;
- one trigger may cause at most one active Fill Plan execution for the current stable page state;
- retries must be bounded and deduplicated.

When OFF:

- Start Assist starts the session without filling automatically;
- future automatic triggers are ignored;
- **Fill now** remains available;
- safe progression/final-submit rules do not change.

### 5.2 Preferred storage

Add a small browser-local user setting owned by Application Assist, for example:

```json
{
  "schema": "escapehatch/application-assist-user-settings/v1",
  "autofill_enabled": true
}
```

Exact storage-key naming should follow the repository's existing `escapeHatch.*` convention.

Absence means `true` for this setting. The implementation must distinguish:

- never configured -> default ON;
- explicitly disabled -> OFF;
- malformed value -> fail to a documented safe behavior and surface a recoverable status.

Do **not** overload `applicationQuestionPreferences.v1`: that store owns answers/value precedence, not automation-mode choice.

### 5.3 Start Assist success call stack

```text
USER presses Start Assist
  -> popup semantic action dispatcher
  -> create/persist AssistSession
  -> load AutofillPreference (missing => enabled)
  -> if enabled:
       requestAutofill(trigger=SESSION_STARTED)
       -> resolve saved profile + preference cache
       -> build canonical Fill Plan
       -> re-gate live page fields
       -> DOM writer executes allowed empty fields only
       -> persist FillBatch/undo metadata
       -> project truthful status/presence
  -> return session-ready result
```

The user-visible terminal value is **session started and safe deterministic fields filled**, not merely “Session: active.”

### 5.4 Disabled call stack

```text
USER disables Autofill
  -> settings command
  -> persist autofill_enabled=false
  -> current AssistSession remains active
  -> future automatic triggers short-circuit before Fill Plan construction
  -> explicit Fill now still calls the canonical Fill Plan path
```

### 5.5 Failure stacks to prototype

1. **No profile**
   - automatic trigger reaches profile resolution;
   - no useful profile is present;
   - no DOM write;
   - status becomes actionable: profile/sync required.

2. **Cross-origin transition**
   - existing session policy pauses;
   - automatic trigger cannot bypass pause/origin rules.

3. **Unknown/manual field**
   - Fill Plan/gate leaves it untouched;
   - automatic mode does not convert uncertainty into a write.

4. **Rapid duplicate page events**
   - dedupe key prevents multiple fill batches from the same stable page fingerprint.

5. **User edits after fill**
   - existing undo/user-edit protection remains authoritative.

### 5.6 P95 prototype question

Before selecting the permanent automatic-trigger mechanism, compare two bounded seams on the current browser permission model:

**Candidate A — popup/session chained trigger**
- Start Assist automatically chains one fill.
- Lowest permission change.
- Does not by itself guarantee refill after popup closure/navigation.

**Candidate B — session-aware tab/page lifecycle trigger**
- a minimal extension runtime seam observes the active assist tab and requests refill on stable same-application transitions;
- must prove it works under current `activeTab + scripting + storage` permissions or identify the smallest additional permission required;
- must not add broad host permissions merely for convenience.

The accepted design should be the smallest mechanism that proves the requested user outcome across the actual navigation lifecycle.

## 6. Popup architecture and polish

### 6.1 Correct the state model before styling

Do not fix the screenshot only by forcing a larger width.

First separate:

```text
InputModality != LayoutDensity != SurfaceContext
```

Required regression:

```text
surface = EXTENSION_ACTION_POPUP
pointer = fine
viewport = narrow
=> input modality = mouse/keyboard-capable
=> density = compact
=> NOT phone interaction language
```

Actual phone/coarse-pointer evidence may still select the phone command-sheet language.

### 6.2 Action-popup layout target

Desktop toolbar popup target:

- explicit popup width in the roughly 360–400 px class, with a tested lower bound;
- no narrow single-word wrapping of the product title;
- primary controls visible before scrolling;
- no long explanatory paragraph consuming the top of the popup;
- a compact session-status row;
- a clearly visible **Autofill** toggle near the session state;
- **Start Assist** as the dominant initial action;
- **Fill now** as secondary/manual action;
- Pause/Resume rendered contextually rather than both occupying equal permanent visual weight when possible;
- Emergency Stop visually distinct but not allowed to dominate ordinary idle state;
- profile editing behind a clear **Profile** destination/collapsible section;
- diagnostics such as `Mode: phone` moved out of the default production surface unless they carry user value;
- one controlled scroll container for secondary/advanced content rather than the entire basic command surface becoming a long narrow page.

### 6.3 Suggested information hierarchy

```text
[ EscapeHatch ] [session state]

Autofill    [ ON ]

[ Start Assist / Resume ]
[ Fill now ] [ Pause ]
[ More commands... ]

Profile: ready / needs attention
[ Manage profile ]

Advanced / destructive
  Emergency Stop
  evidence/import/export/diagnostics
```

The exact labels may be refined during implementation, but the hierarchy is contractual: state + normal action first, recovery/advanced controls later.

### 6.4 Popup call stack

```text
BROWSER opens action popup
  -> resolve SurfaceContext=EXTENSION_ACTION_POPUP
  -> detect InputModality independently
  -> compute LayoutDensity from geometry
  -> load session + AutofillPreference + profile readiness
  -> derive ViewModel
  -> render compact shell
  -> user action dispatches through existing semantic action table
```

The popup must be a projection of canonical state, not another session state owner.

### 6.5 UI failure stacks

- Narrow desktop popup must remain desktop/fine-pointer semantics.
- Zoom/text scaling must not hide the primary action.
- Long session reason text must truncate/wrap without expanding every button.
- No pointer/hover-only essential action.
- Keyboard shortcuts and focus order remain valid.
- Real phone/coarse-pointer mode still reaches the command sheet and does not autofocus text.
- Popup reopening reconstructs state from storage; it does not reset autofill preference.

## 7. Windows installer/executable design

### 7.1 Boundary with the existing lifecycle program

This plan **does not** create a second launcher/process manager.

The install layer may:

- build/copy an install artifact;
- register a user-visible executable/shortcut;
- record installed version/path;
- delegate launch/status/stop to the existing Windows runtime lifecycle owner.

It may not independently decide process ownership, kill listeners, or reimplement start/stop recovery.

### 7.2 User-facing contract

Normal path:

```text
double-click Install-EscapeHatch.cmd
  -> validate source/release bundle
  -> install/update user-level EscapeHatch files
  -> produce EscapeHatch.exe
  -> create Start Menu shortcut and/or documented CLI entry
  -> verify installed version
  -> launch or status-check through canonical runtime manager
  -> report success and installed path
```

The install should be idempotent.

A matching uninstall path is required.

### 7.3 Packaging candidates to prototype before locking implementation

P95 requires evidence here because the repository currently has lifecycle scripts, not an accepted executable packaging mechanism.

**Candidate 1 — native thin executable launcher**
- small executable only delegates to the canonical lifecycle manager;
- product/runtime remains ordinary repository/application assets;
- clean separation between installer UX and runtime ownership.

**Candidate 2 — bundled/self-contained application executable**
- packages the necessary runtime into a single distributable executable or tightly bounded app folder;
- potentially better user experience;
- potentially larger build/update/security surface.

**Candidate 3 — CMD/PowerShell shim only**
- retain as development/fallback mechanism;
- **cannot be selected as final** if no real executable artifact is produced, because it does not satisfy the operator requirement.

Compare candidates on:

- user-level install without admin by default;
- update behavior;
- dependency requirements on a fresh Windows machine;
- size/startup cost;
- signing/versioning path;
- compatibility with the existing runtime manager;
- uninstall/rollback;
- secrets/profile isolation;
- reproducibility in CI.

Do not jump directly to MSIX/Microsoft Store packaging unless evidence makes those mechanisms necessary.

### 7.4 Installer state

Preferred user-local receipt:

`%LOCALAPPDATA%\EscapeHatch\install\install.json`

Fields should include only non-secret operational identity such as:

- schema/version;
- installed product version;
- install root;
- executable path;
- install/update timestamp;
- source release/build identity.

No career/profile/application content belongs in the receipt.

### 7.5 Installer failure stacks

1. Existing install same version -> verify/repair, no duplicate install.
2. Upgrade -> stage new payload, validate, atomically promote, preserve recoverable previous state.
3. Runtime currently active -> use canonical status/stop policy; never kill by process name.
4. Missing build dependency -> fail with exact prerequisite or switch to a prebuilt release artifact if that is the selected mechanism.
5. Locked install files -> preserve existing working install and report retry action.
6. Partial install -> rollback or leave a typed repairable state; never report success merely because files were copied.
7. Browser extension install restriction -> stage/locate extension payload and provide the supported user action; never claim Chrome/Edge extension registration occurred without proof.

## 8. Implementation factoring

### Wave 0 — P95 seam prototypes

**P95-A — Autofill trigger seam**
- prototype Candidate A vs Candidate B;
- prove default-on, persistent opt-out, manual Fill now, duplicate suppression, cross-origin safety.

**P95-U — Popup surface/modality seam**
- separate InputModality, LayoutDensity, SurfaceContext;
- prove narrow desktop popup does not become phone;
- produce a static/runtime fixture that matches the real toolbar-popup constraints.

**P95-R — Windows packaging seam**
- prototype at least two executable packaging mechanisms sufficiently to compare install/update/launch behavior;
- select one canonical packaging design.

These three prototypes are parallel-safe when they own separate files/fixtures.

### Wave 1 — implementation

**AUTO-1 — default-on autofill settings + orchestration**
Likely owned surfaces:
- `contracts/application-assist-session.v1.json`
- a small settings contract/module if needed;
- `browser/application-assist/popup.js`;
- page/session trigger module selected by P95-A;
- focused tests.

**UI-1 — extension action popup shell**
Likely owned surfaces:
- `contracts/application-assist-modality.v1.json`
- `browser/application-assist/modality.js`
- `browser/application-assist/popup.html`
- popup-focused rendering tests/fixtures.

**WIN-1 — installer + executable packaging**
Likely owned surfaces:
- `Install-EscapeHatch.cmd`
- `scripts/windows/Install-EscapeHatch.ps1` or selected canonical installer implementation;
- executable bootstrap/package source;
- installer validation and Windows tests;
- install/uninstall documentation.

Run these in isolated writers. Serialize shared manifest/version/release files.

### Wave 2 — convergence

**CONVERGE-1**
- combine AUTO-1 + UI-1 + WIN-1;
- reconcile current integration/recovery state before merge;
- update canonical docs;
- rerun all Application Assist, modality, Windows lifecycle, installer, harness, build, and patch-hygiene checks;
- exercise the real extension action popup on desktop Chrome/Edge;
- exercise actual opt-out persistence;
- install and launch on a Windows workstation from the user-facing CMD path.

## 9. Collision ownership

| Surface | Single owner |
| --- | --- |
| `popup.html` | UI-1, then CONVERGE-1 |
| `popup.js` | AUTO-1 for automation behavior; UI-1 must avoid behavior rewrites; convergence resolves final view wiring |
| `modality.js` | UI-1 |
| session contract | AUTO-1 unless P95 prototype selects a separate settings contract |
| Windows runtime manager | existing Windows lifecycle owner; WIN-1 consumes, does not replace |
| VERSION / release contract | CONVERGE-1 only |
| extension manifest | CONVERGE-1 unless a prototype proves a permission/background change is required |
| CI workflow | owning focused lane may add its isolated check; combined workflow edits serialize at convergence |

Do not have simultaneous writers hand-edit the same popup, manifest, VERSION, or shared workflow file.

## 10. Regression fixtures required

Permanent cases:

1. narrow desktop action popup + fine pointer -> not phone;
2. coarse pointer/actual phone -> phone command sheet;
3. Start Assist + setting absent -> one safe automatic fill request;
4. Start Assist + explicit opt-out -> zero automatic fill requests;
5. explicit Fill now works while opt-out is active;
6. duplicate page trigger -> one fill batch;
7. cross-origin transition pauses before autofill;
8. unknown/manual field remains untouched under automatic mode;
9. final submit remains unreachable automatically;
10. popup reopen preserves opt-out;
11. installer cold install creates executable;
12. repeated install is idempotent;
13. upgrade preserves usable prior install until promotion succeeds;
14. foreign runtime/listener is never terminated by installer;
15. uninstall removes installed product artifacts without deleting user-owned profile/application data.

## 11. Proof taxonomy

- **Contract proof:** settings/modality/install contracts are internally consistent.
- **Static/unit proof:** state classification, default/opt-out semantics, layout-mode decisions, installer planning.
- **Browser fixture proof:** popup geometry and desktop-vs-phone classification.
- **Launcher/build proof:** executable artifact builds and delegates correctly.
- **Windows install proof:** `Install-EscapeHatch.cmd` installs on a real Windows workstation and the installed executable launches/status-checks successfully.
- **Live extension proof:** actual Chrome/Edge action popup has cohesive geometry and Autofill toggle behavior.
- **Operator acceptance:** operator confirms the popup no longer feels like the pictured narrow phone column and the default-on workflow removes the extra fill step.

Do not promote repository tests into live browser or workstation proof.

## 12. Acceptance criteria

### Autofill

- setting absence means ON;
- explicit OFF persists;
- Start Assist normally fills allowed deterministic fields without a second click;
- manual Fill now remains available;
- no overwrite of non-empty/user-edited fields;
- existing phone authority remains fail-closed;
- no final submission/attestation automation is added by this feature.

### Popup

- desktop toolbar popup is not rendered in phone mode solely because it is narrow;
- title/status/Autofill/primary action fit coherently;
- normal operation does not require scrolling through large full-width command cards;
- profile/advanced functions remain discoverable;
- keyboard and actual phone semantics remain available.

### Installer

- one user-facing CMD starts installation;
- accepted build produces an actual executable artifact;
- installed app launches without repository-path archaeology;
- install/update/uninstall are idempotent and recoverable;
- no administrator requirement unless a later selected packaging mechanism proves it unavoidable and the operator explicitly accepts it;
- no false claim that the browser extension was silently registered.

## 13. Explicit non-goals

This program does not authorize:

- automatic final application submission;
- weakening identity/contact/attestation policy;
- broad host permissions merely for convenience;
- a second application session state machine;
- a second Windows runtime/process manager;
- Store/MSIX distribution without evidence;
- raw screenshot/browser-history/private application data in the public repository;
- redesigning the in-page ambient companion beyond what is needed to keep presentation semantics coherent.

## 14. First implementation command after operator authorizes execution

The implementation owner must refresh the integration floor before creating any writer:

```powershell
$repo = & pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location -LiteralPath $repo
git fetch --all --prune --tags
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git status --short --branch
git log --oneline --decorate -12 origin/integration/replit-donor-b01f628-20260921
```

Then run the three Wave-0 P95 prototypes in isolated writer lanes from the refreshed integration head. No broad implementation starts until the seam prototypes select the automatic trigger, popup state split, and executable packaging mechanism.

## 15. Current closeout

- **COMPLETED / PROVEN:** current popup/runtime/contracts inspected at `79e42c7`; screenshot defect translated into a concrete modality-state defect; current manual fill path and Windows lifecycle ownership recovered; P95 design applied.
- **REMAINING GAPS:** no autofill-default implementation, opt-out setting, popup repair, installer, or executable artifact has been built in this planning pass.
- **RISKS:** automatic triggers can duplicate writes if not deduped; popup width can regress actual phone behavior if modality remains conflated; installer work can accidentally create a second runtime owner if not kept thin.
- **BLOCKERS:** none for bounded prototype work after explicit implementation authorization; live browser and Windows workstation acceptance remain later proof gates.
- **PROOF CEILING:** repository/provider-backed design only.
- **INTEGRATION STATE:** planning branch only until reviewed/merged.
- **NEXT ACTION:** execute the three P95 Wave-0 seam prototypes, then select one design per seam before broad implementation.
