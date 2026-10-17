import { useEffect, useState } from 'react';
import { emptyPreferences, parsePreferences, questions, type Preferences } from '@/lib/application-preferences';

const API = '/__escapehatch/managed-assist/preferences';
export function ApplicationPreferences({ onLoad }: { onLoad?: (data: Preferences) => void }) {
  const [data, setData] = useState<Preferences>(emptyPreferences);
  const [message, setMessage] = useState('Loading saved preferences…');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clearRequested, setClearRequested] = useState(false);
  async function load() {
    try {
      const response = await fetch(API, { credentials: 'same-origin' });
      const json = await response.json();
      const parsed = parsePreferences(json.preferences);
      if (!response.ok || !parsed) throw new Error();
      setData(parsed); onLoad?.(parsed); setReady(true); setMessage('Saved on this computer. Reused until you edit or clear them.');
    } catch { setMessage('Saved preferences are unavailable. Start EscapeHatch with its local launcher; existing data was preserved.'); }
  }
  useEffect(() => { void load(); }, []);
  async function save(clear = false) {
    setBusy(true);
    try {
      const response = await fetch(API + (clear ? '/clear' : ''), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
        body: JSON.stringify(clear ? {} : { preferences: { ...data, exported_at: new Date().toISOString() } }),
      });
      if (!response.ok) throw new Error();
      await load(); setClearRequested(false);
      setMessage(clear ? 'Saved preferences cleared on this computer.' : 'Preferences saved on this computer. Fill will reuse these explicit answers.');
    } catch { setMessage('Save failed. Your edits remain here; no successful persistence is claimed.'); }
    finally { setBusy(false); }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'escapehatch-application-preferences.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="mb-6 rounded-2xl border border-border bg-card p-5" data-testid="application-preferences">
    <h2 className="font-display text-2xl">Reusable application answers</h2>
    <p className="mt-2 text-sm text-muted-foreground">Save your own answers once. Leave unknown facts blank. Review the employer form before submitting. Agreements and certifications stay manual.</p>
    <fieldset disabled={!ready || busy}>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {questions.filter(q => q.automation_policy === 'fill_if_explicit_preference' && q.confirmation_policy === 'until_changed').map(q => <label key={q.id} className="text-sm">
          {q.aliases[0]}
          <input aria-label={q.aliases[0]} className="mt-1 block w-full rounded border border-input bg-background p-2"
            value={data.preferences[q.id]?.value || ''} onChange={event => {
              const value = event.target.value;
              setData(current => { const preferences = { ...current.preferences };
                if (value.trim()) preferences[q.id] = { scope: 'profile_preference', source: 'user', value, updated_at: new Date().toISOString() };
                else delete preferences[q.id];
                return { ...current, preferences };
              });
            }} />
        </label>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} className="rounded bg-primary px-4 py-2 text-primary-foreground">Save Preferences</button>
        <button type="button" onClick={exportData}>Export Preferences</button>
        <label className="cursor-pointer">Import Preferences<input type="file" accept=".json,application/json" className="sr-only" onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          try {
            if (file.size > 65536) throw new Error();
            const parsed = parsePreferences(JSON.parse(await file.text())); if (!parsed) throw new Error();
            setData(parsed); setMessage('Import staged for review. Choose Save Preferences to persist it.');
          } catch { setMessage('Invalid preference export; current preferences preserved.'); }
          event.target.value = '';
        }} /></label>
        <button type="button" onClick={() => setClearRequested(true)}>Clear Preferences</button>
        {clearRequested && <><span>Clear all saved answers?</span><button type="button" onClick={() => void save(true)}>Confirm clear</button><button type="button" onClick={() => setClearRequested(false)}>Cancel</button></>}
      </div>
    </fieldset>
    <p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}
