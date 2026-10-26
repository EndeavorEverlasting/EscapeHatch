import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ASSIST_ANSWERS_KEY, parseAssistAnswers, type AssistAnswer, type AssistProfile } from '@/lib/assist-contract';
import { parsePreferences, type Preferences } from '@/lib/application-preferences';
import { projectAnswerRecovery, type RecoveredKnowledge } from '@/lib/answer-recovery';
import type { AnswerSnippet, Profile } from '@/lib/storage';

export function useRecoveredAnswers(profile: Profile, answers: AnswerSnippet[], assistProfile: AssistProfile) {
  const [assistAnswers, setAssistAnswers] = useState<AssistAnswer[]>([]);
  const [preferences, setPreferences] = useState<Preferences>();
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const readAssist = () => {
      try {
        const raw = localStorage.getItem(ASSIST_ANSWERS_KEY);
        const parsed = raw === null ? [] : parseAssistAnswers(JSON.parse(raw));
        if (!parsed) throw new Error('invalid');
        setAssistAnswers(parsed);
        setUnavailable(items => items.filter(item => item !== 'Assist answers'));
      } catch { setUnavailable(items => [...new Set([...items, 'Assist answers'])]); }
    };
    readAssist();
    const onStorage = (event: StorageEvent) => { if (event.key === ASSIST_ANSWERS_KEY || event.key === null) readAssist(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/__escapehatch/managed-assist/preferences', { signal: controller.signal });
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        const parsed = parsePreferences(body.preferences);
        if (!parsed) throw new Error('invalid');
        if (active) setPreferences(parsed);
      } catch { if (active) setUnavailable(items => [...new Set([...items, 'Application preferences and question memory'])]); }
      finally { window.clearTimeout(timeout); if (active) setLoading(false); }
    })();
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);
  return { items: projectAnswerRecovery({ profile, answers, assistAnswers, assistProfile, preferences }), unavailable, loading };
}

export function RecoveredAnswers({ items, onEdit }: { items: RecoveredKnowledge[]; onEdit: (id: string) => void }) {
  const [copyStatus, setCopyStatus] = useState('');
  const copy = async (content: string) => {
    try { await navigator.clipboard.writeText(content); setCopyStatus('Saved answer copied.'); }
    catch { setCopyStatus('Could not copy. Select the answer text to copy it.'); }
  };
  return <section aria-label="Recovered knowledge" className="mb-6 grid gap-4 lg:grid-cols-2">
    <p role="status" className="sr-only">{copyStatus}</p>
    {items.map(item => <article key={item.id} data-testid="recovered-answer" className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm font-bold">{item.status === 'recovered' ? 'Recovered' : item.status === 'needs-review' ? 'Needs review' : 'Missing'} · {item.scope === 'question' ? 'This exact question only' : 'Reusable'}</p>
      <h2 className="mt-2 font-display text-2xl">{item.title}</h2>
      {item.variants.map((variant, index) => <div key={index} className="mt-3">
        <p className="whitespace-pre-wrap break-words text-sm">{variant.content || 'No approved answer saved for this question.'}</p>
        <p className="mt-2 text-xs text-muted-foreground">Source: {variant.sources.map(source => `${source.label} (${source.owner})${source.provenance ? ` — ${source.provenance.label}` : ''}`).join('; ')}</p>
        {variant.content && <button type="button" className="mt-2 mr-3 underline" onClick={() => void copy(variant.content)}>Copy saved answer</button>}
        {variant.sources.filter(source => source.owner === 'answer-library').map(source => <button key={source.recordId} type="button" className="mt-2 underline" onClick={() => onEdit(source.recordId)}>Edit saved library answer</button>)}
      </div>)}
      {item.status === 'needs-review' && <p className="mt-3 text-sm">Review these saved versions at their source. No version has been selected automatically.</p>}
      <Link href="/assist" className="mt-3 inline-block text-sm underline">Review in Application Assist</Link>
    </article>)}
  </section>;
}
