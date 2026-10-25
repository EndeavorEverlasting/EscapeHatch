# P04 execution slice — employer proof, VPN recovery, and scannable documents (2026-10-25)

**Parent:** [Application-autofill Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69).
**Canonical implementation owner:** [APPLICATION_ASSIST_AUTOPILOT_PLAN.md](../APPLICATION_ASSIST_AUTOPILOT_PLAN.md).
**Proof ceiling:** source changes + synthetic tests only. No actual employer form, provider VPN client, private job packet, Chrome runtime, Windows installer, PDF/DOCX render or submission has been certified by this branch.

## Observed operator failure and preserved scope

The screenshot of the **micro1 Strategic Project Lead** listing shows an email-entry step and a Continue action, not employer application fields, uploaded résumé, or a final review/receipt. A previously produced local packet is not proof of employer acceptance. Never store a real email address, user job file, screenshot contents, answers, or credential in this public repository.

Three concerns are separate but one parent outcome:
1. **Claim truth:** /fill and /attach previously assigned successful-looking states even on zero verified fields or zero populated file inputs.
2. **VPN attribution:** /launch swallowed navigation errors into one undifferentiated state; must distinguish a VPN-like tunnel suspicion from proof of VPN causality.
3. **Scan hierarchy:** the presentation contract already requires bold headings, but its contract-only validator does not inspect a produced DOCX.

The user's local checkout and active draft PRs, including Windows launch/workspace recovery #95/#98, have not been modified. Branch ownership is isolated; coordinate integration against current head and preserve dirty work.

## Changed canonical code

- `artifacts/escape-hatch/managed-progress-evidence.ts` + tests: zero/partial/readback-only employer progress states. A DOM input filled is **not** employer submission or upload acceptance.
- `artifacts/escape-hatch/browser-assist-control.ts`: use checked return values before assigning fill or document-staging states; retain existing employer-site and final-submit boundaries.
- `artifacts/escape-hatch/src/components/managed-browser-assist.tsx`: show explicit partial/unverified states and redacted VPN suspicion without claiming completion.
- `artifacts/escape-hatch/network-navigation-diagnosis.ts` + tests: read-only active interface-name heuristic and browser failure class. An interface name or tunnel error alone is not verification of causality.
- `artifacts/escape-hatch/vpn-recovery.ts` + tests: provider-neutral, one-attempt-consent transaction with identity capture, pre-disconnect recovery journal, kill-switch preflight, finally restoration, readback and interrupted-session reconciliation. It is **not connected to a real VPN vendor or filesystem journal yet**.
- `scripts/audit_resume_docx.py` + `tests/test_resume_docx_audit.py`: check bold main section and inline subsection labels on real DOCX paths without exposing contents in logs. A passing structural audit is not rendered artifact QA.
- `artifacts/escape-hatch/package.json`: wire TypeScript checks into the managed-assist test command.

## Next integration and workstation gates (ordered)

1. **Exact-head and collision check:** fetch current origin, branches and PRs; inspect dirty checkout and active worktrees. Do not reset or overwrite; use an isolated worktree for this branch. Confirm draft PR #95/#98 source overlap before cherry-picks/merge.
2. **CI/local managed-assist proof:** from `artifacts/escape-hatch`, run `npm run test:managed-assist`, `npm run typecheck`, `npm run build`. From repo root, run `python -m unittest discover -s tests -p test_resume_docx_audit.py`, `python scripts/validate_application_autofill_parent.py`, `python scripts/validate_resume_presentation.py`, `python scripts/validate_governance.py`, and `git diff --check`. Repair failures before promoting.
3. **Real VPN integration:** detect the actual client/provider and exact connection identity locally; review any kill-switch/always-on/policy constraints. Implement provider-specific status/disconnect/reconnect adapter plus atomic **private** journal and startup recovery. Add an explicit per-retry UI consent control and warning about exposure of normal traffic. Never kill a guessed VPN process, disable an arbitrary adapter, bypass enterprise policy, or toggle without direct permission. Verify a real disconnect → single retry → reconnect with provider readback before claiming it works.
4. **Real browser proof:** micro1 may present an email-first/login route. Distinguish identity bootstrap from application form. Reobserve live DOM before/after field writes, file-input state and employer upload receipts. Report zero verified fields as zero. Block unknown intermediate actions, CAPTCHA, MFA, legal/EEO attestations and terminal Submit. Repeat on a different ATS archetype.
5. **Document repair:** on an isolated copy of each private role-specific DOCX, preserve approved wording and factual chronology. Bold short inline labels and all section/position titles, leave surrounding body regular, prefer concise parallel evidence statements and restrained spacing; do not add bullets just to add bullets. Run `python scripts/audit_resume_docx.py "FULL_PATH_TO_REVIEW_COPY.docx"`; regenerate PDF, inspect every rendered page and extractable text. Replace original private projections only after exact artifact approval and revision/readback checks. If the DOCX renderer is missing, install/repair the authorized renderer rather than claiming QA passed.
6. **Converge:** after provider CI and protected Windows browser/runtime testing, integrate without erasing separately owned changes. Parent Issue #69 remains OPEN until all its conjunctive end-to-end gates pass.

## Status semantics

- **CHANGED:** source and synthetic checks on an isolated branch.
- **PROVED:** local synthetic testing of the new helper contracts (see PR receipt); provider readback of GitHub files after commit.
- **NOT PROVED:** restored VPN on user's workstation; automatic consent UI; employer-side field or PDF acceptance; actual document rendering/repair; working final-review path; submission.
- **NEXT EXECUTABLE COMMAND:** `npm run test:managed-assist` in the isolated branch's `artifacts/escape-hatch` directory, then the remaining commands above. The operator should never be asked to duplicate private source documents into public Git.
