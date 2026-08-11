# Lua Embedding Constraints

Status: **design input, not yet product implementation**.

These constraints preserve the intended Lua architecture for future EscapeHatch product work without introducing product code during the harness sprint.

## Host owns the application

- Treat Lua as an embedded library/runtime, not as the process owner.
- The host language owns startup, shutdown, the main execution loop, persistence boundaries, resource cleanup, and rollback.
- Performance-critical or resource-intensive work stays in the host. Lua is for dynamic policy/logic that benefits from rapid change.

## State isolation

- Prefer independent Lua states for tasks or trust boundaries that need isolation.
- A state must be destroyable/resettable without corrupting sibling states or host process memory.
- The host explicitly closes/releases each state when its lifetime ends.

## Error boundary

- Lua code may raise errors.
- The host must catch script failures at a protected-call boundary, preserve cleanup/rollback responsibilities, and convert failures into explicit host-level results.
- Script failure must not silently escape into uncontrolled host state mutation.

## Sandboxing

- Start from deny-by-default exposure.
- Do not expose OS, process, filesystem, network, or unrestricted I/O capabilities to scripts by default.
- Register only the host functions required by the specific script contract.
- Capabilities should be named, reviewable, and testable.

## Execution model

- Keep the scripting instruction surface small and auditable.
- Precompiled bytecode may be used only when its compatibility/version boundary is explicit.
- Do not assume LuaJIT. If JIT is introduced later, preserve a correct interpreter path and reconstructible state at fallback/deoptimization boundaries.

## Type discipline

Lua remains dynamically typed, but host/script contracts must document expected input/output shapes, nil behavior, numeric/string assumptions, and error results. Prefer narrow, explicit tables over magical implicit state.

## Conceptual integrity

- If a requirement belongs naturally in the host language, keep it there.
- Avoid adding scripting features merely for convenience.
- Favor readable, non-magical code that a human can audit even when AI generated it.
- Preserve Lua's ordinary 1-based sequence semantics unless a specific host contract requires conversion; make any boundary conversion explicit.

## Validation expectations for the first Lua product sprint

Before claiming Lua runtime proof, that sprint should demonstrate at minimum:

1. host-created state;
2. allow-listed function exposure;
3. protected host catch of a script error;
4. state teardown after success and failure;
5. isolation between two independent states;
6. denial or absence of unapproved OS/I/O access;
7. documented host/script data contract.

This file does not select a host language, Lua version, binding library, persistence engine, or deployment topology.
