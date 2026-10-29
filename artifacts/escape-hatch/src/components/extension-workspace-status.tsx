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
  return <aside className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-6 py-2 text-sm" aria-label="Extension workspace">
    <span role="status">{message}</span>
    <button type="button" onClick={() => void refresh()} disabled={checking} className="rounded-md border border-border px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60">
      {checking ? 'Checking extension…' : 'Check extension'}
    </button>
  </aside>;
}
