/** Exact US Indeed posting identity. Tracking parameters are not job identity.
 * No browser navigation, applicant data, or submission authority lives here.
 */
export function indeedPostingKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['indeed.com', 'www.indeed.com'].includes(url.hostname) || url.pathname !== '/viewjob') return null;
    const keys = url.searchParams.getAll('jk');
    return keys.length === 1 && /^[a-f0-9]{16}$/i.test(keys[0]) ? keys[0].toLowerCase() : null;
  } catch { return null; }
}

/** A known posting can be opened directly without following the survey or a tracking redirect. */
export function directIndeedPostingUrl(value: string): string | null {
  const key = indeedPostingKey(value);
  return key ? `https://www.indeed.com/viewjob?jk=${key}` : null;
}

/** Exclude aliases of already locked jobs, even when the local row ID differs. */
export function lockedIndeedPostingKeys(urls: readonly string[]): Set<string> {
  return new Set(urls.map(indeedPostingKey).filter((key): key is string => key !== null));
}

export function isLockedIndeedPosting(value: string, locked: ReadonlySet<string>): boolean {
  const key = indeedPostingKey(value);
  return key !== null && locked.has(key);
}
