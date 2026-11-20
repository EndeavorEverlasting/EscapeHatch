export type EmailApplication = { postingUrl: string; recipient: string; subject?: string };

/** The posting binds files. The address and subject are displayed as text only. */
export function parseEmailApplication(value: unknown): EmailApplication | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { postingUrl, recipient, subject } = value as Record<string, unknown>;
  if (typeof postingUrl !== 'string' || postingUrl.length > 2048 ||
      typeof recipient !== 'string' || recipient.length > 254 ||
      !/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(recipient) ||
      (subject !== undefined && (typeof subject !== 'string' || subject.length > 500 ||
        /[\x00-\x1f\x7f]/.test(subject)))) return null;
  try {
    const posting = new URL(postingUrl);
    if (posting.protocol !== 'https:' || !posting.hostname.includes('.') ||
      posting.username || posting.password || posting.port) return null;
    return { postingUrl: posting.href, recipient, ...(subject ? { subject } : {}) };
  } catch {
    return null;
  }
}

export function emailApplicationFromTracker(mailto: URL, postingUrl: unknown): EmailApplication | null {
  if (mailto.protocol !== 'mailto:' || mailto.hash ||
    [...mailto.searchParams.keys()].some(key => key !== 'subject') ||
    mailto.searchParams.getAll('subject').length > 1) return null;
  try {
    return parseEmailApplication({
      postingUrl,
      recipient: decodeURIComponent(mailto.pathname),
      subject: mailto.searchParams.get('subject') ?? undefined,
    });
  } catch {
    return null;
  }
}
