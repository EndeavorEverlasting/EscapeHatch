#!/usr/bin/env node
// Cross-platform preinstall: replaces Unix-only `sh -c '...'` wrapper
// Removes competing lockfiles and enforces pnpm.
// Works on Windows (no sh), macOS, and Linux.
import fs from 'node:fs';

for (const f of ['package-lock.json', 'yarn.lock']) {
  try {
    fs.rmSync(f, { force: true });
  } catch {}
  try {
    fs.rmSync(`artifacts/escape-hatch/${f}`, { force: true });
  } catch {}
}

const ua = process.env.npm_config_user_agent || '';
if (!ua.includes('pnpm/')) {
  console.error('Use pnpm instead (npm/yarn are not supported for this workspace).');
  console.error(`  npm_config_user_agent="${ua}"`);
  console.error('  Install pnpm: https://pnpm.io/installation');
  process.exit(1);
}
