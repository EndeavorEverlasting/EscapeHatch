import { useState } from 'react';
import type { PathQualityReceipt, QualityClass } from '../../network-path-quality.ts';

const QUALITY_COPY: Record<QualityClass, { title: string; message: string }> = {
  USABLE_PATH: {
    title: 'The selected connection checks responded normally.',
    message: 'DNS, two public TCP paths, and TLS responded. This does not measure download or upload speed or an employer website.',
  },
  DEGRADED_LATENCY: {
    title: 'Connection setup is slower than expected.',
    message: 'At least one selected DNS/TCP/TLS check took 120 ms or longer. This may make an application feel sluggish; the cause is unknown.',
  },
  SEVERELY_DEGRADED_LATENCY: {
    title: 'Connection setup is substantially delayed.',
    message: 'At least one selected DNS/TCP/TLS check took 250 ms or longer. This is not an ISP speed measurement.',
  },
  DNS_PATH_DEGRADED: {
    title: 'Name resolution did not succeed.',
    message: 'Selected public TCP paths responded, but DNS failed. This can explain why websites do not open normally.',
  },
  DEGRADED_PUBLIC_PATH: {
    title: 'Some public connection checks failed.',
    message: 'Results are mixed. The current network, VPN, firewall, or selected remote service may be involved; no cause is proven.',
  },
  UNUSABLE_PUBLIC_PATH: {
    title: 'Neither selected public TCP path connected.',
    message: 'The selected checks failed. This does not establish a full Internet outage or identify the ISP as responsible.',
  },
  TLS_PATH_UNVERIFIED: {
    title: 'The selected secure-handshake check failed.',
    message: 'Public TCP paths responded, but the independent TLS handshake did not. This is not proof an employer website is down.',
  },
  INSUFFICIENT_EVIDENCE: {
    title: 'The diagnostic could not establish connection quality.',
    message: 'One or more measurements were unavailable. No network failure or recovery is inferred.',
  },
};

function formatMs(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? value + ' ms' : 'not measured';
}

/** Never probes on mount. A person must request one local diagnostic each time. */
export function NetworkPathQualityCheck() {
  const [busy, setBusy] = useState(false);
  const [personalScopeApproved, setPersonalScopeApproved] = useState(false);
  const [receipt, setReceipt] = useState<PathQualityReceipt | null>(null);
  const [error, setError] = useState('');
  async function check() {
    if (busy || !personalScopeApproved) return;
    setBusy(true);
    setError('');
    setReceipt(null);
    try {
      const response = await fetch('/__escapehatch/network-path-quality', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'x-escapehatch-operator-action': 'confirmed',
          'x-escapehatch-network-scope': 'personal',
        },
        cache: 'no-store',
      });
      const payload: unknown = await response.json();
      const candidate = payload && typeof payload === 'object' && 'receipt' in payload
        ? (payload as { receipt?: PathQualityReceipt }).receipt : null;
      if (!response.ok || !candidate ||
          candidate.schema !== 'escapehatch.local-network-path-quality.v1' ||
          candidate.source_id !== 'escapehatch-consented-fixed-path-probes' ||
          candidate.vantage !== 'THIS_LOCAL_WINDOWS_ENDPOINT_ONLY' ||
          !Object.hasOwn(QUALITY_COPY, candidate.quality_class)) {
        throw new Error('The local diagnostic is unavailable. Start EscapeHatch with its owned Windows launcher; no network outage is inferred.');
      }
      setReceipt(candidate);
    } catch {
      setError('The local diagnostic could not run. This does not mean your Internet connection is down.');
    } finally {
      setBusy(false);
    }
  }
  const result = receipt ? QUALITY_COPY[receipt.quality_class] : null;
  return (
    <aside className="mt-4 rounded-xl border border-border bg-card p-4" data-testid="escapehatch-network-path-quality" aria-label="Connection diagnostics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Is the connection slowing you down?</h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            Check this device's DNS, public connection setup, and TLS handshake. One manual check; no speed-test upload, VPN changes, or application submission.
          </p>
        </div>
        <button className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          type="button" disabled={busy || !personalScopeApproved} onClick={() => void check()} data-testid="button-network-path-check">
          {busy ? 'Checking…' : 'Check my connection'}
        </button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={personalScopeApproved}
          onChange={event => setPersonalScopeApproved(event.target.checked)}
          data-testid="network-path-personal-consent" />
        I am using my personal Windows device and approve one fixed-target network diagnostic when I press the button.
      </label>
      <div role="status" aria-live="polite" className="mt-2 text-sm" data-testid="network-path-result">
        {error && <p>{error}</p>}
        {result && receipt && <>
          <p className="font-semibold">{result.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.message}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div><dt className="text-muted-foreground">DNS</dt><dd>{receipt.checks.public_dns_resolution} · {formatMs(receipt.latencies_ms.dns_ms)}</dd></div>
            <div><dt className="text-muted-foreground">TCP path 1</dt><dd>{receipt.checks.public_tcp_1} · {formatMs(receipt.latencies_ms.tcp_1_ms)}</dd></div>
            <div><dt className="text-muted-foreground">TCP path 2</dt><dd>{receipt.checks.public_tcp_2} · {formatMs(receipt.latencies_ms.tcp_2_ms)}</dd></div>
            <div><dt className="text-muted-foreground">TLS</dt><dd>{receipt.checks.tls_handshake} · {formatMs(receipt.latencies_ms.tls_ms)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Measured locally at {receipt.observed_utc}. Bandwidth unknown; root cause unproven.
          </p>
        </>}
      </div>
    </aside>
  );
}
