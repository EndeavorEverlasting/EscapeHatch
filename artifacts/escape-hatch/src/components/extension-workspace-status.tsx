import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { browserExtensionRuntime, refreshExtensionWorkspace } from '../lib/extension-workspace';

type HostStatus = { managed: boolean; state: string; workspaceReviewAvailable?: boolean };
const messages: Record<string, string> = {
  CURRENT_SOURCE: 'The companion source matches this EscapeHatch build. Browser activation is checked separately.',
  OUTDATED: 'The last-used Chrome profile has an older companion build. Its missing controls are an update issue.',
  NOT_INSTALLED: 'The optional companion was not found in the last-used Chrome profile.',
  PROFILE_UNAVAILABLE: 'Chrome deployment metadata could not be verified. No browser data was changed.',
  HOST_UNAVAILABLE: 'Companion deployment checks need the installed Windows host.',
};

/** Companion maintenance never gates the extension-free managed-browser path. */
export function ExtensionWorkspaceStatus() {
  const [host, setHost] = useState<HostStatus>();
  const [message, setMessage] = useState('Checking companion setup…');
  const [checking, setChecking] = useState(false);
  const [staged, setStaged] = useState(false);
  const refresh = async () => {
    setChecking(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/__escapehatch/companion/status', { signal: controller.signal });
      if (!response.ok) throw new Error('unavailable');
      const status = await response.json() as HostStatus;
      if (!Object.hasOwn(messages, status.state)) throw new Error('invalid');
      setHost(status);
      setMessage(status.state === 'CURRENT_SOURCE'
        ? await refreshExtensionWorkspace(browserExtensionRuntime())
        : messages[status.state]);
    } catch {
      setHost({ managed: false, state: 'HOST_UNAVAILABLE' });
      setMessage('Companion deployment could not be checked. Browser assist remains available.');
    } finally { window.clearTimeout(timeout); setChecking(false); }
  };
  const repair = async () => {
    setChecking(true);
    try {
      const response = await fetch('/__escapehatch/companion/stage-update', { method: 'POST', headers: { 'x-escapehatch-companion': '1' }, signal: AbortSignal.timeout(35000) });
      const receipt = await response.json();
      if (!response.ok || receipt.state !== 'PACKAGE_STAGED_BROWSER_UPDATE_REQUIRED' || receipt.installationVerified !== false) throw new Error('unverified');
      setStaged(true);
      setMessage('The host verified and staged the current companion package. Chrome activation is still pending; your browser data is unchanged. Continue preparation in Browser assist.');
    } catch { setMessage('The host could not verify the companion update. Existing packages and browser data were preserved. Browser assist remains available.'); }
    finally { setChecking(false); }
  };
  useEffect(() => { void refresh(); }, []);
  return <details className="fixed right-3 top-20 z-30 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur-md lg:top-4" aria-label="Companion setup" data-testid="companion-setup">
    <summary className="min-h-8 cursor-pointer font-semibold">Companion setup{host?.state === 'OUTDATED' ? ' · update available' : ''}</summary>
    <p className="mt-2 leading-5" role="status">{message}</p>
    <p className="mt-2 leading-5 text-muted-foreground">The companion is optional for managed-browser preparation.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Link href="/assist" className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">Continue in Browser assist</Link>
      {host?.managed && ['OUTDATED', 'NOT_INSTALLED'].includes(host.state) && !staged && <button type="button" onClick={() => void repair()} disabled={checking} className="min-h-11 rounded-md border border-border px-3 disabled:opacity-60">Prepare companion update</button>}
      <button type="button" onClick={() => void refresh()} disabled={checking} className="min-h-11 rounded-md border border-border px-3 disabled:opacity-60">{checking ? 'Checking…' : 'Check setup'}</button>
    </div>
  </details>;
}
