import { useCallback, useEffect, useRef, useState } from 'react';
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
  const opportunityId = opportunity?.id;
  const liveUrl = currentPage?.opportunityId === opportunityId && sameApplicationUrl(currentPage?.applicationUrl, url)
    ? currentPage?.pageUrl : undefined;
  const available = Boolean(opportunity && opportunity.url === url && !['applied', 'closed'].includes(opportunity.status));
  const scope = JSON.stringify([opportunityId, url, liveUrl, available]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => {
    setInspection(null); setMessage(''); setBusy(false);
    return () => { inFlight.current?.abort(); inFlight.current = null; };
  }, [scope]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const projection = projectApplicationPuzzle(available ? inspection : null, opportunityId || '', url, clock, currentPage);
  const inspect = useCallback(async (quiet = false) => {
    if (inFlight.current || currentScope.current !== scope) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const current = () => currentScope.current === scope && !controller.signal.aborted;
    if (!quiet) { setBusy(true); setMessage('Reading the current employer form…'); }
    try {
      const response = await fetch('/__escapehatch/managed-assist/requirements', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
        signal: controller.signal, body: JSON.stringify({ opportunityId, url }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.inspection || !Array.isArray(result.inspection.requirements)) {
        const error = typeof result.error === 'string' ? result.error : '';
        if (current() && error !== 'action_in_progress') setInspection(null);
        throw new Error(inspectionErrors[error] || (error.includes(' ') ? error : 'Requirements unavailable. Launch this opportunity, open its form, and inspect again.'));
      }
      if (!current() || liveUrl && !sameApplicationUrl(result.inspection.pageUrl, liveUrl)) return;
      setInspection(result.inspection); setClock(Date.now()); setMessage(quiet ? '' : 'Current page inspected.');
    } catch (error) {
      if (current() && !quiet) setMessage(error instanceof Error ? error.message : 'Inspection failed. Try again.');
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (current() && !quiet) setBusy(false);
    }
  }, [opportunityId, url, scope, liveUrl]);
  useEffect(() => {
    if (!available || disabled || documents.intakePending) return;
    if (liveUrl || refresh?.opportunityId === opportunityId && refresh?.url === url) void inspect(true);
    if (!liveUrl) return;
    const timer = window.setInterval(() => void inspect(true), 2000);
    return () => window.clearInterval(timer);
  }, [available, disabled, documents.intakePending, inspect, liveUrl, opportunityId, refresh, url]);
  return <section aria-label="Application puzzle" className="application-puzzle my-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1"><Puzzle size={26} className="text-primary" aria-hidden="true" /><h3 className="mt-3 font-display text-3xl">{opportunity ? `Assemble ${opportunity.company}’s application` : 'Choose the application you’re assembling'}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{opportunity?.role || 'Select a saved opportunity above. Each application keeps its own documents and employer prompts.'}</p></div>
      <button type="button" disabled={disabled || busy || documents.intakePending || !available} onClick={() => void inspect()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"><RefreshCw size={16} aria-hidden="true" />{busy ? 'Inspecting…' : 'Inspect current form'}</button>
    </div>
    <p className="mt-4 rounded-lg bg-secondary p-3 text-sm leading-6">Start with career sources, select this job, and launch its form above. Inspection reads the current page without filling it. Later pages and posting availability still need verification. You authorize the final Submit after review.</p>
    <p role="status" className="my-3 text-sm">{message}</p>
    {projection.current ? <>
      <p className="my-3 text-sm font-bold">Current page: {projection.requiredCount} required inputs · {projection.unresolvedCount} still empty or invalid · {projection.unknownCount} with unknown requiredness</p>
      <div className="rounded-lg border border-primary/30 bg-secondary/40 p-3" data-testid="application-checkpoint-progress" aria-live="polite">
        <p className="text-sm font-bold" data-testid="application-observed-percent">{projection.checkpoint.observedPercent === null
          ? 'No fields counted on this page yet.'
          : `Fields filled on this page: ${projection.checkpoint.observedFilled}/${projection.checkpoint.observedTotal} (${projection.checkpoint.observedPercent}%)`}</p>
        <p className="text-sm font-bold" data-testid="application-checkpoint-percent">{projection.checkpoint.percent === null
          ? 'Checkpoint percentage unavailable — no verified required inputs or unresolved field classification.'
          : `Observed checkpoint: ${projection.checkpoint.percent}% of required inputs verified (${projection.checkpoint.verifiedRequired}/${projection.checkpoint.totalRequired})`}</p>
        <p className="mt-1 text-xs text-muted-foreground" data-testid="application-cover-requirement">{projection.checkpoint.coverLetter === 'REQUIRED'
          ? 'Required cover-letter input observed: included in the required-input denominator. Upload only a reviewed, approved document.'
          : projection.checkpoint.coverLetter === 'OPTIONAL'
            ? projection.checkpoint.optionalCoverLetterOffer
              ? 'Supporting documents are optional. You can add a tailored cover note or continue without one.'
              : 'Cover-letter input is optional on this page: excluded from required progress.'
            : projection.checkpoint.coverLetter === 'UNKNOWN'
              ? 'Cover-letter field exists, but whether it is required remains unknown.'
              : 'No cover-letter upload input observed on this page. A written interest response is separate; later pages may differ.'}</p>
        {projection.checkpoint.writtenAppeal && <p className="mt-1 text-xs text-muted-foreground">
          {projection.checkpoint.writtenAppeal.requirement === 'required' ? 'Required' :
            projection.checkpoint.writtenAppeal.requirement === 'optional' ? 'Optional' : 'Requiredness unknown for this'} written response.
        </p>}
        <p className="mt-1 text-xs text-muted-foreground">The field count includes optional fields and updates as the employer form changes. Later pages and unsupported fields are outside this count. Submit still requires your approval.</p>
      </div>
      <p className="mb-4 text-xs text-muted-foreground break-all">Observed {new Date(inspection!.capturedAt).toLocaleTimeString()} on {inspection!.pageUrl}. This inventory expires after five minutes.</p>
      {!projection.pieces.length && <p className="my-3 text-sm">No supported inputs found on this page. Open the employer’s application form and inspect again; this does not mean nothing is required.</p>}
      <div className="puzzle-pieces">{projection.pieces.map(piece => <article key={piece.id} className="puzzle-piece" data-populated={piece.populated}>
        <div className="flex items-start justify-between gap-3"><h4 className="font-bold break-words">{piece.label}</h4><span className="rounded bg-secondary px-2 py-1 text-xs">{piece.requirement}</span></div>
        <p className="mt-3 text-sm">{piece.kind === 'question' ? piece.populated ? 'Answer present on the employer form. Review it there.' : 'Awaiting a valid answer on the employer form.' : `Employer file input${piece.populated ? ' populated; verify acceptance there.' : ' awaiting attachment.'}`}</p>
        {piece.kind === 'resume' || piece.kind === 'cover' ? <p className="mt-2 text-xs text-muted-foreground">Add the matching PDF below. A saved or reviewed file is separate from an employer attachment.</p> : piece.kind === 'file' ? <p className="mt-2 text-xs text-muted-foreground">Attach this requested artifact directly on the employer form.</p> : null}
      </article>)}</div>
    </> : <p className="my-4 text-sm font-bold">{inspection ? 'Inspection expired or the current page changed or is unavailable. Inspect this form again.' : 'Requirements not inspected yet. No readiness score is inferred.'}</p>}
    <OpportunityDocuments documents={documents} disabled={disabled || !opportunity || opportunity.url !== url} onBypass={onBypass} />
    <div className="mt-4 flex flex-wrap gap-5 text-sm"><Link href="/materials" className="font-bold text-primary underline" data-testid="puzzle-open-materials">Open materials desk</Link><Link href="/sources" className="font-bold text-primary underline">Review career sources</Link><Link href="/answers" className="font-bold text-primary underline">Open reusable answers</Link></div>
  </section>;
}
