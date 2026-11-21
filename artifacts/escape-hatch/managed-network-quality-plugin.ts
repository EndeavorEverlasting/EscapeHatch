/** Canonical managed entry point: one sampler, one consent policy, no auto-run in preview. */
import type { Plugin } from 'vite';
import { readManagedRuntime } from './runtime-control.ts';
import { measureNetworkPath } from './network-path-quality.ts';
import { handleNetworkPathRequest } from './network-path-quality-plugin.ts';
import { handleAutomaticQualityRequest } from './network-quality-route.ts';
import { readAutomaticQualityStatus } from './network-quality-state.ts';
import { AutomaticQualityRuntime } from './network-quality-runtime.ts';

export function createManagedNetworkQualityPlugin(): Plugin {
  const managed = Boolean(readManagedRuntime());
  const eligible = managed && process.platform === 'win32';
  const runtime = new AutomaticQualityRuntime();
  const manual = { inFlight: false, lastStartedAt: null as number | null };
  return {
    name: 'escapehatch-managed-network-quality',
    configureServer(server) {
      const ready = eligible ? runtime.load() : Promise.resolve();
      server.httpServer?.once('close', () => runtime.close());
      server.middlewares.use((req, res, next) => {
        void (async () => {
          if (req.url?.startsWith('/__escapehatch/network-path-quality/monitor/')) {
            await ready;
            if (readAutomaticQualityStatus(req, res, runtime, eligible)) return true;
            return handleAutomaticQualityRequest(req, res, runtime, eligible);
          }
          return handleNetworkPathRequest(req, res, {
            managed, platform: process.platform, measure: measureNetworkPath,
            now: Date.now, state: manual,
          });
        })().then(handled => { if (!handled) next(); }).catch(() => {
          res.statusCode = 503;
          res.setHeader('cache-control', 'no-store');
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'network_diagnostics_unavailable' }));
        });
      });
    },
  };
}
