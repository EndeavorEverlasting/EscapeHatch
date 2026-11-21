/** Browser-level contextual alert: only for fresh automatic events after permission. */
import type { AlertKind } from '../../quality-transition.ts';

const TITLES: Record<AlertKind, string> = {
  SLOW: 'EscapeHatch: slow network response',
  DNS_ISSUE: 'EscapeHatch: DNS trouble',
  PATH_ISSUE: 'EscapeHatch: connection checks failing',
  RECOVERED: 'EscapeHatch: connection checks recovered',
};
export function showNetworkEvent(kind: AlertKind): boolean {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    new Notification(TITLES[kind], {
      body: kind === 'RECOVERED'
        ? 'Two consecutive connection checks passed.'
        : 'Repeated local checks indicate possible degradation. Bandwidth and cause are unknown.',
      tag: 'escapehatch-network-health',
    });
    return true;
  } catch { return false; }
}
