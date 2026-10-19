import { useCallback, useEffect, useRef, useState } from 'react';

export type ReviewDocument = { name: string; sha256: string; size: number; reviewedAt?: string };
export type ReviewPackage = { opportunityId: string; url: string; documents: Partial<Record<'resume' | 'cover', ReviewDocument>> };
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
  const scopeKey = JSON.stringify([opportunityId, url]);
  const currentKey = useRef(scopeKey); currentKey.current = scopeKey;
  const request = useCallback(async (action: string, payload?: object) => {
    const key = JSON.stringify([opportunityId, url]);
    if (!opportunityId || !url) { setState(null); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(API + action + (payload ? '' : '?' + new URLSearchParams({ opportunityId, url })), payload ? {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' }, body: JSON.stringify({ ...payload, opportunityId, url }),
      } : { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.package || typeof result.requireReview !== 'boolean') throw new Error(result.error || 'Opportunity documents unavailable.');
      if (currentKey.current === key) setState(result);
      return result as State;
    } catch (error) { if (currentKey.current === key) setError(error instanceof Error ? error.message : 'Document action failed.'); throw error; }
    finally { if (currentKey.current === key) setLoading(false); }
  }, [opportunityId, url]);
  useEffect(() => { setState(null); if (opportunityId && url) void request('status').catch(() => {}); }, [request, opportunityId, url]);
  const bound = state?.package.opportunityId === opportunityId && state.package.url === url;
  const data = bound ? state : null;
  const canUpload = Boolean(data && data.package.documents.resume && (!data.requireReview || Object.values(data.package.documents).every(item => item.reviewedAt)));
  return { data, loading, error, canUpload, request, scopeKey };
}
export function OpportunityDocuments({ documents, disabled, onBypass }: { documents: ReturnType<typeof useOpportunityDocuments>; disabled: boolean; onBypass: () => void }) {
  const data = documents.data;
  const [preview, setPreview] = useState<{ scope: string; kind: 'resume' | 'cover' } | null>(null);
  const [notice, setNotice] = useState('');
  const [pendingPolicy, setPendingPolicy] = useState<{ scope: string; value: boolean } | null>(null);
  const fileUrl = (kind: 'resume' | 'cover') => API + 'file?' + new URLSearchParams({ opportunityId: data?.package.opportunityId || '', url: data?.package.url || '', kind });
  return <section className="my-4 rounded-xl border border-border bg-card p-4" aria-label="Opportunity document review">
    <h3 className="font-display text-xl">Documents and review</h3>
    <p className="mt-2 text-sm">Selected files are saved privately for this opportunity. Selecting a file does not upload it to the employer or mean you reviewed it.</p>
    <label className="my-3 flex items-start gap-2 text-sm font-semibold"><input type="checkbox" aria-label="Require my review before document upload" checked={pendingPolicy?.scope === documents.scopeKey ? pendingPolicy.value : data?.requireReview !== false} disabled={disabled || documents.loading || !data}
      onChange={event => { const requireReview = event.target.checked; setPendingPolicy({ scope: documents.scopeKey, value: requireReview }); void documents.request('policy', { requireReview }).then(() => { if (!requireReview) onBypass(); }).catch(() => {}).finally(() => setPendingPolicy(null)); }} />Require my review before document upload</label>
    <p className="text-xs text-muted-foreground">Review on: confirm each exact file before uploading. Review off: your explicit start/launch reuses saved documents and attempts preparation to final review. Turning review off never marks a file reviewed. Missing documents, unknown answers, failed uploads or missing trusted navigation evidence still stop preparation. Final Submit stays yours.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['resume', 'cover'] as const).map(kind => {
      const item = data?.package.documents[kind], label = kind === 'resume' ? 'résumé' : 'cover letter';
      return <div key={kind} className="rounded-lg border border-border p-3">
        <label className="block text-sm font-bold">{kind === 'resume' ? 'Choose résumé PDF' : 'Choose cover PDF'}<input type="file" accept=".pdf,application/pdf" disabled={disabled || documents.loading || !data} onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const saved = await documents.request('stage', { kind, file: await pdfPayload(file) }); if (saved?.requireReview === false) onBypass(); setNotice('Saved privately. Review status is tied to the current file version.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save file.'); }
          event.target.value = '';
        }} /></label>
        {item ? <><p className="mt-2 break-words text-sm">{item.name}</p><p className="text-xs">{item.reviewedAt ? 'You confirmed review on ' + new Date(item.reviewedAt).toLocaleString() : 'Not confirmed reviewed'}{data?.requireReview === false ? ' · Review checkpoint disabled' : ''}</p>
          <button className="mt-2 rounded border border-primary px-3 py-2 text-sm" type="button" disabled={disabled || documents.loading} onClick={() => setPreview({ scope: documents.scopeKey, kind })}>Preview {label}</button>
          <button className="mt-2 ml-2 rounded border border-primary px-3 py-2 text-sm" type="button" disabled={disabled || documents.loading || Boolean(item.reviewedAt)} onClick={() => { void documents.request('review', { kind, sha256: item.sha256, confirmed: true }).catch(() => {}); }}>I reviewed this {label}</button>
        </> : <p className="mt-2 text-sm">No {label} saved for this opportunity.</p>}
      </div>;
    })}</div>
    {preview?.scope === documents.scopeKey && data && <div className="mt-3"><a className="underline" href={fileUrl(preview.kind)} target="_blank" rel="noreferrer">Open selected PDF in a new tab</a><iframe title="Selected document preview" className="mt-2 h-96 w-full border" src={fileUrl(preview.kind)} /><button type="button" onClick={() => setPreview(null)}>Close preview</button></div>}
    <p role="status" className="mt-3 text-sm">{documents.error || notice || (documents.loading ? 'Loading saved documents…' : documents.canUpload ? 'Documents are eligible for upload under your current review setting.' : 'Select this opportunity’s documents and complete the required review before uploading.')}</p>
  </section>;
}
