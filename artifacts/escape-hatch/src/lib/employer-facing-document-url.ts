/** Employer-facing document URL policy: never paste private-cloud links into ATS fields. */

const DOCUMENT_URL_FIELD = /\b(resume|r[eé]sum[eé]|cv|curriculum\s*vitae|transcript|cover[\s-]?letter)\b/i;

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

/** Throws when an employer-visible resume/CV/transcript/cover URL is a Google Drive/Docs link. */
export function assertEmployerFacingDocumentUrl(label: string, value: string): void {
  if (!isEmployerFacingDocumentUrlField(label)) return;
  if (!isForbiddenPrivateCloudDocumentUrl(value)) return;
  throw new Error(
    'private_cloud_document_url_forbidden: do not put Google Drive/Docs links in employer resume or document URL fields; use an applicant-controlled public URL.',
  );
}
