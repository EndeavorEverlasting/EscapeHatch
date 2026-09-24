import { expect, test } from '@playwright/test';

const initialState = {
  schema_version: 'escapehatch-career-state/v1',
  state_id: 'browser-state',
  revision: 1,
  updated_at: '2026-09-24T09:00:00.000Z',
  profile: { id: 'profile-primary', headline: 'Synthetic profile', skills: [] },
  opportunities: [],
  resumes: [],
  applications: [],
  evidence: [],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('escape-hatch-career-state');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
    localStorage.clear();
  });
});

test('career state survives reload and compare-and-set blocks stale overwrite', async ({ page }) => {
  const initialized = await page.evaluate(async (state) => {
    const { CareerStateStore } = await import('/src/lib/career-store.ts');
    const store = new CareerStateStore();
    return store.initialize(state);
  }, initialState);
  expect(initialized.ok).toBe(true);

  await page.reload();
  const loaded = await page.evaluate(async () => {
    const { CareerStateStore } = await import('/src/lib/career-store.ts');
    return new CareerStateStore().load();
  });
  expect(loaded).toMatchObject({ state_id: 'browser-state', revision: 1 });

  const result = await page.evaluate(async () => {
    const { CareerStateStore } = await import('/src/lib/career-store.ts');
    const store = new CareerStateStore();
    const current = await store.load();
    if (!current) throw new Error('missing state');
    const next = { ...current, revision: 2, updated_at: '2026-09-24T10:00:00.000Z' };
    const first = await store.commit(next, 1);
    const stale = await store.commit({ ...next, revision: 2 }, 1);
    return { first, stale, finalState: await store.load(), snapshots: await store.recoverySnapshots() };
  });
  expect(result.first.ok).toBe(true);
  expect(result.stale).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
  expect(result.finalState).toMatchObject({ revision: 2 });
  expect(result.snapshots).toHaveLength(1);
  expect(result.snapshots[0].state).toMatchObject({ revision: 1 });
});

test('invalid or failed commits preserve the prior state', async ({ page }) => {
  const result = await page.evaluate(async (state) => {
    const { CareerStateStore } = await import('/src/lib/career-store.ts');
    const store = new CareerStateStore();
    await store.initialize(state);
    const before = JSON.stringify(await store.load());
    const invalid = await store.commit({ ...state, revision: 3 }, 1);
    const afterInvalid = JSON.stringify(await store.load());
    const wrongId = await store.commit({ ...state, state_id: 'different', revision: 2 }, 1);
    const afterWrongId = JSON.stringify(await store.load());
    return { invalid, wrongId, before, afterInvalid, afterWrongId };
  }, initialState);
  expect(result.invalid).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  expect(result.wrongId).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  expect(result.afterInvalid).toBe(result.before);
  expect(result.afterWrongId).toBe(result.before);
});

test('legacy opportunities migrate once and legacy storage is removed only after commit', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { CareerStateStore } = await import('/src/lib/career-store.ts');
    const key = 'escape-hatch-applications';
    localStorage.setItem(key, JSON.stringify([
      {
        id: 'legacy-1',
        company: 'Synthetic Co',
        role: 'Automation Engineer',
        url: 'https://example.invalid/jobs/1',
        status: 'preparing',
        priority: 'high',
        notes: 'Synthetic legacy note',
        nextAction: 'Prepare application',
        updatedAt: '2026-09-23T12:00:00.000Z',
      },
    ]));
    const store = new CareerStateStore();
    const create = (opportunities: Record<string, unknown>[], observedAt: string) => ({
      schema_version: 'escapehatch-career-state/v1' as const,
      state_id: 'migrated-state',
      revision: 1,
      updated_at: observedAt,
      profile: { id: 'profile-primary', headline: '', skills: [] },
      opportunities,
      resumes: [],
      applications: [],
      evidence: [],
    });
    const first = await store.migrateLegacyApplications(localStorage, create);
    const legacyAfterFirst = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify([]));
    const second = await store.migrateLegacyApplications(localStorage, create);
    return { first, second, legacyAfterFirst, state: await store.load() };
  });
  expect(result.first).toMatchObject({ migrated: true, count: 1 });
  expect(result.legacyAfterFirst).toBeNull();
  expect(result.state?.opportunities).toHaveLength(1);
  expect(result.state?.opportunities[0]).toMatchObject({
    organization: 'Synthetic Co',
    title: 'Automation Engineer',
    priority: 'high',
  });
  expect(result.second.migrated).toBe(false);
  expect(result.state?.revision).toBe(1);
});
