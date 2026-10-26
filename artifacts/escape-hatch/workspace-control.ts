import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { userDataRoot } from './user-data.ts';
import { isLoopbackAddress, readManagedRuntime } from './runtime-control.ts';
import { readWorkspace, saveWorkspace, MAX_WORKSPACE_BYTES } from './workspace-file.ts';
import { readPreferences } from './preference-file.ts';
import { PROFILE_KEY } from './src/lib/storage.ts';
import { hasContext, profileFromPreferences, WORKSPACE_SCHEMA, workspaceParsers, type BootstrapResponse, type SavedWorkspace } from './src/lib/workspace-bootstrap.ts';

function respond(res: ServerResponse, status: number, data: object) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(data));
}
export function authorizedWorkspaceRequest(req: IncomingMessage, port: number) {
  const origin = 'http://127.0.0.1:' + port;
  return isLoopbackAddress(req.socket.remoteAddress) && req.headers.host === '127.0.0.1:' + port &&
    (!req.headers.origin || req.headers.origin === origin) && req.headers['sec-fetch-site'] !== 'cross-site';
}
export async function bootstrapWorkspace(): Promise<BootstrapResponse> {
  try {
    const saved = await readWorkspace();
    if (saved) return { managed: true, ...saved, state: hasContext(saved.workspace.values) ? 'READY' : 'NEEDS_CONTEXT', message: 'Private workspace recovered from this Windows account.' };
    const profile = profileFromPreferences((await readPreferences()).preferences);
    const workspace: SavedWorkspace = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: profile } };
    return { managed: true, revision: null, workspace, state: hasContext(workspace.values) ? 'READY' : 'NEEDS_CONTEXT',
      message: 'No saved workspace yet. Import a local backup or connect your existing career sources.' };
  } catch {
    return { managed: true, revision: null, workspace: null, state: 'RECOVERY_REQUIRED', message: 'Saved context could not be read. Existing files are preserved; restore a valid backup before continuing.' };
  }
}
export function createWorkspaceControlPlugin(): Plugin {
  const managed = readManagedRuntime();
  return { name: 'escapehatch-workspace-control',
    transformIndexHtml(_html, context) {
      return [{ tag: 'meta', attrs: { name: 'escapehatch-runtime', content: context.server && managed ? 'managed' : 'standalone' }, injectTo: 'head' }];
    },
    configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const route = (req.url || '').split('?')[0];
      if (!['/__escapehatch/workspace', '/__escapehatch/workspace/status', '/__escapehatch/workspace/resume'].includes(route)) return next();
      const port = Number(process.env.PORT || server.config.server.port || 5173);
      if (!managed) return respond(res, 200, { managed: false });
      if (!authorizedWorkspaceRequest(req, port)) return respond(res, 403, { error: 'same_origin_loopback_required' });
      if (route === '/__escapehatch/workspace/status' && req.method === 'GET') {
        const result = await bootstrapWorkspace();
        return respond(res, 200, { managed: true, state: result.state, message: result.message,
          populatedAreas: Object.keys(result.workspace?.values || {}),
          profileRecovered: Boolean(result.workspace?.values[PROFILE_KEY] && hasContext({ [PROFILE_KEY]: result.workspace.values[PROFILE_KEY] })) });
      }
      if (route === '/__escapehatch/workspace/resume' && req.method === 'GET') {
        try {
          const file = path.join(userDataRoot(), 'resume-source.v1.json');
          if ((await fs.stat(file)).size > 1024 * 1024) throw new Error('oversized');
          const resume = JSON.parse(await fs.readFile(file, 'utf8'));
          if (resume.schema !== 'escapehatch-cached-resume/v1' || typeof resume.text !== 'string' || !resume.text.trim() || typeof resume.label !== 'string' || !Number.isFinite(Date.parse(resume.capturedAt))) throw new Error('invalid');
          return respond(res, 200, { label: resume.label, text: resume.text, capturedAt: resume.capturedAt });
        } catch { return respond(res, 404, { error: 'No valid saved resume is available. Choose a local resume or reconnect its source.' }); }
      }
      if (route !== '/__escapehatch/workspace') return respond(res, 405, { error: 'method_not_allowed' });
      if (req.method === 'GET') return respond(res, 200, await bootstrapWorkspace());
      if (req.method !== 'PUT') return respond(res, 405, { error: 'method_not_allowed' });
      if (req.headers['x-escapehatch-workspace'] !== '1' || req.headers['content-type'] !== 'application/json') return respond(res, 403, { error: 'workspace_request_required' });
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > MAX_WORKSPACE_BYTES + 1024) return respond(res, 413, { error: 'workspace_too_large' });
          chunks.push(Buffer.from(chunk));
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (payload.expectedRevision !== null && !/^[a-f0-9]{64}$/.test(payload.expectedRevision)) throw new Error('invalid');
        if (payload.recoverInvalid !== undefined && typeof payload.recoverInvalid !== 'boolean') throw new Error('invalid');
        if (payload.browserArchive !== undefined) {
          const archive = payload.browserArchive;
          if (!archive || typeof archive !== 'object' || Array.isArray(archive) || Object.entries(archive).some(([key, value]) => !Object.hasOwn(workspaceParsers, key) || value !== null && typeof value !== 'string')) throw new Error('invalid archive');
          await fs.mkdir(userDataRoot(), { recursive: true });
          await fs.writeFile(path.join(userDataRoot(), 'browser-recovery-' + crypto.randomUUID() + '.json'), JSON.stringify(archive), { flag: 'wx', mode: 0o600 });
        }
        const saved = await saveWorkspace(payload.workspace, payload.expectedRevision, undefined, payload.recoverInvalid === true, payload.browserArchive !== undefined);
        return respond(res, 200, { revision: saved.revision });
      } catch (error) {
        const conflict = (error as Error).message === 'WORKSPACE_CONFLICT';
        return respond(res, conflict ? 409 : 422, { error: conflict ? 'workspace_changed_elsewhere' : 'workspace_not_saved_existing_data_preserved' });
      }
    });
  } };
}
