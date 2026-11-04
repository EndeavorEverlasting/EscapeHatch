/**
 * Contract: Node status digest must equal Android-style SHA-256 of sealed
 * projection plaintext, and the phone proof JSON shape must satisfy the
 * await-watcher comparison fields (value-free).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import {
  generateSyncKey,
  projectReusablePreferences,
  projectionDigest,
  sealProjection,
  openProjection,
} from './private-sync-crypto.ts';

const PHONE_PROOF_SCHEMA = 'escapehatch/private-sync-phone-proof-receipt/v1';

function androidStyleDigest(projectionPlaintextUtf8: string): string {
  return createHash('sha256').update(projectionPlaintextUtf8, 'utf8').digest('hex');
}

function buildPhoneProof(input: {
  vaultId: string;
  entryCount: number;
  cognizantFieldIds: string[];
  projectionDigest: string;
}): string {
  return JSON.stringify({
    schema: PHONE_PROOF_SCHEMA,
    createdAt: '2026-11-04T03:00:00.000Z',
    device: 'android-phone',
    phoneState: 'IMPORTED',
    vaultId: input.vaultId,
    reusableAnswerCount: input.entryCount,
    projectionDigest: input.projectionDigest,
    cognizantTalentCommunityFieldsPresent: input.cognizantFieldIds.slice().sort(),
  });
}

test('phone proof digest matches Node projectionDigest of opened capsule plaintext', () => {
  const prefs = emptyPreferences();
  for (const [id, value] of Object.entries({
    'talent_community.primary_areas': 'Synthetic Engineering',
    'talent_community.industry_preferences': 'Synthetic Healthcare',
    'talent_community.new_graduate_interest': 'No',
  })) {
    prefs.preferences[id] = {
      scope: 'profile_preference',
      source: 'user',
      value,
      updated_at: '2026-11-03T00:00:00Z',
    };
  }
  const projected = projectReusablePreferences(prefs);
  const key = generateSyncKey();
  const sealed = sealProjection(projected, key, null, 'a'.repeat(32));
  const opened = openProjection(sealed, key);
  const nodeDigest = projectionDigest(opened);
  // Android digests the exact UTF-8 plaintext recovered from the capsule.
  const sealedPlaintext = JSON.stringify(opened);
  const phoneDigest = androidStyleDigest(sealedPlaintext);
  assert.equal(phoneDigest, nodeDigest);
  assert.equal(nodeDigest.length, 64);

  const cognizant = Object.keys(opened.entries)
    .filter((id) => id.startsWith('talent_community.'))
    .sort();
  const proofJson = buildPhoneProof({
    vaultId: sealed.vaultId,
    entryCount: Object.keys(opened.entries).length,
    cognizantFieldIds: cognizant,
    projectionDigest: phoneDigest,
  });
  assert.equal(proofJson.includes('Synthetic'), false);
  const proof = JSON.parse(proofJson) as {
    schema: string;
    reusableAnswerCount: number;
    projectionDigest: string;
    cognizantTalentCommunityFieldsPresent: string[];
  };
  assert.equal(proof.schema, PHONE_PROOF_SCHEMA);
  assert.equal(proof.reusableAnswerCount, 3);
  assert.equal(proof.projectionDigest, nodeDigest);
  assert.deepEqual(proof.cognizantTalentCommunityFieldsPresent, cognizant);

  // Await-watcher comparison (order-independent Cognizant ids).
  const deskCog = cognizant.slice().sort().join(',');
  const phoneCog = [...proof.cognizantTalentCommunityFieldsPresent].sort().join(',');
  assert.equal(phoneCog, deskCog);
  assert.equal(proof.projectionDigest, nodeDigest);
});

/** Mirror of await/ingest gate: emulator lab receipts must never close 3/3. */
function phoneProofEligibleForThreeOfThree(proof: {
  device?: string;
  deviceKind?: string;
  notPhoneThreeOfThree?: boolean;
}): boolean {
  if (proof.notPhoneThreeOfThree === true) return false;
  if (proof.deviceKind === 'android-emulator') return false;
  return proof.device === 'android-phone';
}

test('emulator lab proof shape is rejected for threeOfThree eligibility', () => {
  assert.equal(
    phoneProofEligibleForThreeOfThree({
      deviceKind: 'android-emulator',
      notPhoneThreeOfThree: true,
    }),
    false,
  );
  assert.equal(
    phoneProofEligibleForThreeOfThree({
      device: 'android-emulator',
    }),
    false,
  );
  assert.equal(phoneProofEligibleForThreeOfThree({}), false);
  assert.equal(
    phoneProofEligibleForThreeOfThree({
      device: 'android-phone',
      deviceKind: 'android-emulator',
      notPhoneThreeOfThree: true,
    }),
    false,
  );
  assert.equal(
    phoneProofEligibleForThreeOfThree({
      device: 'android-phone',
    }),
    true,
  );
});
