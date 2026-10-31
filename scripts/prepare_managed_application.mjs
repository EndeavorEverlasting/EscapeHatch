#!/usr/bin/env node
/**
 * Deterministic managed-application prepare workflow.
 *
 * Ensures EscapeHatch managed-assist can open a saved opportunity, fill the
 * shared OS-private preference profile, apply public resume/portfolio URLs,
 * arm the submission listener, and prove required-field readiness.
 *
 * Default: STOP before Submit. Pass --submit only with --confirmed-submit after
 * readiness is clean. Never prints preference values.
 *
 * Usage:
 *   node scripts/prepare_managed_application.mjs --opportunity-id <id> --url <https://...>
 *   node scripts/prepare_managed_application.mjs --company Broadcastwell
 * Optional:
 *   --public-resume-url <https://...>
 *   --portfolio-url <https://...>
 *   --motivation-file <path>   (Why this role / cover text; private local file)
 *   --consent-label <substr>  (checkbox label substring; default: Consent)
 *   --port 21031
 *   --submit --confirmed-submit
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const port = String(args.port || process.env.PORT || '21031');
const base = `http://127.0.0.1:${port}`;
const api = `${base}/__escapehatch/managed-assist`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

async function request(endpoint, body, { method = body ? 'POST' : 'GET', allowFailure = false } = {}) {
  const response = await fetch(api + endpoint, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: base,
      'x-escapehatch-operator-action': 'confirmed',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  if (!allowFailure && (!response.ok || !json?.ok)) {
    const err = new Error(`${endpoint} failed: ${json?.error || response.status}`);
    err.payload = json;
    err.status = response.status;
    throw err;
  }
  return { response, json };
}

function loadWorkspaceOpportunity({ opportunityId, url, company }) {
  const dataHome = process.env.ESCAPEHATCH_DATA_HOME
    || path.join(process.env.LOCALAPPDATA || '', 'EscapeHatch');
  const workspacePath = path.join(dataHome, 'workspace.v1.json');
  const raw = JSON.parse(fs.readFileSync(workspacePath, 'utf8'));
  const apps = raw?.values?.['escape-hatch-applications'];
  if (!Array.isArray(apps)) throw new Error('workspace_applications_missing');
  let match = null;
  if (opportunityId) match = apps.find((item) => item.id === opportunityId);
  else if (url) match = apps.find((item) => item.url === url);
  else if (company) {
    const needle = String(company).toLowerCase();
    const hits = apps.filter((item) => String(item.company || '').toLowerCase().includes(needle)
      && !['applied', 'closed'].includes(String(item.status || '').toLowerCase()));
    if (hits.length !== 1) throw new Error(`company_not_unique:${hits.length}`);
    match = hits[0];
  }
  if (!match?.id || !match?.url) throw new Error('opportunity_not_found');
  return match;
}

async function waitForFormReady(timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { json } = await request('/status');
    const phase = json?.authCheckpoint?.phase;
    if (json?.browserOpen && (phase === 'APPLICATION_FORM_READY' || json.state?.includes('application_'))) {
      return json;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('application_form_not_ready');
}

async function typeLabeled(label, value) {
  if (!value) return null;
  const { json } = await request('/type-labeled', { label, value });
  return json?.readback || null;
}

async function toggleConsent(labelSubstr) {
  const { json } = await request('/toggle-labeled-checkbox', { label: labelSubstr, checked: true }, { allowFailure: true });
  return json;
}

async function main() {
  const opportunity = loadWorkspaceOpportunity({
    opportunityId: args['opportunity-id'],
    url: args.url,
    company: args.company,
  });
  const publicResumeUrl = args['public-resume-url']
    || process.env.ESCAPEHATCH_PUBLIC_RESUME_URL
    || 'https://www.perezparallax.dev/static/resume/current.html';
  const portfolioUrl = args['portfolio-url']
    || process.env.ESCAPEHATCH_PORTFOLIO_URL
    || '';
  const motivation = args['motivation-file']
    ? fs.readFileSync(path.resolve(args['motivation-file']), 'utf8').trim()
    : (process.env.ESCAPEHATCH_MOTIVATION_TEXT || '').trim();
  const consentLabel = args['consent-label'] || 'Consent';
  const wantSubmit = Boolean(args.submit);
  const confirmedSubmit = Boolean(args['confirmed-submit']);

  console.log('PREPARE_MANAGED_APPLICATION: start');
  console.log(`PORT=${port}`);
  console.log(`OPPORTUNITY_ID=${opportunity.id}`);
  console.log(`APPLICATION_URL=${opportunity.url}`);
  console.log(`COMPANY=${opportunity.company || ''}`);

  const status = await request('/status');
  if (!status.json?.ok) throw new Error('managed_runtime_unavailable');

  await request('/launch', {
    opportunityId: opportunity.id,
    url: opportunity.url,
    employerName: opportunity.company || '',
  });
  await waitForFormReady();

  const fill = await request('/fill', { opportunityId: opportunity.id, url: opportunity.url }, { allowFailure: true });
  if (!fill.json?.ok) {
    console.log(`FILL_WARNING=${fill.json?.error || fill.response.status}`);
  } else {
    console.log(`FILL_OK filled=${(fill.json.filled || []).length} skipped=${(fill.json.skipped || []).length}`);
  }

  // Prefer portfolio over LinkedIn for combined portfolio/LinkedIn fields.
  const prefs = await request('/preferences');
  const website = portfolioUrl
    || prefs.json?.preferences?.preferences?.['identity.website']?.value
    || '';
  if (website) {
    await typeLabeled('LinkedIn or portfolio URL', website);
    console.log('PORTFOLIO_FIELD=set');
  }
  if (publicResumeUrl) {
    await typeLabeled('Resume (link to a PDF)', publicResumeUrl);
    console.log('RESUME_FIELD=set');
  }
  if (motivation) {
    await typeLabeled('Why this role', motivation.slice(0, 500));
    console.log('MOTIVATION_FIELD=set');
  }
  await toggleConsent(consentLabel);

  const arm = await request('/listeners', {
    opportunityId: opportunity.id,
    trackSubmission: true,
    recordAnswers: true,
    employerName: opportunity.company || '',
  });
  const listenerState = arm.json?.listeners?.submission?.state;
  console.log(`LISTENER=${listenerState || 'UNKNOWN'}`);
  if (listenerState !== 'ARMED') throw new Error('submission_listener_not_armed');

  const requirements = await request('/requirements', {
    opportunityId: opportunity.id,
    url: opportunity.url,
  });
  let unresolved = Array.isArray(requirements.json?.blockers) ? requirements.json.blockers : [];
  if (!unresolved.length && Array.isArray(requirements.json?.inspection?.requirements)) {
    unresolved = requirements.json.inspection.requirements
      .filter((field) => !field.populated && field.requirement !== 'optional')
      .map((field) => {
        const protectedAction = /privacy|consent|attest|certif|acknowledg|agree to|terms of/i.test(field.label || '');
        const status = field.requirement === 'unknown' ? 'unclassified_field_review'
          : protectedAction ? 'required_operator_action' : 'required_field_unresolved';
        return `${status}:${field.label}`;
      });
  }
  console.log(`REQUIRED_BLOCKERS=${unresolved.length}`);
  for (const item of unresolved.slice(0, 20)) console.log(`BLOCKER=${item}`);

  if (unresolved.length) {
    console.log('PREPARE_MANAGED_APPLICATION: READY_FOR_OPERATOR_FIX');
    console.log('SUBMIT=blocked_incomplete_form');
    process.exitCode = 2;
    return;
  }

  console.log('PREPARE_MANAGED_APPLICATION: FORM_COMPLETE');
  console.log('LISTENER=ARMED');

  if (!wantSubmit) {
    console.log('SUBMIT=stopped_before_submit');
    console.log('NEXT=review form then re-run with --submit --confirmed-submit');
    return;
  }
  if (!confirmedSubmit) throw new Error('confirmedSubmit_required');

  const submit = await request('/submit-authorized', {
    opportunityId: opportunity.id,
    confirmedSubmit: true,
  }, { allowFailure: true });
  if (!submit.json?.ok) {
    console.log(`SUBMIT=blocked error=${submit.json?.error || submit.response.status}`);
    if (Array.isArray(submit.json?.blockers)) {
      for (const item of submit.json.blockers.slice(0, 20)) console.log(`BLOCKER=${item}`);
    }
    process.exitCode = 3;
    return;
  }
  console.log(`SUBMIT=${submit.json.state || 'requested'}`);
  console.log(`AFTER_URL=${submit.json.afterUrl || ''}`);
  if (submit.json.trackerSync?.state) console.log(`TRACKER_SYNC=${submit.json.trackerSync.state}`);
}

main().catch((error) => {
  console.error('PREPARE_MANAGED_APPLICATION: FAIL');
  console.error(String(error?.message || error));
  if (error?.payload?.error) console.error(`API_ERROR=${error.payload.error}`);
  process.exitCode = 1;
});
