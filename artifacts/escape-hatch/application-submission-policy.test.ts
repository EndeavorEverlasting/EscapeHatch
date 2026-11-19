import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readPreparedSubmissionDisposition,
  readSubmissionPolicy,
  saveSubmissionMode,
} from './application-submission-policy.ts';

const job = 'https://jobs.example.com/engineer';
const indeed = 'https://smartapply.indeed.com/form';

test('the saved host setting governs prepared applications across reads and can be revoked', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-submission-mode-'));
  try {
    assert.deepEqual(await readSubmissionPolicy(data), { mode: 'REVIEW_BEFORE_SUBMIT', storage: 'default' });
    assert.equal(await readPreparedSubmissionDisposition('REVIEW_READY', job, job, data), 'REVIEW_BEFORE_SUBMIT');
    assert.deepEqual(await saveSubmissionMode('AUTO_SUBMIT_WHERE_SUPPORTED', data),
      { mode: 'AUTO_SUBMIT_WHERE_SUPPORTED', storage: 'saved' });
    assert.equal(await readPreparedSubmissionDisposition('REVIEW_READY', job, job, data), 'PROVIDER_AUTOMATION_UNAVAILABLE');
    assert.equal(await readPreparedSubmissionDisposition('REVIEW_REQUIRED', job, job, data), 'PREPARATION_INCOMPLETE');
    assert.equal(await readPreparedSubmissionDisposition('REVIEW_READY', indeed, job, data), 'INDEED_AUTHORIZED_TOOL_REQUIRED');
    assert.equal(await readPreparedSubmissionDisposition('REVIEW_READY', job, indeed, data), 'INDEED_AUTHORIZED_TOOL_REQUIRED');
    assert.equal(await readPreparedSubmissionDisposition('REVIEW_READY', job, 'https://notindeed.com/apply', data), 'PROVIDER_AUTOMATION_UNAVAILABLE');
    await saveSubmissionMode('REVIEW_BEFORE_SUBMIT', data);
    assert.equal(await readPreparedSubmissionDisposition('REVIEW_READY', job, indeed, data), 'REVIEW_BEFORE_SUBMIT');
  } finally {
    await fs.rm(data, { recursive: true, force: true });
  }
});

test('bad schema, invalid JSON and request values cannot grant standing permission', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-submission-invalid-'));
  try {
    const file = path.join(data, 'application-submission-policy.json');
    await fs.writeFile(file, '{"schema":"unknown","mode":"AUTO_SUBMIT_WHERE_SUPPORTED"}');
    assert.deepEqual(await readSubmissionPolicy(data), { mode: 'REVIEW_BEFORE_SUBMIT', storage: 'unavailable' });
    await fs.writeFile(file, '{');
    assert.equal(await readPreparedSubmissionDisposition('REVIEW_READY', job, job, data), 'SUBMISSION_SETTING_UNAVAILABLE');
    await assert.rejects(saveSubmissionMode('AUTO_SUBMIT' as never, data), /invalid_submission_mode/);
    assert.equal(await fs.readFile(file, 'utf8'), '{');
    assert.deepEqual(await saveSubmissionMode('REVIEW_BEFORE_SUBMIT', data), { mode: 'REVIEW_BEFORE_SUBMIT', storage: 'saved' });
  } finally {
    await fs.rm(data, { recursive: true, force: true });
  }
});
