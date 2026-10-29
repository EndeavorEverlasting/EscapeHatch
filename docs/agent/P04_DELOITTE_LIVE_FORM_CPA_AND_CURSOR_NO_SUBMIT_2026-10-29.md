# P04 + P07/P08/P82 — Deloitte live application: deterministic form completion, ZERO Submit

**Operator-selected immediate task, 2026-10-29.** This is an executable **Cursor handoff**, not evidence of a completed application. This plan complements [the 2026-10-28 Deloitte application packet handoff](P04_DELOITTE_AGENTIC_AI_ENGINEER_APPLICATION_HANDOFF_2026-10-28.md). Parent application-assist authority: [Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69), `AGENTS.md`, `harness/contracts/application-autofill-parent.v1.json`. Work within these, not a new browser/approval mechanism. Current application identified publicly by Indeed job key **`f7cda3c372bdd67f`**, Deloitte **Agentic AI Engineer – Anthropic/Claude**, Stamford, CT. Authenticate/inspect actual employer requisition; **the provided screenshot shows Deloitte Education History but does not establish the requisition number**. Verify the form's job identity before any mutation. Employer-page date/availability outranks conflicting aggregator close dates.

## 0. P04 execution contract: task bounds and no-conflict lanes

- **Lane P07, owner:** Existing local EscapeHatch running browser session and application form only, owned and inspected by Cursor; no simultaneous edits by another agent. Identify real host, checked-out commit, dirty files, worktrees, existing process PID and owned ports before entering browser. Don't launch a second browser or kill a foreign process. Don't reset existing form state, change repo code, or steal PR branches.
- **Lane P08, proof:** Read-only DOM snapshot, verified field-by-field data mapping, bounded nonterminal interactions, post-write DOM readback, independent pre-submit checkpoint. **No final application commit ever.**
- **Lane P82, repair:** Only if a specific application adapter seam blocks safe progress, isolate a synthetic fixture and instrument the existing owner; no production source mutation without declaring a separate branch and avoiding parallel PRs #115/#138/#139/#140 and other current work.
- **Forbidden:** **Never click or trigger Submit / Apply / Complete / Finish / Send / Save and Complete / Finalize**, enter-key form submission, shortcuts that commit, any irreversible job or candidate action; never agree to terms, sign attestations, answer EEO voluntarily for operator, guess employment or licensing facts, bypass CAPTCHA/MFA, export applicant data into Git or logs, upload any document whose exact revision has not been separately approved, or mark application Submitted without an employer receipt.
- **Owner controls:** User-approved data is not user-approved final submission. “Review completed” is not “approved.” The source profile and current form are the only live record of applicant facts; public Git is NOT the career data store.

## 1. Live data sources and updated authority

Retrieve the **original** `Richard Perez - Job Application Tracker 2026` via the installed authorized Google Drive source connector and search `Applications` by job key `f7cda3c372bdd67f` and employer/title. The prior Deloitte row was **row 40**, `High`, `Resume Ready`, **unapplied**; rows may move and other agents may have edited notes. Do not create a duplicate. Within this record, resolve exact document refs and the private review graph. Read graph via **exact Drive title**:

`PRIVATE — Deloitte Agentic AI Engineer — Application Artifact Graph & Review Gates — 2026-10-28`

Graph has private prose AND a strict JSON snapshot between `BEGIN_ESCAPEHATCH_APPLICATION_ASSET_GRAPH_JSON` and `END_ESCAPEHATCH_APPLICATION_ASSET_GRAPH_JSON`. **Current provider readback 2026-10-29: résumé editable node `resume:v1` has reviewed=true / approved=false / status REVIEWED; cover letter editable `cover_letter:v1` has reviewed=false / approved=false / status READY_FOR_REVIEW.** Neither PDF is approved. Do not misread prior prose from Oct 28 as current truth. Re-read live source and exact revisions before staging. User is personally reviewing the cover letter; do not toggle reviewed/approved yourself. Approval after actual operator instruction must bind a specific Drive revision and derivative bytes. If graph has changed, provider truth wins.

The provided Deloitte screenshot establishes only current visible form values, not employer acceptance, not a saved application, not job ID, and not any legal consent. Use the existing canonical master résumé and reviewed role derivative for employer's legitimate profile/work/education fields, but source every write. **Do not share or commit the profile, names, contacts, JSON node Drive identifiers, or employer session cookies in repository artifacts.**

## 2. Mandatory field matrix (preflight → action → readback)

Build a PRIVATE local matrix with `{form_section,field_label,selector/type,observed_value,proposed_value,source_doc_and_revision,confidence,authorization,action,post_write_readback,consequence}`. For each field:

1. Snapshot the current value and user-filled fields BEFORE changing anything. Prefer preservation; do not clear/retype already-correct values.
2. Verify exact active job title/requisition, target company and URL, that this is the same application session, and whether state is persisted. If not, **STOP and ask operator one specific question**; never silently start a new job.
3. Education form: user's **completed bachelor's degree is NOT a pending future degree**. The provided screenshot shows `As of today, have you completed this degree/program?` set to `No`; **correct to `Yes`** after verifying the private approved source. University, major, degree, graduation month/year come from the private résumé/transcript, not from public Git. If a day-specific calendar entry is demanded and source only establishes month/year, **STOP on that field rather than fabricate a day**. Once changed, inspect which “expected graduation date” controls disappear or become optional.
4. CPA field: screenshot shows user already chose `I plan to pursue a CPA license`. **Preserve current user choice; don't switch to “No” or invent “Yes”**. The separate date control asks for education completion that makes applicant CPA-eligible. **No authenticated CPA-course transcript assessment, approved future study enrollment, or operator-approved exact date is currently documented.** Mark `CPA_EDUCATION_DATE = REVIEW_REQUIRED`, leave blank, STOP at that field if validation prevents progress. A scenario date in the private CPA research note is NOT an authorized application answer; only the operator can approve it after understanding assumptions.
5. Work Experience: for each job, verify employer/title/month/year/responsibilities with the canonical applicant source; don't invent formal AI/ML production tenure, Claude Agent SDK tenure, licensed CPA status, accounting-experience supervision, or time spans; use exact source-backed wording. Distinguish independent software/agentic practice from paid employer production delivery.
6. All other controls: use approved source-backed values only. If unknown or consequential (compensation expectation, work mode, ability to travel up to 50%, professional licensing, immigration sponsorship, criminal/background declarations, accommodations/EEO, references, signature, terms), do not select by inference. Request narrow operator decisions.
7. File upload: do not attach résumé until its **approved=true** and upload-authorized state is provable for exact revision and current job; cover letter additionally needs distinct review+approval and the form must allow an attachment. A local PDF path or Drive link alone is not permission to upload. If the employer form has a cover-letter text-only box, honor the site's actual format and preserve paragraph breaks.

### CPA reality, from current primary sources (public facts only)

The [exact Deloitte posting](https://www.indeed.com/viewjob?jk=f7cda3c372bdd67f) **does not require or prefer a CPA** for this Agentic AI Engineer job. The role prefers Claude and cloud certifications. The CPA question appears to be a generic/conditional Deloitte application field; absence from the posting does not authorize clicking a false option. The posting has materially separate experience demands in production AI/ML and Claude Agent SDK and travel up to 50%. Capture truthful actual answers.

New York's [120-credit plus two years of qualifying supervised experience pathway](https://www.op.nysed.gov/professions/certified-public-accountants/initial1202year) becomes effective **2026-11-21**. Nonaccounting-degree applicants generally need an official credential/content audit for 27 accounting credits (18 upper-level) and 30 business credits with prescribed subjects. A bachelor's degree in another subject does not automatically meet that requirement. Qualifying experience must be within specified accounting/financial/consulting skill areas under a licensed U.S. CPA at the same employer; general IT project coordination does not automatically qualify. Four exam sections also required. NASBA [New York CPA fee schedule](https://nasba.org/exams/cpaexam/new-york/): $96 education evaluation plus per-section $268.59 exam fee and $96 application fee; NYSED license $427. Four first passes + license cost roughly **$1,981.36**, not counting courses, materials, retakes, lost work time. 2026 alternatives better matched to this exact role include Anthropic Claude [Architect Foundations](https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification) (listed $125, **partner network eligibility caveat**) and PMI [PMP](https://www.pmi.org/certifications/project-management-pmp) ($655 nonmember exam, with independently verified experience/training eligibility required).

**Provisional education planning scenario (NEVER autofill):** Dec 31, 2029 could be an achievable academic-completion target if a real transcript gap audit by early 2027 establishes sufficiently few missing courses for a sustained part-time program beginning 2027. It is **not** confirmed, is not a promised license date, and should become an employer answer **only after explicit user review and authorization**. An alternate later date may be necessary after course mapping. Do not label “CPA pass” as equivalent to state licensure.

## 3. Exact Cursor run sequence — NO-SUBMIT contract

**A. Orient** current branch/host and inspect `AGENTS.md`, parent Issue #69, active P04 handoff, repo source/host launcher docs, current PRs, current private graph and tracker. Resolve actual TokenCorridor P04/P07/P08/P82 definitions through canonical resolver. Inspect live current Deloitte form in **existing** authenticated managed browser session. Return a one-paragraph P04 sprint contract. Do not claim host proof until readbacks exist.

**B. Read-only preflight**: Record public requisition/job identity, URL origin, field labels, current values, completion %, required marker and conditional controls, artifact approval states, and button labels with risk classification. No clicks that advance or submit in this stage. Bind the correct user/workspace; fail closed if ambiguous.

**C. Apply verified facts**: Iterate field matrix, skip already-correct user inputs, correct visible incorrect completed bachelor's selection, fill only approved factual profile and history fields. Run **DOM readback after each change**. Do not set future CPA date or approve documents unless operator instructs. Local private checkpoint each section. Never press Enter in a form. Do not trigger hidden submit by keyboard.

**D. Bounded navigation**: Only if action clearly and demonstrably saves/advances to a NONTERMINAL intermediate section, traverse the existing navigation classifier and verify resulting page; if a button is even possibly final submission, or legal/EEO consent, **STOP**. Treat controls with labels Save, Continue or Next as ambiguous until their actual effect is proven safe. Do not directly issue fetch/XHR/POST to employer application endpoints.

**E. Stop and present** at final review, an unresolvable date/credential question, unapproved document upload, unknown fact, legal/signature/EEO, MFA, CAPTCHA, or terminal-looking action. The user retains the browser and can finish personally. Never test terminal submission to see whether it works. Capture a **PRIVATE** resumable checkpoint: `job_id_verified`, `filled_field_receipts`, `unfilled_fields_with_reason`, `document_nodes_approved`, `upload_authorization`, `zero_submit_attempts`, `exact_next_operator_action`.

**F. Reconcile** original tracker without altering Submitted status unless the employer has verifiable acceptance receipt. On operator-approved progression, record form in progress / review gate in Notes and private graph, preserving existing fields and other agents' edits. No fabricated interview step, success, submission or automatic listener receipt.

## 4. Test and acceptance contract

- [ ] Exact employer requisition matches original target. If not, stop; don't “repair” by guessing a different vacancy.
- [ ] Correct user/workspace, no cross-person import, live form untouched until snapshot.
- [ ] Resume graph REVIEWED=true and APPROVED=false; cover review pending; no implicit automatic approval.
- [ ] Bachelor's completion corrected to Yes (source-backed), no future degree invented.
- [ ] CPA selection preserved; date has no unapproved value.
- [ ] Every changed field tied to source and read back from actual employer DOM.
- [ ] No accidental applicant answers; no unapproved document attachments.
- [ ] No legal agreement / attestation / EEO selection.
- [ ] **Exactly ZERO final submit/complete/apply/finish attempts, including Enter-key effects.**
- [ ] No applicant info in public commits/logs.
- [ ] Private resume checkpoint and exact next action available to operator.
- [ ] Current original tracker intact, status not Submitted absent actual employer proof.

Run repository validators/tests appropriate to the *owned* source if a real adapter fix becomes necessary, with a synthetic applicant and isolated browser ports, and include exact-head CI evidence. **Do not run test automation against the employer form, press Submit to test a listener, or convert a PASS in a fixture into live employer proof.**

## 5. Output required from Cursor

A compact structured completion receipt: `CHANGED` exact fields with post-readbacks; `PROVED` real browser / document states; `NOT DONE` CPA date, artifact approvals, legal/final controls; `NEXT` the one specific human decision or safe continuation action. If the user approves an exact CPA date, re-read the current live form and update only that field with their explicit permission. This task concludes at a **review checkpoint, NOT employer submission**.

**No manual file transfers. No reapplication to previously submitted jobs. No fictitious CPA date. Zero Submit.**
