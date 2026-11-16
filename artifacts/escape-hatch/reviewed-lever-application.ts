/** Local-agent adapter for an already reviewed application. Uses the same managed API as Assist. */
import { pathToFileURL } from 'node:url';
import { readWorkspace } from './workspace-file.ts';
import { APPLICATIONS_KEY, parseApplicationsStorage } from './src/lib/storage.ts';
import { leverApplicationKey, savedLeverApplicationKey } from './src/lib/application-puzzle.ts';
import { parseSubmissionEvidence, submissionMatchesApplication, type SubmissionEvidence } from './src/lib/submission-reconciliation.ts';
import type { LeverReceipt } from './lever-attempt-receipts.ts';

type RequestBody = Record<string, string | boolean>;
type Reply = { ok?: boolean; error?: string; attemptReceipt?: LeverReceipt; receipts?: LeverReceipt[];
  listeners?: { recordingAnswers?: boolean; submission?: { state?: string }; receipts?: SubmissionEvidence[] };
  answerSync?: { status: string; updated: number; unchanged: number; skipped: number }; blockers?: string[];
  employerChallenge?: boolean;
  filled?: string[]; skipped?: string[];
  package?: { documents: { resume?: { reviewedAt?: string; sha256?: string } } };
};
type LocalOptions = { livePageUrl: string; port: number; submitReviewedOnce: boolean; retryUnconfirmedOnce?: boolean };
type Receipt = { state: string; [key: string]: unknown };
const FAILURES = ['LEVER_VERIFICATION_ERROR', 'VALIDATION_FAILED'];

export async function completeReviewedLeverApplication({ livePageUrl, port, submitReviewedOnce, retryUnconfirmedOnce = false }: LocalOptions): Promise<Receipt> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INSTALLED_ASSIST_PORT_REQUIRED');
  const key = leverApplicationKey(livePageUrl);
  if (!key) throw new Error('EXACT_OPEN_LEVER_APPLICATION_URL_REQUIRED');
  const origin = 'http://127.0.0.1:' + port;
  const jobs = parseApplicationsStorage((await readWorkspace())?.workspace.values[APPLICATIONS_KEY]);
  const candidates = jobs?.filter(job => savedLeverApplicationKey(job.url) === key);
  if (candidates?.length !== 1) throw new Error('ONE_SAVED_OPPORTUNITY_REQUIRED');
  const [job] = candidates;
  const scope = { opportunityId: job.id, url: job.url, livePageUrl };
  const query = '?' + new URLSearchParams({ opportunityId: job.id, url: job.url });
  const request = async (route: string, body?: RequestBody): Promise<Reply> => {
    const response = await fetch(origin + '/__escapehatch/managed-assist' + route, {
      redirect: 'error',
      ...(body ? { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
        body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    return response.json() as Promise<Reply>;
  };
  const history = async () => {
    const journal = await request('/lever-attempt-receipts' + query);
    if (!journal.ok || !Array.isArray(journal.receipts)) throw new Error('LEVER_ATTEMPT_HISTORY_UNAVAILABLE');
    return journal.receipts.find(row => row.action === 'SUBMIT' && row.dispatch !== 'NOT_ATTEMPTED');
  };
  const proof = (reply: Reply) => reply.listeners?.receipts?.map(parseSubmissionEvidence).find(
    row => row?.opportunityId === job.id && submissionMatchesApplication(row, job.url));
  const finish = (evidence: SubmissionEvidence, attempt?: LeverReceipt, answerSync?: Reply['answerSync']) => ({
    state: 'EMPLOYER_CONFIRMED', confirmationId: evidence.attemptId, observedAt: evidence.observedAt, attempt, answerSync,
  });
  const status = await request('/status');
  if (!status.ok) throw new Error('MANAGED_ASSIST_STATUS_UNAVAILABLE');
  const previous = await history();
  const existing = proof(status) || job.submissionEvidence;
  if (existing && submissionMatchesApplication(existing, job.url) && existing.opportunityId === job.id) return finish(existing, previous);
  let released: LeverReceipt | undefined;
  if (previous) {
    // Prior dispatch belongs to the existing application, including a pending
    // result after a client timeout. Reconcile it without replaying Submit.
    const observed = await request('/listeners/refresh', scope).catch(() => null);
    const evidence = observed && proof(observed);
    const attempt = await history() || previous;
    if (evidence) return finish(evidence, attempt);
    // Only an explicit operator retry may continue past an attempt without an employer outcome.
    if (!retryUnconfirmedOnce || attempt.response === 'CONFIRMED') {
      return { state: FAILURES.includes(attempt.response) ? 'EMPLOYER_REJECTED' : 'RECONCILIATION_PENDING', attempt };
    }
    if (attempt.response === 'PENDING') {
      const release = await request('/lever-attempt/release-unconfirmed', { ...scope, attemptId: attempt.id, confirmedRetry: true });
      if (!release.ok) return { state: 'RECONCILIATION_PENDING', code: release.error, attempt };
      released = await history();
    }
  }
  if (!['saved', 'preparing'].includes(job.status)) throw new Error('SAVED_APPLICATION_NO_LONGER_ACTIONABLE');
  const bound = await request('/listeners/bind-existing', { ...scope, recordAnswers: true });
  if (!bound.ok || bound.listeners?.submission?.state !== 'ARMED' || !bound.listeners.recordingAnswers) {
    return { state: 'BIND_RECOVERY_REQUIRED', code: bound.error || 'LISTENERS_NOT_ARMED' };
  }
  const sync = await request('/reviewed-answers/save', { ...scope, approved: true });
  if (!sync.ok || sync.answerSync?.status !== 'REVIEWED_ANSWERS_SAVED_AND_READ_BACK') {
    return { state: 'PROFILE_SYNC_REQUIRED', code: sync.error || 'ANSWER_RECEIPT_UNVERIFIED' };
  }
  const answerSync = sync.answerSync;
  // Restore approved answers the employer cleared, then save the completed form for this application.
  const fill = await request('/fill', { ...scope, employerName: job.company });
  if (!fill.ok) return { state: 'DETERMINISTIC_FILL_REQUIRED', code: fill.error || 'FILL_UNAVAILABLE', answerSync };
  const restored = { filled: fill.filled?.length ?? 0, skipped: fill.skipped?.length ?? 0 };
  if (restored.filled) {
    const resync = await request('/reviewed-answers/save', { ...scope, approved: true });
    if (!resync.ok || resync.answerSync?.status !== 'REVIEWED_ANSWERS_SAVED_AND_READ_BACK') {
      return { state: 'PROFILE_SYNC_REQUIRED', code: resync.error || 'ANSWER_RECEIPT_UNVERIFIED', restored };
    }
  }
  if (!submitReviewedOnce) return { state: 'ANSWERS_SAVED', answerSync, restored };

  const documents = await request('/documents/status' + query);
  const resume = documents.package?.documents.resume;
  if (!documents.ok || !resume?.reviewedAt || !resume.sha256) return { state: 'APPROVED_RESUME_NOT_STAGED' };
  const attachment = { ...scope, resumeSha256: resume.sha256 };
  let attach: Reply;
  for (let poll = 0; ; poll++) {
    attach = await request('/attach', attachment);
    if (attach.attemptReceipt?.resumeBefore !== 'PARSING' || poll === 9) break;
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  if (attach.attemptReceipt?.resumeBefore !== 'VERIFIED') {
    return { state: 'ATTACHMENT_RECOVERY_REQUIRED', code: attach.attemptReceipt?.code || attach.error, attempt: attach.attemptReceipt };
  }
  // A lost response is an unresolved attempt. Query receipts before any
  // further action, and never issue another terminal call in this run.
  const sent = await request('/submit-authorized', { ...attachment, confirmedSubmit: true }).catch(() => null);
  if (sent && !sent.ok && sent.attemptReceipt?.dispatch === 'NOT_ATTEMPTED') {
    return { state: 'SUBMIT_PRECONDITION_REQUIRED', code: sent.error, attempt: sent.attemptReceipt, restored,
      blockers: sent.blockers };
  }
  let attempt = sent?.attemptReceipt;
  // An employer challenge belongs to the operator; keep observing while it is solved.
  const polls = sent?.employerChallenge ? 300 : 10;
  for (let poll = 0; poll < polls; poll++) {
    const observed = await request('/listeners/refresh', scope).catch(() => null);
    attempt = await history().catch(() => undefined) || attempt;
    const evidence = (observed && proof(observed)) || (sent && proof(sent));
    if (evidence) return finish(evidence, attempt, answerSync);
    if (attempt && FAILURES.includes(attempt.response)) return { state: 'EMPLOYER_REJECTED', attempt, answerSync, released };
    if (poll < polls - 1) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return { state: sent?.employerChallenge ? 'EMPLOYER_VERIFICATION_REQUIRED' : 'RECONCILIATION_PENDING', attempt, answerSync, released };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [port, livePageUrl, mode, ...extra] = process.argv.slice(2);
  if (!port || !livePageUrl || !['--sync-reviewed', '--submit-reviewed-once', '--retry-unconfirmed-once'].includes(mode) || extra.length) {
    console.error('Usage: node reviewed-lever-application.ts <installed-port> <exact-open-Lever-URL> --sync-reviewed|--submit-reviewed-once|--retry-unconfirmed-once');
    process.exitCode = 2;
  } else {
    completeReviewedLeverApplication({ port: Number(port), livePageUrl, submitReviewedOnce: mode !== '--sync-reviewed',
      retryUnconfirmedOnce: mode === '--retry-unconfirmed-once' })
      .then(receipt => {
        console.log(JSON.stringify(receipt));
        if (!['EMPLOYER_CONFIRMED', 'ANSWERS_SAVED'].includes(receipt.state)) process.exitCode = 1;
      }, error => {
        const code = /^[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'LOCAL_MANAGED_RUNTIME_UNAVAILABLE';
        console.error(JSON.stringify({ state: 'RECOVERY_REQUIRED', code }));
        process.exitCode = 1;
      });
  }
}
