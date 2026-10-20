# Career language style — private policy, generic checks

**Authority:** the operator's career-narrative standard in Google Drive (section 17); the latest author-edited Google Doc and its live comments determine the actual permitted scope. **Public implementation:** `contracts/career-language-style.v1.json`, `scripts/validate_career_language_style.py`, and synthetic fixture `fixtures/career-language-style.v1.example.json`.

## Workflow
1. Fetch the latest author-edited source **and** its comments before making a wording change. Recover the exact anchored phrase and current source revision; do not use an old agent-generated document as authority.
2. Classify the request as voice-only, factual change, role-specific emphasis, rejected style, or explicit promotion to the master. Scope any modification to the authorized anchor and use provider revision protection. Keep unrelated author changes exactly as they stand.
3. Prefer plain, positive, concrete evidence of what was done. A canned "I do X, not Y" or "not just X but Y" rhetorical contrast is a style regression. An em dash alone is not. Preserve a contrast only if it is genuinely material and explicitly approved.
4. Inspect both the changed phrase and the entire surrounding document diff. Fail if unapproved paragraphs changed. Factual claims, revenue, promotions, metrics, and dates still require separately sourced approval through career claim fidelity.
5. Receipt the changed editable source and derivative statuses using the career-artifact propagation harness. Never represent stale PDF/DOCX copies or submitted applications as newly synced.

## Executable checks
`python scripts/validate_career_language_style.py` runs public synthetic contract and regression cases; it is wired into career-state CI. For a PRIVATE candidate, supply a local untracked JSON file with `--input /path/to/private-review.json`, never commit the file. Case shapes are documented in the synthetic fixture. Inputs lacking an `expected` outcome fail if rejected. Approval cannot be inferred from a clean linter result.

**Scope ceiling:** This deterministic lexical and paragraph-level validator catches defined failure shapes only. It does not consume Google Docs comments itself, semantically interpret every writing choice, verify personal career claims, perform private source ingestion, export PDFs, or automate job application submission. These are separate implementation gates under EscapeHatch's existing parent issue #69 and its narrative-engine design PR #89.
