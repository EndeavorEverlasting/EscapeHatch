# Finish an already reviewed Lever application

**Launch order.** Start with the installed Windows workspace and the currently open application. Read attempt history, bind the exact tab, save reviewed answers, verify the approved résumé, then use the guarded Submit path once. Observe the employer response and reconcile any confirmation. The product rollout and fixture validation can proceed independently of the already open application.

**First command from the installation-selected EscapeHatch checkout**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Status-EscapeHatch.ps1
```

Use the source and port reported by that installation. Recover the exact open form URL from Chrome and the uniquely matching opportunity from the existing private workspace. Preserve the original tab and all reviewed fields. Keep the reviewed form ahead of cached profile values, old drafts, and optional import files. The current authorization for one reviewed application travels with this handoff. A new confirmation prompt is unnecessary when the target, reviewed answers, and approved résumé are already established.

## Continue an existing Firefox tab

When LinkedIn has added the profile in Firefox, keep that tab and run the host-owned recovery below from the installed source. The host resolves the exact saved opportunity and builds a private, 30-minute fill package from current approved preferences, that opportunity’s reviewed answers, and its already-saved opportunity overrides. It uses the résumé-backed profile for missing eligible identity fields. The email is excluded from the package, even if the Firefox email field is empty. Keep the LinkedIn-provided address for this opportunity, and keep the résumé email as the general default.

```powershell
npm --prefix artifacts/escape-hatch run application:prepare-firefox -- "<exact open Lever form URL>"
```

1. In a separate Firefox tab, open **about:debugging#/runtime/this-firefox**, select **Load Temporary Add-on**, and use the returned `manifestPath`. Switch back to the existing Lever tab without a reload.
2. Open **EscapeHatch Fill Saved Answers** from the Firefox extensions menu and click **Fill saved answers**. EscapeHatch matches approved answers to the form, fills only empty eligible controls, and verifies retained values. Report verified fields and unresolved required controls using the current form. Preserve all existing entries. Recover any older approved source through its existing private owner before asking the applicant to re-enter data.
3. Attach the approved PDF and verify the attachment in the Firefox form. For the opportunity’s LinkedIn alias, use its private scoped record. The general **Update Local Profile** action can update the default email and should remain unused for this alias.
4. Use an exact-tab Firefox observer if one is installed and verified. Otherwise open **Network Monitor** with **Ctrl+Shift+E**, enable **Persist Logs**, and verify recording on the existing form. The applicant clicks Submit. Record the provider outcome privately from the same tab and reconcile only explicit confirmation. After evidence capture, remove the temporary add-on and delete the generated private package directory. Prepare a fresh package if the prior one has expired.

The Firefox command prepares answers and supplies the writer. The managed Chrome listener and the Firefox observer have independent readiness checks.

## Managed runtime

When the installed runtime exposes the reviewed-answer endpoint, set `$assistPort` and `$livePageUrl` from the verified status and existing tab, then run:

```powershell
npm --prefix artifacts/escape-hatch run application:reviewed-lever -- $assistPort $livePageUrl --submit-reviewed-once
```

The adapter uses the installed local Assist routes and returns only outcome codes and receipt metadata. `--sync-reviewed` saves approved answers without submitting. Operational recovery remains with the local agent.

1. Read the selected opportunity’s attempt history and the managed listener status before a new action. A prior confirmed attempt is reconciled. A pending or rejected attempt is observed and reported without another click under one-attempt authority.
2. Bind the already open tab with **Track existing application tab**. If the managed context cannot see it, locate the existing window using `scripts/windows/EscapeHatch-CareerBrowser.ps1 -Action LocateProgress -TargetHostHint jobs.lever.co -Json` and check the exact tab through the local browser adapter. PID discovery is only a locator. A wrong window or a duplicate requires exact identity recovery before any action. Preserve the original tab, even if it is incognito. For the existing optional extension path, **Update Local Profile** saves reviewed fields when the paired extension is available in that window. Use the guarded managed Submit route for the terminal action.
3. Read the private opportunity Documents review record and match the current approved PDF by SHA-256. If missing or stale, recover the exact already-approved bytes from the private source, stage them for this opportunity, and record the existing approval for their digest. A filename or employer “Success” indicator alone cannot establish which bytes were uploaded. Wait through parsing and verify the attachment in the same tab.
4. Resolve required-field or stale-runtime errors with the current form and private records. Repair only the missing prerequisites. Preserve reviewed entries. An unresolved CAPTCHA, sign-in secret, or unmade personal attestation requires the operator at that control. Resume after the operator resolves it when no click has occurred.
5. Press the guarded **Submit reviewed application** action once. The click receipt distinguishes a precondition failure, a reserved or uncertain dispatch, an observed click, an employer rejection, and confirmation. Inspect the same tab and refresh the listener after the call, including when the command times out. A blank file field after a click does not establish what was attached before it. Keep all private evidence in the existing receipt stores.

If the installed service is still on the prior released path, use the same sequence through [Approved Submit on managed Lever](../APPLICATION_ASSIST_AUTOPILOT_PLAN.md#approved-submit-on-managed-lever). That path already captures reviewed answers inside Submit. Continue with that path without closing, refreshing, or upgrading away from the reviewed tab. The private role-answer import is a recovery source only if the canonical reviewed value is absent from the form or the existing approved record needs repair.

## Outcome evidence

Report whether a click occurred, the last observed employer response, the before/after résumé evidence, the private receipt ID, and tracker reconciliation. Only a same-job confirmation receipt supports Applied. If evidence remains pending, leave the application at its verified state and name the next local readback. Keep answer text, documents, raw page data, and private workspace locators on the local host.

The [dispatch manifest](../../Outputs/prompt-parallel-dispatch/runs/reviewed-lever-application/manifest.json) binds the lanes to [Application Assist parent issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69). Linux fixture evidence and repository CI can cover regression behavior. Windows installation, the already open employer session, actual acceptance, and tracker provider synchronization require their own observations.
