# Application Opportunity Readiness

## Trigger

Run this workflow **before** an agent tells the operator which opportunity to apply to next or presents an opportunity as ready for manual application.

The selection decision and the application-packet readiness decision are separate. A high fit score does not make an opportunity recommendation-ready.

## Authorities

- Opportunity/career graph: `contracts/career-state.v1.schema.json`
- Resume quality: `contracts/resume-presentation.v1.json`
- Resume durability: `contracts/application-resume-artifact-sync.v1.json`
- Recommendation-readiness contract: `harness/contracts/application-opportunity-readiness.v1.json`
- Artifact registry: `ARTIFACT_REGISTRY.md`

Real resume, cover-letter, application-answer, and contact content is private user-owned data and must not be committed to Git.

## Workflow

### 1. Select the opportunity

Resolve the next candidate from current career-state/tracker truth.

Record:
- organization;
- role;
- apply/source URL;
- current status;
- why it is being selected now.

Do not fabricate a recommendation from stale remembered queue state when the tracker/provider can be refreshed.

### 2. Verify the application source

Confirm the apply destination is still usable and identify any visible application requirements.

At minimum resolve:
- application URL;
- role identity;
- whether the source is current enough to use;
- whether a cover letter is required, optional, not requested, or still unknown.

If the form requirement cannot be observed without operator-only access, mark the cover-letter demand `UNKNOWN` and surface the smallest operator gate. Do not silently assume `NOT_REQUESTED`.

### 3. Resolve the opportunity resume

Search the current tracker/career state and the existing private provider workspace.

An existing resume qualifies only when either:

1. it is explicitly bound/tailored to the opportunity; or
2. master reuse was deliberately approved for that opportunity.

The resume must satisfy the existing presentation and durability contracts.

If no qualifying resume exists:
1. create a tailored resume from the canonical private master;
2. preserve factual claims and the registered presentation floor;
3. create/editable + PDF projections;
4. place them in the existing company/opportunity workspace;
5. read back the provider IDs;
6. update tracker/career-state references;
7. do not claim ready until provider IDs and tracker references reconcile.

Do not create duplicate company folders when an existing workspace is evidenced.

### 4. Resolve the cover-letter requirement

Classify the opportunity:

- `REQUIRED` — create a role-specific cover letter before recommendation-ready.
- `OPTIONAL` — do not generate by default unless the operator requests one or the opportunity strategy explicitly chooses one.
- `NOT_REQUESTED` — no cover-letter artifact is required.
- `UNKNOWN` — recommendation-ready is blocked until the demand is resolved or the operator is given an explicit inspection gate.

When a cover letter is required:
1. draft from current role/company evidence;
2. keep it truthful and role-specific;
3. create the editable artifact and submission-ready PDF when the application accepts file upload;
4. organize it with the opportunity packet in the existing private workspace;
5. return exact artifact links.

### 5. Build the operator packet

A recommendation handoff must include:

1. **Opportunity** — company, role, apply link.
2. **Why this is next** — concise, evidence-backed reason.
3. **Resume status** — existing/reused/created and why.
4. **Resume links** — editable + PDF.
5. **Cover-letter status** — required/optional/not requested/unknown.
6. **Cover-letter links** — when created/required.
7. **Manual application instructions** — ordered, concrete steps.
8. **What to record** — the canonical recording list below.
9. **Screenshot guidance** — screenshots only for ambiguity or final proof, not every page.

### 6. Tell the operator what to record

Always request the smallest useful evidence set:

- date applied;
- final submission/confirmation wording;
- application/reference ID if shown;
- exact resume artifact used;
- exact cover-letter artifact used, if any;
- compensation/rate entered when the application asks;
- nontrivial questions, available choices, and final answers;
- stated next step or employer response timeline.

Screenshots are useful when:
- surrounding UI changes the meaning of a question;
- multiple controls/options must be interpreted together;
- final submission confirmation is shown.

Do not require screenshots of routine identity/contact fields when text is enough.

### 7. Gate the recommendation

The opportunity is `RECOMMENDATION_READY` only when:

- source/apply destination is verified;
- qualifying resume is `DURABLE_READY`;
- resume provider read-back and tracker parity are proven;
- cover-letter demand is known;
- any required cover letter exists and is durable;
- artifact links are available;
- operator instructions are complete;
- recording obligations are listed.

Otherwise report the exact blocking transition instead of calling the packet ready.

## Failure handling

- Missing resume -> create it; do not merely tell the operator to make one.
- Local-only resume -> synchronize and reconcile; local existence is not durability.
- Stale tracker link -> repair tracker/provider parity.
- Required cover letter missing -> create it.
- Cover-letter demand unknown -> inspect the form/provider; if operator-only access blocks inspection, ask for only that evidence.
- Provider unavailable -> preserve the smallest safe artifact payload and state, report `BLOCKED`, and do not invent Drive IDs/links.
- Resume/cover-letter content appears in a public fixture -> replace with synthetic content before commit.
- Final submit button -> operator action only.

## Handoff

A valid handoff is compact and application-oriented. It should let the operator open the apply page and the exact artifacts immediately without asking which resume to use.

The handoff ends with the first manual action, for example:

`Open <apply URL>, use <resume PDF>, and send me the first nontrivial question or unexpected requirement.`
