# Deterministic opportunity rubric v1

Owner: `src/lib/opportunity-fit.ts`; tracker import and next-opportunity recommendation: `src/lib/tracker-bridge.ts`.
This is a bounded addition to application-assist parent #69, not a submission or browser automation change.

The operator's explicit private inputs are work mode, work preference, commute acceptability and application intent. No location/distance is invented. Record exactly one line in the tracker Notes field:
`EscapeHatch rubric v1: on_site; remote_only; unacceptable; interview_practice`

Allowed values in order: remote/hybrid/on_site/unknown; remote_only/any; acceptable/unacceptable/unknown; career/interview_practice/unknown.
A remote-only preference conflicts with known hybrid or on-site requirements. An unacceptable commute conflicts with non-remote work. Incompatible eligibility yields Fit Score 0 (eligibility score, not a skill percentage); otherwise Fit Score is not calculated. Unknown inputs require review, not a guessed score. Practice intent never makes a role career-eligible or changes application receipt state. The tracker projection lowers priority and both recommendation selectors omit incompatible, unknown and practice-only rows with explicit rubric notes; manually selecting them remains possible. Legacy unmarked rows retain existing behavior until classified. The existing skill-text evidence function is unchanged.

Tracker fields: Work Mode reflects observed mode; Priority Low for nonrecommended; Fit Score 0 only for incompatible eligibility; Notes holds exact versioned rubric input; Next Action describes operator choice. Applied?, Status, date and Submission Proof are independent and must not be updated from fit or intent. Preserve existing submitted receipts. Private posting identifiers and applicant details never belong in public fixtures.

Validation: npm run test:unit in artifacts/escape-hatch; npm run typecheck; parent validator remains independent. No employer or installed-host behavior is asserted.
