# Visual dynamic resume template (v1 spike)

Reverse-engineered structural target for the operator’s Fall 2024 Dynamic Resume PDF.

## Doctrine

- Source folder `Source Resumes Not to Mutate but to Generate/` is **read-only**.
- This template uses **synthetic** content only.
- Projection is **NOT_FOR_ATS_SUBMISSION**. ATS applications use `contracts/resume-presentation.v1.json`.

## R5 structural checklist

1. Dark full-bleed background with schematic/network motif
2. Left main column (experience / education)
3. Right white door-hanger / rounded-tag sidebar
4. Horizontal skill bars with numeric scale
5. Contact icon cluster
6. Single-page target for short synthetic content

## Validate

```powershell
python scripts/validate_resume_presentation_visual.py
python scripts/validate_resume_visual_spike.py
```

## Compile (when TeX is installed)

```powershell
pdflatex -interaction=nonstopmode templates/resume-visual-dynamic/v1/synthetic-dynamic.tex
```

Write outputs under gitignored `Outputs/resume-visual/` (or `private/resume-visual/`).
