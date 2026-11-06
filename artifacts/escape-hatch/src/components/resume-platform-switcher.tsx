import { useEffect, useState } from 'react';

const API = '/__escapehatch/managed-assist/resume-selection';

type ResumeChoice = {
  resumeId: string;
  tier: 'canonical' | 'domain' | 'job';
  current: boolean;
};

type Listed = {
  ok?: boolean;
  choices?: ResumeChoice[];
  error?: string;
};

type SelectResult = {
  ok?: boolean;
  selected?: boolean;
  requiresConsent?: boolean;
  disclosure?: string | null;
  decision?: { action: string; reason: string; candidateId: string | null };
  error?: string;
};

export function ResumePlatformSwitcher({
  opportunityId,
  url,
  refresh = 0,
  disabled = false,
}: {
  opportunityId?: string;
  url?: string;
  refresh?: number;
  disabled?: boolean;
}) {
  const [listed, setListed] = useState<Listed | null>(null);
  const [message, setMessage] = useState('Loading approved résumé choices…');
  const [busy, setBusy] = useState(false);
  const [pendingConsent, setPendingConsent] = useState<string | null>(null);
  const [registerId, setRegisterId] = useState('');
  const [registerTier, setRegisterTier] = useState<'canonical' | 'domain'>('canonical');
  const [domainTags, setDomainTags] = useState('technology');
  const [parentResumeId, setParentResumeId] = useState('master');

  async function load() {
    try {
      const response = await fetch(API, { credentials: 'same-origin', cache: 'no-store' });
      const json = await response.json() as Listed;
      if (!response.ok) {
        setListed(null);
        setMessage(json.error === 'workspace_owner_required'
          ? 'Recover your workspace before choosing a résumé.'
          : 'Résumé choices unavailable. Existing private data was preserved.');
        return;
      }
      setListed(json);
      setMessage(json.choices?.length
        ? 'Choose an approved résumé below.'
        : 'Register an approved canonical master (and optional domain variants) to enable switching.');
    } catch {
      setListed(null);
      setMessage('Résumé choices unavailable. Existing private data was preserved.');
    }
  }

  useEffect(() => { void load(); }, [refresh]);

  async function select(resumeId: string, consentAccountWideReplacement: boolean) {
    setBusy(true);
    try {
      const response = await fetch(API + '/select', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-escapehatch-operator-action': 'confirmed',
        },
        body: JSON.stringify({
          resumeId,
          consentAccountWideReplacement,
          opportunityId: opportunityId || undefined,
          url: url || undefined,
        }),
      });
      const json = await response.json() as SelectResult;
      if (!response.ok) throw new Error(json.error || 'select_failed');
      if (json.requiresConsent && json.disclosure) {
        setPendingConsent(resumeId);
        setMessage('Review where this choice will be used.');
        return;
      }
      setPendingConsent(null);
      await load();
      setMessage(json.selected
        ? `Selected ${resumeId}. Saved in EscapeHatch. Indeed account status is unverified.`
        : `Selection not applied (${json.decision?.reason || 'review required'}). Unrelated applications stay available.`);
    } catch {
      setMessage('Résumé switch did not complete. Existing selection and queue were preserved.');
    } finally {
      setBusy(false);
    }
  }

  async function register(file: File) {
    setBusy(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (const byte of buffer) binary += String.fromCharCode(byte);
      const response = await fetch(API + '/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-escapehatch-operator-action': 'confirmed',
        },
        body: JSON.stringify({
          resumeId: registerId.trim() || (registerTier === 'canonical' ? 'master' : 'domain'),
          tier: registerTier,
          revision: new Date().toISOString().slice(0, 10),
          domainTags: registerTier === 'domain' ? domainTags.split(/[,\s]+/).filter(Boolean) : undefined,
          parentResumeId: registerTier === 'domain' ? parentResumeId.trim() : undefined,
          file: {
            name: file.name,
            mimeType: 'application/pdf',
            base64: btoa(binary),
          },
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'register_failed');
      setMessage('Approved résumé registered privately for this owner. Select it below to switch.');
      setRegisterId('');
      await load();
    } catch {
      setMessage('Registration failed. Existing approved résumés were preserved.');
    } finally {
      setBusy(false);
    }
  }

  const choices = listed?.choices || [];

  return (
    <section
      className="mt-5 rounded-xl border border-border bg-card p-4"
      aria-label="Account-wide résumé switcher"
      data-testid="resume-platform-switcher"
    >
      <h3 className="font-display text-xl">Indeed résumé switcher</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Choose the approved résumé EscapeHatch should use when preparing Indeed applications.
        Your choice carries across jobs until you change it.
      </p>
      <div className="mt-3 border-l-2 border-border pl-3 text-sm" data-testid="resume-switcher-slot">
        <p className="font-medium">Indeed account résumé · Unverified</p>
        <p className="text-muted-foreground">Manage the shared copy in your Indeed profile. EscapeHatch cannot verify it yet.</p>
      </div>
      {choices.length > 0 ? (
        <ul className="mt-3 grid gap-2" data-testid="resume-switcher-choices">
          {choices.map(choice => (
            <li key={choice.resumeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3">
              <div>
                <p className="text-sm font-semibold">{choice.resumeId}</p>
                <p className="text-xs text-muted-foreground">
                  {choice.tier === 'canonical' ? 'Master résumé' : 'Domain résumé'}
                </p>
              </div>
              <button
                type="button"
                className="rounded border border-primary px-3 py-2 text-sm font-medium text-primary disabled:opacity-50"
                disabled={disabled || busy || choice.current || pendingConsent !== null}
                data-testid={'resume-switcher-select-' + choice.resumeId}
                onClick={() => void select(choice.resumeId, false)}
              >
                {choice.current ? 'Selected' : 'Use this résumé'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No approved reusable résumés are registered yet for this owner.</p>
      )}
      {pendingConsent && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid="resume-switcher-consent">
          <p className="text-sm">Save {pendingConsent} for future Indeed application preparation.
            To replace the shared account résumé, upload the approved PDF in your Indeed profile.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={disabled || busy}
              data-testid="resume-switcher-confirm-replacement"
              autoFocus
              onClick={() => void select(pendingConsent, true)}
            >
              Save choice
            </button>
            <button
              type="button"
              className="rounded border border-border px-3 py-2 text-sm"
              disabled={busy}
              onClick={() => setPendingConsent(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <details className="mt-4 rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Register an approved résumé PDF</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Private owner-bound catalog only. Already-approved content does not need a fresh editorial review when selected.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Résumé id
            <input className="mt-1 block w-full rounded border border-input bg-background p-2" value={registerId}
              onChange={event => setRegisterId(event.target.value)} placeholder="master or it-domain" />
          </label>
          <label className="text-sm">Tier
            <select className="mt-1 block w-full rounded border border-input bg-background p-2" value={registerTier}
              onChange={event => setRegisterTier(event.target.value as 'canonical' | 'domain')}>
              <option value="canonical">canonical master</option>
              <option value="domain">domain</option>
            </select>
          </label>
          {registerTier === 'domain' && <>
            <label className="text-sm">Domain tags
              <input className="mt-1 block w-full rounded border border-input bg-background p-2" value={domainTags}
                onChange={event => setDomainTags(event.target.value)} />
            </label>
            <label className="text-sm">Parent master id
              <input className="mt-1 block w-full rounded border border-input bg-background p-2" value={parentResumeId}
                onChange={event => setParentResumeId(event.target.value)} />
            </label>
          </>}
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded border border-border px-3 py-2 text-sm">
          Choose PDF
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            disabled={disabled || busy}
            data-testid="resume-switcher-register-file"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void register(file);
            }}
          />
        </label>
      </details>
      <p role="status" className="mt-3 text-sm" data-testid="resume-switcher-status">{message}</p>
    </section>
  );
}
