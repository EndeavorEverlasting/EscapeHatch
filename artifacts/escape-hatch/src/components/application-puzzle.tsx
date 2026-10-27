import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Puzzle, RefreshCw } from 'lucide-react';
import type { Application } from '@/lib/storage';
import { projectApplicationPuzzle, sameApplicationUrl, type FormInspection, type CurrentApplicationPage } from '@/lib/application-puzzle';
import { OpportunityDocuments, type useOpportunityDocuments } from './opportunity-documents';

const inspectionErrors: Record<string, string> = {
  launch_browser_first: 'Launch this opportunity and open its application form, then inspect again.',
  managed_local_runtime_required: 'Start EscapeHatch with its local launcher to inspect the employer form.',
  application_origin_changed_review_required: 'The employer page changed. Relaunch the selected opportunity before inspecting.',
  action_in_progress: 'Another application action is running. Wait for it to finish, then inspect again.',
};

export function ApplicationPuzzle({ opportunity, url, documents, disabled, onBypass, refresh, currentPage = null }: {
  opportunity?: Application; url: string; documents: ReturnType<typeof useOpportunityDocuments>; disabled: boolean; onBypass: () => void;
  refresh?: { opportunityId: string; url: string; revision: number } | null;
  currentPage?: CurrentApplicationPage | null;
}) {
  const [inspection, setInspection] = useState<FormInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [clock, setClock] = useState(Date.now);
  const scope = JSON.stringify([opportunity?.id, url]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const generation = useRef(0);
  useEffect(() => { generation.current += 1; setInspection(null); setMessage(''); setBusy(false); }, [scope]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => () => { generation.current += 1; }, []);
  const projection = projectApplicationPuzzle(inspection, opportunity?.id || '', url, clock, currentPage);
  useEffect(() => {
    if (inspection && (!currentPage || currentPage.opportunityId !== opportunity?.id ||
      !sameApplicationUrl(currentPage.applicationUrl, url) || !sameApplicationUrl(currentPage.pageUrl, inspection.pageUrl))) setInspection(null);
  }, [inspection, currentPage?.pageUrl, currentPage?.opportunityId, currentPage?.applicationUrl, opportunity?.id, url]);
  useEffect(() => {
    if (!disabled && !documents.intakePending && refresh?.opportunityId === opportunity?.id && refresh?.url === url) void inspect();
  }, [refresh, disabled, documents.intakePending, currentPage?.pageUrl]);
  async function inspect() {
    const request = ++generation.current, requestedScope = scope;
    setBusy(true); setMessage('Reading the current employer form…'); setInspection(null);
    try {
      const response = await fetch('/__escapehatch/managed-assist/requirements', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
        body: JSON.stringify({ opportunityId: opportunity?.id, url }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.inspection || !Array.isArray(result.inspection.requirements)) {
        const error = typeof result.error === 'string' ? result.error : '';
        throw new Error(inspectionErrors[error] || (error.includes(' ') ? error : 'Requirements unavailable. Launch this opportunity, open its form, and inspect again.'));
      }
      if (request !== generation.current || requestedScope !== currentScope.current) return;
      setInspection(result.inspection); setClock(Date.now()); setMessage('Current page inspected. Inspect again after changing pages or filling answers.');
    } catch (error) {
      if (request === generation.current && requestedScope === currentScope.current) setMessage(error instanceof Error ? error.message : 'Inspection failed. Try again.');
    } finally { if (request === generation.current && requestedScope === currentScope.current) setBusy(false); }
  }
  return <section aria-label="Application puzzle" className="application-puzzle my-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1"><Puzzle size={26} className="text-primary" aria-hidden="true" /><h3 className="mt-3 font-display text-3xl">{opportunity ? `Assemble ${opportunity.company}’s application` : 'Choose the application you’re assembling'}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{opportunity?.role || 'Select a saved opportunity above. Each application keeps its own documents and employer prompts.'}</p></div>
      <button type="button" disabled={disabled || busy || documents.intakePending || !opportunity || opportunity.url !== url || ['applied', 'closed'].includes(opportunity.status)} onClick={() => void inspect()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"><RefreshCw size={16} aria-hidden="true" />{busy ? 'Inspecting…' : 'Inspect current form'}</button>
    </div>
    <p className="mt-4 rounded-lg bg-secondary p-3 text-sm leading-6">Start with career sources, select this job, and launch its form above. Inspection reads the current page without filling it. Later pages and posting availability still need verification. Final Submit is yours.</p>
    <p role="status" className="my-3 text-sm">{message}</p>
    {projection.current ? <>
      <p className="my-3 text-sm font-bold">Current page: {projection.requiredCount} required inputs · {projection.unresolvedCount} still empty or invalid · {projection.unknownCount} with unknown requiredness</p>
      <p className="mb-4 text-xs text-muted-foreground break-all">Observed {new Date(inspection!.capturedAt).toLocaleTimeString()} on {inspection!.pageUrl}. This inventory expires after five minutes.</p>
      {!projection.pieces.length && <p className="my-3 text-sm">No supported inputs found on this page. Open the employer’s application form and inspect again; this does not mean nothing is required.</p>}
      <div className="puzzle-pieces">{projection.pieces.map(piece => <article key={piece.id} className="puzzle-piece" data-populated={piece.populated}>
        <div className="flex items-start justify-between gap-3"><h4 className="font-bold break-words">{piece.label}</h4><span className="rounded bg-secondary px-2 py-1 text-xs">{piece.requirement}</span></div>
        <p className="mt-3 text-sm">{piece.kind === 'question' ? piece.populated ? 'Answer present on the employer form. Review it there.' : 'Answer on the employer form; inspect again to update.' : `Employer file input${piece.populated ? ' populated; verify acceptance there.' : ' awaiting attachment.'}`}</p>
        {piece.kind === 'resume' || piece.kind === 'cover' ? <p className="mt-2 text-xs text-muted-foreground">Add the matching PDF below. A saved or reviewed file is separate from an employer attachment.</p> : piece.kind === 'file' ? <p className="mt-2 text-xs text-muted-foreground">Attach this requested artifact directly on the employer form.</p> : null}
      </article>)}</div>
    </> : <p className="my-4 text-sm font-bold">{inspection ? 'Inspection expired or the current page changed or is unavailable. Inspect this form again.' : 'Requirements not inspected yet. No readiness score is inferred.'}</p>}
    <OpportunityDocuments documents={documents} disabled={disabled || !opportunity || opportunity.url !== url} onBypass={onBypass} />
    <div className="mt-4 flex flex-wrap gap-5 text-sm"><Link href="/sources" className="font-bold text-primary underline">Review career sources</Link><Link href="/answers" className="font-bold text-primary underline">Open reusable answers</Link></div>
  </section>;
}
