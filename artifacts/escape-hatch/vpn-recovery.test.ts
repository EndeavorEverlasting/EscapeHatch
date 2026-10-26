import assert from 'node:assert/strict';
import test from 'node:test';
import {
  withTemporaryVpnPause, recoverInterruptedVpnPause,
  type VpnJournalEntry, type VpnSnapshot, type VpnAdapter, type VpnJournal,
} from './vpn-recovery.ts';

function fixture(killSwitchEnabled: boolean | null = false) {
  const actions: string[] = [];
  let state: VpnSnapshot = {
    providerId: 'synthetic-provider', connectionId: 'synthetic-connection',
    state: 'connected', killSwitchEnabled,
  };
  let pending: VpnJournalEntry | null = null;
  let failReconnect = false;
  const adapter: VpnAdapter = {
    snapshot: async () => ({ ...state }),
    disconnect: async () => { actions.push('disconnect'); state = { ...state, state: 'disconnected' }; },
    reconnect: async () => {
      actions.push('reconnect');
      if (!failReconnect) state = { ...state, state: 'connected' };
    },
  };
  const journal: VpnJournal = {
    read: async () => pending,
    write: async entry => { actions.push('journal-write'); pending = entry; },
    clear: async () => { actions.push('journal-clear'); pending = null; },
  };
  const consent = { approved: true, disclosureAccepted: true, scope: 'one_employer_navigation_retry' } as const;
  return { actions, adapter, journal, consent,
    pending: () => pending,
    state: () => state,
    failReconnect: () => { failReconnect = true; },
    setPending: (value: VpnJournalEntry | null) => { pending = value; },
  };
}
test('no scoped consent means no network changes', async () => {
  const f = fixture();
  await assert.rejects(withTemporaryVpnPause({ ...f, consent: null, operation: async () => 'x' }), /EXPLICIT_ONE_RETRY_CONSENT_REQUIRED/);
  assert.deepEqual(f.actions, []);
});
test('unknown or enabled kill switch blocks disconnection', async () => {
  for (const status of [true, null]) {
    const f = fixture(status);
    await assert.rejects(withTemporaryVpnPause({ ...f, operation: async () => 'x' }), /VPN_PREFLIGHT_NOT_SAFE/);
    assert.deepEqual(f.actions, []);
  }
});
test('journaling precedes disconnection; successful retry is followed by reconnection', async () => {
  const f = fixture();
  const result = await withTemporaryVpnPause({ ...f, operation: async () => {
    f.actions.push('site-retry'); return 'review-only';
  } });
  assert.equal(result, 'review-only');
  assert.deepEqual(f.actions, ['journal-write', 'disconnect', 'site-retry', 'reconnect', 'journal-clear']);
  assert.equal(f.state().state, 'connected');
});
test('navigation failure does not suppress restoration', async () => {
  const f = fixture();
  await assert.rejects(withTemporaryVpnPause({ ...f, operation: async () => { throw Error('site failed'); } }), /site failed/);
  assert.equal(f.state().state, 'connected');
  assert.equal(f.pending(), null);
});
test('failed reconnect is surfaced; pending journal blocks future pauses', async () => {
  const f = fixture(); f.failReconnect();
  await assert.rejects(withTemporaryVpnPause({ ...f, operation: async () => 'x' }), /VPN_RESTORE_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/);
  assert.equal(f.pending()?.phase, 'RESTORE_REQUIRED');
  await assert.rejects(withTemporaryVpnPause({ ...f, operation: async () => 'x' }), /PENDING_VPN_RESTORATION/);
});
test('startup reconciliation is idempotent', async () => {
  const f = fixture();
  f.setPending({ providerId: 'synthetic-provider', connectionId: 'synthetic-connection', phase: 'RESTORE_REQUIRED' });
  assert.equal(await recoverInterruptedVpnPause(f.adapter, f.journal), 'RESTORED');
  assert.equal(await recoverInterruptedVpnPause(f.adapter, f.journal), 'NOT_NEEDED');
  assert.deepEqual(f.actions, ['journal-clear']);
});
