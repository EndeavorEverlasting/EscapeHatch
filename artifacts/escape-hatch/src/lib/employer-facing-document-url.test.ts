import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEmployerFacingDocumentUrl,
  isEmployerFacingDocumentUrlField,
  isForbiddenPrivateCloudDocumentUrl,
} from './employer-facing-document-url.ts';

test('document URL field labels include resume/CV/transcript/cover', () => {
  assert.equal(isEmployerFacingDocumentUrlField('Resume (link to a PDF) (optional)'), true);
  assert.equal(isEmployerFacingDocumentUrlField('CV (link)'), true);
  assert.equal(isEmployerFacingDocumentUrlField('Transcript (link) (optional)'), true);
  assert.equal(isEmployerFacingDocumentUrlField('Cover letter URL'), true);
  assert.equal(isEmployerFacingDocumentUrlField('LinkedIn or portfolio URL (optional)'), false);
  assert.equal(isEmployerFacingDocumentUrlField('Why this role'), false);
});

test('Google Drive and Docs hosts are forbidden; public applicant URLs are not', () => {
  assert.equal(
    isForbiddenPrivateCloudDocumentUrl('https://drive.google.com/file/d/abc123/view'),
    true,
  );
  assert.equal(
    isForbiddenPrivateCloudDocumentUrl('https://docs.google.com/document/d/abc123/edit'),
    true,
  );
  assert.equal(
    isForbiddenPrivateCloudDocumentUrl('https://drive.usercontent.google.com/download?id=abc'),
    true,
  );
  assert.equal(
    isForbiddenPrivateCloudDocumentUrl('https://www.perezparallax.dev/static/resume/current.html'),
    false,
  );
  assert.equal(isForbiddenPrivateCloudDocumentUrl('https://linkedin.com/in/example'), false);
});

test('assert blocks Drive links only on document URL fields', () => {
  assert.doesNotThrow(() =>
    assertEmployerFacingDocumentUrl(
      'LinkedIn or portfolio URL',
      'https://drive.google.com/file/d/abc/view',
    ),
  );
  assert.throws(
    () =>
      assertEmployerFacingDocumentUrl(
        'Resume (link to a PDF)',
        'https://drive.google.com/file/d/1uAF8E6Ex_XFLR2S4NomXf39DCp5xjasF/view',
      ),
    /private_cloud_document_url_forbidden/,
  );
  assert.doesNotThrow(() =>
    assertEmployerFacingDocumentUrl(
      'Resume (link to a PDF)',
      'https://www.perezparallax.dev/static/resume/current.html',
    ),
  );
});
