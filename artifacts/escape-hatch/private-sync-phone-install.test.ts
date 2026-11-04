import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONE_LAN_INSTALL_PORT, resolvePhoneLanInstall } from './private-sync-phone-install.ts';

test('phone LAN install metadata never carries a pairing code and uses dedicated port', () => {
  const info = resolvePhoneLanInstall();
  assert.equal(info.lanPort, PHONE_LAN_INSTALL_PORT);
  assert.equal(info.pairingCode, 'never_on_lan');
  assert.deepEqual(info.serves, ['apk', 'offer', 'capsule']);
  if (info.lanUrl) {
    assert.match(info.lanUrl, new RegExp(`^http://192\\.168\\.\\d+\\.\\d+:${PHONE_LAN_INSTALL_PORT}/$`));
  }
});
