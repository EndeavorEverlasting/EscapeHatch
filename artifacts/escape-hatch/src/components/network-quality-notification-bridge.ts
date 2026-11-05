/** Watches redacted event status across EscapeHatch pages; never starts a probe. */
import { useEffect, useRef } from 'react';
import { showNetworkEvent } from './network-event-notification.ts';
import type { MonitorSnapshot } from '../../network-quality-runtime.ts';

export function NetworkQualityNotificationBridge() {
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    async function observe() {
      try {
        const res = await fetch('/__escapehatch/network-path-quality/monitor/health', {
          credentials: 'same-origin', cache: 'no-store',
        });
        if (!res.ok) return;
        const payload = await res.json() as { monitor?: MonitorSnapshot };
        if (!active || !payload.monitor) return;
        const current = payload.monitor;
        const key = current.event && current.event_observed_utc
          ? current.event + ':' + current.event_observed_utc : '';
        if (lastSeen.current !== null && key && key !== lastSeen.current &&
            current.enabled && current.event &&
            (current.event === 'RECOVERED' ? current.signal === 'GOOD'
              : current.event === current.signal)) showNetworkEvent(current.event);
        lastSeen.current = key;
      } catch { /* no runtime or notifications available; never infer an outage */ }
    }
    void observe();
    const interval = window.setInterval(() => void observe(), 15_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  return null;
}
