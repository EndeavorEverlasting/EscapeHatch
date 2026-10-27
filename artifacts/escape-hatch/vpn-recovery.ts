/** Consent-gated, provider-neutral VPN pause for a single employer-site retry.
 * Concrete OS/provider adapter and durable journal are required; no interface is disabled here.
 */
export type VpnSnapshot = {
  providerId: string; connectionId: string | null;
  state: 'connected' | 'disconnected' | 'unknown';
  killSwitchEnabled: boolean | null;
};
export type VpnConsent = {
  approved: true; disclosureAccepted: true; scope: 'one_employer_navigation_retry';
};
export type VpnJournalEntry = { providerId: string; connectionId: string; phase: 'RESTORE_REQUIRED' };
export type VpnAdapter = {
  snapshot(): Promise<VpnSnapshot>;
  disconnect(connectionId: string): Promise<void>;
  reconnect(connectionId: string): Promise<void>;
};
export type VpnJournal = {
  read(): Promise<VpnJournalEntry | null>;
  write(entry: VpnJournalEntry): Promise<void>;
  clear(): Promise<void>;
};
export class VpnRecoveryError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = 'VpnRecoveryError'; }
}
function assertExpected(snapshot: VpnSnapshot, entry: VpnJournalEntry, state: VpnSnapshot['state']) {
  if (snapshot.providerId !== entry.providerId ||
      snapshot.connectionId !== entry.connectionId || snapshot.state !== state) {
    throw new VpnRecoveryError('VPN_STATE_NOT_VERIFIED');
  }
}
/** Fail closed on an interrupted transaction. Never overwrite a pending recovery record. */
export async function withTemporaryVpnPause<T>(args: {
  consent: VpnConsent | null; adapter: VpnAdapter; journal: VpnJournal; operation: () => Promise<T>;
}): Promise<T> {
  const { consent, adapter, journal, operation } = args;
  if (!consent || !consent.approved || !consent.disclosureAccepted ||
      consent.scope !== 'one_employer_navigation_retry') {
    throw new VpnRecoveryError('EXPLICIT_ONE_RETRY_CONSENT_REQUIRED');
  }
  if (await journal.read()) throw new VpnRecoveryError('PENDING_VPN_RESTORATION');
  const before = await adapter.snapshot();
  if (before.state !== 'connected' || !before.connectionId || before.killSwitchEnabled !== false) {
    throw new VpnRecoveryError('VPN_PREFLIGHT_NOT_SAFE');
  }
  const entry: VpnJournalEntry = {
    providerId: before.providerId, connectionId: before.connectionId, phase: 'RESTORE_REQUIRED',
  };
  await journal.write(entry); // Must be durable before disconnection.
  let operationFailure: unknown;
  let result: T | undefined;
  try {
    await adapter.disconnect(entry.connectionId);
    assertExpected(await adapter.snapshot(), entry, 'disconnected');
    result = await operation();
  } catch (error) {
    operationFailure = error;
  } finally {
    // A partially failed disconnect still needs restoration.
    try {
      const latest = await adapter.snapshot();
      if (latest.providerId !== entry.providerId || latest.connectionId !== entry.connectionId) {
        throw new VpnRecoveryError('VPN_IDENTITY_CHANGED_RESTORE_MANUALLY');
      }
      if (latest.state !== 'connected') await adapter.reconnect(entry.connectionId);
      assertExpected(await adapter.snapshot(), entry, 'connected');
      await journal.clear();
    } catch {
      // Leave journal for next startup; do not claim reconnection.
      throw new VpnRecoveryError('VPN_RESTORE_UNVERIFIED_MANUAL_RECOVERY_REQUIRED');
    }
  }
  if (operationFailure !== undefined) throw operationFailure;
  return result as T;
}
/** At startup, reconcile the persisted original connection before offering another pause. */
export async function recoverInterruptedVpnPause(
  adapter: VpnAdapter, journal: VpnJournal,
): Promise<'NOT_NEEDED' | 'RESTORED'> {
  const entry = await journal.read();
  if (!entry) return 'NOT_NEEDED';
  try {
    const before = await adapter.snapshot();
    if (before.providerId !== entry.providerId || before.connectionId !== entry.connectionId) {
      throw new VpnRecoveryError('VPN_IDENTITY_CHANGED_RESTORE_MANUALLY');
    }
    if (before.state !== 'connected') await adapter.reconnect(entry.connectionId);
    assertExpected(await adapter.snapshot(), entry, 'connected');
    await journal.clear();
    return 'RESTORED';
  } catch {
    throw new VpnRecoveryError('VPN_RESTORE_UNVERIFIED_MANUAL_RECOVERY_REQUIRED');
  }
}
