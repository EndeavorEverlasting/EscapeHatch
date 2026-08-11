# EscapeHatch Current State

**Verified main floor before this harness repair:** `main` at `f2ac418ace7b105625b27cc66f054e4706c387db`, after PR #2 merged the harness and portable career-state contract.

## Working

- Root governance authority exists at `AGENTS.md`.
- Governance and harness validators exist on `main`.
- `contracts/career-state.v1.schema.json` defines the first product persistence contract connecting profile → opportunity → resume → application → evidence.
- Career-state entities use stable IDs and explicit references; resume/application/evidence relationships are checked for dangling links.
- Artifact references declare ownership (`user`, `escapehatch`, or `external`) and portable locator type rather than letting application installation state implicitly own career data.
- `scripts/validate_career_state.py` validates the representative fixture and negative fixtures for invalid relationships and non-portable relative paths.
- Windows durable repository acquisition is owned by `scripts/resolve_repo.ps1`. It resolves an observed `Desktop\Dev` ancestor first, otherwise prefers the current user's `Desktop\Dev`, and keeps durable checkouts/worktrees out of temporary storage.
- Exact branch proof can be isolated as a detached worktree under the same durable development root without overwriting a dirty or differently owned canonical checkout.

## Broken

- The earlier harness proof recipe cloned a durable proof checkout under the process temporary directory. That location policy is repaired by `scripts/resolve_repo.ps1`; temporary directories remain valid only for disposable validator snapshots.

## Missing / intentionally not yet established

- Executable product application/runtime and UI.
- Resume rendering or Resume Matcher integration.
- Opportunity discovery implementation or scraper.
- Application submission or auto-apply behavior.
- Persistent database/storage adapter for real user career-state exports.
- Import/export UX beyond the portable JSON contract.
- Product build/deployment configuration.
- Lua runtime, host binding, sandbox, or executable script surface.

These remain later product concerns. The contract floor must be preserved before those surfaces are introduced.

## Lua direction

Lua remains an architectural constraint only. This harness repair introduces no Lua runtime or script execution capability. See `harness/constraints/LUA_EMBEDDING.md`.

## Validation floor

Run:

```text
python scripts/validate_governance.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
git diff --check
```

On Windows, also prove the durable-root policy with:

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
```

GitHub Actions owns the cross-machine Windows path-policy check on `windows-latest`.

## Principal risks

- Reintroducing disposable `%TEMP%`/`AppData\Local\Temp` locations for durable repositories or agent worktrees.
- Guessing stale sibling repository names instead of resolving the canonical durable root and current checkout.
- Expanding the v1 persistence contract prematurely to mirror one job board, ATS, or resume generator.
- Treating external URLs/files as application-owned data and breaking portability or upgrade safety.
- Adding scraping/auto-apply before opportunity/application evidence semantics are proven in real operator use.
- Introducing Lua before a host runtime and capability boundary are selected and tested.
- Committing real personal career-state data or credentials instead of keeping repository fixtures synthetic.

## Next product gate after this harness repair

Build the smallest import/export persistence adapter around the v1 contract, preserving user ownership and round-trip fidelity, before adding discovery, resume generation, ATS automation, or Lua execution.
