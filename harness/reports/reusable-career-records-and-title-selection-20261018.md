# Reusable career records and professional-title selection

Repository: EscapeHatch. Branch: `codex/reusable-role-and-answer-capture`.

## Result and boundaries

- Existing canonical experience/education records now have explicit editors, resume draft intake,
  reviewed save actions and selected-record projection into managed Fill.
- Employer posting is opportunity-only, distinct from personal work descriptions, and survives
  tracker refresh and workspace serialization.
- Operator professional titles have their own private list and active selection. New entries and
  bounded ordered combinations are supported; fresh users ship with empty lists.
- Suggestions rank existing titles by local target/experience word evidence and require operator
  selection. This is a lexical heuristic, not qualification validation or a trained classifier.
- Repeated/ambiguous sections and unsupported custom ATS widgets remain unresolved. No final
  submission is implemented or attempted. Live employer refill is not proven by these tests.
- Operator-approved work/education records and title list were saved privately and observed after
  cockpit reload. Personal source text and values are excluded from this receipt and Git.

## Changed files

- `artifacts/escape-hatch/browser-assist-control.ts`
- `artifacts/escape-hatch/career-preferences.ts`
- `artifacts/escape-hatch/managed-preferences.test.ts`
- `artifacts/escape-hatch/src/App.tsx`
- `artifacts/escape-hatch/src/components/application-preferences.tsx`
- `artifacts/escape-hatch/src/components/career-records.tsx`
- `artifacts/escape-hatch/src/components/managed-browser-assist.tsx`
- `artifacts/escape-hatch/src/lib/application-preferences.ts`
- `artifacts/escape-hatch/src/lib/assist-contract.ts`
- `artifacts/escape-hatch/src/lib/assist.test.ts`
- `artifacts/escape-hatch/src/lib/resume-import.ts`
- `artifacts/escape-hatch/src/lib/storage.test.ts`
- `artifacts/escape-hatch/src/lib/storage.ts`
- `artifacts/escape-hatch/src/lib/tracker-bridge.test.ts`
- `artifacts/escape-hatch/src/lib/tracker-bridge.ts`
- `artifacts/escape-hatch/tests/managed-browser-assist.spec.ts`
- `docs/MANAGED_BROWSER_ASSIST.md`
- `harness/contracts/application-form-taxonomy.v1.json`
- `harness/reports/reusable-career-records-and-title-selection-20261018.md`

## Actual validation

Run from `artifacts/escape-hatch`:

- `npm run typecheck`: PASS.
- `npm run test:unit`: PASS, 27 tests.
- `npm run test:managed-assist`: PASS, 14 tests.
- `npm run test:tracker`: PASS, 15 tests.
- `npx playwright test tests/managed-browser-assist.spec.ts`: PASS, 8 tests.
- `npm run build`: PASS.

Run from repository root:

- `python scripts/validate_governance.py`: PASS, 56 self-tests.
- `git diff --check`: PASS.

The focused browser tests use mocked managed-control responses; managed tests exercise real
headless Chrome against synthetic forms. Neither proves employer acceptance of live uploads,
multi-step employer progression or submission readiness.

## Git and private state

The operator's original dirty feature checkout is preserved. Private preferences, downloaded
source files and generated test outputs remain outside tracked scope. Implementation is committed
locally; publication and PR creation are not claimed by this receipt. The final chat report gives
the commit SHA and publication state.

## Next gate

Choose the active professional title using displayed target evidence, save the choice, then perform
an explicitly authorized live employer Fill acceptance check. Do not treat a populated form as a
submitted application.
