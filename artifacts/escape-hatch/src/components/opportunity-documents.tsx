import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtifactDropzone } from './artifact-dropzone';
import { sameApplicationUrl } from '@/lib/application-puzzle';

export type ReviewDocument = { name: string; sha256: string; size: number; reviewedAt?: string; source?: { provider: 'local' } | { provider: 'google_drive'; fileId: string; modifiedTime: string } };
function driveSourceLink(item: ReviewDocument) {
  return item.source?.provider === 'google_drive' && /^[A-Za-z0-9_-]{10,200}$/.test(item.source.fileId)
    ? 'https://drive.google.com/file/d/' + item.source.fileId + '/view' : null;
}
export type ReviewPackage = { opportunityId: string; url: string; documents: Partial<Record<'resume' | 'cover' | 'case_study', ReviewDocument>> };
type State = { package: ReviewPackage; requireReview: boolean };
const API = '/__escapehatch/managed-assist/documents/';
async function pdfPayload(file: File) {
  if (!/\.pdf$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose a PDF smaller than 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('Choose a valid PDF.');
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { name: file.name, base64: btoa(binary) };
}
export function useOpportunityDocuments(opportunityId: string, url: string) {
  const [state, setState] = useState<State | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [intakePending, setIntakePending] = useState(false);
  const scopeKey = JSON.stringify([opportunityId, url]);
  const currentKey = useRef(scopeKey);
  const generation = useRef(0);
  if (currentKey.current !== scopeKey) { currentKey.current = scopeKey; generation.current += 1; }
  const request = useCallback(async (action: string, payload?: object) => {
    const key = JSON.stringify([opportunityId, url]);
    const revision = ++generation.current;
    if (!opportunityId || !url) { setState(null); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(API + action + (payload ? '' : '?' + new URLSearchParams({ opportunityId, url })), payload ? {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' }, body: JSON.stringify({ ...payload, opportunityId, url }),
      } : { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.package || typeof result.requireReview !== 'boolean') throw new Error(result.error || 'Opportunity documents unavailable.');
      if (currentKey.current === key && generation.current === revision) setState(result);
      return result as State;
    } catch (error) { if (currentKey.current === key && generation.current === revision) setError(error instanceof Error ? error.message : 'Document action failed.'); throw error; }
    finally { if (currentKey.current === key && generation.current === revision) setLoading(false); }
  }, [opportunityId, url]);
  useEffect(() => { setState(null); setIntakePending(false); if (opportunityId && url) void request('status').catch(() => {}); }, [request, opportunityId, url]);
  const bound = state?.package.opportunityId === opportunityId && sameApplicationUrl(state.package.url, url);
  const data = bound ? state : null;
  const canUpload = Boolean(!intakePending && data && data.package.documents.resume && (!data.requireReview || Object.values(data.package.documents).every(item => item.reviewedAt)));
  return { data, loading, error, canUpload, request, scopeKey, intakePending, setIntakePending };
}
export function OpportunityDocuments({ documents, disabled, onBypass }: { documents: ReturnType<typeof useOpportunityDocuments>; disabled: boolean; onBypass: () => void }) {
  const data = documents.data;
  const [preview, setPreview] = useState<{ scope: string; kind: 'resume' | 'cover' | 'case_study'; sha256: string } | null>(null);
  const [notice, setNotice] = useState<{ scope: string; text: string } | null>(null);
  const [intakeMessages, setIntakeMessages] = useState({ resume: '', cover: '', case_study: '' });
  const currentScope = useRef(documents.scopeKey); currentScope.current = documents.scopeKey;
  const intakeGeneration = useRef({ resume: 0, cover: 0, case_study: 0 });
  const pendingIntakes = useRef<{ resume: number | null; cover: number | null }>({ resume: null, cover: null, case_study: null });
  const failedIntakes = useRef({ resume: false, cover: false, case_study: false });
  const pendingBypassScope = useRef<string | null>(null);
  const onBypassRef = useRef(onBypass); onBypassRef.current = onBypass;
  const stagingQueue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    const invalidate = () => {
      intakeGeneration.current.resume += 1; intakeGeneration.current.cover += 1; intakeGeneration.current.case_study += 1;
      pendingIntakes.current = { resume: null, cover: null, case_study: null };
      failedIntakes.current = { resume: false, cover: false, case_study: false };
      pendingBypassScope.current = null;
    };
    invalidate(); setIntakeMessages({ resume: '', cover: '', case_study: '' }); return invalidate;
  }, [documents.scopeKey]);
  function updateIntakeGate() {
    const blocked = Object.values(pendingIntakes.current).some(value => value !== null) || Object.values(failedIntakes.current).some(Boolean);
    documents.setIntakePending(blocked);
    if (!blocked && pendingBypassScope.current === currentScope.current) {
      pendingBypassScope.current = null;
      onBypassRef.current();
    }
  }
  const [pendingPolicy, setPendingPolicy] = useState<{ scope: string; value: boolean } | null>(null);
  const fileUrl = (kind: 'resume' | 'cover' | 'case_study') => API + 'file?' + new URLSearchParams({ opportunityId: data?.package.opportunityId || '', url: data?.package.url || '', kind, sha256: data?.package.documents[kind]?.sha256 || '' });
  return <section className="my-4 rounded-xl border border-border bg-card p-4" aria-label="Opportunity document review">
    <h3 className="font-display text-xl">Documents and review</h3>
    <p className="mt-2 text-sm">A supporting-document field can accept a cover letter, a separately reviewed role résumé, or a relevant case study only when that exact employer form accepts it. No document is sent simply because it is saved here. A platform-wide résumé is never replaced by a role-specific file without separate approval.</p>
    <p className="mt-2 text-sm">Selected files are saved privately for this opportunity. Selecting a file does not upload it to the employer or mean you reviewed it.</p>
    <p className="mt-2 text-sm text-muted-foreground">Use a local PDF or ask your connected agent to import a selected Google Drive PDF. Review the saved PDF here before preparing the application. Drive access belongs to that connection; the file chooser browses this computer.</p>
    <button type="button" className="mt-2 min-h-11 rounded border border-primary px-3 py-2 text-sm" disabled={disabled || documents.loading || documents.intakePending || !data} onClick={() => { void documents.request('status').catch(() => {}); }}>Refresh saved documents</button>
    <label className="my-3 flex items-start gap-2 text-sm font-semibold"><input type="checkbox" aria-label="Require my review before document upload" checked={pendingPolicy?.scope === documents.scopeKey ? pendingPolicy.value : data?.requireReview !== false} disabled={disabled || documents.loading || documents.intakePending || !data}
      onChange={event => { const requireReview = event.target.checked; if (requireReview) pendingBypassScope.current = null; setPendingPolicy({ scope: documents.scopeKey, value: requireReview }); void documents.request('policy', { requireReview }).then(() => { if (!requireReview) { pendingBypassScope.current = documents.scopeKey; updateIntakeGate(); } }).catch(() => {}).finally(() => setPendingPolicy(null)); }} />Require my review before document upload</label>
    <details className="text-xs text-muted-foreground"><summary className="min-h-11 cursor-pointer py-3 font-bold">How document review works</summary><p className="leading-5">Review on: confirm each exact file before uploading. Review off: your explicit start/launch reuses saved documents and attempts preparation to final review. Turning review off never marks a file reviewed. Missing documents, unknown answers, failed uploads or missing trusted navigation evidence still stop preparation. Final Submit stays yours.</p></details>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['resume', 'cover', 'case_study'] as const).map(kind => {
      const item = data?.package.documents[kind], label = kind === 'resume' ? 'résumé' : kind === 'cover' ? 'cover letter' : 'case study';
      return <div key={kind} className="document-slot rounded-lg border border-border p-3">
        <ArtifactDropzone label={kind === 'resume' ? 'Choose résumé PDF' : kind === 'cover' ? 'Choose cover PDF' : 'Choose case study PDF'} hint={`Drop this job’s ${label} here. PDF up to 5 MB; saved privately, then reviewed separately.`} accept=".pdf,application/pdf" disabled={disabled || documents.loading || !data} onFile={async file => {
          const scope = documents.scopeKey;
          const intake = ++intakeGeneration.current[kind];
          pendingIntakes.current[kind] = intake;
          failedIntakes.current[kind] = false;
          setIntakeMessages(current => ({ ...current, [kind]: `Reading ${file.name} locally…` }));
          updateIntakeGate();
          try {
            const payload = await pdfPayload(file);
            if (currentScope.current !== scope || intake !== intakeGeneration.current[kind]) return;
            // Reads are independent; the runtime accepts one mutation at a time.
            // Re-check scope/version when a queued slot actually reaches staging.
            const staging = stagingQueue.current.catch(() => {}).then(() => {
              if (currentScope.current !== scope || intake !== intakeGeneration.current[kind]) return;
              return documents.request('stage', { kind, file: payload });
            });
            stagingQueue.current = staging;
            const saved = await staging;
            if (currentScope.current !== scope || intake !== intakeGeneration.current[kind]) return;
            if (saved?.requireReview === false) pendingBypassScope.current = scope;
            setIntakeMessages(current => ({ ...current, [kind]: '' }));
            setNotice({ scope, text: 'Saved privately. Review status is tied to the current file version.' });
          } catch (error) {
            if (currentScope.current === scope && intake === intakeGeneration.current[kind]) {
              failedIntakes.current[kind] = true;
              setIntakeMessages(current => ({ ...current, [kind]: error instanceof Error ? error.message : 'Could not save file.' }));
              setNotice({ scope, text: 'A selected file was not saved. Check its document box and choose a valid file before preparing.' });
            }
          } finally {
            if (currentScope.current === scope && intake === intakeGeneration.current[kind]) {
              pendingIntakes.current[kind] = null;
              updateIntakeGate();
            }
          }
        }} />
        <p role="status" className="mt-2 break-words text-sm">{intakeMessages[kind]}</p>
        {item ? <><p className="mt-2 break-words text-sm">{item.name}</p><p className="text-xs">{item.reviewedAt ? 'You confirmed review on ' + new Date(item.reviewedAt).toLocaleString() : 'Not confirmed reviewed'}{data?.requireReview === false ? ' · Review checkpoint disabled' : ''}</p>
          <p className="mt-2 text-xs">{driveSourceLink(item) ? <>Recorded source: <a className="underline" href={driveSourceLink(item)!} target="_blank" rel="noreferrer">Open source in Google Drive</a>. Preview below shows the saved version; later Drive edits need a new import and review.</> : item.source?.provider === 'local' ? 'Source: local PDF' : 'Source not recorded; preview the saved PDF.'}</p>
          <button className="mt-2 rounded border border-primary px-3 py-2 text-sm" type="button" disabled={disabled || documents.loading} onClick={() => setPreview({ scope: documents.scopeKey, kind, sha256: item.sha256 })}>Preview {label}</button>
          <button className="mt-2 ml-2 rounded border border-primary px-3 py-2 text-sm" type="button" disabled={disabled || documents.loading || documents.intakePending || Boolean(item.reviewedAt)} onClick={() => { void documents.request('review', { kind, sha256: item.sha256, confirmed: true }).catch(() => {}); }}>I reviewed this {label}</button>
        </> : <p className="mt-2 text-sm">No {label} saved for this opportunity.</p>}
      </div>;
    })}</div>
    {preview?.scope === documents.scopeKey && data && preview.sha256 === data.package.documents[preview.kind]?.sha256 && <div className="mt-3"><a className="underline" href={fileUrl(preview.kind)} target="_blank" rel="noreferrer">Open selected PDF in a new tab</a><iframe key={preview.sha256} title="Selected document preview" className="mt-2 h-96 w-full border" src={fileUrl(preview.kind)} /><button type="button" onClick={() => setPreview(null)}>Close preview</button></div>}
    <p role="status" className="mt-3 text-sm">{documents.error || (notice?.scope === documents.scopeKey ? notice.text : '') || (documents.loading ? 'Loading saved documents…' : documents.canUpload ? 'Documents are eligible for upload under your current review setting.' : 'Select this opportunity’s documents and complete the required review before uploading.')}</p>
  </section>;
}
