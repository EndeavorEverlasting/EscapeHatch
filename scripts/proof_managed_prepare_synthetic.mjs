#!/usr/bin/env node
/**
 * Product-path proof: cockpit loopback /prepare against repository synthetic ATS.
 * Requires managed EscapeHatch runtime with ESCAPEHATCH_ALLOW_SYNTHETIC_ATS=1.
 * Never submits a terminal application commit.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startSyntheticAts } from '../fixtures/application-navigation-ats/server.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '21032';
const base = `http://127.0.0.1:${port}`;
const api = `${base}/__escapehatch/managed-assist`;
const contract = JSON.parse(
  readFileSync(path.join(root, 'fixtures/application-navigation-ats/adapter-contract.v1.json'), 'utf8'),
);

async function request(endpoint, body) {
  const response = await fetch(api + endpoint, body ? {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: base,
      'x-escapehatch-operator-action': 'confirmed',
    },
    body: JSON.stringify(body),
  } : { headers: { origin: base } });
  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(`${endpoint} failed: ${json.error || response.status}`);
  }
  return json;
}

const ats = await startSyntheticAts();
const before = await (await fetch(ats.origin + '/__effects')).json();
try {
  const status = await request('/status');
  if (!status.ok) throw new Error('managed runtime status unavailable');

  const launch = await request('/launch', {
    url: ats.origin + '/apply/step/1',
    opportunityId: 'synthetic-opportunity-proof',
  });

  const preparation = await request('/prepare', {
    authorization: {
      sessionId: 'synthetic-product-proof',
      opportunityId: 'synthetic-opportunity-proof',
      navigationEnabled: true,
      allowedEffectClasses: ['LOCAL_STEP_ONLY', 'DRAFT_WRITE_AND_ADVANCE'],
      allowedDataCategories: ['synthetic_cover_note'],
    },
    adapterRegistry: {
      schema: contract.schema,
      adapterId: contract.adapterId,
      atsProvider: contract.atsProvider,
      evidence: contract.evidence,
    },
    maxSteps: 4,
    requireUploadsVerified: true,
  });

  const after = await (await fetch(ats.origin + '/__effects')).json();
  const receipt = {
    schema: 'escapehatch/managed-prepare-synthetic-proof/v1',
    provedAtUtc: new Date().toISOString(),
    runtimePort: Number(port),
    launchState: launch.state,
    preparationState: preparation.preparation?.state || preparation.state,
    preparationCode: preparation.preparation?.code || null,
    pagesPrepared: preparation.preparation?.pagesPrepared ?? null,
    intermediateSteps: preparation.preparation?.intermediateSteps ?? null,
    finalActionActivated: preparation.preparation?.finalActionActivated ?? preparation.finalActionActivated,
    terminalCommitsBefore: before.terminalCommits.length,
    terminalCommitsAfter: after.terminalCommits.length,
    nativeDraftsDelta: after.nativeDrafts.length - before.nativeDrafts.length,
    zeroTerminalCommits: after.terminalCommits.length === before.terminalCommits.length,
  };

  if (receipt.preparationState !== 'REVIEW_READY' || !receipt.zeroTerminalCommits ||
      receipt.finalActionActivated !== false || receipt.intermediateSteps !== 2) {
    throw new Error('synthetic product proof failed: ' + JSON.stringify(receipt));
  }

  const outDir = path.join(root, 'harness/reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'managed-prepare-synthetic-proof.v1.json');
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('PASS', outPath);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await ats.close();
}
