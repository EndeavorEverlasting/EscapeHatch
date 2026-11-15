import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { preview } from 'vite';
import { createWorkspaceControlPlugin } from './workspace-control.ts';

const port = Number(process.env.PORT ?? 21030);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a valid unprivileged EscapeHatch port.');
const browserHost = `localhost:${port}`;
const origin = `http://${browserHost}`;
const workspaceHost = `127.0.0.1:${port}`;
const launchFile = process.env.ESCAPEHATCH_LAUNCH_FILE ?? '/tmp/escapehatch-launch-url';
const cookieName = 'escapehatch_container_session';

if (process.argv[2] === 'launch-url') {
  process.stdout.write(readFileSync(launchFile, 'utf8'));
} else if (process.argv[2] === 'serve') {
  await serve();
} else {
  console.log('EscapeHatch container CLI\n  serve       Start the local workspace\n  launch-url  Print the running instance’s browser link');
  if (process.argv.length > 2 && !['--help', '-h'].includes(process.argv[2])) process.exitCode = 2;
}

async function serve() {
  const session = randomBytes(32).toString('hex');
  process.env.PORT = String(port);
  process.env.ESCAPEHATCH_INSTANCE_ID = randomBytes(16).toString('hex');
  process.env.ESCAPEHATCH_REPO_FINGERPRINT = createHash('sha256').update(readFileSync(new URL('./dist/public/index.html', import.meta.url))).digest('hex');
  process.env.ESCAPEHATCH_SHUTDOWN_TOKEN = randomBytes(32).toString('hex');
  process.env.ESCAPEHATCH_STARTED_AT_UTC = new Date().toISOString();
  const app = await preview({
    configFile: false,
    root: import.meta.dirname,
    build: { outDir: 'dist/public' },
    preview: { host: '127.0.0.1', port: 0, strictPort: true, cors: false },
    plugins: [createWorkspaceControlPlugin({ servePreview: true })],
  });
  const upstreamPort = (app.httpServer.address() as AddressInfo).port;
  const status = await new Promise<{ managed?: boolean; state?: string }>((resolve, reject) => {
    const probe = request({ hostname: '127.0.0.1', port: upstreamPort, path: '/__escapehatch/workspace/status',
      headers: { host: workspaceHost }, signal: AbortSignal.timeout(5000) }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve(response.statusCode === 200 ? JSON.parse(body) : {}); }
        catch (error) { reject(error); }
      });
    });
    probe.on('error', reject);
    probe.end();
  });
  if (!status?.managed || !['READY', 'NEEDS_CONTEXT', 'RECOVERY_REQUIRED'].includes(status.state ?? '')) {
    await app.close();
    throw new Error('Workspace startup could not be verified.');
  }

  const server = createServer({ requestTimeout: 30_000 }, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.headers.host !== browserHost || !req.url?.startsWith('/') || req.url.startsWith('//') ||
      (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403).end('Open EscapeHatch using its desktop launcher.');
      return;
    }
    if (req.method === 'GET' && req.url === `/__launch/${session}`) {
      res.writeHead(303, { Location: '/journey', 'Set-Cookie': `${cookieName}=${session}; Path=/; HttpOnly; SameSite=Strict` }).end();
      return;
    }
    if (!req.headers.cookie?.split(';').some(cookie => cookie.trim() === `${cookieName}=${session}`)) {
      res.writeHead(401).end('Click the EscapeHatch launcher to open your private workspace.');
      return;
    }
    if (req.url.startsWith('/__escapehatch/') &&
      !/^\/__escapehatch\/workspace(?:\/(?:status|resume|owner))?(?:\?|$)/.test(req.url)) {
      const error = 'This feature requires a supported native EscapeHatch install.';
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error }));
      return;
    }
    const headers = { ...req.headers, host: workspaceHost };
    delete headers.cookie;
    if (headers.origin) headers.origin = `http://${workspaceHost}`;
    const upstream = request({ host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers }, incoming => {
      res.writeHead(incoming.statusCode ?? 502, { ...incoming.headers, 'cache-control': 'no-store' });
      incoming.pipe(res);
    });
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.writeHead(502).end('Workspace service unavailable. Restart EscapeHatch.');
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  // Docker publishes this listener only on host loopback; the workspace service also listens on private loopback.
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  writeFileSync(launchFile, `${origin}/__launch/${session}\n`, { mode: 0o600 });
  console.log(`EscapeHatch workspace: ${status.state}. The Journey tutorial is ready to open.`);

  const close = () => {
    server.close(async () => { await app.close(); });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
