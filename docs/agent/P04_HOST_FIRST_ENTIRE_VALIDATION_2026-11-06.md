# P04 — Host-first validation, Entire checkpoint lineage, and provider-independent execution

**2026-11-06.** Parent job-application contract: [issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69). Discord companion: [issue #204](https://github.com/EndeavorEverlasting/EscapeHatch/issues/204). Prior feature **PR #205 was already merged to main** (merge commit `32cea6ea23e5f5736726577431b7be9845bc6961` at 2026-11-06 08:09:18 UTC). This source fact displaced the stale “checks still queued” conclusion. Recheck current default ref before further writes.

## P141 strategic scout — selected thesis and ruled-out alternatives

**Question:** How can the operator's Windows host validate/continue EscapeHatch work while GitHub-hosted Actions are unavailable, queued, or partially failing, without sacrificing existing source/merge safety?

- **SELECTED: host-first canonical validator composition.** Run existing validators independently under a bounded local manifest, bind outcomes to exact Git SHA, write privacy-safe local receipts, and allow agent continuation independent of Actions scheduler. A separate provider-side merge still observes the actual branch protection and repository promotion contract.
- **REJECTED: merely waiting for CI.** Queue delay is provider scheduling, not proof of a local code failure. This does not give the host the requested independent execution path.
- **REJECTED: silently forcing a merge or reclassifying local evidence as remote green.** Source validation, provider admission and installed/runtime behavior are distinct dimensions. Do not replace an external required-check truth with a locally fabricated check.

P141 investigated and selected the scope above; P97 supplied reference implementations; P82/P07 own this implementation. P08 Windows/installed certification remains a distinct evidence gate.

## P97 reference implementation findings — inspected 2026-11-06

- **[Entire CLI](https://github.com/entireio/cli)**: `docs/architecture/sessions-and-checkpoints.md` and `docs/architecture/ref-checkpoint-backend.md` implement commit-linked `Entire-Checkpoint` trailers and independent `refs/entire/checkpoints/<shard>/<id>` data. Reusable mechanism: lightweight commit lineage, separately stored agent context, no transcript added to code commits. **Privacy:** a public Git remote may expose checkpoint refs if pushed; this sprint reads only the checkpoint ID from the local commit, never enables hooks or publishes transcripts. Entire is an optional separately managed dependency, not a requirement for local validation.
- **TokenCorridor**: `scripts/p07_terminal_gate.py`, `scripts/regression_provenance.py` implement fail-closed continuation and bounded local git-worktree regression history. Reusable mechanism: stop only on a named proof gate, preserve current checkout and last-known-good commit.
- **Automation**: `scripts/validate_runtime_handoff.py` uses explicit source fields and failure states; local artifacts are evidence, not host-provider telemetry.
- **EscapeHatch existing owners**: `scripts/promotion_guard.py`, `contracts/repository-promotion.v1.json`, `.githooks/pre-commit`, `.githooks/pre-push`, `scripts/resolve_repo.ps1`. The local runner COMPOSES existing tests; it does not replace promotion guard or install another git-hook manager.

## Implemented scope

- `contracts/host-validation.v1.json` owns fixed `core` and `full` ordered validator profiles, no generic user-supplied shell command or network dependency in this runner.
- `scripts/host_validation.py` owns `plan | run | verify`, exact HEAD/branch/origin-main snapshot, optional `Entire-Checkpoint` ID only, a dirty-worktree stop, source-move stop, step timeout, no shell, bounded command outputs via temporary files, private hash-only metadata, and a self-consistency digest.
- `scripts/windows/EscapeHatch-HostValidate.ps1` is a PowerShell entry point with no surprise foreground browser, UAC, install, scheduling, or live account mutation.
- `tests/test_host_validation.py` owns synthetic fault injection: dirty checkout, stale SHA, premature/failed step, receipt tampering, private output isolation, missing canonical manifest and optional Entire checkpoint identity.
- `.github/workflows/harness.yml` repeats the **same Python test** when the host is available, but CI availability is NOT a prerequisite for running it locally. The runner itself never calls GitHub Actions APIs.

### Operator/local agent entrypoints

From an **existing clean isolated worktree** selected by the canonical `scripts/resolve_repo.ps1`:

```powershell
pwsh -NoProfile -File scripts/windows/EscapeHatch-HostValidate.ps1 -Action Plan -Profile Core
pwsh -NoProfile -File scripts/windows/EscapeHatch-HostValidate.ps1 -Action Run -Profile Core
pwsh -NoProfile -File scripts/windows/EscapeHatch-HostValidate.ps1 -Action Run -Profile Full
pwsh -NoProfile -File scripts/windows/EscapeHatch-HostValidate.ps1 -Action Verify -Profile Full -Receipt "<exact-private-receipt-file>"
```

Or with Python directly, from repo root:

```sh
python scripts/host_validation.py plan --profile core
python scripts/host_validation.py run --profile core
python scripts/host_validation.py run --profile full
python tests/test_host_validation.py
```

Windows default receipts: `%LOCALAPPDATA%\EscapeHatch\proof\host-validation\`. Unix: `$XDG_STATE_HOME/EscapeHatch/proof/host-validation/` or `~/.local/state/EscapeHatch/proof/host-validation/`. No raw console output, applicant data, passwords, OAuth tokens, session transcripts or original EML in receipts. A receipt SHA is a **consistency digest, not a digital signature or provider attestation**. Every receipt explicitly sets `provider_checks_verified=false`, `merged=false`, `installed_runtime_observed=false`, `discord_membership_observed=false`. Never promote these fields automatically from a local source-validation pass.

## P08 proof handoff / next source owner

1. On the actual Windows host, fetch remote safely, inspect active worktrees without reset/clean/stash, and choose an isolated clean worktree at the exact intended candidate HEAD. Do not replace an active browser or private source.
2. Run `-Action Plan` then `-Action Run -Profile Full`; keep receipts in the existing private local proof path. Required Node/npm dependencies should already be installed via canonical EscapeHatch bootstrap, never installed implicitly by this tool.
3. Verify the receipt against the same HEAD/manifest using `-Action Verify`; then independently observe the installed application, real browser state and protected job submission behavior as appropriate. Exact runtime action proof is not supplied by the receipt.
4. Inspect provider PR status and current branch protections. When repository promotion's real required checks are satisfied, merge exact head and read back default ref. Host-local validation can proceed independently of GitHub Actions **without lying about provider merge authority**.
5. Record `LOCAL_SOURCE_PASS`, `PROVIDER_MERGED`, `INSTALLED_RUNTIME_PROVED`, and `EMPLOYER_SIDE_OBSERVED` as separate dimensions. P04 handoff references this file, not a recreated parallel architecture.

**Proof ceiling in this ChatGPT sprint:** synthetic local Python fault tests and exact GitHub commit/readback only; a running Windows Task Scheduler entry or an installed host proof cannot be inferred. No Discord server join, employer submission, user settings, or real account authentication has been executed.
