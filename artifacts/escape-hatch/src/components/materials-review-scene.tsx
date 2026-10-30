import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BadgeCheck, FileCheck2, Stamp } from 'lucide-react';
import type { Application } from '@/lib/storage';
import { OpportunityDocuments, useOpportunityDocuments } from './opportunity-documents';
import { projectMaterialsReviewStatus } from '@/lib/materials-review-status';

/** Visible home for deterministic document-review evidence (FORM_PREPARATION.document_review). */
export function MaterialsReviewScene({ applications }: { applications: Application[] }) {
  const open = applications.filter(item => !['applied', 'closed'].includes(item.status));
  const [selectedId, setSelectedId] = useState(() => open[0]?.id || '');
  const selected = open.find(item => item.id === selectedId) || open[0];
  const opportunityId = selected?.id || '';
  const url = selected?.url || '';
  const documents = useOpportunityDocuments(opportunityId, url);
  const status = useMemo(() => projectMaterialsReviewStatus({
    opportunityId,
    applicationUrl: url,
    requireReview: documents.data?.requireReview !== false,
    documents: documents.data?.package.documents || {},
  }), [opportunityId, url, documents.data]);

  return (
    <div className="materials-desk space-y-8" data-testid="materials-review-scene">
      <header className="materials-desk__hero relative overflow-hidden rounded-[1.75rem] border border-primary/30 bg-[linear-gradient(145deg,hsl(198_34%_14%)_0%,hsl(171_40%_18%)_48%,hsl(198_28%_22%)_100%)] p-6 text-[hsl(40_40%_98%)] sm:p-9">
        <div className="relative z-10 max-w-2xl">
          <p className="font-mono-app text-[11px] font-bold uppercase tracking-[.18em] text-[hsl(165_44%_72%)]">Materials desk · review seal</p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">Mark what you already approved.</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[hsl(40_20%_88%/0.88)]">
            EscapeHatch will not treat a Drive link or chat approval as review. Open the exact PDF saved for this opportunity, confirm it, and the seal sticks to that file hash until you replace it.
          </p>
          <p className="mt-4 text-sm font-semibold" role="status" data-testid="materials-review-summary">{status.summary}</p>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 bottom-[-2.5rem] hidden h-44 w-44 rotate-[-8deg] rounded-full border-4 border-[hsl(165_44%_55%/0.45)] sm:block" />
        <div aria-hidden="true" className="pointer-events-none absolute right-10 top-8 hidden font-serif text-6xl font-semibold tracking-tight text-[hsl(165_44%_55%/0.18)] sm:block">EH</div>
      </header>

      <section className="rounded-2xl border border-border bg-card/80 p-5 sm:p-7" aria-label="Choose opportunity materials">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl">Opportunity materials</h2>
            <p className="mt-2 text-sm text-muted-foreground">One opportunity at a time. Review is per file version, not per company name.</p>
          </div>
          <Link href={selected ? `/assist?opportunityId=${encodeURIComponent(selected.id)}` : '/assist'}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            data-testid="materials-open-assist">
            Continue to browser assist <ArrowRight size={16} />
          </Link>
        </div>
        <label className="mt-5 block text-sm font-semibold">
          Saved opportunity
          <select
            className="mt-2 block w-full rounded-xl border border-input bg-background p-3"
            value={selected?.id || ''}
            onChange={event => setSelectedId(event.target.value)}
            data-testid="materials-opportunity-select"
            aria-label="Saved opportunity for materials review"
          >
            {!open.length && <option value="">No open opportunities</option>}
            {open.map(item => <option key={item.id} value={item.id}>{item.company} · {item.role}</option>)}
          </select>
        </label>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Document seal status">
          {status.slots.map(slot => {
            const sealed = slot.present && slot.reviewed;
            const label = slot.kind === 'resume' ? 'Résumé' : 'Cover letter';
            return (
              <li
                key={slot.kind}
                className={'materials-seal relative overflow-hidden rounded-2xl border p-4 transition-[transform,box-shadow] duration-300 motion-reduce:transition-none ' +
                  (sealed
                    ? 'materials-seal--set border-primary/40 bg-primary/5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]'
                    : 'border-border bg-secondary/40')}
                data-testid={'materials-seal-' + slot.kind}
                data-sealed={sealed ? 'true' : 'false'}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono-app text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</p>
                    <p className="mt-2 text-sm font-bold break-words">{slot.present ? (slot.name || 'Saved PDF') : 'Not saved yet'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {sealed ? `Sealed ${new Date(slot.reviewedAt!).toLocaleString()}` : slot.present ? 'Saved — review not confirmed' : 'Add a PDF below'}
                    </p>
                  </div>
                  <span className={'inline-flex h-11 w-11 items-center justify-center rounded-full border ' + (sealed ? 'border-primary bg-primary text-primary-foreground materials-seal__mark' : 'border-border bg-card text-muted-foreground')}>
                    {sealed ? <Stamp size={18} aria-hidden="true" /> : <FileCheck2 size={18} aria-hidden="true" />}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {selected ? (
        <OpportunityDocuments documents={documents} disabled={!selected} onBypass={() => {}} />
      ) : (
        <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Add or reopen an opportunity under Applications, then return here to seal its documents.</p>
      )}

      <footer className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm text-muted-foreground">
        <BadgeCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Chat approval and Google Drive drafts are recovery sources, not EscapeHatch review seals.
          Confirm each exact PDF here (or disable the review checkpoint deliberately). Final employer Submit stays yours.
        </p>
      </footer>
    </div>
  );
}
