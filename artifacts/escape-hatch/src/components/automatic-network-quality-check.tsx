import { useEffect, useRef, useState } from 'react';
import { showNetworkEvent } from './network-event-notification';
import type { MonitorSnapshot } from '../../network-quality-runtime.ts';

const BASE = '/__escapehatch/network-path-quality/monitor';
export function AutomaticNetworkQualityCheck() {
  const [monitor, setMonitor] = useState<MonitorSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lastSeenEvent = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    async function refresh() {
      try {
        const response = await fetch(BASE + '/health', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw Error('unavailable');
        const result = await response.json() as { monitor?: MonitorSnapshot };
        if (live && result.monitor) {
          const event = result.monitor.event;
          const key = event && result.monitor.event_observed_utc
            ? event + ':' + result.monitor.event_observed_utc : '';
          if (lastSeenEvent.current !== null && key && key !== lastSeenEvent.current &&
              result.monitor.enabled && event) showNetworkEvent(event);
          lastSeenEvent.current = key;
          setMonitor(result.monitor);
        }
      } catch {
        if (live) setMessage('Automatic checks require an installed Windows EscapeHatch runtime.');
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  async function setEnabled(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }
    try {
      const response = await fetch(BASE + (enabled ? '/enable' : '/disable'), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'x-escapehatch-operator-action': 'confirmed', 'x-escapehatch-network-scope': 'personal' },
      });
      if (!response.ok) throw Error('unavailable');
      const result = await response.json() as { monitor?: MonitorSnapshot };
      if (result.monitor) setMonitor(result.monitor);
      setMessage(enabled ? 'Automatic checks enabled for this personal Windows device.' : 'Automatic checks disabled.');
    } catch { setMessage('The monitoring preference could not be changed.'); }
    finally { setBusy(false); }
  }
  const enabled = Boolean(monitor?.enabled);
  return <section className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4" aria-label="Automatic network diagnostics" data-testid="automatic-network-quality">
    <h3 className="text-sm font-bold">Automatic network health</h3>
    <p className="mt-1 text-xs text-muted-foreground">After one opt-in, EscapeHatch checks this personal Windows device every 60 seconds. It confirms sustained degradation and recovery without changing your VPN or application.</p>
    <button type="button" disabled={busy} aria-pressed={enabled} data-testid="network-auto-toggle"
      className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
      onClick={() => void setEnabled(!enabled)}>
      {busy ? 'Saving…' : enabled ? 'Disable automatic checks' : 'Enable automatic checks'}
    </button>
    <p className="mt-2 text-xs" role="status" aria-live="polite" data-testid="network-auto-status">
      {message || (!monitor ? 'Checking local monitor status…' : enabled
        ? 'Latest signal: ' + monitor.signal.toLowerCase().replaceAll('_', ' ') +
          '. Last check: ' + (monitor.observed_utc || 'not yet available') +
          '. Root cause unproven; bandwidth unknown.'
        : 'Off until you opt in on this personal device.')}
    </p>
    {enabled && monitor?.event && <p className="mt-2 text-sm font-semibold" role="alert">
      {monitor.event === 'RECOVERED' ? 'Connection checks recovered.' :
        'Connection degradation detected: ' + monitor.event.toLowerCase().replaceAll('_', ' ') + '.'}
    </p>}
  </section>;
}
