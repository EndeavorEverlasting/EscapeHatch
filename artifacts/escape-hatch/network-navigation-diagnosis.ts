/** Read-only diagnostic. Interface heuristics are never proof of VPN causality. */
export type NavigationDiagnosis = {
  code: 'VPN_INTERFERENCE_SUSPECTED' | 'NETWORK_FAILURE_UNATTRIBUTED' | 'NAVIGATION_FAILURE_UNCLASSIFIED';
  vpnCandidateDetected: boolean;
  causeVerified: false;
};
export function diagnoseNavigationFailure(error: unknown, activeInterfaceNames: string[]): NavigationDiagnosis {
  const message = error instanceof Error ? error.message : String(error);
  const vpnCandidateDetected = activeInterfaceNames.some(name => /nordlynx|wireguard|openvpn|mullvad|protonvpn|tun(?:nel)?\b|tap[- ]windows|vpn/i.test(name));
  const tunnelFailure = /ERR_(?:TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|SOCKS_CONNECTION_FAILED|VPN_DISCONNECTED)/i.test(message);
  const networkFailure = tunnelFailure || /ERR_(?:NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|NETWORK_CHANGED|CONNECTION_(?:RESET|TIMED_OUT|CLOSED)|TIMED_OUT)/i.test(message);
  return {
    code: vpnCandidateDetected && tunnelFailure ? 'VPN_INTERFERENCE_SUSPECTED' : networkFailure ? 'NETWORK_FAILURE_UNATTRIBUTED' : 'NAVIGATION_FAILURE_UNCLASSIFIED',
    vpnCandidateDetected,
    causeVerified: false,
  };
}
