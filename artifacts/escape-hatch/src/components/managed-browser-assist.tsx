import { useEffect, useState, type ChangeEvent } from 'react';
import { ArrowUpRight, CheckCircle2, FileUp, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { Application, Profile } from '@/lib/storage';

const MANDIANT = 'https://www.google.com/about/careers/applications/jobs/results/132629079244317382-project-manager-americas-pmo-mandiant-consulting';
const API = '/__escapehatch/managed-assist';

type ServerResponse = {
  ok: boolean;
  state?: string;
  browserOpen?: boolean;
  error?: string;
  filled?: string[];
  skipped?: string[];
  attachments?: Record<string, string>;
  requiresOperatorSubmission?: boolean;
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
  browser_open_navigation_unverified: 'Chrome opened — verify the URL manually',
  fields_filled_review_required: 'Known fields filled — review the page',
  attachments_staged_review_required: 'File controls populated — verify attachments',
  browser_closed: 'Managed browser closed',
};

export function ManagedBrowserAssist({ profile, applications }: { profile: Profile; applications: Application[] }) {
  const [url, setUrl] = useState(MANDIANT);
  const [resume, setResume] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);

  useEffect(() => {
    let active = true;
    request('/status').then((result) => {
      if (active) { setStatus(result.state || 'idle'); setBrowserOpen(Boolean(result.browserOpen)); }
    }).catch(() => { if (active) setMessage('Managed browser is unavailable until EscapeHatch is started with its Windows launcher.'); });
    return () => { active = false; };
  }, []);

  async function run(action: 'launch' | 'fill' | 'attach') {
    setBusy(true);
    setMessage('');
    try {
      let body: object;
      if (action === 'launch') body = { url };
      else if (action === 'fill') body = { profile };
      else body = { resume: await privatePdf(resume), cover: await privatePdf(cover) };
      const result = await request('/' + action, body);
      setStatus(result.state || 'idle');
      if (action === 'launch') setBrowserOpen(true);
      if (action === 'fill') setMessage(
        (result.filled?.length ? 'Filled: ' + result.filled.join(', ') + '. ' : 'No fields filled. ') +
        (result.skipped?.length ? 'Skipped: ' + result.skipped.join(', ') + '. ' : '') +
        'Review before continuing on the employer website.'
      );
      if (action === 'attach') setMessage(
        Object.entries(result.attachments || {}).map(([kind, state]) => kind + ': ' + state.replaceAll('_', ' ')).join(' · ') +
        '. Confirm the employer form accepted each document.'
      );
      if (action === 'launch') setMessage('A separate managed Chrome window is opening. Authentication stays under your control.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const handleUrl = (event: ChangeEvent<HTMLInputElement>) => setUrl(event.target.value);
  const button = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <section className="mb-6 rounded-2xl border border-primary/25 bg-card p-5 shadow-sm sm:p-7" data-testid="managed-browser-assist">
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
                value={applications.find((application) => application.url === url)?.id || ''}
                onChange={(event) => {
                  const opportunity = applications.find((item) => item.id === event.target.value);
                  if (opportunity?.url) setUrl(opportunity.url);
                }}>
                <option value="">Current / custom URL</option>
                {applications.filter((item) => item.url).map((item) => <option key={item.id} value={item.id}>{item.company} — {item.role}</option>)}
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
          Your Chrome sign-in remains private. On each new employer page, choose Fill again. EscapeHatch never clicks Submit, Next, or attests for you.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={secondary} disabled={busy || !browserOpen} onClick={() => void run('fill')} data-testid="button-managed-fill">
            Fill approved contact
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
        </div>
      </div>
      {message && <p role="status" aria-live="polite" data-testid="managed-browser-feedback"
        className="mt-4 rounded-xl border border-border p-3 text-sm leading-6">{message}</p>}
      <p className="mt-4 text-xs text-muted-foreground">
        Files are transferred only to your loopback runtime on your explicit click, held in memory, and never committed.
        A file input being populated does not prove the employer accepted an upload.
      </p>
    </section>
  );
}
