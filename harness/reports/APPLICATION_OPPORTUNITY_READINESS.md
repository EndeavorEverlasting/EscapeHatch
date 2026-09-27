# Application Opportunity Readiness

## Evidence reviewed

The harness already had:
- career-state opportunity → resume → application relationships;
- a resume presentation contract;
- a Drive-backed resume durability contract requiring provider read-back and tracker parity;
- a privacy rule that real resume content remains outside Git.

The missing harness layer was the **recommendation boundary**: an agent could name the next opportunity without first proving that the operator had a usable application packet.

## Working

This harness now defines a deterministic recommendation-readiness gate:

`select opportunity → verify source → resolve/create resume → resolve/create required cover letter → reconcile provider/tracker artifacts → build operator handoff → recommendation-ready`

The operator handoff must contain artifact links, manual instructions, and the evidence to record after applying.

## Broken

Before this contract, “next opportunity” could be returned with no guarantee that:
- the tracked resume still existed;
- the resume was opportunity-appropriate;
- Drive/provider state matched the tracker;
- a required cover letter had been detected/created;
- the operator was told exactly which artifacts to use;
- the operator knew the minimum submission evidence to preserve.

## Missing / intentionally not yet established

- This harness does not itself call Google Drive or generate private resume content inside repository validation.
- Live provider read-back for a real application packet remains an execution-time/provider proof.
- Cover-letter demand can remain `UNKNOWN` when the requirement is hidden behind operator-only ATS access; that blocks `RECOMMENDATION_READY` until resolved.
- Automatic final submission remains intentionally excluded.

## Principal risks

1. **Duplicate private workspaces** — agents must search/reuse existing company/opportunity folders.
2. **Local-only artifact false readiness** — existing durability contract remains mandatory.
3. **Stale source pages** — recommendation requires current enough application-source evidence.
4. **Unnecessary cover letters** — only required letters are automatic requirements; optional letters are strategy/user decisions.
5. **Private data leakage** — repository fixtures contain only synthetic locators/content.
6. **Screenshot overload** — screenshots are evidence for ambiguity/final proof, not routine transcription.

## Validation

Owning validator:
`python scripts/validate_application_opportunity_readiness.py`

Focused tests:
`python tests/test_application_opportunity_readiness.py`

Harness integration:
`python scripts/validate_harness.py`

## Proof ceiling

Repository validation proves the contract, fixtures, workflow, and harness registration.

It does not prove a specific live Drive artifact exists, a cover-letter requirement on a protected ATS page, or an application submission. Those require provider/operator evidence.
