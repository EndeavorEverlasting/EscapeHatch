# Application Resume Artifact Durability

A local DOCX/PDF is an incubation artifact, not proof that an application resume is ready for reuse.

DURABLE_READY requires all of the following to reconcile in the same evidence pass:

1. an existing or newly created company/application folder in the authorized Google Drive workspace;
2. an editable Drive resume document;
3. an application-ready PDF in Drive;
4. provider read-back proving those Drive identities exist;
5. the canonical job tracker pointing to those exact editable/PDF identities.

When a role-specific resume exists, the tracker must not continue pointing at a generic master resume. Creating a local export does not satisfy synchronization. Creating a second company workspace when an evidenced one already exists is also a defect.

The repository stores only the validation contract and synthetic fixtures. It must never store private resume content, Drive credentials, or user application data.

Validation commands:

    python scripts/validate_application_resume_artifact_sync.py
    python -m pytest tests/test_application_resume_artifact_sync.py

The negative fixture intentionally claims DURABLE_READY with only local files. The validator must reject it. The positive control proves the complete folder + editable document + PDF + tracker-reference seam.
