# Opportunity rubric — v2 supersedes v1

Owner: `src/lib/opportunity-fit.ts`; tracker projection and application preparation selectors: `src/lib/tracker-bridge.ts`. Parent #69.

Three independent domains: (1) evidence-based match and work-arrangement compatibility, (2) whether the operator wants the job, (3) whether the operator chooses to apply and for what purpose. Submission evidence is a fourth, independent lifecycle. Neither desire nor application choice is a mathematical operand. Do not assign zero overall fit, rewrite priority, or discard match evidence because of an operator utterance or arrangement mismatch. Existing skill evidence remains unchanged; its explicitly labeled coverage fraction is matched distinct profile skills / total distinct profile skills, not a qualification probability or overall fit score. No canonical overall score formula was found in this owner; preserve existing tracker scores and leave absent scores uncomputed rather than invent weights.

Private Notes transport, exactly one structured line:
`EscapeHatch rubric v2: on_site; remote_only; unacceptable; do_not_want; apply; interview_practice`

Fields: work mode (remote/hybrid/on_site/unknown); standing preference (remote_only/any); commute (acceptable/unacceptable/unknown); job desire (want/do_not_want/unknown); application decision (apply/do_not_apply/undecided); purpose (career/interview_practice/unknown).
V1 imports preserve match evidence and purpose but do not infer desire or application authorization. Conflicting/invalid records do not enter automatic recommendations. Explicit apply routes to preparation independent of arrangement, desire or purpose; do_not_apply excludes preparation; undecided uses discovery policy. Explicit apply does not imply submission approval, bypass form validation, undo duplicate locks or establish employer identity. Priority remains source-owned. Application staples are required for selected opportunities regardless of match. Preserve private source and receipt state.

Validation: unit suite and tracker suite, typecheck and parent validator. No live host claim without observed runtime. Regression: compare all 27 desire/decision/purpose combinations with identical matching inputs, including a good match the user declines and a poor match the user chooses. Separate eligibility from score and application workflow. No private job data in fixtures.

## Derived opportunity type (independent of application purpose)

The matching owner derives `learning` from a proven arrangement mismatch or a reviewed unmet mandatory requirement; `career` requires compatible arrangement plus a complete reviewed set of mandatory requirements, all met. Otherwise the classification is `needs_assessment`. Never treat missing profile text, a user's desire, application choice, or a subjective prediction of rejection as unmet evidence. Existing recommendation policy for unassessed legacy records remains unchanged; known learning opportunities do not enter automatic career suggestions, but an explicit Apply still leads to preparation under the existing safeguards.

Private Notes optionally carry one independently versioned record:
`EscapeHatch requirements v1: {"sourceRef":"synthetic-posting","complete":true,"requirements":[{"id":"database","state":"unmet","evidenceRef":"synthetic-reviewed-evidence"}]}`

Use exact posting-derived mandatory requirement IDs and reviewed evidence references. Unknown criteria remain unknown. `complete` means all mandatory requirements were enumerated; it is not inferred from keyword coverage. A duplicate ID, duplicate marker, unsupported version or missing proof reference for met/unmet is invalid. The parser validates evidence shape, not truth of an external source; the intake/review owner must establish that truth before writing it. Preserve provider notes across local edits. The guide shows the classification at Match Review, before desire and application decision. Learning content and personal progress remain private and are not owned by this public repository. No submission authority changes. Existing #69 remains the application parent. The private assessment producer and installed runtime require separate proof.

Preparation selectors use a shared rank-aware workplace policy: rank 0 (explicit Apply) bypasses discovery-only work-mode filtering, rank 1 respects it, and null is excluded. Submitted/closed/conflicted opportunities remain locked. Local undecided records must also reconcile actual tracker work mode; conflicting evidence cannot silently enter recommendations. Regression tests exercise both selectors under remote-only policy and preserve the no-submit boundary.

When a structured requirement assessment is present, incomplete/unknown evidence cannot enter automatic career recommendations. This deliberately does not silently reclassify pre-assessment legacy rows. Explicit Apply remains independent even with an incomplete assessment; no qualification or submission approval is implied.
