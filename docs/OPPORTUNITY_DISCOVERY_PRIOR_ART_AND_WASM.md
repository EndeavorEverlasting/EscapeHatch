# EscapeHatch Opportunity Discovery — P141 / P97 / P04

Date: 2026-10-28. Parent: https://github.com/EndeavorEverlasting/EscapeHatch/issues/69

## One queue, optional sources

User goal: search title, filter work arrangement, seniority, pay, domain and occupation; explicitly save a chosen listing. Existing `Application` and `APPLICATIONS_KEY` from `artifacts/escape-hatch/src/lib/storage.ts` remain the single career queue. `tracker-bridge.ts` keeps spreadsheet input optional, with manual entry, pasted URL and public discovery as peers. Do not create a second applicant store or infer submitted from search/save.

P141 hypotheses: (A) independent provider adapters projecting to the existing queue — selected; (B) mandatory spreadsheet — rejected for onboarding; (C) rewrite app using Zig/WASM — rejected as unproven dependency. P82 hypothesis: a fixed-origin read-only source can normalize results, allow safe facets, and enter the existing queue by explicit save with no status promotion; falsifiers are untrusted URLs, invented salary/mode, duplicates, overwritten submitted status, and automatic employer submit.

## P97 implementation evidence

- https://github.com/strelov1/freehire (MIT per GitHub repo): inspected `internal/search/search/filter.go` (quoted safe filters), `facets.go` (facet counts independent of hits), `internal/ingest/atsboard/board.go` (ATS tenant identity), and `internal/dict/classify/classify.go` (curated unknown-preserving title taxonomy). Disposition: **ADAPT patterns**, do not copy Go code or adopt infrastructure without need.
- https://github.com/SammyUrfen/JobAggregator: inspected pipeline file inventory `normalize.py`, `filters.py`, `dedup.py`, `salary.py`, `stale.py`; individual implementations remain unverified. Disposition: **ADAPT decomposition**, not proven source reuse.
- https://github.com/Himalayas-App/remote-jobs-api `examples/typescript.ts` and https://himalayas.app/docs/remote-jobs-api: source has public search with title, salary period/currency/ranges, seniority, original applicationLink and expiry metadata. First adapter is **REMOTE ONLY**. Attribute Himalayas, retain original application link, honor rate limits and terms. No assertion of hybrid or on-site coverage.
- Official Greenhouse Job Board API is a future first-party ATS candidate. Each site's public-source terms, tenant identity, field evidence and request limits need verification before adding.

## P04 delivery partitions

D1 current feature branch: search/read-only provider, normalized facets, source credit, explicit save to canonical queue, tests and browser validation. D2 separate provider-adapter branch: hybrid/on-site via first-party ATS boards. D3 separate taxonomy/normalization: source confidence, unknown handling, dedup, accurate currency/period representation. D4 review UI on mobile and desktop before visual redesign: filters, pay emphasis, accessibility and error states. D5 conditional Zig/WASM spike: benchmark identical 10,000-record classification/filter workload against TypeScript, verify output parity, startup latency, bytes and browser/Node compatibility; adopt only if a measured gain exceeds toolchain and delivery cost.

Zig/WASM is computation portability, not automatic web scraping, credentials, platform-host app, or browser UX. Existing Vite/React already runs on browser-capable operating systems. No Zig dependency installed in this sprint.

## Scope and proof boundaries

Local server searches ONLY an allowlisted public API origin, GET with bounded title/pagination and no private career data. Unknown pay/work mode must never be guessed. User chooses Save; no employer-ATS submit or legal attestations, no automatic tracker writeback, no user credentials. Synthetic CI or a green compile is not live-provider/browser proof. Parent issue #69 and application scene contracts remain controlling. Do not claim this branch merged or released until exact-head CI and real runtime proof.
