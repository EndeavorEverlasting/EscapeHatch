/**
 * Value-free LAN install metadata for Android phone proof (port 18765).
 * Never includes pairing codes or preference values.
 */
import os from 'node:os';

export const PHONE_LAN_INSTALL_PORT = 18765;

export type PhoneLanInstallInfo = {
  lanPort: number;
  lanHost: string | null;
  lanUrl: string | null;
  serves: string[];
  pairingCode: 'never_on_lan';
  phoneHint: string;
};

export function resolvePhoneLanInstall(): PhoneLanInstallInfo {
  const ifaces = Object.entries(os.networkInterfaces());
  const candidates: Array<{ name: string; address: string }> = [];
  for (const [name, list] of ifaces) {
    for (const info of list || []) {
      if ((info.family === 'IPv4' || (info.family as unknown) === 4) && !info.internal) {
        candidates.push({ name, address: info.address });
      }
    }
  }
  const wifi =
    candidates.find((i) => /^192\.168\./.test(i.address) && /wi-?fi|wlan|wireless/i.test(i.name)) ||
    candidates.find((i) => /^192\.168\./.test(i.address));
  const lanHost = wifi?.address || null;
  return {
    lanPort: PHONE_LAN_INSTALL_PORT,
    lanHost,
    lanUrl: lanHost ? `http://${lanHost}:${PHONE_LAN_INSTALL_PORT}/` : null,
    serves: ['apk', 'offer', 'capsule', 'proof', 'qr'],
    pairingCode: 'never_on_lan',
    phoneHint:
      'On the phone: install APK from lanUrl (or scan /qr.svg), Pair → Fetch sealed offer from PC, enter desktop code, Import → Fetch capsule, tap Send proof to PC (POST /proof).',
  };
}
