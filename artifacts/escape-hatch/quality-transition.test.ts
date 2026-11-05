import assert from 'node:assert/strict';
import test from 'node:test';
import { TransitionGate, evaluate } from './quality-transition.ts';
import type { PathQualityReceipt } from './network-path-quality.ts';
const sample = (ms: number): PathQualityReceipt => ({
  schema: 'escapehatch.local-network-path-quality.v1',
  source_id: 'escapehatch-consented-fixed-path-probes',
  vantage: 'THIS_LOCAL_WINDOWS_ENDPOINT_ONLY',
  observed_utc: new Date().toISOString(),
  checks: { public_dns_resolution: 'PASS', public_tcp_1: 'PASS', public_tcp_2: 'PASS', tls_handshake: 'PASS' },
  latencies_ms: { dns_ms: 10, tcp_1_ms: ms, tcp_2_ms: ms, tls_ms: 20 },
  quality_class: 'USABLE_PATH', download_mbps: 'UNKNOWN', upload_mbps: 'UNKNOWN',
  isp_speed_test: 'NOT_PERFORMED', root_cause: 'UNPROVEN',
  private_identifiers_collected: false, scope: 'PERSONAL_OPT_IN_ONE_SHOT',
});
test('two samples confirm a degradation and a recovery', () => {
  const gate = new TransitionGate(() => 0);
  assert.equal(gate.observe(sample(240)), null);
  assert.equal(gate.observe(sample(240)), 'SLOW');
  assert.equal(gate.observe(sample(240)), null);
  assert.equal(gate.observe(sample(12)), null);
  assert.equal(gate.observe(sample(12)), 'RECOVERED');
});
test('one slow remote target and malformed sources cannot raise alerts', () => {
  const one = sample(20); one.latencies_ms.tcp_2_ms = 400;
  assert.equal(evaluate(one), 'UNKNOWN');
  const another = sample(240); another.source_id = 'invalid' as typeof another.source_id;
  assert.equal(evaluate(another), 'UNKNOWN');
});
