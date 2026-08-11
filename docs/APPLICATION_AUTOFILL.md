# EscapeHatch Application Autofill

## Purpose

EscapeHatch Application Autofill removes repetitive identity/contact typing from job applications without crossing the
line into automatic application submission.

The extension is deliberately **user-invoked**. Open an application page, click the EscapeHatch toolbar action, and
choose **Fill Current Page**. It fills only empty, recognized identity/contact controls and leaves the application for
the operator to review and submit.

## Privacy and browser-local cache

The browser cache is a convenience projection owned by the user, not repository data.

- Storage key: `escapeHatch.applicationAutofillProfile.v1`
- Export schema: `escapehatch-application-autofill-profile/v1`
- Real profile data is never committed to EscapeHatch.
- **Clear Profile** removes the entire storage key.
- Removing the unpacked extension from the browser also removes the extension-local state under normal browser extension lifecycle behavior.
- Export/import exists so the profile can be moved intentionally without copying it into Git.
- Imports are capped at 64 KiB, schema-checked, field-whitelisted, and treated only as data. Imported content is never executed.

These rules adapt the Prompt Kit portability pattern from `EndeavorEverlasting/web-excel-repair-triage`: version browser storage, version the transfer schema, bound imports, reject unsupported payloads, and keep user-owned state portable.

## Supported fields

The first bounded contract supports title / honorific prefix, first name, last name, preferred name, email, phone, LinkedIn profile URL, street address, city / municipality, state / region, ZIP / postal code, and country.

Matching prefers standard HTML `autocomplete` values and otherwise uses normalized label/name/id/placeholder semantics. For `<select>` controls, EscapeHatch fills only when the saved value exactly matches an available option after normalization.

The WCG-style labels that motivated this sprint (`Title`, `First Name`, `Last Name`, `Preferred Name`, `Email`, `Phone Number`, `LinkedIn Profile`, `Home Street Address`, `City / Municipality`, and `Zip Code`) are covered by the deterministic regression test rather than by a WCG-specific site adapter.

## Hard safety boundary

Application Autofill does **not** submit forms; click Next, Continue, Apply, or Submit; fill passwords or file-upload controls; answer questionnaire, eligibility, demographic, or free-response questions; overwrite a field that already contains a value; scrape pages in the background; request broad `<all_urls>` host access; make network requests from the injected page runtime; or invent a value absent from the saved profile.

The extension uses `activeTab`, `scripting`, and `storage` only. The page runtime is injected only after the user opens the toolbar popup and requests a fill.

## Load locally in Chrome or Edge

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `browser/application-autofill`.
5. Pin **EscapeHatch Application Autofill** if desired.
6. Open the popup once, enter/import the reusable profile, and choose **Save Profile**.
7. On an application page choose **Fill Current Page**, then review the form yourself before continuing.

## Portable profile

**Export Profile** downloads a versioned JSON payload. **Import Profile** replaces the browser cache with only whitelisted profile fields from a supported payload. The payload is `escapehatch-application-autofill-profile/v1`; the repository includes no real profile seed.

## Validation

```bash
python tests/test_application_autofill_contract.py
node tests/test_application_autofill.mjs
git diff --check
```

The runtime proof ceiling is intentionally lower than live ATS compatibility. Passing repository tests proves the matching and safety contract, not that every third-party application framework will accept programmatic input events.
