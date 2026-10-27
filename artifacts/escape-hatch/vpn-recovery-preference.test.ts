import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPreferences, parsePreferences } from './src/lib/application-preferences.ts';

test('VPN compatibility-assist preference is on by default for new profiles', () => {
  assert.equal(emptyPreferences().vpn_recovery_assist_enabled, true);
});
test('legacy existing profile defaults to enabled without rewriting saved answers', () => {
  const previous = emptyPreferences();
  delete previous.vpn_recovery_assist_enabled;
  const result = parsePreferences(previous);
  assert.equal(result?.vpn_recovery_assist_enabled, true);
  assert.deepEqual(result?.preferences, previous.preferences);
});
test('explicit user off choice survives normalization; no hidden forced-on reset', () => {
  const disabled = { ...emptyPreferences(), vpn_recovery_assist_enabled: false };
  assert.equal(parsePreferences(disabled)?.vpn_recovery_assist_enabled, false);
});
test('malformed VPN setting is rejected rather than treated as consent', () => {
  assert.equal(parsePreferences({ ...emptyPreferences(), vpn_recovery_assist_enabled: 'true' }), null);
});
