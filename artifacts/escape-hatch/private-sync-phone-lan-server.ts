/**
 * Temporary LAN install surface for Android phone proof (port 18765).
 * Serves APK, sealed pairing offer, newest .ehsync capsule, and a value-free
 * install page. Never serves pairing codes, preference values, or vault keys.
 *
 * Usage:
 *   node --experimental-strip-types private-sync-phone-lan-server.ts [carrierAbsPath] [port]
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const carrierArg = process.argv[2];
const port = Number(process.argv[3] || 18765);
const carrier =
  carrierArg && path.isAbsolute(carrierArg)
    ? carrierArg
    : path.join(os.homedir(), 'OneDrive', 'EscapeHatchPrivateSync');

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function deny(res: http.ServerResponse, code: number, detail: string) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors });
  res.end(JSON.stringify({ error: detail, values: 'redacted' }));
}

async function newestCapsule(): Promise<string | null> {
  const entries = await fs.readdir(carrier).catch(() => [] as string[]);
  const capsules = entries.filter((name) => name.endsWith('.ehsync'));
  if (!capsules.length) return null;
  const ranked = await Promise.all(
    capsules.map(async (name) => {
      const full = path.join(carrier, name);
      const st = await fs.stat(full);
      return { full, mtime: st.mtimeMs };
    }),
  );
  ranked.sort((a, b) => b.mtime - a.mtime);
  return ranked[0]?.full ?? null;
}

async function fileResponse(res: http.ServerResponse, filePath: string, contentType: string, downloadName?: string) {
  const body = await fs.readFile(filePath);
  const headers: Record<string, string> = {
    'content-type': contentType,
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
    ...cors,
  };
  if (downloadName) {
    headers['content-disposition'] = `attachment; filename="${downloadName}"`;
  }
  res.writeHead(200, headers);
  res.end(body);
}

const installPage = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EscapeHatch phone install</title>
<body style="font:16px/1.45 Georgia,serif;max-width:36rem;margin:2rem;background:#0b1210;color:#e8efe9">
<h1 style="font:700 1.5rem system-ui,sans-serif">Install companion</h1>
<p>Ciphertext-only LAN handoff. Pairing codes stay on the desktop—never on this page.</p>
<ol>
<li><a href="/apk" style="color:#c8f542">Download EscapeHatchAssist-debug.apk</a> and allow install from this browser.</li>
<li>Open Assist → Pair this phone → type the desktop TEMP pairing code.</li>
<li>Import sealed <a href="/offer" style="color:#c8f542">pairing-offer.json</a> and the <a href="/capsule" style="color:#c8f542">.ehsync capsule</a>.</li>
<li>Save proof JSON back to OneDrive EscapeHatchPrivateSync.</li>
</ol>
<p style="color:#9aab9e">No answer values are served here.</p>
</body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    deny(res, 405, 'METHOD_NOT_ALLOWED');
    return;
  }
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...cors });
      res.end(installPage);
      return;
    }
    if (url.pathname === '/apk') {
      const apk = path.join(carrier, 'EscapeHatchAssist-debug.apk');
      await fs.access(apk);
      await fileResponse(res, apk, 'application/vnd.android.package-archive', 'EscapeHatchAssist-debug.apk');
      return;
    }
    if (url.pathname === '/offer') {
      const offer = path.join(carrier, 'pairing-offer.json');
      await fs.access(offer);
      await fileResponse(res, offer, 'application/json; charset=utf-8', 'pairing-offer.json');
      return;
    }
    if (url.pathname === '/capsule') {
      const capsule = await newestCapsule();
      if (!capsule) {
        deny(res, 404, 'CAPSULE_MISSING');
        return;
      }
      await fileResponse(res, capsule, 'application/octet-stream', path.basename(capsule));
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...cors });
      res.end(JSON.stringify({ ok: true, carrier, serves: ['apk', 'offer', 'capsule'], pairingCode: 'never' }));
      return;
    }
    deny(res, 404, 'NOT_FOUND');
  } catch (error) {
    deny(res, 500, error instanceof Error ? error.message : 'SERVE_FAILED');
  }
});

function pickLanIpv4(): string {
  const ifaces = Object.entries(os.networkInterfaces());
  const flat: Array<{ name: string; address: string }> = [];
  for (const [name, list] of ifaces) {
    for (const info of list || []) {
      if ((info.family === 'IPv4' || (info.family as unknown) === 4) && !info.internal) {
        flat.push({ name, address: info.address });
      }
    }
  }
  const wifi = flat.find(
    (i) =>
      /^192\.168\./.test(i.address) && /wi-?fi|wlan|wireless/i.test(i.name),
  );
  if (wifi) return wifi.address;
  const private192 = flat.find((i) => /^192\.168\./.test(i.address));
  if (private192) return private192.address;
  // Prefer RFC1918 over VPN/tunnel (10.5.*, 100.x, etc.) when possible
  const rfc1918 = flat.find((i) => /^(10\.(?!5\.)|172\.(1[6-9]|2\d|3[0-1])\.)/.test(i.address));
  if (rfc1918) return rfc1918.address;
  return flat[0]?.address || '0.0.0.0';
}

server.listen(port, '0.0.0.0', () => {
  const lan = pickLanIpv4();
  process.stdout.write(
    JSON.stringify({
      state: 'LISTENING',
      port,
      bind: '0.0.0.0',
      lan: `http://${lan}:${port}/`,
      carrier,
      pairingCode: 'never_served',
    }) + '\n',
  );
});
