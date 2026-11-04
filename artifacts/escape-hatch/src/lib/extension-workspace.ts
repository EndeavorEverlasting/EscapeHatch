import manifest from '../../../../browser/application-assist/manifest.json' with { type: 'json' };

type ExtensionResponse = { ok?: boolean; status?: string; profileFieldCount?: number; answerCount?: number; reason?: string };
type ExternalRuntime = {
  lastError?: { message?: string };
  sendMessage: (extensionId: string, message: { type: 'workspace-refresh' }, callback: (response?: ExtensionResponse) => void) => void;
};

/** Chrome derives the stable extension ID from its checked-in public key. */
export async function applicationAssistExtensionId() {
  const key = Uint8Array.from(atob(manifest.key), character => character.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', key));
  return [...digest.slice(0, 16)].map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
}

/** Wake only. All private reads, approval and writes remain inside native messaging. */
export async function refreshExtensionWorkspace(runtime?: ExternalRuntime): Promise<string> {
  if (!runtime?.sendMessage) return 'The optional companion is not connected. Continue with managed preparation in Browser assist.';
  const extensionId = await applicationAssistExtensionId();
  return new Promise(resolve => {
    let settled = false;
    const finish = (message: string) => { if (!settled) { settled = true; clearTimeout(timeout); resolve(message); } };
    const timeout = setTimeout(() => finish('The optional companion did not respond. Check its deployed build in EscapeHatch; managed preparation remains available.'), 5000);
    try {
      runtime.sendMessage(extensionId, { type: 'workspace-refresh' }, result => {
        if (runtime.lastError || !result?.ok) return finish('The optional companion could not synchronize. Check its deployed build in EscapeHatch; managed preparation remains available.');
        if (result.status === 'PROJECTED' || result.status === 'ALREADY_CURRENT') {
          const fields = Number.isSafeInteger(result.profileFieldCount) && result.profileFieldCount! >= 0 ? result.profileFieldCount : 0;
          const answers = Number.isSafeInteger(result.answerCount) && result.answerCount! >= 0 ? result.answerCount : 0;
          return finish(`Extension workspace is current: ${fields} profile fields and ${answers} approved answers.`);
        }
        finish(result.status === 'PAUSED'
          ? 'Extension synchronization is paused. Review your changes in the extension.'
          : 'The optional companion needs workspace approval. Managed preparation remains available in Browser assist.');
      });
    } catch { finish('The optional companion is not connected. Continue with managed preparation in Browser assist.'); }
  });
}

export function browserExtensionRuntime(): ExternalRuntime | undefined {
  return (window as unknown as { chrome?: { runtime?: ExternalRuntime } }).chrome?.runtime;
}
