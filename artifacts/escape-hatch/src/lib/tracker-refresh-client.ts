/**
 * Refresh only an already-bound tracker using the managed loopback runtime.
 * The browser never receives a credential or chooses the spreadsheet target.
 * Failed refresh leaves the last snapshot untouched, never manufactures a row.
 */
export type TrackerStatusEnvelope = {
  connection?: string;
  reason?: string;
  localGoogleAuthPresent?: boolean;
  snapshot?: unknown;
};

export async function refreshBoundTrackerOnStartup(
  original: TrackerStatusEnvelope,
  fetcher: typeof fetch = fetch,
): Promise<TrackerStatusEnvelope | null> {
  if (!original.snapshot || !original.localGoogleAuthPresent) return null;
  try {
    const result = await fetcher('/__escapehatch/tracker/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-escapehatch-tracker': '1' },
      body: '{}',
    });
    if (!result.ok) return null;
    const status = await result.json() as { ok?: boolean; refreshed?: boolean };
    if (!status.ok || !status.refreshed) return null;
    const readback = await fetcher('/__escapehatch/tracker/status', { credentials: 'same-origin' });
    if (!readback.ok) return null;
    const next = await readback.json() as TrackerStatusEnvelope;
    return next.snapshot ? next : null;
  } catch {
    return null;
  }
}
