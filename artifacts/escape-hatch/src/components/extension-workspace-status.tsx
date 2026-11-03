import { useEffect, useState } from 'react';
import { browserExtensionRuntime, refreshExtensionWorkspace } from '../lib/extension-workspace';

export function ExtensionWorkspaceStatus() {
  const [message, setMessage] = useState('Checking the extension workspace…');
  const [checking, setChecking] = useState(false);
  const refresh = async () => {
    setChecking(true);
    setMessage(await refreshExtensionWorkspace(browserExtensionRuntime()));
    setChecking(false);
  };
  useEffect(() => { void refresh(); }, []);
  return <aside className="fixed right-3 top-20 z-30 flex w-[min(22rem,calc(100vw-1.5rem))] flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-md backdrop-blur-md lg:top-4" aria-label="Extension workspace">
    <span role="status">{message}</span>
    <button type="button" onClick={() => void refresh()} disabled={checking} className="rounded-md border border-border px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60">
      {checking ? 'Checking extension…' : 'Check extension'}
    </button>
  </aside>;
}
