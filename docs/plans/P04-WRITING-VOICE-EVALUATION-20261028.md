# P04 — Voice-aware career generator: evaluation and execution contract

2026-10-28. Additive continuation of [PR #116](https://github.com/EndeavorEverlasting/EscapeHatch/pull/116), read with P97 prior-art companion. No production changes or private writing copied. Parent #69 and existing artifact, claims, style and presentation owners prevail.

## Product behavior to test

One **Language & Writing** preference panel, not a second career database:

- `DEFAULT` (initial): expert-written, source-grounded professional language, clean ATS presentation, user review.
- `PERSONAL` (explicit opt-in): may use an owner-approved writing-style profile and examples; never changes a claim, employer, date, outcome or legal answer. Switch back instantly.
- `CUSTOM` (advanced): preview/edit personal style rules and preferred examples; custom instructions are subordinate to hard claim/presentation rules. Unsafe templates fall back to DEFAULT with a visible explanation.

User can see `Why this wording?`, `What I learned`, source/claim receipts, `Keep original`, `Use this version`, `Don't learn from this edit`, `Forget learned style` and undo. Approved text remains immutable until a new explicit revision. Editing a résumé for one employer does not import that employer's assertions into other applications.

Opt-in learning loop: `GENERATED_DRAFT -> USER_EDITED -> REVIEWED_APPROVED -> PROPOSED_STYLE_DELTA -> OWNER_CONFIRMED_STYLE_RULE -> NEW_PROFILE_REVISION`. An edit is not itself permission to train. Store generalized style preferences and provenance locally/user-owned, NOT entire uploaded private documents in the public repository or generic telemetry. No unconsented background mining of messages. Support per-artifact overrides and user-owned export/delete. Model providers may receive selected source snippets only after explicit provider consent.

## Deterministic composition boundary

Inputs: immutable `source_claim_revision`, approved source claim IDs, `opportunity_fingerprint`, `voice_profile_revision`, `language_engine_version`, `formatter_version`, `model/provider identity` and optional prior approved draft.

1. Parse current role into structured requirements and assign evidence IDs; untrusted job text is data, not instructions.
2. Derive permitted claim set `F` from approved career source. Unresolved evidence cannot be a factual assertion.
3. Build typed `DraftPlan` for `resume | cover_letter | short_answer | outreach`: claim references, audience, max length, layout, structure, selected voice profile, role ID.
4. Ask LLM for *candidates* in a checked structure. Never let a freeform completion directly overwrite source, approved artifacts or application answers.
5. Reject any candidate that fails schema, required claim mapping, cross-artifact consistency, protected wording, privacy and length requirements. Automatic semantic claim audit that cannot resolve truth must return `REVIEW_REQUIRED`, not pass.
6. Compare eligible candidates with predeclared numeric rubric, deterministic sort and canonical tie-break. Reviewer edits and approves. Render deterministically from accepted structured content; hash input revisions and final bytes; record exported PDF/DOCX readback and lineage.

Let `H(c) = h_schema × h_claims × h_provenance × h_format × h_scope`, with each hard gate in {0,1}. A candidate with `H(c)=0` cannot be released.

For eligible candidates use preliminary `S(c) = 0.30 A + 0.25 R + 0.20 C + 0.15 V + 0.10 E`, where `A` is blinded author preference, `R` role relevance, `C` clarity, `V` measured voice similarity, `E` edit-effort reduction; each normalized to [0,1]. Weights are a **hypothesis**, not proven quality weights. Missing reliable ratings must not be silently scored zero or invented; mark `UNSCORED` and route to review. Tie break on canonical candidate hash after quantized score. Do not train on the evaluation holdout.

**Reproducibility:** identical approved candidate, source and formatter versions yield identical accepted bytes; LLM retries may create different candidates. Pin model/prompt/temperature when measuring; never promise a seed alone guarantees identical model prose.

## Falsification before rollout (P82 admission candidate)

B0: current real generator, if found (otherwise NOT_AVAILABLE). B1: same model and inputs + static approved style card. B2: same controls + confirmed author edit-deltas. Use at least two different synthetic employer archetypes and protected consented author examples when available. Blind randomized reviewer selection. Measure `unsupported_critical_claims = 0` as a hard gate, author preference, role relevance, repeated revision burden, output-to-PDF fidelity, latency, provider cost and personalization privacy controls. B2 must beat B1 on author preference **and** editing effort without a hard-gate regression; otherwise retain cheaper B1. Do not label a synthetic benchmark a real-world win.

## P04 launch order and boundaries

0. **S0 / evidence floor / CURRENT_CHAT_RUNTIME + GitHub/Drive providers:** establish main/PR heads, approved document and exact source revision; verify runtime and provider authority. Private source is `PROTECTED_EXTERNAL`, pass only opaque sanitized evidence into tracked planning.
1. **E1 / reference evaluation / CURRENT_CHAT_RUNTIME + GitHub:** P97 source-inspected mechanisms, licenses and owned local gaps. Current P97 document completes investigation only.
2. **E2 / typed profile and consent contract / LOCAL_AGENT_RUNTIME:** on separate branch, integrate with existing PR #92 voice policy + PR #115 derivative graph; no new fact store; validate state transitions and user isolation.
3. **E3 / deterministic evaluators / CI_OR_REMOTE_RUNNER:** synthetic tests for source ID enforcement, no invented numbers, no unapproved edits, stable tie break/formatting, opt-out/forget and review-required routing. Report exact SHA.
4. **E4 / UI & approved-edit feedback / LOCAL_AGENT_RUNTIME:** user-facing settings and review/preview flows in existing cockpit, not an unapproved redesign. Physical keyboard/mobile/browser proof in `OPERATOR_OR_PHYSICAL_RUNTIME`.
5. **E5 / experimental comparison / LOCAL_AGENT_RUNTIME with protected user samples + CI synthetic:** B0/B1/B2 blind review, revision and cost receipts; promote only after verified comparative signal.
6. **E6 / Application Assist integration / LOCAL_AGENT_RUNTIME:** preserve role-specific claim authority, source badges and operator-owned final Submit; parent nine-gate proof remains independent.

Each E-lane has its own branch and writer. E2 and E3 can proceed concurrently after S0; E4 and E5 depend on their contracts; E6 follows convergence. Datasets and personal examples are private and opt-in. P07 owns later implementation; P141 is scouting only and does not authorize shipping a generator now.

**First executable gate:** reconcile PRs #92, #115 and #116 against current main, identify actual B0 generation entrypoints and supported provider credentials without copying them, then create a small synthetic `DraftPlan` + acceptance-gate prototype on a fresh isolated branch. Validate current application parent/scene, career-claim and resume-presentation contracts before moving toward live UI.

**Proof ceiling:** design/dispatch and source-read decision only; neither a working personalized engine nor its writing-quality superiority has been demonstrated.
