# P97 — Career writing engine prior-art record

2026-10-28 · EscapeHatch · Companion to generator plan [PR #116](https://github.com/EndeavorEverlasting/EscapeHatch/pull/116). Parent issue #69 remains open. Research-only; no changes to approved writing or app settings.

The user requests competitive resume, cover-letter and short-answer generators, a strong default, optional editable language profiles, and consented learning from author-approved edits. Existing owners: PR #115 (derivative lineage), PR #92 (language rules), claim fidelity, resume-presentation contract and application parent #69. Do not introduce another fact store, private writing registry, or competing generation pipeline.

## Source-inspected references

- [Resume Matcher](https://github.com/srbhr/Resume-Matcher), Apache-2.0. Verified `apps/backend/app/services/cover_letter.py`: configurable prompt with default fallback. `apps/backend/tests/unit/test_prompt_guardrails.py`: tests custom overrides and fallback. `apps/backend/app/mcp_server/tools/tailor_and_verify.py`: validation and verification after save. **ADAPT**: overrides, fallback, fact-preserving checks; "custom prompt" alone is not unique.
- [Reactive Resume](https://github.com/reactive-resume/reactive-resume), MIT. Verified `packages/api/src/features/cover-letters/draft.ts`: streamed draft variants, keep/discard. `packages/api/src/features/career/generate.ts`: structured outputs with cited fact IDs. `packages/api/src/features/ai/generate-json.ts`: schema parse/validation. `packages/ai/src/prompts/letter-draft-system.md`: evidence and length rules. **ADAPT**: draft revisions, provenance, provider guards. Note `career/voice.ts` handles speech, not author-style learning.
- [DSPy GEPA](https://github.com/stanfordnlp/dspy/blob/main/dspy/teleprompt/gepa/gepa.py), MIT. Candidate lineage, scores and feedback-guided optimizer. **INVESTIGATE** as a bounded offline test optimizer, not automatic runtime dependency.
- [Outlines](https://github.com/dottxt-ai/outlines), Apache-2.0. Schema-constrained generation. **ADAPT** the principle; JSON validity does not prove claims are true or authentic.

Repository paths inspected through GitHub on 2026-10-28; no external code incorporated, no live model comparison, and no license integration gate completed. Refuse broad claims of unique generator features without a benchmark.

## P141 selection

Compare four theses: (A) default + user-owned learned voice, (B) manually editable prompts only, (C) global evolving persona, (D) single-model autonomous author. **Select A for a measured investigation**, keep B as optional advanced setting, reject C for homogenization/privacy, and reject D as sole fact authority. Falsify A if a static voice card matches learned edits or author-review effort increases. The project-specific gap is safe, reversible learning across artifacts; ordinary generators, prompt overrides and JSON schemas already exist elsewhere.

Pure model generation is probabilistic. Deterministic admission, claim references, ranking tie breaks, versions, and re-rendering are engineering responsibilities. No author-level facts or styles can be learned from unapproved drafts.
