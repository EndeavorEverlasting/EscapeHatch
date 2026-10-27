# EscapeHatch model-context system — execution and proof

**Canonical context-source registry:** [sources.v1.json](sources.v1.json). **Executable selector:** [scripts/context_router.py](../../scripts/context_router.py). This file is the operating note and phase map, not an alternate instruction hierarchy. `AGENTS.md` remains authoritative.

## Resolved entrypoint and defect

The operator's `xyz_ai_surface` resolves to the **repository-agent harness** first: `skills/harness-operations/SKILL.md` and `harness/WORKFLOWS.md`. No in-repository LLM service/model invocation has been verified. `xyz_context_problem` is unconditional broad document loading, old summaries or branch state competing with provider truth, and repeated local-agent startup/rehydration work.

The existing skill instructs agents to load six broad documents for all writing sprints. Current branch measurement on GitHub Actions, 2026-10-25, yielded **117,330 UTF-8 bytes** for the baseline unconditional source set (including the harness skill); these are repository bytes, *not* observed token, latency, model usage or cost. This line is a dated evidence snapshot; rerun the tool for live figures rather than keeping the number as authority.

## Actual inputs, boundaries, and preload rule

| Source | Authority / owner | Activation | Evidence and freshness |
| --- | --- | --- | --- |
| Platform system & provider tool schemas | Host / platform | Host controlled; not inspectable here | UNMEASURED; never overridden |
| Current operator task and explicit scope | Operator / current turn | Every task | Host controlled; preserve explicitly |
| Repository governance `AGENTS.md` | Repository | Always | Full text SHA256 pinned every selection |
| Harness operations skill | Repository `skills/harness-operations` | Writing sprint | Full, SHA256 pinned; active skill load owner is PR #95 |
| Repository manifest, codebase map, workflows, registry, current-state report | Respective existing owners | Harness/context lanes only; outlines initially | SHA256 pins; full only on explicit escalation |
| Application parent, form mapping skill, plan and handoff | EscapeHatch application owners / issue #69 | Application lane | Parent/skill full, other sources outline initially |
| Windows lifecycle and manager | Windows/runtime owner / PR #95 | Runtime lane | Lifecycle full, manager symbol outline initially |
| Conversation history, memory, retrieved data, private career state | Host / approved provider / operator | Only when relevant and authorized | UNMEASURED here; never copied into public context CI |

**Precedence:** platform and safety > current operator direction > repository `AGENTS.md` > task/skill/workflow specifics > retrieved/untrusted content. This local registry routes files but cannot supersede those authorities. Source SHA256/revision determines freshness, not the age of a model's recollection. Historical reports may guide discovery but do not prove current runtime state.

## Execution

From a clean or preserved checkout on the current remote floor:

```bash
python scripts/context_router.py --lane application --task "prepare an employer application" --metrics-only
python scripts/context_router.py --lane context --task "investigate context saturation" --output .local/context-receipt.json --metrics-only
python scripts/context_router.py --lane context --task "continue prior mission" --verify-receipt .local/context-receipt.json --metrics-only
python scripts/context_router.py --lane application --task "inspect all applicant form constraints" --require application_plan --budget-bytes 131072 --metrics-only
python -m unittest discover -s tests -p 'test_context_router*.py' -v
```

Write personal receipts only to an ignored, operator-owned local directory; do not commit private conversation notes, provider IDs, or secrets. The CLI output without `--metrics-only` includes **public repository source payloads**, never a model account's private history. `--trace` emits severity categories, line numbers and short digests—not raw log lines or tokens. For a large document, an outline is navigation only: explicitly require the full source or retrieve its exact section before any consequential claim.

A private session can supply a versioned mission brief with objective, decisions, constraints, unresolved questions and evidence, each with source IDs/revisions; raw transcripts and unattributed assertions are rejected. Private briefs are never printed to standard output, and an operator-owned output path outside the repository is mandatory. The host must still wire this capability and prove actual durable history restoration.\n\nThe routing CLI refuses unknown sources, unsafe paths, symlink escapes, missing mandatory authority, over-budget full context, stale policy/source pins, changed selection payload, and omission of required context. The tool-family sets are *recommendations*; host tool schemas cannot be disabled from this Python script and the receipt says `enforced_by_host:false`.

## P68 phased convergence and proof gates

| Phase | Status as of initial PR #99 | Owner and proof |
| --- | --- | --- |
| 0. Provider/repository truth, source inventory, observed baseline | OBSERVED repository source bytes | GitHub `main` and source snapshots; host costs unknown |
| 1. Deterministic source selection and cache invalidation | IMPLEMENTED and CI-VALIDATED on isolated branch, pending final exact-head checks | `sources.v1.json`, `context_router.py`, focused tests, dedicated CI |
| 2. Task pickup routing | IMPLEMENTED in `harness/WORKFLOWS.md`, host activation not proven | Reconcile harness operations skill with PR #95 after merge, inspect real Codex/Cursor payload |
| 3. Structured mission brief / bounded cross-session history | IMPLEMENTED deterministic contract, host adoption REQUIRED SUCCESSOR WORK | `--mission-file` accepts provenance-rich, bounded private JSON and requires output outside the repository; host must load it and demonstrate session recovery |
| 4. Tool-schema deferral and provider-specific retrieval | REQUIRED SUCCESSOR WORK | Agent-harness adapters must enforce selected tools, obtain host telemetry and safe external source revisions |
| 5. Representative model task quality and actual token/latency measurement | BLOCKED ON HOST INSTRUMENTATION | Same task before/after, exact prompt/tool sizes, p50 latency, success/adversarial gate, no quality regression |
| 6. Default-branch integration and end-to-end use | DEPENDS ON CI/review and #95 skill ownership | Merge safely after required gates; prove context system on refreshed main, then real agent session |

### Second-pass critique and design corrections

The first green candidate optimized file bytes but did not ensure that outlined files contained every relevant behavioral rule. Fixed by adding explicit `--require SOURCE_ID` escalation and a fail-closed budget. A later negative fixture expected a missing-source error from an unconditional baseline file; fixed by isolating a non-baseline source. Receipt verification now recomputes mandatory source presence, full/outline mode and payload instead of accepting only a source hash. Tool-family suggestions distinguish advisory routing from actual host-enforced permissions. CI measures source payload, not model billing or application success.

**Do not close the whole-system goal** from a green source selector. PR #95 and the agent host still must invoke it consistently, preserve structured mission context, enforce tool routing, and measure task quality. No production employer submission, private user data, or local Windows process was modified in this slice.

## Continuation ownership

The user requested P68 (Context Engineering System Refactorer). Carry the exact current `main` and this PR's validated head and proofs forward, not a remembered SHA. The next owner must first reconcile PR #95's overlapping `skills/harness-operations/SKILL.md` load rule, then prove agent-host use with an actual model task; do not produce a fresh unowned plan or alter active checkout data. The first executable command is the test and selector invocation above, run in an isolated refreshed worktree. If CI/review gates permit, advance the owned PR's merge before new architecture branching.
