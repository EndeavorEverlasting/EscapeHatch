/** Local-only, consented automatic checks while the owned EscapeHatch runtime is open. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { userDataRoot } from './user-data.ts';
import { measureNetworkPath, type PathQualityReceipt } from './network-path-quality.ts';
import { TransitionGate, evaluate, type AlertKind } from './quality-transition.ts';

const INTERVAL = 60_000;
const POLICY = 'network-quality-monitor-policy.v1.json';
export type MonitorSnapshot = {
  enabled: boolean; cadence_seconds: 60;
  observed_utc: string | null; signal: string;
  event: AlertKind | null; event_observed_utc: string | null;
  receipt: PathQualityReceipt | null;
  delivery: 'REQUESTED_UNVERIFIED' | 'NOT_REQUESTED_OR_UNAVAILABLE';
};
export class AutomaticQualityRuntime {
  private enabled = false;
  private closed = false;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private policyBusy = false;
  private last: PathQualityReceipt | null = null;
  private event: AlertKind | null = null;
  private eventTime: string | null = null;
  private delivery: MonitorSnapshot['delivery'] = 'NOT_REQUESTED_OR_UNAVAILABLE';
  private gate: TransitionGate;
  constructor(
    private measure: () => Promise<PathQualityReceipt> = measureNetworkPath,
    private notify: (kind: AlertKind) => boolean = () => false,
    private now: () => number = Date.now,
    private policyPath: string = path.join(userDataRoot(), POLICY),
  ) { this.gate = new TransitionGate(now); }
  snapshot(): MonitorSnapshot {
    const fresh = this.last && Number.isFinite(Date.parse(this.last.observed_utc)) &&
      this.now() - Date.parse(this.last.observed_utc) <= INTERVAL * 3 &&
      this.now() >= Date.parse(this.last.observed_utc);
    return {
      enabled: this.enabled, cadence_seconds: 60,
      observed_utc: fresh ? this.last!.observed_utc : null,
      signal: this.enabled && fresh ? evaluate(this.last) : 'UNKNOWN',
      event: this.enabled ? this.event : null,
      event_observed_utc: this.enabled ? this.eventTime : null,
      receipt: this.enabled && fresh ? this.last : null,
      delivery: this.delivery,
    };
  }
  async load(): Promise<void> {
    if (this.closed) return;
    try {
      const text = await fs.readFile(this.policyPath, 'utf8');
      const policy: unknown = JSON.parse(text);
      if (policy && typeof policy === 'object' && !Array.isArray(policy) &&
          (policy as { schema?: string }).schema === 'escapehatch.network-monitor-policy.v1' &&
          (policy as { enabled?: unknown }).enabled === true) this.start();
    } catch { /* absent or damaged consent is OFF, not inferred */ }
  }
  async configure(enabled: boolean): Promise<void> {
    if (this.closed || this.policyBusy) throw new Error('monitor_unavailable');
    this.policyBusy = true;
    try {
      if (!enabled) this.stop();
      await fs.mkdir(path.dirname(this.policyPath), { recursive: true });
      const temp = this.policyPath + '.tmp';
      await fs.writeFile(temp, JSON.stringify({
        schema: 'escapehatch.network-monitor-policy.v1', enabled,
      }) + '\n', { mode: 0o600 });
      await fs.rename(temp, this.policyPath);
      if (enabled) this.start();
    } finally { this.policyBusy = false; }
  }
  private start() {
    if (this.closed || this.enabled) return;
    this.enabled = true;
    this.gate.reset();
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, INTERVAL);
    this.timer.unref?.();
  }
  async tick(): Promise<void> {
    if (!this.enabled || this.busy || this.closed) return;
    this.busy = true;
    try {
      const receipt = await this.measure();
      if (!this.enabled || this.closed) return;
      this.last = receipt;
      const event = this.gate.observe(receipt);
      if (event) {
        this.event = event;
        this.eventTime = receipt.observed_utc;
        try { this.delivery = this.notify(event)
          ? 'REQUESTED_UNVERIFIED' : 'NOT_REQUESTED_OR_UNAVAILABLE'; }
        catch { this.delivery = 'NOT_REQUESTED_OR_UNAVAILABLE'; }
      }
    } catch {
      if (this.enabled && !this.closed) {
        this.last = null;
        this.gate.observe(null);
      }
    } finally { this.busy = false; }
  }
  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.enabled = false;
    this.last = null;
    this.event = null;
    this.eventTime = null;
    this.delivery = 'NOT_REQUESTED_OR_UNAVAILABLE';
    this.gate.reset();
  }
  close() { this.stop(); this.closed = true; }
}
