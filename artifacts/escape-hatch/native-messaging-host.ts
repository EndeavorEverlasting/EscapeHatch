/** Chrome sendNativeMessage transport: one bounded frame, no stdout diagnostics. */
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import { handleNativeProfileRequest, trustedNativeCaller } from './extension-profile-host.ts';

export const MAX_NATIVE_BYTES = 128 * 1024;
export function encodeNativeMessage(value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  if (!bytes.length || bytes.length > MAX_NATIVE_BYTES) throw new Error('NATIVE_RESPONSE_TOO_LARGE');
  const frame = Buffer.alloc(bytes.length + 4);
  frame.writeUInt32LE(bytes.length, 0);
  bytes.copy(frame, 4);
  return frame;
}
export function readNativeMessage(input: Readable, timeoutMs = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let bytes = Buffer.alloc(0);
    let expected: number | null = null;
    const finish = (error?: Error, result?: unknown) => {
      clearTimeout(timer);
      input.removeListener('data', data);
      input.removeListener('end', end);
      input.removeListener('error', failed);
      input.pause();
      if (error) reject(error); else resolve(result);
    };
    const failed = (error: Error) => finish(error);
    const end = () => finish(new Error('NATIVE_FRAME_INCOMPLETE'));
    const data = (chunk: Buffer) => {
      if (bytes.length + chunk.length > MAX_NATIVE_BYTES + 4) return finish(new Error('NATIVE_FRAME_TOO_LARGE'));
      bytes = Buffer.concat([bytes, chunk]);
      if (expected === null && bytes.length >= 4) {
        expected = bytes.readUInt32LE(0);
        if (expected < 1 || expected > MAX_NATIVE_BYTES) return finish(new Error('NATIVE_FRAME_LENGTH_INVALID'));
      }
      if (expected === null || bytes.length < expected + 4) return;
      if (bytes.length !== expected + 4) return finish(new Error('NATIVE_EXTRA_FRAME_FORBIDDEN'));
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4));
        finish(undefined, JSON.parse(text));
      } catch { finish(new Error('NATIVE_JSON_INVALID')); }
    };
    const timer = setTimeout(() => finish(new Error('NATIVE_FRAME_TIMEOUT')), timeoutMs);
    input.on('data', data);
    input.once('end', end);
    input.once('error', failed);
  });
}
export async function runNativeHost(origin: unknown, input: Readable, output: Writable): Promise<void> {
  let response: unknown;
  try {
    // Refuse the wrong Chrome origin before stdin processing or private reads.
    if (!trustedNativeCaller(origin)) response = { ok: false, reason: 'NATIVE_CALLER_REJECTED' };
    else response = await handleNativeProfileRequest(await readNativeMessage(input), origin);
  } catch (error) {
    const message = (error as Error).message;
    response = { ok: false, reason: /^NATIVE_[A-Z_]+$/.test(message) ? message : 'NATIVE_HOST_UNAVAILABLE' };
  }
  let encoded;
  try { encoded = encodeNativeMessage(response); }
  catch { encoded = encodeNativeMessage({ ok: false, reason: 'NATIVE_RESPONSE_TOO_LARGE' }); }
  await new Promise<void>((resolve, reject) => output.write(encoded, error => error ? reject(error) : resolve()));
}
if (process.argv[1] && realpathSync.native(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  runNativeHost(process.argv[2], process.stdin, process.stdout).then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
}
