import type { AssistProfile } from '@/lib/assist-contract';
import { CareerRecords } from './career-records';
import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { ArrowUpRight, CheckCircle2, FileUp, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { Application, Profile } from '@/lib/storage';
import { ApplicationPreferences } from './application-preferences';
import { connectionFromSnapshot, isSubmittedLocked, mergeTrackerIntoApplications, parseTrackerSnapshot, selectNextActionableOpportunity, trackerOpportunityId } from '@/lib/tracker-bridge';
import { consumeManagedLaunchIntent } from '@/lib/managed-launch-intent';

const API = '/__escapehatch/managed-assist';

type PreparationResult = {
  state: 'REVIEW_READY' | 'REVIEW_REQUIRED' | 'BLOCKED';
  code: string;
  pagesPrepared: number;
  intermediateSteps: number;
  finalActionActivated: false;
  evidenceRefs: string[];
  pendingManual: string[];
};

type ServerResponse = {
  ok: boolean;
  state?: string;
  browserOpen?: boolean;
  error?: string;
  filled?: string[];
  recorded?: string[];
  skipped?: string[];
  attachments?: Record<string, string>;
  requiresOperatorSubmission?: boolean;
  preparation?: PreparationResult;
  preparationState?: PreparationResult['state'] | null;
  preparationCode?: string | null;
  pagesPrepared?: number;
  intermediateSteps?: number;
  pendingManual?: string[];
};

async function request(endpoint: string, body?: object): Promise<ServerResponse> {
  const response = await fetch(API + endpoint, body ? {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
    body: JSON.stringify(body),
  } : { credentials: 'same-origin' });
  const json = await response.json() as ServerResponse;
  if (!response.ok || !json.ok) throw new Error(json.error || 'Local browser action failed.');
  return json;
}

async function privatePdf(file: File | null) {
  if (!file) return null;
  if (!/\.pdf$/i.test(file.name) || file.size > 5 * 1024 * 1024 || file.size === 0) {
    throw new Error('Choose a PDF smaller than 5 MB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('The selected file is not a PDF.');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return { name: file.name, base64: btoa(binary) };
}

const titles: Record<string, string> = {
  idle: 'Ready to launch',
  browser_open: 'Chrome opened — verify the application',
  application_open_review_required: 'Application opened — sign in if requested',
  application_form_open_review_required: 'Application form opened — ready to fill',
  browser_open_navigation_unverified: 'Chrome opened — verify the URL manually',
  fields_filled_review_required: 'Known fields filled — review the page',
  attachments_staged_review_required: 'File controls populated — verify attachments',
  browser_closed: 'Managed browser closed',
  REVIEW_READY: 'REVIEW_READY — final Submit is operator-only',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED — resolve gates before continuing',
  BLOCKED: 'BLOCKED — fail closed; re-inspect before retry',
};

export function ManagedBrowserAssist({ profile, setProfile, applications, setApplications, assistProfile, setAssistProfile }: { assistProfile: AssistProfile; setAssistProfile: Dispatch<SetStateAction<AssistProfile>>; profile: Profile; setProfile: Dispatch<SetStateAction<Profile>>; applications: Application[]; setApplications: Dispatch<SetStateAction<Application[]>> }) {
  // Never silently reuse an earlier/submitted employer as the next application.
  const [url, setUrl] = useState('');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('');
  const operatorSelected = useRef(false);
  const autoLaunchAttempted = useRef(false);
  const [explicitLaunchId] = useState(() => consumeManagedLaunchIntent(window.sessionStorage));
  const [verifiedNextReadyId, setVerifiedNextReadyId] = useState<string | null>(null);
  const [trackerChecked, setTrackerChecked] = useState(false);
  const [runtimeChecked, setRuntimeChecked] = useState(false);
  const [resume, setResume] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [recordMilitary, setRecordMilitary] = useState(false);
  const [preferencesRefresh, setPreferencesRefresh] = useState(0);
  const [recordingMessage, setRecordingMessage] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);
  const [preparation, setPreparation] = useState<PreparationResult | null>(null);

  useEffect(() => {
    let active = true;
    // A direct visit to /assist must receive the same validated tracker state as Home.
    fetch('/__escapehatch/tracker/status', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() as Promise<{ connection?: string; snapshot?: unknown }> : null)
      .then((value) => {
        if (!active) return;
        if (value?.connection === 'CONNECTED') {
          const snapshot = parseTrackerSnapshot(value.snapshot);
          if (snapshot && connectionFromSnapshot(snapshot).status === 'CONNECTED') {
            setApplications((current) => mergeTrackerIntoApplications(current, snapshot));
            const next = selectNextActionableOpportunity(snapshot);
            if (next?.applyUrl && !isSubmittedLocked(next)) setVerifiedNextReadyId(trackerOpportunityId(next));
          }
        }
        setTrackerChecked(true);
      }).catch(() => {
        if (active) setTrackerChecked(true);
        // Local selection remains available; one-click automatic launch requires fresh source evidence.
      });
    return () => { active = false; };
  }, [setApplications]);

  useEffect(() => {
    if (operatorSelected.current) return;
    const requestedId = new URLSearchParams(window.location.search).get('opportunityId');
    const permitted = (item: Application) => !!item.url && item.status !== 'applied' && item.status !== 'closed';
    const requested = applications.find((item) => item.id === requestedId && permitted(item));
    const ready = applications.find((item) => permitted(item) &&
      item.id.startsWith('tracker-') && /provider status:\s*ready to apply/i.test(item.notes) &&
      /Applied\? unchecked/i.test(item.notes));
    const next = requested || ready;
    if (next) {
      setSelectedOpportunityId(next.id);
      setUrl(next.url);
    }
  }, [applications]);

  useEffect(() => {
    let active = true;
    request('/status').then((result) => {
      if (active) {
        setStatus(result.state || 'idle');
        setBrowserOpen(Boolean(result.browserOpen));
        if (result.preparationState) {
          setPreparation({
            state: result.preparationState,
            code: result.preparationCode || '',
            pagesPrepared: result.pagesPrepared || 0,
            intermediateSteps: result.intermediateSteps || 0,
            finalActionActivated: false,
            evidenceRefs: [],
            pendingManual: result.pendingManual || [],
          });
        }
      }
    }).catch(() => { if (active) setMessage('Managed browser is unavailable until EscapeHatch is started with its Windows launcher.'); })
      .finally(() => { if (active) setRuntimeChecked(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!explicitLaunchId || autoLaunchAttempted.current || !trackerChecked || !runtimeChecked) return;
    const queryId = new URLSearchParams(window.location.search).get('opportunityId');
    if (queryId !== explicitLaunchId || verifiedNextReadyId !== explicitLaunchId) {
      autoLaunchAttempted.current = true;
      setMessage('Automatic launch paused: the requested opportunity is no longer the freshly verified next Ready-to-Apply job. Review the selection before launching.');
      return;
    }
    const selected = applications.find((item) => item.id === explicitLaunchId);
    if (!selected || !selected.url || selected.status === 'applied' || selected.status === 'closed') {
      autoLaunchAttempted.current = true;
      setMessage('Automatic launch stopped: no active matching opportunity was available.');
      return;
    }
    // Selection is populated in a separate effect. Never launch a stale or other employer URL.
    if (selectedOpportunityId !== selected.id || url !== selected.url) return;
    if (operatorSelected.current) {
      autoLaunchAttempted.current = true;
      setMessage('Automatic launch cancelled because the opportunity selection was changed.');
      return;
    }
    autoLaunchAttempted.current = true;
    void run('launch');
  }, [applications, explicitLaunchId, runtimeChecked, trackerChecked, selectedOpportunityId, url, verifiedNextReadyId]);

  useEffect(() => {
    if (!recordMilitary || !browserOpen) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function record() {
      try {
        const result = await request('/capture-military', {});
        if (cancelled) return;
        if (result.recorded?.length) {
          setPreferencesRefresh(value => value + 1);
          setRecordingMessage('Saved your selected veteran/service answer on this computer.');
        } else setRecordingMessage('Listening for a recognized native veteran/service select or radio answer. Unknown or ambiguous fields remain unsaved.');
        timer = setTimeout(record, 1500);
      } catch {
        if (!cancelled) { setRecordMilitary(false); setRecordingMessage('Recording paused: verify the managed application origin and restart recording.'); }
      }
    }
    void record();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [recordMilitary, browserOpen]);

  async function run(action: 'launch' | 'fill' | 'attach' | 'prepare') {
    setBusy(true);
    setMessage('');
    try {
      let body: object;
      if (action === 'launch') {
        setRecordMilitary(false);
        const opportunity = applications.find((item) => item.id === selectedOpportunityId && item.url === url);
        if (applications.some((item) => item.url === url && (item.status === 'applied' || item.status === 'closed'))) {
          throw new Error('This opportunity is already applied or closed. Do not reapply.');
        }
        body = { url, opportunityId: opportunity?.id || '' };
      } else if (action === 'fill') body = { profile, careerProfile: assistProfile, targetRole: applications.find(item => item.id === selectedOpportunityId)?.role || '' };
      else if (action === 'attach') body = { resume: await privatePdf(resume), cover: await privatePdf(cover) };
      else {
        // Prepare uses a trusted adapter registry supplied by the operator/runtime host.
        // Without registry evidence the control plane fails closed — never invent consequences.
        const registryRaw = window.localStorage.getItem('escapehatch.trustedAdapterRegistry.v1');
        if (!registryRaw) throw new Error('Trusted adapter registry required before Prepare. Load a reviewed registry first.');
        const opportunity = applications.find((item) => item.id === selectedOpportunityId && item.url === url &&
          item.status !== 'applied' && item.status !== 'closed');
        if (!opportunity) throw new Error('Select an active saved opportunity before preparing this application.');
        body = {
          profile,
          authorization: {
            sessionId: 'cockpit-' + opportunity.id,
            opportunityId: opportunity.id,
            navigationEnabled: true,
            allowedEffectClasses: ['LOCAL_STEP_ONLY', 'DRAFT_WRITE_AND_ADVANCE'],
            allowedDataCategories: ['synthetic_cover_note'],
          },
          adapterRegistry: JSON.parse(registryRaw) as object,
        };
      }
      let result = await request('/' + action, body);
      let autoFillMessage = '';
      if (action === 'launch' && result.state === 'application_form_open_review_required') {
        // Explicit operator launch authorizes the existing bounded DOM filler, not navigation or submission.
        // If this is a landing/login page, no fill occurs; the manual Fill control remains available.
        try {
          const filled = await request('/fill', { profile, careerProfile: assistProfile, targetRole: applications.find(item => item.id === selectedOpportunityId)?.role || '' });
          result = filled;
          autoFillMessage = 'Managed Chrome opened the application form. ' +
            (filled.filled?.length ? 'Filled: ' + filled.filled.join(', ') + '. ' : 'No approved fields were filled. ') +
            (filled.skipped?.length ? 'Skipped: ' + filled.skipped.join(', ') + '. ' : '') +
            'Review the employer form before continuing.';
        } catch (error) {
          autoFillMessage = 'Managed Chrome opened, but guarded autofill was blocked: ' +
            (error instanceof Error ? error.message : 'Unknown error') + '. Use Fill after reviewing the page.';
        }
      }
      setStatus(result.state || 'idle');
      if (result.preparation) setPreparation(result.preparation);
      if (action === 'launch') {
        setBrowserOpen(true);
        setPreparation(null);
        setApplications((items) => {
          const existing = items.find((item) => item.id === selectedOpportunityId && item.url === url);
          if (existing) return items.map((item) => item.id === existing.id && item.status === 'saved'
            ? { ...item, status: 'preparing', updatedAt: new Date().toISOString() }
            : item);
          return items; // A custom URL never creates an unverified employer ledger record.
        });
      }
      if (action === 'fill') setMessage(
        (result.filled?.length ? 'Filled: ' + result.filled.join(', ') + '. ' : 'No fields filled. ') +
        (result.skipped?.length ? 'Skipped: ' + result.skipped.join(', ') + '. ' : '') +
        'Review before continuing on the employer website.'
      );
      if (action === 'attach') setMessage(
        Object.entries(result.attachments || {}).map(([kind, state]) => kind + ': ' + state.replaceAll('_', ' ')).join(' · ') +
        '. Confirm the employer form accepted each document.'
      );
      if (action === 'launch') setMessage(autoFillMessage || 'A separate managed Chrome window is opening. Authentication stays under your control.');
      if (action === 'prepare' && result.preparation) {
        setMessage(
          result.preparation.state + ' (' + result.preparation.code + '). Pages prepared: ' +
          result.preparation.pagesPrepared + '; intermediate steps: ' + result.preparation.intermediateSteps +
          '. Final submission remains operator-only.'
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const handleUrl = (event: ChangeEvent<HTMLInputElement>) => {
    operatorSelected.current = true;
    setSelectedOpportunityId('');
    setUrl(event.target.value);
  };
  const button = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <><ApplicationPreferences currentRole={applications.find(item => item.id === selectedOpportunityId)?.role} currentPosting={applications.find(item => item.id === selectedOpportunityId)?.jobDescription || ''} reviewedExperience={assistProfile.experience.filter(item => item.id === assistProfile.selectedExperienceId).map(item => item.title + ' ' + item.bullets.join(' ')).join(' ')} refresh={preferencesRefresh} onEdit={() => setRecordMilitary(false)} onLoad={data => setProfile(current => {
      const next = { ...current };
      for (const key of Object.keys(current) as (keyof Profile)[]) {
        const id = 'identity.' + (key === 'linkedin_url' ? 'linkedin' : key === 'name_prefix' ? 'title' : key);
        const value = data.preferences[id]?.value;
        if (!next[key] && value) next[key] = value;
      }
      return next;
    })} /><CareerRecords profile={assistProfile} setProfile={setAssistProfile} opportunity={applications.find(item => item.id === selectedOpportunityId)} setApplications={setApplications} /><section className="mb-6 rounded-2xl border border-primary/25 bg-card p-5 shadow-sm sm:p-7" data-testid="managed-browser-assist">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Native application launch</p>
          <h2 className="mt-2 font-display text-3xl">Apply from EscapeHatch.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Open a job in managed Chrome, fill permitted contact fields, and attach PDFs from here.
            No unpacked extension or terminal steps. Your browser stays visible and you control every submission.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
          <ShieldCheck size={15} /> Manual final Submit
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          {applications.some((application) => application.url) && (
            <label className="block text-xs font-bold text-muted-foreground">
              Saved opportunity
              <select className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm"
                value={selectedOpportunityId}
                onChange={(event) => {
                  const opportunity = applications.find((item) => item.id === event.target.value);
                  operatorSelected.current = true;
                  setSelectedOpportunityId(opportunity?.id || '');
                  setUrl(opportunity?.url || '');
                }}>
                <option value="">Current / custom URL</option>
                {applications.filter((item) => item.url && item.status !== 'applied' && item.status !== 'closed').map((item) => <option key={item.id} value={item.id}>{item.company} — {item.role}</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs font-bold text-muted-foreground">
            Application URL
            <input type="url" className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm"
              value={url} onChange={handleUrl} aria-label="Application URL" data-testid="managed-job-url" />
          </label>
        </div>
        <div className="flex flex-col justify-end gap-2">
          <button className={button} type="button" disabled={busy || !url.trim()} onClick={() => void run('launch')} data-testid="button-managed-launch">
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUpRight size={16} />}
            {browserOpen ? 'Open another job' : 'Launch application'}
          </button>
          <a href={url} target="_blank" rel="noreferrer noopener" className="text-center text-xs text-muted-foreground underline">Open in ordinary browser instead</a>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-secondary/55 p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="text-primary" size={16} />
          {titles[status] || status.replaceAll('_', ' ')}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Your Chrome sign-in remains private. Fill and Attach stay page-local. Prepare advances only through
          trusted adapter evidence under the managed-browser progression contract; the MV3 extension still
          forbids automatic Next/Submit. A button labeled Submit may be intermediate or terminal — the label alone never authorizes a click.
        </p>
        {preparation && (
          <div className="mt-3 rounded-lg border border-border bg-card p-3 text-xs leading-5"
            data-testid="managed-preparation-state" data-preparation-state={preparation.state}>
            <p className="font-bold">{preparation.state}</p>
            <p className="mt-1 text-muted-foreground">
              code={preparation.code} · pages={preparation.pagesPrepared} · intermediates={preparation.intermediateSteps} ·
              finalActionActivated=false
              {preparation.pendingManual.length ? ' · pending: ' + preparation.pendingManual.join(', ') : ''}
            </p>
          </div>
        )}
        <label className="mt-3 block text-sm">
          <input type="checkbox" checked={recordMilitary} disabled={!browserOpen || busy}
            onChange={event => setRecordMilitary(event.target.checked)} /> Record my veteran/service answers from this managed application
        </label>
        <p className="text-xs">While enabled and this page stays open, selected native dropdown/radio answers are saved locally for reuse. Protected-veteran status and military service are separate facts. Other fields and custom widgets are not recorded.</p>
        <p role="status" className="text-xs">{recordingMessage}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={secondary} disabled={busy || !browserOpen} onClick={() => void run('fill')} data-testid="button-managed-fill">
            Fill approved profile and answers
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-bold">
            <FileUp size={15} /> {resume ? 'Resume selected' : 'Choose résumé PDF'}
            <input className="sr-only" type="file" accept=".pdf,application/pdf" onChange={(event) => setResume(event.target.files?.[0] || null)} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-bold">
            <FileUp size={15} /> {cover ? 'Letter selected' : 'Choose cover PDF'}
            <input className="sr-only" type="file" accept=".pdf,application/pdf" onChange={(event) => setCover(event.target.files?.[0] || null)} />
          </label>
          <button type="button" className={secondary} disabled={busy || !browserOpen || (!resume && !cover)}
            onClick={() => void run('attach')} data-testid="button-managed-attach">
            Attach selected PDFs
          </button>
          <button type="button" className={button} disabled={busy || !browserOpen}
            onClick={() => void run('prepare')} data-testid="button-managed-prepare">
            Prepare to final review
          </button>
        </div>
      </div>
      {message && <p role="status" aria-live="polite" data-testid="managed-browser-feedback"
        className="mt-4 rounded-xl border border-border p-3 text-sm leading-6">{message}</p>}
      <p className="mt-4 text-xs text-muted-foreground">
        Files are transferred only to your loopback runtime on your explicit click, held in memory, and never committed.
        A file input being populated does not prove the employer accepted an upload.
      </p>
    </section></>
  );
}
