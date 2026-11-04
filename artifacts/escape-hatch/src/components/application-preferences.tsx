import { useEffect, useRef, useState } from 'react';
import { emptyPreferences, parsePreferences, questions, preferenceChoices, expandProfessionalTitles, suggestProfessionalTitles, type Preferences } from '@/lib/application-preferences';
import { savedAnswerReviewRows, unrecognizedSavedAnswerCount, hasTalentCommunityAnswers, talentCommunityAnswerHandoff, canReplaceEditorFromDisk } from '@/lib/answer-transparency';

const API = '/__escapehatch/managed-assist/preferences';
const SYNC_STATUS_API = '/__escapehatch/managed-assist/private-sync/status';
type PreferenceStoreMeta = { dataHome: string; preferenceStore: string; source: string; exists: boolean };
type PrivateSyncUiStatus = {
  enabled?: boolean;
  status?: string;
  keyBackend?: string;
  carrierKind?: string;
  reusableAnswerCount?: number;
  projectionDigest?: string | null;
  cognizantTalentCommunityFieldsPresent?: string[];
  offlineQueued?: number;
  notes?: string[];
};
function preferenceFieldLabel(id: string, fallback: string) {
  if (id === 'identity.title') return 'Salutation (Mr., Ms., Dr.)';
  if (id === 'identity.job_title') return 'Target opportunity title';
  if (id === 'identity.professional_title') return 'Selected professional title';
  if (id === 'identity.website') return 'Portfolio website';
  if (id === 'identity.linkedin') return 'LinkedIn profile';
  return fallback;
}
export function ApplicationPreferences({ onLoad, currentRole, currentPosting = '', reviewedExperience = '', refresh = 0, onEdit }: { onLoad?: (data: Preferences) => void; currentRole?: string; currentPosting?: string; reviewedExperience?: string; refresh?: number; onEdit?: () => void }) {
  const [data, setData] = useState<Preferences>(emptyPreferences);
  // Separate the durable disk snapshot from unsaved edits in the form below.
  const [savedData, setSavedData] = useState<Preferences>(emptyPreferences);
  const [showAllSavedAnswers, setShowAllSavedAnswers] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [message, setMessage] = useState('Loading saved preferences…');
  const [store, setStore] = useState<PreferenceStoreMeta | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clearRequested, setClearRequested] = useState(false);
  const [removedQuestions, setRemovedQuestions] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<PrivateSyncUiStatus | null>(null);
  const editVersion = useRef(0);
  const loadVersion = useRef(0);
  function markEdited() {
    editVersion.current++;
    setDirty(true);
    onEdit?.();
  }
  async function load(): Promise<boolean> {
    const requestVersion = ++loadVersion.current;
    const priorEdits = editVersion.current;
    try {
      const response = await fetch(API, { credentials: 'same-origin' });
      const json = await response.json();
      const parsed = parsePreferences(json.preferences);
      if (!response.ok || !parsed) throw new Error();
      const meta = json.store && typeof json.store.preferenceStore === 'string'
        ? { dataHome: String(json.store.dataHome || ''), preferenceStore: String(json.store.preferenceStore), source: String(json.store.source || 'platform_default'), exists: json.store.exists === true }
        : null;
      if (requestVersion !== loadVersion.current) return false; // ignore stale overlapping fetches
      setStore(meta);
      setSavedData(parsed); setReady(true);
      // A person can edit while a background refresh is pending. A disk read
      // may refresh the review snapshot but must never replace those edits.
      if (!canReplaceEditorFromDisk(requestVersion, loadVersion.current, priorEdits, editVersion.current)) {
        setMessage('Disk snapshot refreshed. Unsaved answers in the editor were preserved.');
        return false;
      }
      setData(parsed); onLoad?.(parsed);
      setMessage(meta?.exists
        ? 'Shared EscapeHatch profile found on this computer. Reused across browsers until you edit or clear it.'
        : 'No shared profile file yet. Save Preferences to create the EscapeHatch profile on this computer.');
      return true;
    } catch {
      if (requestVersion === loadVersion.current) setMessage('Saved preferences are unavailable. Start EscapeHatch with its local launcher; existing data was preserved.');
      return false;
    }
  }
  useEffect(() => { if (!dirty) void load(); else setMessage('New recorded answers are saved on disk. Save or reload your edits before reloading them here.'); }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(SYNC_STATUS_API, { credentials: 'same-origin', cache: 'no-store' });
        const json = await response.json();
        if (!cancelled && response.ok) setSyncStatus(json);
      } catch {
        if (!cancelled) setSyncStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh, ready]);
  async function save(clear = false) {
    setBusy(true);
    try {
      const response = await fetch(API + (clear ? '/clear' : ''), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
        body: JSON.stringify(clear ? {} : { preferences: { ...data, exported_at: new Date().toISOString() }, removedQuestions }),
      });
      if (!response.ok) throw new Error();
      const readbackOk = await load();
      if (!readbackOk) {
        setMessage('Save request completed, but profile readback was not verified. Your editor state is preserved; retry refresh before relying on it.');
        return;
      }
      setDirty(false); setClearRequested(false); setRemovedQuestions([]);
      setMessage(clear ? 'Shared EscapeHatch profile cleared on this computer.' : 'Shared EscapeHatch profile saved and read back. Fill will reuse these explicit answers across browsers on this account.');
    } catch { setMessage('Save failed. Your edits remain here; no successful persistence is claimed.'); }
    finally { setBusy(false); }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'escapehatch-application-preferences.json'; a.click(); URL.revokeObjectURL(url);
  }
  const recorded = savedAnswerReviewRows(savedData);
  const visibleRecorded = showAllSavedAnswers ? recorded : recorded.slice(0, 8);
  async function copyTalentCommunityAnswers() {
    try {
      await navigator.clipboard.writeText(talentCommunityAnswerHandoff(savedData));
      setCopyStatus('Saved talent-community answers copied. Paste only where you choose.');
    } catch {
      setCopyStatus('Clipboard unavailable. Review the saved answers here or use Export Preferences.');
    }
  }
  return <section className="mb-6 rounded-2xl border border-border bg-card p-5" data-testid="application-preferences">
    <h2 className="font-display text-2xl">Reusable application answers</h2>
    <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">Save your own answers once. Leave unknown facts blank. Review the employer form before submitting. Agreements and certifications stay manual.</p>
    <aside className="preference-store-rail mt-4 border-l-4 border-primary/70 bg-primary/[0.04] py-3 pl-4 pr-3" aria-label="Shared EscapeHatch profile location" data-testid="preference-store-rail">
      <p className="text-sm font-semibold text-foreground">Shared profile on this computer</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {store?.exists
          ? 'One EscapeHatch profile file is ready for managed Chrome, the cockpit, and the paired extension on this user account.'
          : 'EscapeHatch will create one shared profile file for this user account when you save.'}
      </p>
      <p className="mt-2 text-xs tracking-wide text-muted-foreground">
        Status: <span className="font-medium text-foreground">{store ? (store.exists ? 'Present' : 'Not created yet') : 'Checking…'}</span>
      </p>
      {store?.preferenceStore && <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium text-foreground/90">Exact store path</summary>
        <p className="mt-2 break-all font-mono text-[0.7rem] leading-5 text-muted-foreground" data-testid="preference-store-path">{store.preferenceStore}</p>
      </details>}
    </aside>

    <aside className="preference-sync-rail mt-4 border-l-4 border-accent/70 bg-accent/[0.05] py-3 pl-4 pr-3" aria-label="Private multi-device sync" data-testid="private-sync-status-rail">
      <p className="text-sm font-semibold text-foreground">Private multi-device sync</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Ciphertext-only carrier. Status never includes answer values—only counts and a digest fingerprint.
      </p>
      <p className="mt-2 text-xs tracking-wide text-muted-foreground">
        Status:{' '}
        <span className="font-medium text-foreground" data-testid="private-sync-status-label">
          {!syncStatus ? 'Checking…' : syncStatus.enabled === false ? 'Off on this host' : (syncStatus.status || 'Unknown')}
        </span>
        {syncStatus?.enabled && syncStatus.keyBackend ? <> · {syncStatus.keyBackend}</> : null}
        {syncStatus?.enabled && syncStatus.carrierKind ? <> · {syncStatus.carrierKind}</> : null}
        {typeof syncStatus?.reusableAnswerCount === 'number' ? <> · {syncStatus.reusableAnswerCount} reusable</> : null}
        {typeof syncStatus?.offlineQueued === 'number' && syncStatus.offlineQueued > 0 ? <> · {syncStatus.offlineQueued} queued offline</> : null}
      </p>
      {syncStatus?.projectionDigest && (
        <p className="mt-1 break-all font-mono text-[0.7rem] text-muted-foreground" data-testid="private-sync-digest">
          digest {syncStatus.projectionDigest.slice(0, 16)}…
        </p>
      )}
      {Array.isArray(syncStatus?.cognizantTalentCommunityFieldsPresent) && syncStatus.cognizantTalentCommunityFieldsPresent.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Cognizant talent-community field ids present: {syncStatus.cognizantTalentCommunityFieldsPresent.length}
        </p>
      )}
    </aside>

    {ready && <section className="mt-4 rounded-xl border border-border bg-secondary/20 p-4" aria-label="Exact saved answers" data-testid="saved-answer-review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl">What EscapeHatch actually remembers</h3>
          <p className="mt-1 text-sm text-muted-foreground">Exact answers from your private local profile, with their saved times. These are not proof of which choices an employer received or accepted.</p>
        </div>
        <button type="button" className="rounded border border-border px-3 py-2 text-sm" disabled={busy || dirty} onClick={() => void load()}>Refresh from disk</button>
      </div>
      <p className="mt-3 text-sm font-medium">{recorded.length} recorded answers
        {unrecognizedSavedAnswerCount(savedData) > 0 && <span className="ml-2 text-muted-foreground">· {unrecognizedSavedAnswerCount(savedData)} unrecognized IDs retained privately, not used for automatic filling</span>}
      </p>
      {dirty && <p className="mt-2 text-sm text-muted-foreground">Edits below have not been saved. This review shows the last disk snapshot.</p>}
      {recorded.length ? <ul className="mt-3 grid gap-2" data-testid="saved-answer-rows">
        {visibleRecorded.map(answer => <li key={answer.id} className="rounded-lg border border-border bg-card p-3" data-testid="saved-answer-row">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{answer.label}</span>
            <code className="break-all text-xs text-muted-foreground">{answer.id}</code>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm" data-testid="saved-answer-value">{answer.value}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {answer.source === 'saved_preference' ? 'Saved user preference' : answer.source === 'approved_question_memory' ? 'Approved question memory' : 'Question memory awaiting approval'}
            {' · '}Saved {new Date(answer.updatedAt).toLocaleString()}
            {' · '}{answer.reusable ? 'Eligible for matching-field reuse' : 'Review needed before reuse'}
          </p>
        </li>)}
      </ul> : <p className="mt-3 text-sm text-muted-foreground">No saved answers were found in this local preference store.</p>}
      {recorded.length > 8 && <button type="button" className="mt-3 text-sm underline" onClick={() => setShowAllSavedAnswers(value => !value)}>
        {showAllSavedAnswers ? 'Show latest 8 answers' : 'Show all ' + recorded.length + ' saved answers'}
      </button>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!hasTalentCommunityAnswers(savedData)} className="rounded border border-primary px-3 py-2 text-sm font-medium text-primary disabled:opacity-50" onClick={() => void copyTalentCommunityAnswers()}>
          Copy talent-community answers for handoff
        </button>
        <span className="text-xs text-muted-foreground">Copies only the three talent-community fields, on your explicit click. Nothing is uploaded or shared automatically.</span>
      </div>
      <p role="status" className="mt-2 text-sm">{copyStatus}</p>
    </section>}
    <fieldset disabled={!ready || busy}>
      <section className="mt-4 rounded-xl border border-border p-4" aria-label="Applicant privacy acknowledgements">
        <h3 className="font-display text-xl">Applicant privacy acknowledgements</h3>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" data-testid="applicant-privacy-acknowledgement-toggle"
            checked={data.application_privacy_acknowledgement_enabled === true}
            onChange={event => { markEdited(); setData(current => ({ ...current, application_privacy_acknowledgement_enabled: event.target.checked })); }} />
          Reuse my approval for routine applicant privacy notices during job applications
        </label>
        <p className="mt-2 text-xs text-muted-foreground">Off until you enable and save it. EscapeHatch checks only clearly identified application privacy acknowledgements, verifies the result, and leaves optional marketing/data sharing, contracts, certifications, signatures, and final submission for your own review. You can turn this off or clear it at any time.</p>
      </section>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {questions.filter(q => q.automation_policy === 'fill_if_explicit_preference' && q.confirmation_policy === 'until_changed' && q.id !== 'identity.full_name' && !q.id.startsWith('experience.') && !['education.institution', 'education.credential', 'education.field_of_study', 'education.dates', 'education.details'].includes(q.id)).map(q => {
          const label = preferenceFieldLabel(q.id, q.aliases[0]);
          const value = data.preferences[q.id]?.value || '';
          const choices = q.id === 'identity.job_title' ? [...new Set([...(data.job_titles || []), ...(value ? [value] : [])])] : q.id === 'identity.professional_title' ? [...new Set([...(data.professional_titles || []), ...(value ? [value] : [])])] : preferenceChoices[q.id];
          const change = (value: string) => {
            setRemovedQuestions(current => value.trim() ? current.filter(id => id !== q.id) : [...new Set([...current, q.id])]);
            markEdited();
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
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={data.optional_omissions?.includes('identity.pronouns') || false}
        onChange={event => { const omit = event.target.checked; markEdited(); setData(current => ({ ...current,
          optional_omissions: omit ? [...new Set([...(current.optional_omissions || []), 'identity.pronouns'])] : (current.optional_omissions || []).filter(id => id !== 'identity.pronouns') })); }} />Leave pronoun fields blank when optional; use my saved answer when required</label>
      {!!Object.keys(data.discovered_answers || {}).length && <section className="mt-5 rounded-lg border border-border p-4" aria-label="Questions remembered from applications">
        <h3 className="font-display text-xl">Questions remembered from applications</h3>
        {Object.values(data.discovered_answers || {}).some(answer => answer.source === 'observed_question' && !answer.value.trim()) && <div className="mt-3 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3" data-testid="mascot-missing-answer">
          <img src="/escapehatch-mascot.webp" alt="" aria-hidden="true" width={56} height={56} className="h-14 w-14 shrink-0 object-contain" />
          <div><p className="font-bold text-sm">Chirp! This puzzle has an unanswered question.</p>
          <p className="mt-1 text-sm text-muted-foreground">Fill in the question below and choose Save Preferences. EscapeHatch can then fill the exact approved answer into an empty matching employer field; you still review it before submission.</p></div>
        </div>}
        <p className="mt-2 text-sm">Answers are stored privately. Employer-specific motivation should be reviewed and tailored again for a different role. Agreements and certifications stay manual.</p>
        {Object.entries(data.discovered_answers || {}).map(([key, answer]) => <div key={key} className="mt-3">
          <label className="block text-sm">{answer.question}<textarea aria-label={'Saved answer: ' + answer.question} value={answer.value}
            rows={4} className="mt-1 block w-full rounded border border-input bg-background p-2" maxLength={512}
            onChange={event => { const value = event.target.value; markEdited(); setData(current => ({ ...current,
              discovered_answers: { ...current.discovered_answers, [key]: { ...answer, value, source: value.trim() ? 'user' : 'observed_question',
                accepted: !!value.trim(), updated_at: new Date().toISOString() } } })); }} /></label>
          <label className="mt-1 flex gap-2 text-xs"><input type="checkbox" checked={answer.accepted} disabled={!answer.value.trim()}
            onChange={event => { const accepted = event.target.checked; markEdited(); setData(current => ({ ...current,
              discovered_answers: { ...current.discovered_answers, [key]: { ...answer, accepted, updated_at: new Date().toISOString() } } })); }} />Reuse this exact answer on later applications</label>
        </div>)}
      </section>}
      <section className="mt-5 rounded-xl border border-primary/25 bg-secondary/30 p-4" aria-label="Professional title suggestions">
        <h3 className="font-display text-xl">Choose a professional title</h3>
        <p className="mt-2 text-sm">Choose a suggestion below, or use the Selected professional title dropdown above. Save Preferences to keep your choice.</p>
        <details className="my-3 rounded-lg border border-border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-semibold">How suggestions work</summary>
          <p className="mt-2">Suggestions compare your saved titles with the selected opportunity, its employer posting, and your reviewed work record. Choose the opportunity in Saved opportunity. Edit its employer posting and your reviewed work record in Reusable work and education. Add your own titles using New professional title.</p>
          <p className="mt-2">Matching evidence is read-only. Suggestions use deterministic word matching and do not assess qualifications or change your choice automatically.</p>
        </details>
        <div className="grid gap-3 sm:grid-cols-3">
          {suggestProfessionalTitles(data.professional_titles || [], currentRole || '', currentPosting, reviewedExperience).map(item => {
            const selected = data.preferences['identity.professional_title']?.value === item.title;
            return <div key={item.title} className={'flex flex-col rounded-xl border-2 p-4 ' + (selected ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-2 flex-1 text-xs leading-5 text-muted-foreground">{item.evidence}</p>
              <button type="button" aria-label={'Choose professional title: ' + item.title} aria-pressed={selected}
                className={'mt-3 rounded-lg border px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' + (selected ? 'border-primary bg-primary text-primary-foreground' : 'border-primary text-primary hover:bg-primary/10')}
                onClick={() => {
                  markEdited(); setData(current => ({ ...current, preferences: { ...current.preferences, 'identity.professional_title': { scope: 'profile_preference', source: 'user', value: item.title, updated_at: new Date().toISOString() } } }));
                  setMessage('Title selected. Save Preferences to keep this choice.');
                }}>{selected ? 'Selected' : 'Choose this title'}</button>
            </div>;
          })}
        </div>
        {!suggestProfessionalTitles(data.professional_titles || [], currentRole || '', currentPosting, reviewedExperience).length && <p className="mt-3 text-sm">No matching target evidence yet. Add your titles and the opportunity posting.</p>}
      </section>
      <section className="mt-5 rounded-xl border border-border p-4" aria-label="Application network recovery">
        <h3 className="font-display text-xl">Application network recovery</h3>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" data-testid="vpn-recovery-assist-toggle"
            checked={data.vpn_recovery_assist_enabled !== false}
            onChange={event => {
              markEdited();
              setData(current => ({ ...current, vpn_recovery_assist_enabled: event.target.checked }));
            }} />
          Offer VPN compatibility recovery when an employer application is blocked
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          On by default. Save Preferences to keep your choice. This preference does not disconnect your VPN.
          A retry requires a verified provider connection, supported restoration, a safe kill-switch check,
          and your explicit approval before temporary disconnection. Connection protection is restored
          after the bounded retry, not left off while you complete an interview or application.
        </p>
      </section>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="block w-full">New professional title<input className="mt-1 block w-full rounded border border-input bg-background p-2" aria-label="New professional title" maxLength={160} value={newTitle} onChange={event => setNewTitle(event.target.value)} /></label>
        <button type="button" disabled={!newTitle.trim()} onClick={() => {
          const variants = expandProfessionalTitles(newTitle.split(';'));
          const titles = [...new Set([...(data.professional_titles || []), ...variants])];
          if (!variants.length || titles.length > 100) { setMessage('Use up to four titles separated by semicolons; the saved list supports 100 choices.'); return; }
          markEdited(); setData(current => ({ ...current, professional_titles: titles }));
          setMessage('Title combinations added. Select the professional title you want to use, then Save Preferences.');
        }}>Add title combinations</button>
        <p>Enter up to four professional titles separated by semicolons to generate selectable combinations.</p>
        <button type="button" disabled={!newTitle.trim()} onClick={() => {
          const title = newTitle.trim(); markEdited();
          setData(current => ({ ...current, professional_titles: [...new Set([...(current.professional_titles || []), title])], preferences: { ...current.preferences, 'identity.professional_title': { scope: 'profile_preference', source: 'user', value: title, updated_at: new Date().toISOString() } } }));
          setNewTitle(''); setMessage('Professional title added and selected. Save Preferences to keep it.');
        }}>Add professional title</button>
        {currentRole && <button type="button" onClick={() => {
          markEdited();
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
            setData(parsed); markEdited(); setMessage('Import staged for review. Choose Save Preferences to persist it.');
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
