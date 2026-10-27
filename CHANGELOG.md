# Changelog

All notable EscapeHatch **product** releases are recorded here.
Product identity is owned by `VERSION`. Exact freshness is the Git commit (and any release tag pointing at that commit), never this file alone.

Schema/protocol versions (`escapehatch-*/vN`, contract `version` integers) are independent and are not product releases.

## [1.2.0]

### Added

- Import selected local or connected-Drive PDF snapshots through the existing private document review package.
- Show recorded Drive origin separately from the saved PDF and refresh externally imported documents before review.

## [1.1.1]

### Fixed

- Keep resume and cover-letter intake independent while serializing private staging.
- Wait for selected document reads and saves before automatic preparation; preserve failed replacement gates.
- Refresh form inspection after launch preparation rather than racing the runtime action gate.

## [1.1.0]

### Added

- Guided source-first onboarding with shared drag-and-drop artifact intake.
- Per-opportunity current-form requirement puzzle with explicit review and evidence boundaries.

### Preserved

- Existing local persistence, managed preparation, and manual final submission.

## [1.0.0] - 2026-09-11

### Cutover

- Established repository-native SemVer product-release authority at `VERSION`.
- Ratified existing `browser/application-assist/manifest.json` package version `1.0.0` as the cutover release.
- Classified schema/protocol versions as non-authoritative for product releases.
- No prior Git tags or GitHub Releases existed at cutover; none were rewritten.
