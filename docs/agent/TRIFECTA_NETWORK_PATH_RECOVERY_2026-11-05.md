# EscapeHatch — Restore local network path diagnostics (Trifecta P08 → P82 → P07)

Date: 2026-11-05. Product owner: EscapeHatch. Upstream diagnostic inspiration: PiShark's separate `pishark/escape_hatch.py`. The same phrase named a PiShark experiment and the EscapeHatch career product; this was a naming/ownership collision, not an authorization to move or delete PiShark code.

## Parent outcome

In EscapeHatch's actual managed Windows application, the operator can ask why an employer application seems slow by selecting **Check my connection**. The check reports DNS, two fixed public TCP paths, and TLS latency/failure without changing application state. Preserve PiShark's independent observability and evolving contextual alerts. Never introduce auto-probes into employer navigation, automatic VPN changes, credential interception, or claims of employer/ISP culpability.

## Current implementation ownership

- `artifacts/escape-hatch/network-path-quality.ts`: fixed-target local DNS/TCP/TLS one-shot and redacted receipt. Uses Node built-ins already bundled with EscapeHatch. No Python, new package, packet capture, or bandwidth upload/download.
- `artifacts/escape-hatch/network-path-quality-plugin.ts`: managed-local Windows-only POST endpoint, same-origin browser action, loopback remote address, no dynamic target parameters, 10-second trigger cooldown, no concurrent checks, no state writes.
- `artifacts/escape-hatch/src/components/network-path-quality-check.tsx`: on-demand panel, readable status/measurement explanation, explicit UNKNOWN bandwidth and UNPROVEN cause, no requests on mount.
- `artifacts/escape-hatch/src/components/application-puzzle.tsx` and `vite.config.ts`: client/server integration within the existing employer checkpoint experience. Existing browser navigation/submit/VPN/preferences/receipt logic remains unchanged.

Canonical distinction: PiShark owns general network telemetry, continuous monitoring and notifications. EscapeHatch owns an *application-relevant, user-triggered subset* of diagnostic behavior. These are independent consumers with a shared behavioral test rubric, **not** two installations of the same service. This public repository must never receive actual DNS histories, IP inventories, employer URLs, resumes, tokens, passwords or diagnostic payloads.

## Behavior contract (source candidate)

- Manual click only; no startup probe, service, cron, installation, or browser navigation.
- The current Windows host must be an owned managed local runtime; nonlocal, cross-origin, missing explicit action, unsupported platform and repeated requests are rejected before any network call.
- Four allowlisted operations: DNS resolution of one fixed public name, two fixed TCP 443 destinations, and certificate-verified TLS handshake to the fixed public name. All are bounded to roughly three seconds and suppress underlying socket identities/exceptions in the receipt.
- Output statuses and latencies are redacted and categorized as USABLE_PATH, DEGRADED_LATENCY, SEVERELY_DEGRADED_LATENCY, DNS_PATH_DEGRADED, DEGRADED_PUBLIC_PATH, UNUSABLE_PUBLIC_PATH, TLS_PATH_UNVERIFIED or INSUFFICIENT_EVIDENCE.
- No measured upload/download Mbps, root-cause claim, remote-device inventory, HTTPS document fetch, employer sign-in or implicit VPN attribution. One public target's failure is not proof that the ISP is down.

## Exact proof and execution gates

1. On the exact committed head run `npm --prefix artifacts/escape-hatch run typecheck`, `npm --prefix artifacts/escape-hatch run build`, `npm --prefix artifacts/escape-hatch run test:managed-assist`, and the repo's application/scene validators.
2. Add and run deterministic targeted tests for source refusal, bounded timeout, classification, redaction, same-origin request, wrong method, non-Windows refusal, repeated request cooldown and one-shot user action. GitHub test-file writes were blocked during this session; do not claim targeted tests exist or pass until provider readback and execution show them.
3. P08 on a separately consented **personal Windows** installation: open the canonical EscapeHatch launcher, enter `/assist`, click **Check my connection**, verify actual DNS/TCP/TLS receipt and visible UI; test failed/filtered connections and control that an already-open application page, saved answers, application/puzzle state, listener and final Submit remain unchanged. No authorized local Windows runtime was available to this cloud execution.
4. After full tests, review exact PR diff and conflicts with concurrently owned application projects, check upstream main freshness, and integrate only once repository and review gates are satisfied. A green generic CI job alone is not Windows live acceptance.
5. Android implementation is separately owned by its application runtime; this Windows on-demand route does not certify an Android diagnostic or notification.

## Trifecta receipts

- P08: runtime chain is required, **not run on personal Windows**. Build/CI/localhost simulations are lower-level evidence.
- P82: candidate = fixed-target Node diagnostic, human-triggered component, typed OS-local boundary; compare with PiShark's published check fields and independent classification. Dedicated deterministic tests remain a gate.
- P07: preserve user-owned resumes, live employer forms and active branch work; return CHANGED | PROVED | NEXT including exact SHA, source/readback, test results and merge status. If tests or authority block merging, leave the feature in an isolated branch for independent repair, not an unreviewed live mainline.

No live networking or credential flow was exercised by this handoff. No raw personal network evidence is stored in Git.