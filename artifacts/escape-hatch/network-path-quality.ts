/** EscapeHatch-owned local DNS/TCP/TLS path check.
 *
 * PiShark's "Escape Hatch" experiment is prior art, not a dependency of this
 * Node-bundled career product. This module performs NO automatic monitoring,
 * bandwidth benchmark, web fetch, browser navigation, data capture, or upload.
 */
import { lookup } from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import { performance } from 'node:perf_hooks';

const TIMEOUT_MS = 3000;
const TCP_TARGETS = ['1.1.1.1', '9.9.9.9'] as const;
const DNS_TARGET = 'example.com';
export const NETWORK_PATH_SCHEMA = 'escapehatch.local-network-path-quality.v1' as const;
export const NETWORK_PATH_SOURCE = 'escapehatch-consented-fixed-path-probes' as const;
export type CheckStatus = 'PASS' | 'FAIL' | 'UNAVAILABLE';
export type CheckResult = { status: CheckStatus; latencyMs: number | null };
export type QualityClass = 'USABLE_PATH' | 'DEGRADED_LATENCY' | 'SEVERELY_DEGRADED_LATENCY'
  | 'DNS_PATH_DEGRADED' | 'DEGRADED_PUBLIC_PATH' | 'UNUSABLE_PUBLIC_PATH'
  | 'TLS_PATH_UNVERIFIED' | 'INSUFFICIENT_EVIDENCE';
export type PathQualityReceipt = {
  schema: typeof NETWORK_PATH_SCHEMA;
  source_id: typeof NETWORK_PATH_SOURCE;
  vantage: 'THIS_LOCAL_WINDOWS_ENDPOINT_ONLY';
  observed_utc: string;
  checks: {
    public_dns_resolution: CheckStatus;
    public_tcp_1: CheckStatus;
    public_tcp_2: CheckStatus;
    tls_handshake: CheckStatus;
  };
  latencies_ms: {
    dns_ms: number | null;
    tcp_1_ms: number | null;
    tcp_2_ms: number | null;
    tls_ms: number | null;
  };
  quality_class: QualityClass;
  download_mbps: 'UNKNOWN';
  upload_mbps: 'UNKNOWN';
  isp_speed_test: 'NOT_PERFORMED';
  root_cause: 'UNPROVEN';
  private_identifiers_collected: false;
  scope: 'PERSONAL_OPT_IN_ONE_SHOT';
};

export type PathProbes = {
  dns: () => Promise<CheckResult>;
  tcp1: () => Promise<CheckResult>;
  tcp2: () => Promise<CheckResult>;
  tls: () => Promise<CheckResult>;
};

function elapsed(start: number): number {
  return Math.min(10000, Math.max(0, Math.round(performance.now() - start)));
}

function dnsProbe(): Promise<CheckResult> {
  return new Promise(resolve => {
    const started = performance.now();
    let finished = false;
    const finish = (status: CheckStatus) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve({ status, latencyMs: status === 'PASS' ? elapsed(started) : null });
    };
    const timeout = setTimeout(() => finish('FAIL'), TIMEOUT_MS);
    // Fixed public name, system-configured DNS resolution. Never return addresses.
    try {
      lookup(DNS_TARGET, { family: 4 }, (error) => finish(error ? 'FAIL' : 'PASS'));
    } catch {
      finish('UNAVAILABLE');
    }
  });
}

function connectionProbe(host: string, encrypted: boolean): Promise<CheckResult> {
  return new Promise(resolve => {
    const started = performance.now();
    let finished = false;
    let socket: net.Socket | tls.TLSSocket | undefined;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (status: CheckStatus) => {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      const result: CheckResult = { status, latencyMs: status === 'PASS' ? elapsed(started) : null };
      socket?.destroy();
      resolve(result);
    };
    try {
      socket = encrypted
        ? tls.connect({ host, port: 443, servername: DNS_TARGET, rejectUnauthorized: true })
        : net.connect({ host, port: 443 });
      socket.on('error', () => finish('FAIL'));
      socket.once(encrypted ? 'secureConnect' : 'connect', () => finish('PASS'));
      timeout = setTimeout(() => finish('FAIL'), TIMEOUT_MS);
    } catch {
      finish('UNAVAILABLE');
    }
  });
}

export const livePathProbes: PathProbes = Object.freeze({
  dns: dnsProbe,
  tcp1: () => connectionProbe(TCP_TARGETS[0], false),
  tcp2: () => connectionProbe(TCP_TARGETS[1], false),
  // DNS + verified TLS to one fixed, public hostname; not a TLS login or HTTP request.
  tls: () => connectionProbe(DNS_TARGET, true),
});

function clean(value: unknown): CheckResult {
  if (!value || typeof value !== 'object') return { status: 'UNAVAILABLE', latencyMs: null };
  const candidate = value as Partial<CheckResult>;
  if (candidate.status === 'FAIL') return { status: 'FAIL', latencyMs: null };
  if (candidate.status !== 'PASS' || typeof candidate.latencyMs !== 'number' ||
      !Number.isFinite(candidate.latencyMs) || candidate.latencyMs < 0 ||
      candidate.latencyMs > 10000) {
    return { status: 'UNAVAILABLE', latencyMs: null };
  }
  return { status: 'PASS', latencyMs: Math.round(candidate.latencyMs) };
}

async function safeProbe(fn: () => Promise<CheckResult>): Promise<CheckResult> {
  try { return clean(await fn()); }
  catch { return { status: 'UNAVAILABLE', latencyMs: null }; }
}

export function classifyPath(checks: PathQualityReceipt['checks'],
                             latencies: PathQualityReceipt['latencies_ms']): QualityClass {
  const values = Object.values(checks);
  if (values.some(value => value === 'UNAVAILABLE')) return 'INSUFFICIENT_EVIDENCE';
  const tcp = [checks.public_tcp_1, checks.public_tcp_2];
  if (tcp.every(value => value === 'FAIL')) return 'UNUSABLE_PUBLIC_PATH';
  if (checks.public_dns_resolution === 'FAIL' && tcp.every(value => value === 'PASS')) return 'DNS_PATH_DEGRADED';
  if (checks.public_dns_resolution === 'FAIL' || tcp.includes('FAIL')) return 'DEGRADED_PUBLIC_PATH';
  if (checks.tls_handshake !== 'PASS') return 'TLS_PATH_UNVERIFIED';
  const times = Object.values(latencies);
  if (times.some(value => typeof value !== 'number' || !Number.isFinite(value))) return 'INSUFFICIENT_EVIDENCE';
  const worst = Math.max(...(times as number[]));
  if (worst >= 250) return 'SEVERELY_DEGRADED_LATENCY';
  if (worst >= 120) return 'DEGRADED_LATENCY';
  return 'USABLE_PATH';
}

export async function measureNetworkPath(
  probes: PathProbes = livePathProbes,
  timestamp: () => string = () => new Date().toISOString(),
): Promise<PathQualityReceipt> {
  // All targets are fixed in livePathProbes. Injected providers are for offline tests.
  const [dns, tcp1, tcp2, tlsResult] = await Promise.all([
    safeProbe(probes.dns), safeProbe(probes.tcp1),
    safeProbe(probes.tcp2), safeProbe(probes.tls),
  ]);
  const checks: PathQualityReceipt['checks'] = {
    public_dns_resolution: dns.status,
    public_tcp_1: tcp1.status,
    public_tcp_2: tcp2.status,
    tls_handshake: tlsResult.status,
  };
  const latencies_ms: PathQualityReceipt['latencies_ms'] = {
    dns_ms: dns.latencyMs,
    tcp_1_ms: tcp1.latencyMs,
    tcp_2_ms: tcp2.latencyMs,
    tls_ms: tlsResult.latencyMs,
  };
  return {
    schema: NETWORK_PATH_SCHEMA,
    source_id: NETWORK_PATH_SOURCE,
    vantage: 'THIS_LOCAL_WINDOWS_ENDPOINT_ONLY',
    observed_utc: timestamp(),
    checks, latencies_ms,
    quality_class: classifyPath(checks, latencies_ms),
    download_mbps: 'UNKNOWN', upload_mbps: 'UNKNOWN',
    isp_speed_test: 'NOT_PERFORMED', root_cause: 'UNPROVEN',
    private_identifiers_collected: false, scope: 'PERSONAL_OPT_IN_ONE_SHOT',
  };
}
