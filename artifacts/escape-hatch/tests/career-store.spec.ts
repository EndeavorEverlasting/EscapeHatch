import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

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
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
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

test('family1: full canonical validation rejects nested/status/extra/artifact defects', async ({ page }) => {
  const result = await page.evaluate(async (state) => {
    const { CareerStateStore, validateCareerStateEnvelope } = await import('/src/lib/career-store.ts');
    const store = new CareerStateStore();
    await store.initialize(state);

    const cases: Array<{ label: string; next: unknown }> = [
      {
        label: 'empty-opportunity',
        next: { ...state, revision: 2, opportunities: [{}] },
      },
      {
        label: 'invalid-status',
        next: {
          ...state,
          revision: 2,
          opportunities: [{
            id: 'opp-1',
            title: 'Role',
            organization: 'Org',
            status: 'applied',
            source: { owner: 'user', kind: 'inline', locator: 'x' },
          }],
        },
      },
      {
        label: 'extra-property',
        next: { ...state, revision: 2, unexpected: true },
      },
      {
        label: 'bad-artifact',
        next: {
          ...state,
          revision: 2,
          opportunities: [{
            id: 'opp-1',
            title: 'Role',
            organization: 'Org',
            status: 'targeted',
            source: { owner: 'user', kind: 'file', locator: 'x' },
          }],
        },
      },
      {
        label: 'malformed-profile',
        next: { ...state, revision: 2, profile: { id: 'profile-primary', headline: 'x' } },
      },
    ];

    const outcomes = [];
    for (const item of cases) {
      let validateError = '';
      try {
        validateCareerStateEnvelope(item.next);
      } catch (error) {
        validateError = error instanceof Error ? error.message : String(error);
      }
      const commit = await store.commit(item.next as typeof state, 1);
      outcomes.push({ label: item.label, validateError, commit });
    }
    return { outcomes, finalState: await store.load() };
  }, initialState);

  for (const outcome of result.outcomes) {
    expect(outcome.validateError.length, outcome.label).toBeGreaterThan(0);
    expect(outcome.commit, outcome.label).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  }
  expect(result.finalState).toMatchObject({ revision: 1, state_id: 'browser-state' });
});

test('family2: strict date-time rejects date-only updated_at', async ({ page }) => {
  const result = await page.evaluate(async (state) => {
    const { CareerStateStore, isStrictDateTime, validateCareerStateEnvelope } = await import('/src/lib/career-store.ts');
    const dateOnlyAcceptedByParse = !Number.isNaN(Date.parse('2026-09-24'));
    const strictRejectsDateOnly = !isStrictDateTime('2026-09-24');
    const strictAcceptsDateTime = isStrictDateTime('2026-09-24T09:00:00.000Z');
    let validateError = '';
    try {
      validateCareerStateEnvelope({ ...state, updated_at: '2026-09-24' });
    } catch (error) {
      validateError = error instanceof Error ? error.message : String(error);
    }
    const store = new CareerStateStore();
    await store.initialize(state);
    const commit = await store.commit({ ...state, revision: 2, updated_at: '2026-09-24' }, 1);
    return {
      dateOnlyAcceptedByParse,
      strictRejectsDateOnly,
      strictAcceptsDateTime,
      validateError,
      commit,
      finalState: await store.load(),
    };
  }, initialState);

  expect(result.dateOnlyAcceptedByParse).toBe(true);
  expect(result.strictRejectsDateOnly).toBe(true);
  expect(result.strictAcceptsDateTime).toBe(true);
  expect(result.validateError).toMatch(/date-time/i);
  expect(result.commit).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  expect(result.finalState).toMatchObject({ revision: 1, updated_at: '2026-09-24T09:00:00.000Z' });
});

test('family3: legacy applied/preparing/saved/follow-up preserve milestones', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { CareerStateStore } = await import('/src/lib/career-store.ts');
    const key = 'escape-hatch-applications';
    localStorage.setItem(key, JSON.stringify([
      { id: 'a-saved', company: 'A', role: 'R1', url: '', status: 'saved', priority: 'low', notes: '', nextAction: '', updatedAt: '2026-09-20T10:00:00.000Z' },
      { id: 'a-prep', company: 'B', role: 'R2', url: '', status: 'preparing', priority: 'normal', notes: 'n', nextAction: 'prep', updatedAt: '2026-09-21T10:00:00.000Z' },
      { id: 'a-applied', company: 'C', role: 'R3', url: 'https://example.invalid/c', status: 'applied', priority: 'high', notes: '', nextAction: 'wait', updatedAt: '2026-09-22T10:00:00.000Z' },
      { id: 'a-follow', company: 'D', role: 'R4', url: '', status: 'follow_up', priority: 'high', notes: '', nextAction: 'ping', updatedAt: '2026-09-23T10:00:00.000Z' },
      { id: 'a-closed', company: 'E', role: 'R5', url: '', status: 'closed', priority: 'low', notes: '', nextAction: '', updatedAt: '2026-09-24T10:00:00.000Z' },
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
    const migrated = await store.migrateLegacyApplications(localStorage, create);
    const state = await store.load();
    return {
      migrated,
      opportunities: state?.opportunities.map((item) => ({ id: item.id, status: item.status })),
      applications: state?.applications.map((item) => ({
        id: item.id,
        status: item.status,
        submitted_at: item.submitted_at,
        external_reference: item.external_reference,
      })),
      resumes: state?.resumes.map((item) => item.id),
    };
  });

  expect(result.migrated).toMatchObject({ migrated: true, count: 5 });
  expect(result.opportunities).toEqual(expect.arrayContaining([
    { id: 'legacy-opportunity-a-saved', status: 'targeted' },
    { id: 'legacy-opportunity-a-prep', status: 'targeted' },
    { id: 'legacy-opportunity-a-applied', status: 'targeted' },
    { id: 'legacy-opportunity-a-follow', status: 'targeted' },
    { id: 'legacy-opportunity-a-closed', status: 'closed' },
  ]));
  expect(result.applications).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'legacy-application-a-saved', status: 'draft', submitted_at: null, external_reference: 'legacy-status:saved' }),
    expect.objectContaining({ id: 'legacy-application-a-prep', status: 'draft', submitted_at: null, external_reference: 'legacy-status:preparing' }),
    expect.objectContaining({ id: 'legacy-application-a-applied', status: 'submitted', submitted_at: '2026-09-22T10:00:00.000Z', external_reference: 'legacy-status:applied' }),
    expect.objectContaining({ id: 'legacy-application-a-follow', status: 'submitted', submitted_at: '2026-09-23T10:00:00.000Z', external_reference: 'legacy-status:follow_up' }),
  ]));
  expect(result.applications?.some((item) => item.id === 'legacy-application-a-closed')).toBe(false);
  expect(result.resumes).toEqual(expect.arrayContaining([
    'legacy-resume-a-saved',
    'legacy-resume-a-prep',
    'legacy-resume-a-applied',
    'legacy-resume-a-follow',
  ]));
});

test('family4: migration marker+eligibility rechecked in write txn; one concurrent winner', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { CareerStateStore } = await import('/src/lib/career-store.ts');
    const key = 'escape-hatch-applications';
    localStorage.setItem(key, JSON.stringify([
      {
        id: 'race-1',
        company: 'Race Co',
        role: 'Engineer',
        url: '',
        status: 'saved',
        priority: 'low',
        notes: '',
        nextAction: '',
        updatedAt: '2026-09-23T12:00:00.000Z',
      },
    ]));
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
    const left = new CareerStateStore();
    const right = new CareerStateStore();
    const [first, second] = await Promise.all([
      left.migrateLegacyApplications(localStorage, create),
      right.migrateLegacyApplications(localStorage, create),
    ]);
    const snapshots = await left.recoverySnapshots();
    const state = await left.load();
    return {
      first,
      second,
      winners: [first, second].filter((item) => item.migrated).length,
      snapshotCount: snapshots.length,
      opportunityCount: state?.opportunities.length ?? 0,
      revision: state?.revision ?? null,
    };
  });

  expect(result.winners).toBe(1);
  expect([result.first.migrated, result.second.migrated].sort()).toEqual([false, true]);
  expect(result.snapshotCount).toBe(1);
  expect(result.opportunityCount).toBe(1);
  expect(result.revision).toBe(1);
});

test('family5: after IDB commit, localStorage cleanup failure does not reject durable migrate', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { CareerStateStore } = await import('/src/lib/career-store.ts');
    const key = 'escape-hatch-applications';
    const payload = JSON.stringify([
      {
        id: 'cleanup-1',
        company: 'Cleanup Co',
        role: 'Engineer',
        url: '',
        status: 'applied',
        priority: 'high',
        notes: '',
        nextAction: 'follow',
        updatedAt: '2026-09-23T12:00:00.000Z',
      },
    ]);
    localStorage.setItem(key, payload);
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
    const flakyStorage = {
      getItem: (name: string) => localStorage.getItem(name),
      removeItem: () => {
        throw new Error('synthetic localStorage.removeItem failure');
      },
    };
    const store = new CareerStateStore();
    const first = await store.migrateLegacyApplications(flakyStorage, create);
    const legacyStillPresent = localStorage.getItem(key);
    const second = await store.migrateLegacyApplications(localStorage, create);
    return {
      first,
      legacyStillPresent,
      second,
      state: await store.load(),
      snapshots: await store.recoverySnapshots(),
    };
  });

  expect(result.first).toMatchObject({ migrated: true, count: 1 });
  expect(result.legacyStillPresent).not.toBeNull();
  expect(result.second).toMatchObject({ migrated: false, count: 0 });
  expect(result.state?.applications).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'legacy-application-cleanup-1', status: 'submitted', external_reference: 'legacy-status:applied' }),
  ]));
  expect(result.snapshots).toHaveLength(1);
});
