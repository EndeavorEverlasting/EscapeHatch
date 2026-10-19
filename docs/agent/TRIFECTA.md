# Trifecta: P08 + P82 + P07

Use this shorthand when the operator requests it. AGENTS.md remains the sole repository governance
owner. Apply the referenced prompts within the user's authorized scope and higher-precedence rules.

## Canonical prompt sources

Resolve the operator's TokenCorridor checkout or connected repository before invoking. Do not
assume a remembered prompt or this summary is the current full prompt. Registry owners are:

- `src/tokencorridor/interface/promptkit/registry/base/prompts.json`: P08 and P07.
- `src/tokencorridor/interface/promptkit/registry/prompts/spec-architecture-prompts.v1.json`: P82.

Read the entries identified by their IDs, including `copyContent` and any applicable overrides.
Do not copy private configuration or personal source material from that repository. TokenCorridor
is a prompt source here; its unrelated project governance does not govern EscapeHatch.

## Combined execution

1. P08: identify the exact live behavior and an impacted known-good control. Use the canonical
   launcher. Observe the actual side effect, not merely a route, ACK, build or mocked test.
2. P82: fix a stable acceptance rubric, implement the smallest real candidate, measure, critique,
   and refine concrete gaps. Stop cosmetic churn once the outcome is proven at the available layer.
3. P07: refresh repository/provider truth, preserve separately owned work, declare bounded mutation
   scope, dispatch genuinely independent lanes when applicable, validate/review the exact head,
   and integrate only through repository checks and authorized merge gates.

The execution order follows dependencies; these are complementary proof/iteration/execution roles,
not necessarily three simultaneous writers. Read-only review may run alongside coordinator-owned
implementation or live proof. Enforce one writer per branch and record real dispatch evidence.

If a referenced manifest schema, runner or receipt validator is absent, name that exact gap.
Native concurrent work can still provide useful evidence, but do not label it a contract-valid
parallel PASS without the required manifest, observed receipt and validation. No missing adapter
justifies bypassing controls or making the operator act as a scheduler.

## Acceptance and reporting

Keep completed/proven behavior, remaining gaps, risks, blockers, proof ceiling, integration state,
and the first executable continuation explicit. Preserve last-known-good commits and use actual
validation output. A local commit or green browser mock is not deployment or employer-form proof.

For job applications: use only reviewed/explicit user facts, preserve existing employer values,
respect page/origin binding, and leave final submission to the operator. Upload approval and
employer acceptance are separate observations. Do not publish personal form screenshots or values
in public repository reports or PRs.
