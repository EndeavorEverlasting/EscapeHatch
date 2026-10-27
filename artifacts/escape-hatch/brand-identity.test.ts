import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url));
const readText = (path: string) => read(path).toString('utf8');

test('approved EscapeHatch mascot is shipped as a valid, tamper-detectable WebP asset', () => {
  const logo = read('./public/escapehatch-mascot.webp');
  assert.equal(logo.toString('ascii', 0, 4), 'RIFF');
  assert.equal(logo.toString('ascii', 8, 12), 'WEBP');
  assert.equal(createHash('sha256').update(logo).digest('hex'),
    'e1e0f6e7ff0470231ae3ffa042e6a36555659a86ea070bee036e2badcec76451');
});

test('desktop, mobile, favicon and social description reflect the mascot identity', () => {
  const app = readText('./src/App.tsx');
  const html = readText('./index.html');
  const svg = readText('./public/favicon.svg');
  assert.match(app, /data-testid="image-mobile-mascot"/);
  assert.match(app, /data-testid="image-sidebar-mascot"/);
  assert.equal((app.match(/src="\/escapehatch-mascot\.webp"/g) ?? []).length, 2);
  assert.match(html, /rel="icon" type="image\/webp" href="\/escapehatch-mascot\.webp"/);
  assert.doesNotMatch(html, /built on Replit/);
  assert.match(svg, /<title>EscapeHatch<\/title>/);
  assert.doesNotMatch(svg, /#FF3C00/i);
});
