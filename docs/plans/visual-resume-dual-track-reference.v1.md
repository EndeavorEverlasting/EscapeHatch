# Visual resume dual-track — reference architecture + spike plan

Status: TRACKED (execution in progress)  
Authority: Escape Hatch resume presentation owners  
Related Cursor plan: `visual_resume_precedence_f0e262a7.plan.md`

## Capability

Own generation of an optional **visual** resume projection (dark schematic background, door-hanger sidebar, skill bars) while keeping the registered **ATS** floor as the default for employer submissions.

## Precedence (external)

| Pattern | Disposition | Source |
| --- | --- | --- |
| Content / schema / render separation | ADOPT | YAMLResume, RenderCV |
| Private tree + synthetic fixtures | ADOPT | schema-driven-resume-as-code |
| Multi-layout / multi-projection | ADAPT | YAMLResume layouts |
| AltaCV visual primitives | ADAPT | sidebar/skill ideas; custom door-hanger |
| Replace ATS floor with visual-first | REJECT | violates `resume-presentation.v1` |
| Vendor full YAMLResume/RenderCV | REJECT (now) | Escape Hatch is companion + contracts |

## Local floor

- ATS: `contracts/resume-presentation.v1.json` (unchanged fail-closed rules)
- Visual: `contracts/resume-presentation-visual.v1.json` (`not_for_ats_submission`)
- Synthetic template: `templates/resume-visual-dynamic/v1/synthetic-dynamic.tex`
- Source PDFs: gitignored operator folder; never mutate

## Phase map

1. **Privacy hygiene** — `.gitignore` Source Resumes + private/output paths
2. **Dual-track contracts** — ATS retained; visual sibling registered
3. **Reverse-engineer spike** — synthetic LaTeX + R5 marker validation
4. **REQUIRED SUCCESSOR** — TeX toolchain install → live PDF compile OBSERVED
5. **REQUIRED SUCCESSOR** — private YAML → template compile lane; career-state projection tags

## Proof ceiling

- Source R5 markers: VALIDATED by `validate_resume_visual_spike.py`
- Live PDF compile: BLOCKED until `pdflatex`/`xelatex`/`lualatex`/`tectonic` available
- Pixel-perfect private PDF match: OUT OF SCOPE for this spike
