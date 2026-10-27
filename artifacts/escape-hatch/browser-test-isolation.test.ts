import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createIsolatedBrowserTestEnvironment, resolveBrowserTestPort } from './browser-test-isolation.ts';

test('P94: browser regressions reject the real runtime and separately owned test ports', () => {
  assert.equal(resolveBrowserTestPort(undefined), '21041');
  assert.equal(resolveBrowserTestPort('21141'), '21141');
  for (const unsafe of ['21031', '21033', '21039', '21040', '0', '65536', 'not-a-port', '-1']) {
    assert.throws(() => resolveBrowserTestPort(unsafe), /isolated port/);
  }
});

test('P94: inherited real workspace paths cannot enter a disposable browser test server', () => {
  const config = createIsolatedBrowserTestEnvironment({
    ESCAPEHATCH_TEST_PORT: '21141',
    LOCALAPPDATA: 'C:/real/user/local',
    ESCAPEHATCH_DATA_HOME: 'C:/real/user/workspace',
    ESCAPEHATCH_PREFERENCES_FILE: 'C:/real/user/preferences.json',
    ESCAPEHATCH_TRACKER_SNAPSHOT: 'C:/real/user/tracker.json',
    ESCAPEHATCH_ALLOW_SYNTHETIC_ATS: '1',
  });
  try {
    assert.equal(config.port, '21141');
    assert.equal(config.serverEnv.ESCAPEHATCH_DATA_HOME, config.dataHome);
    assert.equal(config.serverEnv.LOCALAPPDATA, config.dataHome);
    assert.equal(config.serverEnv.ESCAPEHATCH_PREFERENCES_FILE, path.join(config.dataHome, 'preferences.json'));
    assert.equal(config.serverEnv.ESCAPEHATCH_TRACKER_SNAPSHOT, path.join(config.dataHome, 'tracker.json'));
    assert.equal(config.serverEnv.ESCAPEHATCH_ALLOW_SYNTHETIC_ATS, '0');
    assert.equal(config.serverEnv.VITE_ESCAPEHATCH_SYNTHETIC_TEST_WORKSPACE, '1');
    assert.notEqual(config.serverEnv.ESCAPEHATCH_DATA_HOME, 'C:/real/user/workspace');
  } finally {
    rmSync(config.dataHome, { recursive: true, force: true });
  }
});
