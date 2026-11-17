/** Prepare an already-open Lever form from the private host workspace. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readWorkspace } from './workspace-file.ts';
import { readPreferenceSnapshot } from './preference-file.ts';
import { APPLICATIONS_KEY, PROFILE_KEY, parseApplicationsStorage, parseProfileStorage } from './src/lib/storage.ts';
import { leverApplicationKey, savedLeverApplicationKey } from './src/lib/application-puzzle.ts';
import { discoveredValue, matchQuestion, normalizeQuestion, questions, reusableValue, roleQuestionKey } from './src/lib/application-preferences.ts';
import { assertEmployerFacingDocumentUrl } from './src/lib/employer-facing-document-url.ts';

const source = fileURLToPath(new URL('../../browser/firefox-reviewed-fill/', import.meta.url));
const assets = ['manifest.json', 'popup.html', 'popup.js', 'fill-known.js'];
const protectedQuestion = /(?:^|\s)(?:e[\s-]?mail|privacy|consent|attest\w*|certif\w*|sign\w*|agree\w*|acknowledg\w*|password|passcode|captcha|disclosure|voluntary|terms|disability|veteran|ethnicity|race|gender)(?:\s|$)/i;

export async function prepareFirefoxApplication(applicationUrl: string) {
  const key = leverApplicationKey(applicationUrl);
  const url = new URL(applicationUrl);
  if (!key || url.username || url.password || url.href !== applicationUrl) throw new Error('EXACT_LEVER_FORM_URL_REQUIRED');
  const workspace = await readWorkspace();
  const jobs = parseApplicationsStorage(workspace?.workspace.values[APPLICATIONS_KEY]);
  const matches = jobs?.filter(job => savedLeverApplicationKey(job.url) === key);
  if (matches?.length !== 1) throw new Error('SAVED_LEVER_OPPORTUNITY_REQUIRED');
  const [job] = matches;
  if (!['saved', 'preparing'].includes(job.status) || job.submissionEvidence) throw new Error('APPLICATION_REQUIRES_RECONCILIATION');

  const { preferences: saved, source: stored } = await readPreferenceSnapshot();
  const profile = parseProfileStorage(workspace?.workspace.values[PROFILE_KEY]);
  const fallback: Record<string, string | undefined> = {
    'identity.title': profile?.name_prefix, 'identity.first_name': profile?.first_name,
    'identity.last_name': profile?.last_name, 'identity.preferred_name': profile?.preferred_name,
    'identity.linkedin': profile?.linkedin_url, 'identity.street_address': profile?.street_address,
    'identity.city': profile?.city, 'identity.region': profile?.region,
    'identity.postal_code': profile?.postal_code, 'identity.country': profile?.country,
  };
  if (profile?.phone_authority === 'user_confirmed_primary') fallback['identity.phone'] = profile.phone;
  const valueFor = (id: string) => reusableValue(id, saved) || fallback[id]?.trim();
  const firstName = valueFor('identity.first_name'), lastName = valueFor('identity.last_name');
  if (firstName && lastName) fallback['identity.full_name'] = firstName + ' ' + lastName;

  const answers: { id: string; aliases: string[]; value: string; requiredOnly: boolean }[] = [];
  const add = (id: string, prompts: string[], value: string | undefined | null) => {
    if (!value?.trim() || value.length > 4096) return;
    const aliases = [...new Set(prompts.map(normalizeQuestion).filter(label => label && !protectedQuestion.test(label)))];
    if (!aliases.length || /^(?:please )?(?:select|choose)(?: one)?[ .…-]*$/i.test(value.trim())) return;
    try { assertEmployerFacingDocumentUrl(prompts.join(' '), value); }
    catch { return; }
    answers.push({ id, aliases, value, requiredOnly: saved.optional_omissions?.includes(id) === true });
  };
  for (const definition of questions) {
    const { id } = definition;
    if (id === 'identity.email' || /^(?:eeo|military|veteran|legal|attestation|marketing|accommodation|talent_community)\./.test(id) ||
        /^employment\.(?:current_employee|previous_employee|prior_employer_relationship)$/.test(id) ||
        definition.answer_scope !== 'profile' || definition.confirmation_policy !== 'until_changed' ||
        definition.automation_policy !== 'fill_if_explicit_preference') continue;
    const value = valueFor(id);
    const aliases = definition.aliases.filter(prompt => matchQuestion(prompt, job.company) === id);
    add(id, aliases, value);
  }
  for (const answer of saved.reviewed_role_answers || []) {
    if (answer.opportunityId === job.id && answer.url === job.url && roleQuestionKey(answer.question)) {
      add('reviewed-role:' + roleQuestionKey(answer.question), [answer.question], answer.value);
    }
  }
  for (const old of Object.values(saved.discovered_answers || {})) {
    add('approved-question:' + normalizeQuestion(old.question), [old.question], discoveredValue(old.question, saved));
  }
  // Installed versions can already have reviewed opportunity overrides in
  // this same private file. Read the exact scope without rewriting the store.
  const overlay = stored && typeof stored === 'object' && 'application_answers' in stored
    ? stored.application_answers : undefined;
  if (Array.isArray(overlay) && overlay.length <= 150) {
    const exact = new Map<string, { question: string; value: string } | null>();
    for (const row of overlay) {
      if (!row || row.opportunityId !== job.id || row.url !== job.url ||
          typeof row.question !== 'string' || row.question.length > 512 ||
          typeof row.value !== 'string' || !row.value.trim() || row.value.length > 4096 ||
          typeof row.approvedAt !== 'string' || !Number.isFinite(Date.parse(row.approvedAt))) continue;
      const label = normalizeQuestion(row.question);
      if (!label || protectedQuestion.test(label)) continue;
      if (/^(?:eeo|legal|attestation|marketing|accommodation|military|veteran|talent_community)\./.test(matchQuestion(row.question, job.company) || '')) continue;
      exact.set(label, exact.has(label) ? null : row);
    }
    for (const [label, row] of exact) {
      // The exact reviewed application answer takes precedence on this prompt.
      // Duplicate exact rows suppress fallback and require review.
      for (const answer of answers) answer.aliases = answer.aliases.filter(alias => alias !== label);
      if (row) add('opportunity:' + label, [row.question], row.value);
    }
  }
  const usableAnswers = answers.filter(answer => answer.aliases.length);
  if (!usableAnswers.length) throw new Error('NO_APPROVED_ANSWERS_AVAILABLE');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'escapehatch-firefox-'));
  try {
    await Promise.all(assets.map(name => fs.copyFile(path.join(source, name), path.join(directory, name))));
    const expiresAt = Date.now() + 30 * 60 * 1000;
    await fs.writeFile(path.join(directory, 'answers.json'), JSON.stringify({ applicationUrl, expiresAt, answers: usableAnswers }),
      { flag: 'wx', mode: 0o600 });
    return { state: 'FIREFOX_FILL_READY' as const, manifestPath: path.join(directory, 'manifest.json'),
      approvedAnswerCount: usableAnswers.length, expiresAt: new Date(expiresAt).toISOString(), emailPolicy: 'PRESERVE' as const };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [url, ...extra] = process.argv.slice(2);
  if (!url || extra.length) {
    console.error('Usage: npm run application:prepare-firefox -- "<exact open Lever form URL>"');
    process.exitCode = 2;
  } else {
    prepareFirefoxApplication(url).then(result => console.log(JSON.stringify(result)), error => {
      const message = error instanceof Error ? error.message : '';
      const code = /^[A-Z_]+$/.test(message) ? message : 'PRIVATE_ANSWER_PREPARATION_FAILED';
      console.error(JSON.stringify({ state: 'RECOVERY_REQUIRED', code }));
      process.exitCode = 1;
    });
  }
}
