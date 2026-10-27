import { useEffect, useState } from 'react';

type Directory = { sources: { label: string; kind: string; locator: string }[]; refreshState: string; message: string };
export function CareerSourceStatus() {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/__escapehatch/tracker/sources', { signal: controller.signal }).then(response => response.ok ? response.json() : null)
      .then(value => { if (value && Array.isArray(value.sources)) setDirectory(value); }).catch(() => {});
    return () => controller.abort();
  }, []);
  const refresh = async () => {
    setBusy(true); setFeedback('Refreshing your existing tracker…');
    try {
      const response = await fetch('/__escapehatch/tracker/refresh', { method: 'POST', headers: { 'content-type': 'application/json', 'x-escapehatch-tracker': '1' }, body: '{}' });
      const result = await response.json() as { ok?: boolean; state?: string; reason?: string };
      setFeedback(result.ok ? 'Tracker refreshed. Return to Today to load current progress.' : result.state === 'AUTH_REQUIRED'
        ? 'Google is not connected to this local app. Your saved progress is preserved. Your connected assistant can refresh the original tracker without creating new credentials.'
        : 'Cloud refresh could not complete. Your saved local progress is preserved. Retry when the existing connection is available.');
    } catch { setFeedback('Cloud refresh is unavailable. Your saved local context is preserved.'); }
    finally { setBusy(false); }
  };
  return <section className="my-5 rounded-xl border border-border bg-card p-5" aria-label="Remembered career sources">
    <h2 className="font-display text-2xl">Your career sources</h2>
    <p className="my-3">{directory?.message || 'Your saved workspace is available locally. Choose a source once; keep its original files in place.'}</p>
    {directory?.sources.map((source, index) => <p key={index} className="my-2">{source.kind === 'local_file'
      ? <span>{source.label} · local artifact</span>
      : <a className="underline" href={source.locator} target="_blank" rel="noreferrer">{source.label}</a>}</p>)}
    <button className="rounded-lg border border-border px-4 py-2" disabled={busy} onClick={() => void refresh()}>Refresh connected tracker</button>
    <p className="mt-3 text-sm" role="status">{feedback}</p>
  </section>;
}
