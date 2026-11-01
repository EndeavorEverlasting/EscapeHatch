/** One-shot Windows/headless replay of trusted, already-observed submission receipts.
 * Never opens a browser, changes a form, or infers success from HTTP status alone.
 * Designed for an OS scheduler as well as a manual recovery invocation.
 */
import { runSubmissionSyncOnce } from './tracker-writeback.ts';

try {
  const result = await runSubmissionSyncOnce();
  // Counts only: never print application answers, tokens, employer URLs, or receipt bytes.
  process.stdout.write(JSON.stringify({ schema: 'escapehatch/submission-sync-worker/v1',
    state: result.state, pending: result.pending, synced: result.synced,
    authRequired: result.authRequired, conflicts: result.conflicts,
    retryRequired: result.retryRequired }) + '\n');
  if (result.state !== 'IDLE') process.exitCode = 2;
} catch {
  // Preserve the original receipt and outbox. Distinguish failure from success
  // without leaking private data into scheduler logs.
  process.stderr.write('EscapeHatch submission sync could not complete; private evidence was preserved.\n');
  process.exitCode = 1;
}
