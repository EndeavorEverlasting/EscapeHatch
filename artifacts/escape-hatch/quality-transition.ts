import type { PathQualityReceipt } from './network-path-quality.ts';
export type AlertKind = 'SLOW' | 'DNS_ISSUE' | 'PATH_ISSUE' | 'RECOVERED';
export type Signal = AlertKind | 'GOOD' | 'UNKNOWN';
export function evaluate(receipt: PathQualityReceipt | null): Signal {
  if (!receipt || receipt.schema !== 'escapehatch.local-network-path-quality.v1' ||
      receipt.source_id !== 'escapehatch-consented-fixed-path-probes' ||
      receipt.vantage !== 'THIS_LOCAL_WINDOWS_ENDPOINT_ONLY') return 'UNKNOWN';
  const c = receipt.checks;
  if (c.public_tcp_1 === 'FAIL' && c.public_tcp_2 === 'FAIL') return 'PATH_ISSUE';
  if (c.public_tcp_1 !== 'PASS' || c.public_tcp_2 !== 'PASS') return 'UNKNOWN';
  if (c.public_dns_resolution === 'FAIL') return 'DNS_ISSUE';
  if (c.public_dns_resolution !== 'PASS') return 'UNKNOWN';
  const a = receipt.latencies_ms.tcp_1_ms, b = receipt.latencies_ms.tcp_2_ms;
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 10000 || b > 10000) return 'UNKNOWN';
  return a >= 180 && b >= 180 ? 'SLOW' : a < 180 && b < 180 ? 'GOOD' : 'UNKNOWN';
}
export class TransitionGate {
  private previous: Signal = 'UNKNOWN';
  private count = 0;
  private active: Signal = 'GOOD';
  private lastAlertAt = -Infinity;
  private lastSampleAt: number | null = null;
  constructor(private now: () => number = Date.now) {}
  observe(receipt: PathQualityReceipt | null): AlertKind | null {
    const now = this.now();
    if (this.lastSampleAt !== null && now - this.lastSampleAt > 150_000) {
      this.previous = 'UNKNOWN';
      this.count = 0;
    }
    this.lastSampleAt = now;
    const signal = evaluate(receipt);
    this.count = signal === this.previous ? this.count + 1 : 1;
    this.previous = signal;
    if (signal === 'UNKNOWN' || this.count < 2) return null;
    if (signal === 'GOOD') {
      if (this.active === 'GOOD') return null;
      this.active = 'GOOD';
      return 'RECOVERED';
    }
    if (this.active === signal) return null;
    this.active = signal;
    if (this.now() - this.lastAlertAt < 600_000) return null;
    this.lastAlertAt = this.now();
    return signal;
  }
  reset() { this.previous = 'UNKNOWN'; this.count = 0; this.active = 'GOOD'; this.lastAlertAt = -Infinity; this.lastSampleAt = null; }
}
