# Opportunity rubric — v2 supersedes v1

Owner: `src/lib/opportunity-fit.ts`; tracker projection and application preparation selectors: `src/lib/tracker-bridge.ts`. Parent #69.

Three independent domains: (1) evidence-based match and work-arrangement compatibility, (2) whether the operator wants the job, (3) whether the operator chooses to apply and for what purpose. Submission evidence is a fourth, independent lifecycle. Neither desire nor application choice is a mathematical operand. Do not assign zero overall fit, rewrite priority, or discard match evidence because of an operator utterance or arrangement mismatch. Existing skill evidence remains unchanged; its explicitly labeled coverage fraction is matched distinct profile skills / total distinct profile skills, not a qualification probability or overall fit score. No canonical overall score formula was found in this owner; preserve existing tracker scores and leave absent scores uncomputed rather than invent weights.

Private Notes transport, exactly one structured line:
`EscapeHatch rubric v2: on_site; remote_only; unacceptable; do_not_want; apply; interview_practice`

Fields: work mode (remote/hybrid/on_site/unknown); standing preference (remote_only/any); commute (acceptable/unacceptable/unknown); job desire (want/do_not_want/unknown); application decision (apply/do_not_apply/undecided); purpose (career/interview_practice/unknown).
V1 imports preserve match evidence and purpose but do not infer desire or application authorization. Conflicting/invalid records do not enter automatic recommendations. Explicit apply routes to preparation independent of arrangement, desire or purpose; do_not_apply excludes preparation; undecided uses discovery policy. Explicit apply does not imply submission approval, bypass form validation, undo duplicate locks or establish employer identity. Priority remains source-owned. Application staples are required for selected opportunities regardless of match. Preserve private source and receipt state.

Validation: unit suite and tracker suite, typecheck and parent validator. No live host claim without observed runtime. Regression: compare all 27 desire/decision/purpose combinations with identical matching inputs, including a good match the user declines and a poor match the user chooses. Separate eligibility from score and application workflow. No private job data in fixtures.
