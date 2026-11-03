/** Employer-facing document URL policy: never paste private-cloud links into ATS fields. */

const DOCUMENT_URL_FIELD = /\b(resume|r[eé]sum[eé]|cv|curriculum\s*vitae|transcript|cover[\s-]?letter)\b/i;
const PDF_REQUEST_FIELD = /\bpdf\b/i;

const FORBIDDEN_HOST_SUFFIXES = [
  'drive.google.com',
  'docs.google.com',
  'sheets.google.com',
  'drive.usercontent.google.com',
  'docs.googleusercontent.com',
] as const;

export function isEmployerFacingDocumentUrlField(label: string): boolean {
  return DOCUMENT_URL_FIELD.test(String(label || ''));
}

export function isForbiddenPrivateCloudDocumentUrl(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  let hostname = '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    hostname = parsed.hostname.toLowerCase();
  } catch {
    // Non-URL text is not a private-cloud document link for this gate.
    return false;
  }
  return FORBIDDEN_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

/** True when the URL path ends with .pdf (query/hash allowed). HTML resume pages are not PDFs. */
export function isPdfDocumentUrl(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/**
 * Throws when an employer-visible resume/CV/transcript/cover URL is a Google Drive/Docs link,
 * or when a field that asks for a PDF would receive a non-PDF URL (for example current.html).
 */
export function assertEmployerFacingDocumentUrl(label: string, value: string): void {
  if (!isEmployerFacingDocumentUrlField(label)) return;
  const raw = String(value || '').trim();
  if (!raw) return;
  if (isForbiddenPrivateCloudDocumentUrl(raw)) {
    throw new Error(
      'private_cloud_document_url_forbidden: do not put Google Drive/Docs links in employer resume or document URL fields; use an applicant-controlled public URL.',
    );
  }
  if (PDF_REQUEST_FIELD.test(String(label || '')) && !isPdfDocumentUrl(raw)) {
    throw new Error(
      'employer_facing_document_url_must_be_pdf: this field asks for a PDF link; do not paste HTML resume pages or other non-PDF URLs.',
    );
  }
}
