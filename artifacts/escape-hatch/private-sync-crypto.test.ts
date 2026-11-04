import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { generateSyncKey, vaultIdForKey, projectReusablePreferences, sealProjection, openProjection, envelopeDigest, validateProjection } from './private-sync-crypto.ts';

test('sealed preference capsule authenticates saved Cognizant answers without leaking plaintext', () => {
  const p = emptyPreferences();
  p.preferences['talent_community.primary_areas'] = { scope:'profile_preference',source:'user',value:'Synthetic Engineering',updated_at:'2026-11-03T00:00:00Z' };
  p.preferences['talent_community.industry_preferences'] = { scope:'profile_preference',source:'user',value:'Synthetic Healthcare',updated_at:'2026-11-03T00:00:00Z' };
  p.preferences['talent_community.new_graduate_interest'] = { scope:'profile_preference',source:'user',value:'No',updated_at:'2026-11-03T00:00:00Z' };
  p.preferences['eeo.gender'] = { scope:'profile_preference',source:'user',value:'Sensitive Synthetic',updated_at:'2026-11-03T00:00:00Z' };
  p.preferences['future.password'] = { scope:'profile_preference',source:'user',value:'Never Export',updated_at:'2026-11-03T00:00:00Z' };
  p.application_privacy_acknowledgement_enabled = true;
  p.discovered_answers = { password: { question: 'password', value:'secret',source:'user',updated_at:'2026-11-03T00:00:00Z',accepted:true } };
  const projected = projectReusablePreferences(p);
  assert.equal(Object.keys(projected.entries).length,3);
  assert.equal(projected.entries['eeo.gender'],undefined);
  const key=generateSyncKey(),device='a'.repeat(32),sealed=sealProjection(projected,key,null,device);
  assert.equal(sealed.vaultId,vaultIdForKey(key));
  const serialized=JSON.stringify(sealed);
  for(const fragment of ['Synthetic Engineering','Synthetic Healthcare','Sensitive Synthetic','Never Export','secret']) assert.equal(serialized.includes(fragment),false);
  assert.deepEqual(openProjection(sealed,key),projected);
  assert.match(envelopeDigest(sealed),/^[a-f0-9]{64}$/);
  assert.throws(()=>openProjection(sealed,generateSyncKey()),/WRONG_VAULT_KEY/);
  assert.throws(()=>openProjection({...sealed,parent:'f'.repeat(64)},key),/CAPSULE_AUTHENTICATION_FAILED/);
  // Corrupt an interior ciphertext character so AEAD/canonical base64url cannot silently accept it.
  const flipped = sealed.ciphertext[10] === 'A' ? 'B' : 'A';
  const tamperedCipher = sealed.ciphertext.slice(0, 10) + flipped + sealed.ciphertext.slice(11);
  assert.throws(
    () => openProjection({ ...sealed, ciphertext: tamperedCipher }, key),
    /CAPSULE_AUTHENTICATION_FAILED|INVALID_CAPSULE/,
  );
  assert.throws(()=>validateProjection({...projected,entries:{...projected.entries,'credential.password': projected.entries['talent_community.primary_areas']}}),/FORBIDDEN_SYNC_FIELD/);
});
