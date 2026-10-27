import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileVpnJournal, VPN_RECOVERY_JOURNAL_FILE } from './vpn-recovery-journal.ts';
import { recoverInterruptedVpnPause, withTemporaryVpnPause, type VpnAdapter, type VpnSnapshot } from './vpn-recovery.ts';

async function fixture(fn: (file: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'eh-vpn-journal-'));
  try { await fn(join(dir, VPN_RECOVERY_JOURNAL_FILE)); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
const entry = { providerId: 'synthetic-provider', connectionId: 'synthetic-route', phase: 'RESTORE_REQUIRED' } as const;
test('journal is private, exclusive, and preserved through process-independent re-open', async () => fixture(async file => {
  const first = createFileVpnJournal(file);
  assert.equal(await first.read(), null);
  await first.write(entry);
  assert.deepEqual(await createFileVpnJournal(file).read(), entry);
  await assert.rejects(first.write(entry), /EEXIST/);
  assert.match(await readFile(file, 'utf8'), /RESTORE_REQUIRED/);
  await first.clear();
  assert.equal(await createFileVpnJournal(file).read(), null);
}));
test('invalid, corrupt, or truncated files never mean safe to disconnect', async () => fixture(async file => {
  const journal = createFileVpnJournal(file);
  for (const invalid of ['', '{', '{}', JSON.stringify({...entry, phase:'NOOP'}), 'x'.repeat(2100)]) {
    await writeFile(file, invalid);
    await assert.rejects(journal.read(), /VPN_JOURNAL_UNTRUSTED_MANUAL_RECOVERY_REQUIRED/);
  }
}));
test('symlinked journal is rejected without touching linked contents', async t => fixture(async file => {
  const target = file + '.outside';
  await writeFile(target, JSON.stringify(entry));
  try { await symlink(target, file); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && ['EPERM','EACCES','ENOTSUP'].includes(String(error.code))) {
      t.skip('host does not permit test symlinks'); return;
    }
    throw error;
  }
  await assert.rejects(createFileVpnJournal(file).read(), /VPN_JOURNAL_UNTRUSTED_MANUAL_RECOVERY_REQUIRED/);
  assert.match(await readFile(target, 'utf8'), /synthetic-route/);
}));
test('real file journal preserves restore obligation after retry failure', async () => fixture(async file => {
  const journal = createFileVpnJournal(file);
  const events: string[] = [];
  let state: VpnSnapshot = { providerId:'synthetic-provider', connectionId:'synthetic-route', state:'connected', killSwitchEnabled:false };
  let restoreFails = true;
  const adapter: VpnAdapter = {
    snapshot: async () => ({...state}),
    disconnect: async () => { events.push('disconnect'); state={...state, state:'disconnected'}; },
    reconnect: async () => { events.push('reconnect'); if (!restoreFails) state={...state,state:'connected'}; },
  };
  const consent = { approved:true, disclosureAccepted:true, scope:'one_employer_navigation_retry' } as const;
  await assert.rejects(withTemporaryVpnPause({consent, adapter, journal, operation:async () => 'page'}), /VPN_RESTORE_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/);
  assert.deepEqual(await createFileVpnJournal(file).read(), entry);
  await assert.rejects(withTemporaryVpnPause({consent, adapter, journal, operation:async () => 'page'}), /PENDING_VPN_RESTORATION/);
  restoreFails = false;
  assert.equal(await recoverInterruptedVpnPause(adapter, createFileVpnJournal(file)), 'RESTORED');
  assert.equal(await journal.read(), null);
  assert.equal(state.state,'connected');
  assert.deepEqual(events,['disconnect','reconnect','reconnect']);
}));
test('invalid provider state cannot create journal or disconnect', async () => fixture(async file => {
  const journal = createFileVpnJournal(file);
  const adapter: VpnAdapter = {
    snapshot: async () => ({ providerId:'synthetic-provider',connectionId:'synthetic-route',state:'connected',killSwitchEnabled:null }),
    disconnect: async () => { throw Error('unreachable'); },
    reconnect: async () => { throw Error('unreachable'); },
  };
  await assert.rejects(withTemporaryVpnPause({
    consent:{approved:true,disclosureAccepted:true,scope:'one_employer_navigation_retry'}, adapter, journal, operation:async () => 'page',
  }), /VPN_PREFLIGHT_NOT_SAFE/);
  assert.equal(await journal.read(),null);
}));
