import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import contract from '../../contracts/application-submission-policy.v1.json' with { type: 'json' };
import { userDataRoot } from './user-data.ts';

export type SubmissionMode = keyof typeof contract.modes;
export type SavedSubmissionPolicy = { mode: SubmissionMode; storage: 'saved' | 'default' | 'unavailable' };

export function isSubmissionMode(value: unknown): value is SubmissionMode {
  return typeof value === 'string' && Object.hasOwn(contract.modes, value);
}

const defaultMode = contract.default as SubmissionMode;

function policyPath(dataHome: string) {
  return path.join(dataHome, contract.setting);
}

export async function readSubmissionPolicy(dataHome = userDataRoot()): Promise<SavedSubmissionPolicy> {
  try {
    const saved = JSON.parse(await fs.readFile(policyPath(dataHome), 'utf8'));
    if (saved?.schema === contract.schema && isSubmissionMode(saved.mode)) {
      return { mode: saved.mode, storage: 'saved' };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { mode: defaultMode, storage: 'default' };
  }
  return { mode: defaultMode, storage: 'unavailable' };
}

export async function saveSubmissionMode(mode: SubmissionMode, dataHome = userDataRoot()) {
  if (!isSubmissionMode(mode)) throw new Error('invalid_submission_mode');
  const file = policyPath(dataHome);
  const temp = file + '.' + randomUUID() + '.tmp';
  await fs.mkdir(dataHome, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temp, JSON.stringify({ schema: contract.schema, mode }), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
  const saved = await readSubmissionPolicy(dataHome);
  if (saved.storage !== 'saved' || saved.mode !== mode) throw new Error('submission_policy_save_unverified');
  return saved;
}

function isIndeedApply(url: string) {
  const hostname = URL.parse(url)?.hostname;
  return hostname === 'indeed.com' || Boolean(hostname?.endsWith('.indeed.com'));
}

export async function readPreparedSubmissionDisposition(
  state: 'REVIEW_READY' | 'REVIEW_REQUIRED' | 'BLOCKED',
  applicationUrl: string,
  livePageUrl: string,
  dataHome = userDataRoot(),
) {
  const { mode, storage } = await readSubmissionPolicy(dataHome);
  if (storage === 'unavailable') return 'SUBMISSION_SETTING_UNAVAILABLE';
  if (mode === 'REVIEW_BEFORE_SUBMIT') return 'REVIEW_BEFORE_SUBMIT';
  if ([applicationUrl, livePageUrl].some(isIndeedApply)) return 'INDEED_AUTHORIZED_TOOL_REQUIRED';
  if (state !== 'REVIEW_READY') return 'PREPARATION_INCOMPLETE';
  return 'PROVIDER_AUTOMATION_UNAVAILABLE';
}

export type SubmissionDisposition = Awaited<ReturnType<typeof readPreparedSubmissionDisposition>>;
