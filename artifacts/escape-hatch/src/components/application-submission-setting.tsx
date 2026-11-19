import { useEffect, useState } from 'react';
import type { SavedSubmissionPolicy, SubmissionDisposition, SubmissionMode } from '../../application-submission-policy';

const endpoint = '/__escapehatch/managed-assist/submission-policy';

export const submissionDispositionText: Record<SubmissionDisposition, string> = {
  REVIEW_BEFORE_SUBMIT: 'Your setting holds the application for review before Submit.',
  INDEED_AUTHORIZED_TOOL_REQUIRED: 'Indeed Apply requires an Indeed-authorized submission route.',
  PREPARATION_INCOMPLETE: 'The application still has preparation steps to resolve.',
  PROVIDER_AUTOMATION_UNAVAILABLE: 'This provider has no authorized automatic submission route. Review before submitting.',
  SUBMISSION_SETTING_UNAVAILABLE: 'The saved setting could not be verified. Review before submitting.',
};

async function requestPolicy(mode?: SubmissionMode): Promise<SavedSubmissionPolicy> {
  const response = await fetch(endpoint, mode ? {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
    body: JSON.stringify({ mode }),
  } : { credentials: 'same-origin' });
  const body = await response.json();
  if (!response.ok || !body.ok || !body.policy) throw new Error('submission_policy_unavailable');
  return body.policy;
}

export function ApplicationSubmissionSetting() {
  const [policy, setPolicy] = useState<SavedSubmissionPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void requestPolicy().then(value => {
      if (active) setPolicy(value);
    }).catch(() => {
      if (active) setError('The submission setting is unavailable on this runtime.');
    });
    return () => { active = false; };
  }, []);

  async function save(mode: SubmissionMode) {
    setBusy(true);
    setError('');
    try {
      setPolicy(await requestPolicy(mode));
    } catch {
      setError('The change could not be verified. The setting shown is the last verified choice.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="mb-5 min-w-0 rounded-xl border border-border bg-card p-4" aria-label="Application submission">
    <label className="block text-sm font-semibold" htmlFor="application-submission-mode">Application submission</label>
    <select id="application-submission-mode" value={policy?.mode || 'REVIEW_BEFORE_SUBMIT'}
      disabled={!policy || busy} onChange={event => void save(event.target.value as SubmissionMode)}
      aria-describedby="application-submission-mode-status"
      className="mt-2 w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <option value="REVIEW_BEFORE_SUBMIT">Review before submitting</option>
      <option value="AUTO_SUBMIT_WHERE_SUPPORTED">Submit automatically where supported</option>
    </select>
    <p id="application-submission-mode-status" role="status" className="mt-2 text-xs text-muted-foreground">
      {error || (busy ? 'Saving submission setting…'
        : !policy ? 'Loading submission setting…'
        : policy.storage === 'unavailable' ? 'The saved setting could not be read. Choose a mode to save it again.'
        : policy.mode === 'AUTO_SUBMIT_WHERE_SUPPORTED'
          ? 'Automatic mode is saved. This version has no authorized automatic submission providers.'
          : 'EscapeHatch holds prepared applications for your review.')}
    </p>
  </section>;
}
