import { useEffect, useState } from 'react';
import { projectProfileDiscovery, validateDiscoveryAnswer } from '@/lib/profile-question-planner';
import type { Preferences } from '@/lib/application-preferences';

export function ProfileDiscoveryCoach({ saved, busy, onSave }: {
  saved: Preferences;
  busy: boolean;
  onSave: (id: string, answer: string) => void;
}) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const plan = projectProfileDiscovery(saved, skipped);
  const next = plan.next;
  useEffect(() => { setAnswer(''); setError(''); }, [next?.id]);
  return <section className="mt-4 rounded-xl border border-primary/30 bg-primary/[0.04] p-4" aria-label="Guided profile discovery" data-testid="profile-discovery-coach">
    <div className="flex items-start gap-3">
      <img src="/escapehatch-mascot.webp" alt="" aria-hidden="true" width={64} height={64} className="h-16 w-16 shrink-0 object-contain" />
      <div>
        <h3 className="font-display text-xl">Build your reusable profile with Chirp</h3>
        <p className="mt-1 text-sm text-muted-foreground">I will ask one useful question at a time. This order estimates reusable answers per minute; it is not measured employer frequency or a guarantee of application readiness.</p>
      </div>
    </div>
    <p className="mt-3 text-sm font-semibold" aria-live="polite">
      {plan.answered} of {plan.total} additional reusable details saved · weighted coverage {plan.reusableCoveragePercent}%
    </p>
    <progress aria-label="Weighted reusable profile coverage" value={plan.reusableCoveragePercent} max={100} className="mt-2 w-full" />
    {next ? <div className="mt-3" key={next.id}>
      <p className="text-sm font-semibold">Chirp! Next question: {next.label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{next.why}</p>
      <label className="mt-3 block text-sm" htmlFor="profile-discovery-answer">Your answer (only if you can confirm it)</label>
      {next.multiline
        ? <textarea id="profile-discovery-answer" rows={3} maxLength={512} value={answer} disabled={busy}
            onChange={event => setAnswer(event.target.value)} className="mt-1 block w-full rounded border border-input bg-background p-2" />
        : <input id="profile-discovery-answer" type={next.url ? 'url' : 'text'} maxLength={512} value={answer} disabled={busy}
            autoComplete="off" onChange={event => setAnswer(event.target.value)} className="mt-1 block w-full rounded border border-input bg-background p-2" />}
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !answer.trim()} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          onClick={() => { const fault = validateDiscoveryAnswer(next, answer); if (fault) { setError(fault); return; } onSave(next.id, answer.trim()); }}>
          Save answer to my private profile
        </button>
        <button type="button" disabled={busy} className="rounded border border-border px-4 py-2" onClick={() => setSkipped(current => [...new Set([...current, next.id])])}>
          Skip for now
        </button>
      </div>
    </div> : <p className="mt-3 text-sm">{plan.skippedThisVisit ? 'You have reviewed the remaining questions for this visit.' : 'You have answered the available reusable questions.'} You can always edit these answers below.</p>}
    {plan.skippedThisVisit > 0 && <button type="button" disabled={busy} className="mt-3 text-sm font-semibold text-primary underline"
      onClick={() => setSkipped([])}>Revisit {plan.skippedThisVisit} skipped question{plan.skippedThisVisit === 1 ? '' : 's'}</button>}
    <p className="mt-3 text-xs text-muted-foreground">Skipping does not invent an answer. Legal statements, equal-opportunity disclosures, consent, employer-specific questions, documents, and final Submit stay outside this discovery quiz and require separate review.</p>
  </section>;
}
