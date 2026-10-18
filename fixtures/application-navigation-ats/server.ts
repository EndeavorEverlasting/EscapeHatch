import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export type NativeDraftRecord = { step: string; fields: string[]; atMs: number };
export type SpaAdvanceRecord = { pageFingerprint: string; atMs: number };
export type TerminalRecord = { route: string; via: 'native_post' | 'spa_fetch'; atMs: number };
export type RejectedPostRecord = { target: string; atMs: number };

export type SyntheticAtsEffects = {
  nativeDrafts: NativeDraftRecord[];
  spaAdvances: SpaAdvanceRecord[];
  terminalCommits: TerminalRecord[];
  rejectedDriftPosts: RejectedPostRecord[];
  unmodeledPosts: RejectedPostRecord[];
};

export type SyntheticAtsHandle = {
  origin: string;
  effects: SyntheticAtsEffects;
  close: () => Promise<void>;
};

const MAX_BODY_BYTES = 16 * 1024;

function htmlPage(options: {
  pageFingerprint: string;
  heading: string;
  formAction: string | null;
  controlFingerprint: string;
  buttonLabel: string;
  buttonType: string;
  spaScript?: string;
}): string {
  const control =
    options.formAction === null
      ? `<button type="${options.buttonType}" id="apply-submit" data-control-id="apply-submit" data-control-fp="${options.controlFingerprint}">${options.buttonLabel}</button>`
      : `<form method="post" action="${options.formAction}">
      <input type="hidden" name="step_marker" value="${options.pageFingerprint}">
      <label>Cover note <input name="note" value="synthetic-cover-note"></label>
      <button type="${options.buttonType}" id="apply-submit" data-control-id="apply-submit" data-control-fp="${options.controlFingerprint}">${options.buttonLabel}</button>
    </form>`;
  const script = options.spaScript ? `<script>${options.spaScript}</script>` : '';
  return `<!doctype html>
<html lang="en" data-page-fp="${options.pageFingerprint}">
<head><meta charset="utf-8"><title>Synthetic ATS</title></head>
<body>
  <h1>${options.heading}</h1>
  ${control}
  ${script}
</body>
</html>`;
}

function spaPage(pageFingerprint: string): string {
  if (pageFingerprint === 'spa-step-1') {
    return htmlPage({
      pageFingerprint: 'spa-step-1',
      heading: 'Step one — profile summary',
      formAction: null,
      controlFingerprint: 'cta-spa-step-1',
      buttonLabel: 'Submit',
      buttonType: 'button',
      spaScript: `document.getElementById('apply-submit').addEventListener('click', async () => {
  const response = await fetch('/api/spa/advance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pageFingerprint: 'spa-step-1' }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) return;
  history.pushState({}, '', payload.next);
  document.documentElement.dataset.pageFp = 'spa-step-2';
  document.querySelector('h1').textContent = 'Step two — final review';
  const stale = document.getElementById('apply-submit');
  const control = stale.cloneNode(true);
  stale.replaceWith(control);
  control.dataset.controlFp = 'cta-spa-step-2';
  control.setAttribute('type', 'button');
  control.addEventListener('click', async () => {
    await fetch('/apply/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ via: 'spa' }),
    });
    document.querySelector('h1').textContent = 'We have received your application.';
  });
});`,
    });
  }
  return htmlPage({
    pageFingerprint: 'spa-step-2',
    heading: 'Step two — final review',
    formAction: null,
    controlFingerprint: 'cta-spa-step-2',
    buttonLabel: 'Submit',
    buttonType: 'button',
    spaScript: `document.getElementById('apply-submit').addEventListener('click', async () => {
  await fetch('/apply/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ via: 'spa' }),
  });
  document.querySelector('h1').textContent = 'We have received your application.';
});`,
  });
}

function send(res: ServerResponse, status: number, contentType: string, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': contentType, ...headers });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location });
  res.end();
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body exceeds fixture limit');
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseForm(body: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) values[key] = value;
  return values;
}

function parseJson(body: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('fixture expected a JSON object body');
  return parsed as Record<string, unknown>;
}

export async function startSyntheticAts(): Promise<SyntheticAtsHandle> {
  const effects: SyntheticAtsEffects = {
    nativeDrafts: [],
    spaAdvances: [],
    terminalCommits: [],
    rejectedDriftPosts: [],
    unmodeledPosts: [],
  };

  const server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      send(res, 500, 'text/plain', `fixture error: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const method = req.method ?? 'GET';

    if (method === 'GET' && url.pathname === '/__effects') {
      send(res, 200, 'application/json', JSON.stringify(effects));
      return;
    }

    if (method === 'GET') {
      switch (url.pathname) {
        case '/apply/step/1': {
          const drifted = url.searchParams.get('drift') === '1';
          send(res, 200, 'text/html; charset=utf-8', htmlPage({
            pageFingerprint: 'native-step-1',
            heading: 'Step one — contact details',
            formAction: drifted ? '/apply/step/1-drifted' : '/apply/step/1',
            controlFingerprint: 'cta-native-step-1',
            buttonLabel: 'Submit',
            buttonType: 'submit',
          }));
          return;
        }
        case '/apply/step/2':
          send(res, 200, 'text/html; charset=utf-8', htmlPage({
            pageFingerprint: 'native-step-2',
            heading: 'Step two — work preferences',
            formAction: '/apply/step/2',
            controlFingerprint: 'cta-native-step-2',
            buttonLabel: 'Submit',
            buttonType: 'submit',
          }));
          return;
        case '/apply/step/3':
          send(res, 200, 'text/html; charset=utf-8', htmlPage({
            pageFingerprint: 'native-step-3',
            heading: 'Final step — review and deliver',
            formAction: '/apply/submit',
            controlFingerprint: 'cta-native-step-3',
            buttonLabel: 'Submit',
            buttonType: 'submit',
          }));
          return;
        case '/apply/decoy':
          send(res, 200, 'text/html; charset=utf-8', htmlPage({
            pageFingerprint: 'decoy-commit',
            heading: 'Step two — work preferences',
            formAction: '/apply/submit',
            controlFingerprint: 'cta-decoy-commit',
            buttonLabel: 'Next',
            buttonType: 'submit',
          }));
          return;
        case '/apply/unmodeled':
          send(res, 200, 'text/html; charset=utf-8', htmlPage({
            pageFingerprint: 'unmodeled-step',
            heading: 'Additional questions',
            formAction: '/apply/unmodeled/next',
            controlFingerprint: 'cta-unmodeled-step',
            buttonLabel: 'Submit',
            buttonType: 'submit',
          }));
          return;
        case '/apply/ack':
          send(res, 200, 'text/html; charset=utf-8', `<!doctype html>
<html lang="en" data-page-fp="acknowledgment">
<head><meta charset="utf-8"><title>Synthetic ATS</title></head>
<body><h1>We've received your application.</h1><p>Application APP-SYNTH-0001</p></body>
</html>`);
          return;
        case '/spa/step/1':
          send(res, 200, 'text/html; charset=utf-8', spaPage('spa-step-1'));
          return;
        case '/spa/step/2':
          send(res, 200, 'text/html; charset=utf-8', spaPage('spa-step-2'));
          return;
        default:
          send(res, 404, 'text/plain', 'not found');
          return;
      }
    }

    if (method === 'POST') {
      const body = await readBody(req);
      switch (url.pathname) {
        case '/apply/step/1':
        case '/apply/step/2': {
          const step = url.pathname === '/apply/step/1' ? 'native-step-1' : 'native-step-2';
          effects.nativeDrafts.push({ step, fields: Object.keys(parseForm(body)), atMs: Date.now() });
          redirect(res, url.pathname === '/apply/step/1' ? '/apply/step/2' : '/apply/step/3');
          return;
        }
        case '/apply/step/1-drifted':
          effects.rejectedDriftPosts.push({ target: url.pathname, atMs: Date.now() });
          send(res, 410, 'text/plain', 'drifted endpoint must never receive traffic');
          return;
        case '/apply/unmodeled/next':
          effects.unmodeledPosts.push({ target: url.pathname, atMs: Date.now() });
          send(res, 410, 'text/plain', 'unmodeled endpoint must never receive traffic');
          return;
        case '/apply/submit': {
          let via: 'native_post' | 'spa_fetch' = 'native_post';
          if (body.startsWith('{')) {
            const payload = parseJson(body);
            if (payload.via === 'spa') via = 'spa_fetch';
          }
          effects.terminalCommits.push({ route: '/apply/submit', via, atMs: Date.now() });
          redirect(res, '/apply/ack');
          return;
        }
        case '/api/spa/advance': {
          const payload = parseJson(body);
          if (payload.pageFingerprint !== 'spa-step-1') {
            send(res, 409, 'application/json', JSON.stringify({ ok: false }));
            return;
          }
          effects.spaAdvances.push({ pageFingerprint: 'spa-step-1', atMs: Date.now() });
          send(res, 200, 'application/json', JSON.stringify({ ok: true, next: '/spa/step/2' }));
          return;
        }
        default:
          send(res, 404, 'text/plain', 'not found');
          return;
      }
    }

    send(res, 405, 'text/plain', 'method not allowed');
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('synthetic ATS failed to bind an ephemeral loopback port');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    effects,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
