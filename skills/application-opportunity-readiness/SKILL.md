# Skill: Application Opportunity Readiness

## Trigger

Use this skill whenever an agent:

- recommends the next opportunity to apply to;
- labels an opportunity ready for manual application;
- hands an application from research/queue state to the operator;
- is asked whether a selected opportunity already has a resume or cover letter.

## Required inputs

- current opportunity/tracker or career-state record;
- verified apply/source URL when accessible;
- current private resume artifact references;
- existing company/opportunity workspace identity when known;
- cover-letter requirement evidence;
- resume presentation and durability contracts;
- operator preference for manual submission.

## Procedure

1. Refresh opportunity state from the current tracker/career store.
2. Verify the application source and classify cover-letter demand.
3. Resolve whether a qualifying opportunity-bound resume already exists.
4. If no qualifying resume exists, create the tailored resume from the canonical private master; validate presentation; produce editable + PDF artifacts; synchronize/read back provider IDs; repair tracker parity.
5. Reuse the existing company/opportunity workspace. Never create a duplicate workspace merely because the current agent did not remember it.
6. If a cover letter is required, create and organize it before recommendation-ready. If optional, do not generate automatically unless strategy/user asks. If demand is unknown, resolve it or surface the exact operator gate.
7. Build a recommendation receipt conforming to `harness/contracts/application-opportunity-readiness.v1.json`.
8. Return one compact operator handoff containing:
   - opportunity/apply link;
   - why it is next;
   - resume status and exact links;
   - cover-letter status and exact links when applicable;
   - ordered manual instructions;
   - exact details to record;
   - screenshot guidance.
9. Keep final submission and attestations under operator control.
10. Do not call the packet ready until the contract gates are satisfied.

## Failure behavior

- No resume -> create it rather than recommending a future manual task.
- Existing local resume but no durable provider reconciliation -> synchronize first.
- Required cover letter absent -> create it.
- Unknown cover-letter demand -> do not guess.
- Provider IDs cannot be read back -> block durability claim.
- Tracker/provider IDs disagree -> repair or block.
- Private artifact content appears in Git-bound output -> remove/redact and retain only safe locators/metadata.
- Application requires judgment -> ask the operator only for the specific unresolved decision/evidence.

## Expected outputs

- recommendation-readiness receipt/state;
- verified apply URL;
- exact resume Doc/PDF links;
- exact cover-letter links when required;
- private workspace organization/reconciliation;
- concise manual-application instructions;
- canonical record-these list;
- truthful readiness/blocker state;
- no automatic final submission.
