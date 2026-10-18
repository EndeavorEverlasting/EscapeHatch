import { useEffect, useState } from 'react';
import { emptyPreferences, parsePreferences, questions, preferenceChoices, expandProfessionalTitles, suggestProfessionalTitles, type Preferences } from '@/lib/application-preferences';

const API = '/__escapehatch/managed-assist/preferences';
export function ApplicationPreferences({ onLoad, currentRole, currentPosting = '', reviewedExperience = '', refresh = 0, onEdit }: { onLoad?: (data: Preferences) => void; currentRole?: string; currentPosting?: string; reviewedExperience?: string; refresh?: number; onEdit?: () => void }) {
  const [data, setData] = useState<Preferences>(emptyPreferences);
  const [newTitle, setNewTitle] = useState('');
  const [message, setMessage] = useState('Loading saved preferences…');
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
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
  useEffect(() => { if (!dirty) void load(); else setMessage('New recorded answers are saved on disk. Save or reload your edits before reloading them here.'); }, [refresh]);
  async function save(clear = false) {
    setBusy(true);
    try {
      const response = await fetch(API + (clear ? '/clear' : ''), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
        body: JSON.stringify(clear ? {} : { preferences: { ...data, exported_at: new Date().toISOString() } }),
      });
      if (!response.ok) throw new Error();
      await load(); setDirty(false); setClearRequested(false);
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
        {questions.filter(q => q.automation_policy === 'fill_if_explicit_preference' && q.confirmation_policy === 'until_changed' && !q.id.startsWith('experience.') && !['education.institution', 'education.credential', 'education.field_of_study', 'education.dates', 'education.details'].includes(q.id)).map(q => {
          const label = q.id === 'identity.title' ? 'Salutation (Mr., Ms., Dr.)' : q.id === 'identity.job_title' ? 'Target opportunity title' : q.id === 'identity.professional_title' ? 'Selected professional title' : q.aliases[0];
          const value = data.preferences[q.id]?.value || '';
          const choices = q.id === 'identity.job_title' ? [...new Set([...(data.job_titles || []), ...(value ? [value] : [])])] : q.id === 'identity.professional_title' ? [...new Set([...(data.professional_titles || []), ...(value ? [value] : [])])] : preferenceChoices[q.id];
          const change = (value: string) => {
            setDirty(true); onEdit?.();
            setData(current => { const preferences = { ...current.preferences };
              if (value.trim()) preferences[q.id] = { scope: 'profile_preference', source: 'user', value, updated_at: new Date().toISOString() };
              else delete preferences[q.id];
              return { ...current, preferences };
            });
          };
          return <label key={q.id} className="text-sm">{label}
            {choices ? <select aria-label={label} className="mt-1 block w-full rounded border border-input bg-background p-2" value={value} onChange={event => change(event.target.value)}>
              <option value="">Not answered</option>
              {value && !choices.includes(value) && <option value={value}>{value} (saved answer)</option>}
              {choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
            </select> : <input aria-label={label} className="mt-1 block w-full rounded border border-input bg-background p-2" value={value} onChange={event => change(event.target.value)} />}
          </label>;
        })}
      </div>
      <div className="mt-4 rounded border border-border p-3">
        <h3 className="font-bold">Suggested professional titles for this opportunity</h3>
        <p>Deterministic word matching against the role, posting and reviewed experience. Suggestions are not a qualification assessment. Choose a title, then Save Preferences; no selection changes automatically.</p>
        {suggestProfessionalTitles(data.professional_titles || [], currentRole || '', currentPosting, reviewedExperience).map(item => <div key={item.title}>
          <button type="button" onClick={() => {
            setDirty(true); onEdit?.(); setData(current => ({ ...current, preferences: { ...current.preferences, 'identity.professional_title': { scope: 'profile_preference', source: 'user', value: item.title, updated_at: new Date().toISOString() } } }));
          }}>Use professional title: {item.title}</button><p className="text-xs">{item.evidence}</p>
        </div>)}
        {!suggestProfessionalTitles(data.professional_titles || [], currentRole || '', currentPosting, reviewedExperience).length && <p>No matching target evidence yet. Add your titles and the opportunity posting.</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="block w-full">New professional title<input className="mt-1 block w-full rounded border border-input bg-background p-2" aria-label="New professional title" maxLength={160} value={newTitle} onChange={event => setNewTitle(event.target.value)} /></label>
        <button type="button" disabled={!newTitle.trim()} onClick={() => {
          const variants = expandProfessionalTitles(newTitle.split(';'));
          const titles = [...new Set([...(data.professional_titles || []), ...variants])];
          if (!variants.length || titles.length > 100) { setMessage('Use up to four titles separated by semicolons; the saved list supports 100 choices.'); return; }
          setDirty(true); onEdit?.(); setData(current => ({ ...current, professional_titles: titles }));
          setMessage('Title combinations added. Select the professional title you want to use, then Save Preferences.');
        }}>Add title combinations</button>
        <p>Enter up to four professional titles separated by semicolons to generate selectable combinations.</p>
        <button type="button" disabled={!newTitle.trim()} onClick={() => {
          const title = newTitle.trim(); setDirty(true); onEdit?.();
          setData(current => ({ ...current, professional_titles: [...new Set([...(current.professional_titles || []), title])], preferences: { ...current.preferences, 'identity.professional_title': { scope: 'profile_preference', source: 'user', value: title, updated_at: new Date().toISOString() } } }));
          setNewTitle(''); setMessage('Professional title added and selected. Save Preferences to keep it.');
        }}>Add professional title</button>
        {currentRole && <button type="button" onClick={() => {
          setDirty(true); onEdit?.();
          setData(current => ({ ...current, job_titles: [...new Set([...(current.job_titles || []), currentRole])],
            preferences: { ...current.preferences, 'identity.job_title': { scope: 'profile_preference', source: 'user', value: currentRole, updated_at: new Date().toISOString() } } }));
          setMessage('Role added and selected. Choose Save Preferences to keep it.');
        }}>Add selected role to my job titles: {currentRole}</button>}
        <p>Your selected professional title is independent of the target opportunity title and salutations. Save your selected title for recognized job-title fields; it does not change your employment history.</p>
        <button type="button" onClick={() => void save()} className="rounded bg-primary px-4 py-2 text-primary-foreground">Save Preferences</button>
        <button type="button" onClick={exportData}>Export Preferences</button>
        <label className="cursor-pointer">Import Preferences<input type="file" accept=".json,application/json" className="sr-only" onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          try {
            if (file.size > 65536) throw new Error();
            const parsed = parsePreferences(JSON.parse(await file.text())); if (!parsed) throw new Error();
            setData(parsed); setDirty(true); onEdit?.(); setMessage('Import staged for review. Choose Save Preferences to persist it.');
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
