import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PROFILE_KEY, ANSWERS_KEY, APPLICATIONS_KEY, emptyProfile, parseWorkspaceExportText } from '../lib/storage.ts';
import { applyBrowserWorkspace, hasContext, parseSavedWorkspace, rawBrowserWorkspace, readBrowserWorkspace, reconcileWorkspace, WORKSPACE_SCHEMA, type BootstrapResponse, type SavedWorkspace } from '../lib/workspace-bootstrap.ts';

const ENDPOINT = '/__escapehatch/workspace';
const REQUEST_HEADERS = { 'content-type': 'application/json', 'x-escapehatch-workspace': '1' };
const syntheticWorkspace = import.meta.env.VITE_ESCAPEHATCH_SYNTHETIC_TEST_WORKSPACE === '1';

/** Mount state-writing hooks only after the validated private workspace has been reconciled. */
export function WorkspaceStartup({ children }: { children: ReactNode }) {
  const standalone = document.querySelector('meta[name="escapehatch-runtime"]')?.getAttribute('content') === 'standalone';
  const [ready, setReady] = useState(standalone);
  const [managed, setManaged] = useState(false);
  const [message, setMessage] = useState('Recovering your saved workspace…');
  const [needsContext, setNeedsContext] = useState(false);
  const [conflicts, setConflicts] = useState(false);
  const [browserInvalid, setBrowserInvalid] = useState(false);
  const [candidate, setCandidate] = useState<SavedWorkspace | null>(null);
  const [savedCandidate, setSavedCandidate] = useState<SavedWorkspace | null>(null);
  const revision = useRef<string | null>(null);
  const blocked = useRef(false);
  const recoveryImport = useRef(false);
  const save = async (workspace: SavedWorkspace, recoverInvalid = false, browserArchive?: Record<string, string | null>) => {
    const response = await fetch(ENDPOINT, { method: 'PUT', credentials: 'same-origin', headers: REQUEST_HEADERS,
      body: JSON.stringify({ workspace, expectedRevision: revision.current, recoverInvalid, browserArchive }) });
    if (!response.ok) throw new Error(response.status === 409
      ? 'Your workspace changed in another window. Your browser edits are preserved. Reload to review both copies.'
      : 'Your workspace could not be saved to this computer. Your browser edits are preserved. Retry before closing.');
    const result = await response.json() as { revision: string };
    revision.current = result.revision;
  };
  const recover = async () => {
    setMessage('Recovering your saved workspace…'); setNeedsContext(false); setConflicts(false); setBrowserInvalid(false); blocked.current = false;
    try {
      const response = await fetch(ENDPOINT, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('The local workspace service is unavailable. Retry startup.');
      const result = await response.json() as BootstrapResponse;
      if (result.managed === false) { setReady(true); return; }
      setManaged(true); revision.current = result.revision;
      recoveryImport.current = result.state === 'RECOVERY_REQUIRED';
      // Inspect both copies before offering recovery. Either one may be unreadable.
      let invalidLocal = false;
      try { readBrowserWorkspace(localStorage); }
      catch { setBrowserInvalid(true); invalidLocal = true; }
      if (result.state === 'RECOVERY_REQUIRED') throw new Error(result.message + ' Importing a valid local backup will archive the unreadable copy first.');
      const saved: SavedWorkspace | null = result.workspace === null ? { schema: WORKSPACE_SCHEMA, values: {} } : parseSavedWorkspace(result.workspace);
      if (!saved) throw new Error('Saved workspace is invalid. Existing data has been preserved.');
      if (invalidLocal) {
        setBrowserInvalid(true); setCandidate(saved);
        setMessage('This browser’s saved copy needs recovery. Restore the validated saved workspace or import a backup. The original browser text will be archived first.');
        return;
      }
      const local = readBrowserWorkspace(localStorage);
      const merged = reconcileWorkspace(local, saved);
      if (merged.conflicts.length) {
        setCandidate(local); setSavedCandidate(saved); setConflicts(true);
        const labels: Record<string, string> = { 'escape-hatch-profile': 'profile', 'escape-hatch-applications': 'application queue', 'escape-hatch-answers': 'answer library', 'escape-hatch-assist-profile': 'reviewed career details', 'escape-hatch-assist-answers': 'assist answers', 'escape-hatch-source-bindings-v1': 'source bindings' };
        setMessage('This browser and your saved workspace differ in: ' + merged.conflicts.map(key => labels[key] || 'saved context').join(', ') + '. Both copies are preserved. Choose which copy to continue; the other copy will be backed up.');
        return;
      }
      if (!hasContext(merged.workspace.values)) {
        setCandidate(merged.workspace);
        setNeedsContext(true); setMessage(result.message); return;
      }
      await save(merged.workspace);
      applyBrowserWorkspace(localStorage, merged.workspace);
      setMessage('Workspace recovered and saved on this computer.'); setReady(true);
    } catch (error) { setMessage((error as Error).message); }
  };
  useEffect(() => { if (!standalone) void recover(); }, []);

  useEffect(() => {
    if (!ready || !managed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let queue = Promise.resolve();
    let pending = false;
    const changed = () => {
      pending = true;
      if (!blocked.current) setMessage('Saving workspace on this computer…');
      clearTimeout(timer);
      timer = setTimeout(() => {
        queue = queue.then(async () => {
          if (blocked.current) return;
          try { await save(readBrowserWorkspace(localStorage)); pending = false; setMessage('Workspace saved on this computer.'); }
          catch (error) { blocked.current = true; setMessage((error as Error).message); }
        });
      }, 200);
    };
    window.addEventListener('escapehatch-workspace-changed', changed);
    window.addEventListener('storage', changed);
    const beforeClose = (event: BeforeUnloadEvent) => { if (pending) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeClose);
    return () => { clearTimeout(timer); window.removeEventListener('escapehatch-workspace-changed', changed); window.removeEventListener('storage', changed); window.removeEventListener('beforeunload', beforeClose); };
  }, [ready, managed]);

  const useWorkspace = async (workspace: SavedWorkspace) => {
    try {
      await save(workspace, recoveryImport.current, browserInvalid || conflicts ? rawBrowserWorkspace(localStorage) : undefined);
      recoveryImport.current = false;
      applyBrowserWorkspace(localStorage, workspace, browserInvalid || conflicts);
      setReady(true); setMessage('Workspace saved on this computer.');
    } catch (error) { setMessage((error as Error).message); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a workspace backup smaller than 2 MB.');
      const text = await file.text();
      let workspace = parseSavedWorkspace(JSON.parse(text));
      if (!workspace) {
        const legacy = parseWorkspaceExportText(text);
        if (!legacy.ok) throw new Error(legacy.error);
        workspace = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: legacy.workspace.profile, [ANSWERS_KEY]: legacy.workspace.answers, [APPLICATIONS_KEY]: legacy.workspace.applications } };
      }
      const local = browserInvalid ? { schema: WORKSPACE_SCHEMA, values: {} } as SavedWorkspace : readBrowserWorkspace(localStorage);
      const merged = reconcileWorkspace(local, workspace);
      if (merged.conflicts.length) throw new Error('The selected backup conflicts with browser edits. Export and reconcile those copies first. Nothing was replaced.');
      if (!hasContext(merged.workspace.values)) throw new Error('This backup has no profile, answers, or applications. Choose a populated backup.');
      await useWorkspace(merged.workspace);
    } catch (error) { setMessage((error as Error).message); }
  };
  const exportBrowser = () => {
    const blob = new Blob([JSON.stringify(rawBrowserWorkspace(localStorage), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'escapehatch-browser-recovery.json'; link.click(); URL.revokeObjectURL(url);
  };
  const syntheticNotice = syntheticWorkspace ? <aside role="note" data-testid="synthetic-workspace-warning" className="border-b border-amber-600 bg-amber-50 px-6 py-3 font-bold text-amber-950">
    Synthetic test workspace — disposable sample data. Do not use this window for real job applications. Open the normal EscapeHatch launcher for your saved work.
  </aside> : null;
  if (ready) return <>{syntheticNotice}{managed && <aside className="border-b border-border bg-card px-6 py-2 text-sm" role={blocked.current ? 'alert' : 'status'}>{message}</aside>}{children}</>;
  return <>{syntheticNotice}<main className="mx-auto max-w-2xl px-6 py-16">
    <p className="text-primary">EscapeHatch · Your private workspace</p>
    <h1 className="my-5 font-display text-4xl">{needsContext ? 'Bring your work with you.' : conflicts ? 'Review your saved copies.' : 'Recover your workspace.'}</h1>
    <p role="status" className="mb-6 leading-relaxed">{message}</p>
    <div className="flex flex-wrap gap-4">
      <button className="rounded-lg border border-border px-4 py-3" onClick={() => void recover()}>Retry startup</button>
      <label className="rounded-lg bg-primary px-4 py-3 text-primary-foreground">Import local workspace
        <input className="block mt-2 max-w-full" aria-label="Import local workspace" type="file" accept=".json,application/json" onChange={event => void importFile(event.target.files?.[0])} />
      </label>
      {(conflicts || browserInvalid) && <button className="rounded-lg border px-4 py-3" onClick={exportBrowser}>Export this browser</button>}
      {browserInvalid && candidate && hasContext(candidate.values) && <button className="rounded-lg border px-4 py-3" onClick={() => void useWorkspace(candidate)}>Restore saved workspace</button>}
      {conflicts && <>
        <button className="rounded-lg border px-4 py-3" onClick={() => savedCandidate && void useWorkspace(savedCandidate)}>Use saved workspace</button>
        <button className="rounded-lg border px-4 py-3" onClick={() => candidate && void useWorkspace(candidate)}>Keep this browser’s details</button></>}
      {needsContext && <button className="rounded-lg border px-4 py-3" onClick={() => void useWorkspace({ schema: WORKSPACE_SCHEMA, values: { ...candidate?.values, [PROFILE_KEY]: candidate?.values[PROFILE_KEY] || { ...emptyProfile } } })}>Create a new workspace</button>}
    </div>
    <p className="mt-8 text-sm text-muted-foreground">Your local files and Google Drive sources stay in place. Existing accounts and source permissions are reused when available; this app never submits applications for you.</p>
  </main></>;
}
