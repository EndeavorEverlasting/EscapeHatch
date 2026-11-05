import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseNavigationFailure } from './network-navigation-diagnosis.ts';

test('tunnel failure with active VPN-like interface is only a suspicion', () => {
  assert.deepEqual(diagnoseNavigationFailure(new Error('net::ERR_TUNNEL_CONNECTION_FAILED'), ['NordLynx']), {
    code: 'VPN_INTERFERENCE_SUSPECTED', vpnCandidateDetected: true, causeVerified: false,
  });
});
test('DNS failure is unattributed even if VPN-like interface is present', () => {
  assert.equal(diagnoseNavigationFailure(new Error('net::ERR_NAME_NOT_RESOLVED'), ['WireGuard Tunnel']).code, 'NETWORK_FAILURE_UNATTRIBUTED');
});
test('no VPN-like interface cannot produce a VPN attribution', () => {
  assert.equal(diagnoseNavigationFailure(new Error('net::ERR_PROXY_CONNECTION_FAILED'), ['Ethernet']).code, 'NETWORK_FAILURE_UNATTRIBUTED');
  assert.equal(diagnoseNavigationFailure(new Error('page closed'), ['Ethernet']).code, 'NAVIGATION_FAILURE_UNCLASSIFIED');
});

import { TransitionGate, evaluate } from './quality-transition.ts';
import type { PathQualityReceipt } from './network-path-quality.ts';

function sampled(ms: number): PathQualityReceipt {
  return {
    schema: 'escapehatch.local-network-path-quality.v1',
    source_id: 'escapehatch-consented-fixed-path-probes',
    vantage: 'THIS_LOCAL_WINDOWS_ENDPOINT_ONLY',
    observed_utc: '2026-11-05T12:00:00Z',
    checks: { public_dns_resolution: 'PASS', public_tcp_1: 'PASS', public_tcp_2: 'PASS', tls_handshake: 'PASS' },
    latencies_ms: { dns_ms: 10, tcp_1_ms: ms, tcp_2_ms: ms, tls_ms: 10 },
    quality_class: 'USABLE_PATH',
    download_mbps: 'UNKNOWN', upload_mbps: 'UNKNOWN', isp_speed_test: 'NOT_PERFORMED',
    root_cause: 'UNPROVEN', private_identifiers_collected: false, scope: 'PERSONAL_OPT_IN_ONE_SHOT',
  };
}
test('automatic diagnostic requires two bad checks and two recoveries', () => {
  const gate = new TransitionGate(() => 1000000);
  assert.equal(gate.observe(sampled(240)), null);
  assert.equal(gate.observe(sampled(240)), 'SLOW');
  assert.equal(gate.observe(sampled(240)), null);
  assert.equal(gate.observe(sampled(30)), null);
  assert.equal(gate.observe(sampled(30)), 'RECOVERED');
});
test('automatic diagnostic does not infer a device-wide issue from one slow target', () => {
  const receipt = sampled(20);
  receipt.latencies_ms.tcp_2_ms = 400;
  assert.equal(evaluate(receipt), 'UNKNOWN');
  receipt.source_id = 'external' as PathQualityReceipt['source_id'];
  assert.equal(evaluate(receipt), 'UNKNOWN');
});

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AutomaticQualityRuntime } from './network-quality-runtime.ts';

test('automatic monitor does not sample before consent, then remembers an explicit off', async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'eh-network-monitor-'));
  const policy = path.join(dir, 'monitor.json');
  let samples = 0;
  const read = async () => { samples++; return sampled(25); };
  const monitor = new AutomaticQualityRuntime(read, () => false,
    () => Date.parse('2026-11-05T12:00:00Z'), policy);
  try {
    await monitor.load();
    assert.equal(monitor.snapshot().enabled, false);
    assert.equal(samples, 0);
    await monitor.configure(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(monitor.snapshot().enabled, true);
    assert.ok(samples >= 1);
    await monitor.configure(false);
    assert.equal(monitor.snapshot().enabled, false);
    const restarted = new AutomaticQualityRuntime(read, () => false,
      () => Date.parse('2026-11-05T12:00:00Z'), policy);
    await restarted.load();
    assert.equal(restarted.snapshot().enabled, false);
    restarted.close();
  } finally {
    monitor.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('automatic sensor loss cannot be presented as a verified recovery', async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'eh-network-sensor-'));
  const policy = path.join(dir, 'monitor.json');
  let value = sampled(250);
  const monitor = new AutomaticQualityRuntime(async () => value, () => false,
    () => Date.parse('2026-11-05T12:00:00Z'), policy);
  try {
    await monitor.configure(true);
    await new Promise(resolve => setImmediate(resolve));
    await monitor.tick();
    assert.equal(monitor.snapshot().event, 'SLOW');
    value = sampled(20);
    await monitor.tick();
    assert.notEqual(monitor.snapshot().event, 'RECOVERED');
    await monitor.tick();
    assert.equal(monitor.snapshot().event, 'RECOVERED');
  } finally {
    monitor.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
