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
