/**
 * Temporary LAN install surface for Android phone proof (port 18765).
 * Serves APK, sealed pairing offer, newest .ehsync capsule, and a value-free
 * install page. Never serves pairing codes, preference values, or vault keys.
 *
 * Usage:
 *   node --experimental-strip-types private-sync-phone-lan-server.ts [carrierAbsPath] [port]
 */
import { spawnSync } from 'node:child_process';
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
  'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const PHONE_PROOF_SCHEMA = 'escapehatch/private-sync-phone-proof-receipt/v1';
const PHONE_PROOF_FILE = 'escapehatch-phone-sync-proof.json';

function readBody(req: http.IncomingMessage, limit = 64_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > limit) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Value-free phone proof only — never preference values or pairing codes. */
function acceptPhoneProofJson(raw: string): { ok: true; pretty: string } | { ok: false; error: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }
  if (parsed.schema !== PHONE_PROOF_SCHEMA) {
    return { ok: false, error: 'INVALID_PROOF_SCHEMA' };
  }
  if (parsed.notPhoneThreeOfThree === true || parsed.deviceKind === 'android-emulator') {
    return { ok: false, error: 'REJECTED_EMULATOR_LAB_PROOF' };
  }
  if (parsed.device !== 'android-phone') {
    return { ok: false, error: 'REJECTED_NON_PHONE_DEVICE' };
  }
  const digest = parsed.projectionDigest;
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/i.test(digest)) {
    return { ok: false, error: 'INVALID_PROOF_DIGEST' };
  }
  if (typeof parsed.reusableAnswerCount !== 'number') {
    return { ok: false, error: 'INVALID_PROOF_COUNT' };
  }
  const compressed = JSON.stringify(parsed);
  if (/password|ssn|secret|Bearer |@gmail\.com/i.test(compressed)) {
    return { ok: false, error: 'PROOF_LOOKS_LIKE_IT_CONTAINS_SENSITIVE_TEXT' };
  }
  // Persist only known value-free fields (drop unknown keys).
  const cognizant = Array.isArray(parsed.cognizantTalentCommunityFieldsPresent)
    ? parsed.cognizantTalentCommunityFieldsPresent.filter((id): id is string => typeof id === 'string')
    : [];
  const slim = {
    schema: PHONE_PROOF_SCHEMA,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    device: 'android-phone',
    phoneState: typeof parsed.phoneState === 'string' ? parsed.phoneState : 'IMPORTED',
    vaultId: typeof parsed.vaultId === 'string' ? parsed.vaultId : null,
    reusableAnswerCount: parsed.reusableAnswerCount,
    projectionDigest: digest.toLowerCase(),
    cognizantTalentCommunityFieldsPresent: cognizant,
  };
  return { ok: true, pretty: `${JSON.stringify(slim, null, 2)}\n` };
}

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

function qrSvgFor(lanBase: string): string | null {
  // Local SVG only — no third-party QR API; never embeds pairing codes.
  const url = lanBase.endsWith('/') ? lanBase : `${lanBase}/`;
  const py = [
    'import qrcode, qrcode.image.svg as s, sys',
    'img=qrcode.make(sys.argv[1], image_factory=s.SvgPathImage)',
    'sys.stdout.buffer.write(img.to_string())',
  ].join('; ');
  const result = spawnSync('python', ['-c', py, url], { encoding: 'buffer', maxBuffer: 256_000 });
  if (result.status !== 0 || !result.stdout?.byteLength) return null;
  return result.stdout.toString('utf8');
}

function installPageHtml(lanBase: string, apkBytes: number | null): string {
  const apkHint =
    apkBytes && apkBytes > 0
      ? `${(apkBytes / (1024 * 1024)).toFixed(1)}&nbsp;MB — Keystore build; refuse a ~5.5&nbsp;MB stale copy`
      : 'download size shown after APK is staged on the PC';
  const hostForApp = lanBase.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EscapeHatch phone install</title>
<body style="font:16px/1.45 Georgia,serif;max-width:36rem;margin:2rem;background:#0b1210;color:#e8efe9">
<h1 style="font:700 1.5rem system-ui,sans-serif">Install companion</h1>
<p>Ciphertext-only LAN handoff. Pairing codes stay on the desktop—never on this page.</p>
<p style="font:600 0.95rem system-ui,sans-serif;color:#c8f542">LAN host for Assist: <code style="color:#e8efe9">${hostForApp}</code></p>
<p><img src="/qr.svg" alt="QR code for this LAN install URL" width="180" height="180" style="background:#fff;padding:8px;border-radius:4px"></p>
<ol>
<li><a href="/apk" style="color:#c8f542">Download EscapeHatchAssist-debug.apk</a> (${apkHint}) and allow install from this browser.</li>
<li>Open Assist → Pair → paste <code>${hostForApp}</code> → <strong>Fetch sealed offer from PC</strong> → type the desktop TEMP pairing code.</li>
<li>Import → same host → <strong>Fetch capsule from PC</strong> (or download <a href="/offer" style="color:#c8f542">offer</a> / <a href="/capsule" style="color:#c8f542">capsule</a> here).</li>
<li>After import, tap <strong>Send proof to PC</strong> (POST /proof) or save <code>escapehatch-phone-sync-proof.json</code> into OneDrive EscapeHatchPrivateSync.</li>
</ol>
<p style="color:#9aab9e">No answer values are served here. This is for a phone—not a smart TV/display.</p>
</body></html>`;
}

function accessLog(req: http.IncomingMessage, pathname: string) {
  // Path + remote only — never pairing codes or preference values.
  const remote = req.socket.remoteAddress || 'unknown';
  process.stdout.write(
    JSON.stringify({
      t: new Date().toISOString(),
      event: 'lan_access',
      method: req.method,
      path: pathname,
      remote,
    }) + '\n',
  );
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  accessLog(req, url.pathname);

  if (req.method === 'POST' && url.pathname === '/proof') {
    try {
      const raw = await readBody(req);
      const accepted = acceptPhoneProofJson(raw);
      if (!accepted.ok) {
        deny(res, 400, accepted.error);
        return;
      }
      const dest = path.join(carrier, PHONE_PROOF_FILE);
      await fs.writeFile(dest, accepted.pretty, 'utf8');
      const body = JSON.stringify({
        ok: true,
        stored: PHONE_PROOF_FILE,
        digest: JSON.parse(accepted.pretty).projectionDigest,
        values: 'never',
      });
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': String(Buffer.byteLength(body)),
        'cache-control': 'no-store',
        ...cors,
      });
      res.end(body);
    } catch (error) {
      deny(res, 500, error instanceof Error ? error.message : 'PROOF_STORE_FAILED');
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    deny(res, 405, 'METHOD_NOT_ALLOWED');
    return;
  }
  const headOnly = req.method === 'HEAD';
  try {
    if (url.pathname === '/qr.svg') {
      const hostHeader = String(req.headers.host || `127.0.0.1:${port}`);
      const lanBase = `http://${hostHeader}`;
      const svg = qrSvgFor(lanBase);
      if (!svg) {
        deny(res, 503, 'QR_UNAVAILABLE');
        return;
      }
      res.writeHead(200, {
        'content-type': 'image/svg+xml; charset=utf-8',
        'content-length': String(Buffer.byteLength(svg)),
        'cache-control': 'no-store',
        ...cors,
      });
      if (!headOnly) res.end(svg);
      else res.end();
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const apkPath = path.join(carrier, 'EscapeHatchAssist-debug.apk');
      let apkBytes: number | null = null;
      try {
        apkBytes = (await fs.stat(apkPath)).size;
      } catch {
        apkBytes = null;
      }
      const hostHeader = String(req.headers.host || `127.0.0.1:${port}`);
      const lanBase = `http://${hostHeader}`;
      const html = installPageHtml(lanBase, apkBytes);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(Buffer.byteLength(html)),
        'cache-control': 'no-store',
        ...cors,
      });
      if (!headOnly) res.end(html);
      else res.end();
      return;
    }
    if (url.pathname === '/apk') {
      const apk = path.join(carrier, 'EscapeHatchAssist-debug.apk');
      await fs.access(apk);
      if (headOnly) {
        const st = await fs.stat(apk);
        res.writeHead(200, {
          'content-type': 'application/vnd.android.package-archive',
          'content-length': String(st.size),
          'content-disposition': 'attachment; filename="EscapeHatchAssist-debug.apk"',
          'cache-control': 'no-store',
          ...cors,
        });
        res.end();
        return;
      }
      await fileResponse(res, apk, 'application/vnd.android.package-archive', 'EscapeHatchAssist-debug.apk');
      return;
    }
    if (url.pathname === '/offer') {
      const offer = path.join(carrier, 'pairing-offer.json');
      await fs.access(offer);
      if (headOnly) {
        const st = await fs.stat(offer);
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': String(st.size),
          'cache-control': 'no-store',
          ...cors,
        });
        res.end();
        return;
      }
      await fileResponse(res, offer, 'application/json; charset=utf-8', 'pairing-offer.json');
      return;
    }
    if (url.pathname === '/capsule') {
      const capsule = await newestCapsule();
      if (!capsule) {
        deny(res, 404, 'CAPSULE_MISSING');
        return;
      }
      if (headOnly) {
        const st = await fs.stat(capsule);
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(st.size),
          'content-disposition': `attachment; filename="${path.basename(capsule)}"`,
          'cache-control': 'no-store',
          ...cors,
        });
        res.end();
        return;
      }
      await fileResponse(res, capsule, 'application/octet-stream', path.basename(capsule));
      return;
    }
    if (url.pathname === '/health') {
      const apkPath = path.join(carrier, 'EscapeHatchAssist-debug.apk');
      let apkBytes: number | null = null;
      try {
        apkBytes = (await fs.stat(apkPath)).size;
      } catch {
        apkBytes = null;
      }
      const body = JSON.stringify({
        ok: true,
        carrier,
        serves: ['apk', 'offer', 'capsule', 'proof', 'qr'],
        apkBytes,
        pairingCode: 'never',
        proofPost: '/proof',
        qrSvg: '/qr.svg',
      });
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': String(Buffer.byteLength(body)),
        ...cors,
      });
      if (!headOnly) res.end(body);
      else res.end();
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
