/**
 * Local-only read-only job discovery endpoint for the existing EscapeHatch Vite
 * runtime. Fetches ONE documented public API: never an arbitrary user URL.
 * No applicant data, credentials, browser controls, or tracker source is read.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isLoopbackAddress } from './runtime-control.ts';

const ENDPOINT = '/__escapehatch/discovery/search';
const API_URL = 'https://himalayas.app/jobs/api/search';
const MAX_BYTES = 4_000_000;
const TTL_MS = 5 * 60 * 1000;

type DiscoveryReply = { ok: boolean; jobs?: unknown[]; provider?: string; fetchedAt?: string; error?: string };
type CacheEntry = { expires: number; reply: DiscoveryReply };

export function validateDiscoveryQuery(q: string | null, page: string | null): { q: string; page: number } | null {
  const title = q?.trim() || '';
  if (title.length < 2 || title.length > 80 || /[\x00-\x1f\x7f]/.test(title)) return null;
  const p = page === null ? 1 : Number(page);
  if (!Number.isInteger(p) || p < 1 || p > 5) return null;
  return { q: title, page: p };
}

export async function queryPublicJobs(
  q: string, page = 1, fetcher: typeof fetch = fetch,
): Promise<DiscoveryReply> {
  const params = new URLSearchParams({ q, sort: 'recent', page: String(page) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(`${API_URL}?${params}`, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (response.status === 429) return {ok:false,error:'SOURCE_RATE_LIMITED'};
    if (!response.ok) return {ok:false,error:'SOURCE_UNAVAILABLE'};
    const size = Number(response.headers.get('content-length') || '0');
    if (size > MAX_BYTES) return {ok:false,error:'SOURCE_RESPONSE_TOO_LARGE'};
    // Consume with explicit cap even when Content-Length is missing.
    const reader = response.body?.getReader();
    if (!reader) return {ok:false,error:'SOURCE_EMPTY'};
    const bytes: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return {ok:false,error:'SOURCE_RESPONSE_TOO_LARGE'};
      }
      bytes.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of bytes) { merged.set(chunk, offset); offset += chunk.byteLength; }
    const payload = JSON.parse(new TextDecoder().decode(merged)) as unknown;
    if (!payload || typeof payload !== 'object' || !('jobs' in payload) ||
        !Array.isArray(payload.jobs)) return {ok:false,error:'SOURCE_SCHEMA_CHANGED'};
    // Never forward the employer HTML description. Browser renders text only.
    const fields = ['guid','title','companyName','applicationLink','seniority','categories',
      'parentCategories','minSalary','maxSalary','salaryPeriod','currency','pubDate','expiryDate','locationRestrictions'] as const;
    const jobs = payload.jobs.slice(0, 60).filter((v: unknown) => v && typeof v === 'object' && !Array.isArray(v))
      .map((v: Record<string, unknown>) => Object.fromEntries(fields.map((field) => [field, v[field]])));
    return {ok:true,provider:'himalayas',fetchedAt:new Date().toISOString(),jobs};
  } catch {
    return {ok:false,error:'SOURCE_UNAVAILABLE'};
  } finally {
    clearTimeout(timer);
  }
}

function respond(res: ServerResponse, code: number, reply: DiscoveryReply) {
  res.statusCode = code;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.end(JSON.stringify(reply));
}

export function discoveryRequestAllowed(req: IncomingMessage, port: number): boolean {
  const expected = `127.0.0.1:${port}`;
  const origin = req.headers.origin;
  return req.method === 'GET' && isLoopbackAddress(req.socket.remoteAddress) &&
    req.headers.host === expected &&
    (!origin || origin === `http://${expected}`) &&
    (!req.headers['sec-fetch-site'] || ['same-origin','none'].includes(String(req.headers['sec-fetch-site'])));
}

export function createJobDiscoveryPlugin(): Plugin {
  const cache = new Map<string, CacheEntry>();
  return {
    name: 'escapehatch-job-discovery',
    configureServer(server) {
      server.middlewares.use(async (req,res,next) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (url.pathname !== ENDPOINT) return next();
        const port = Number(process.env.PORT || server.config.server.port || 5173);
        if (!discoveryRequestAllowed(req,port)) return respond(res,403,{ok:false,error:'LOCAL_ONLY'});
        const request = validateDiscoveryQuery(url.searchParams.get('q'),url.searchParams.get('page'));
        if (!request) return respond(res,400,{ok:false,error:'INVALID_TITLE_OR_PAGE'});
        const key = `${request.q.toLowerCase()}|${request.page}`;
        const cached = cache.get(key);
        if (cached && cached.expires > Date.now()) return respond(res,200,cached.reply);
        const reply = await queryPublicJobs(request.q,request.page);
        if (reply.ok) {
          if (cache.size >= 30) cache.delete(cache.keys().next().value!);
          cache.set(key,{expires:Date.now()+TTL_MS,reply});
        }
        return respond(res, reply.ok ? 200 : reply.error === 'SOURCE_RATE_LIMITED' ? 429 : 502, reply);
      });
    },
  };
}
