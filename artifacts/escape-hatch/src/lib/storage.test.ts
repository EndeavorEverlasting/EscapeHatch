import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DRAFT_RECOVERY_SECONDS,
  DRAFT_RECOVERY_KEY,
  DRAFT_RECOVERY_OPTIONS,
  emptyProfile,
  getWorkspaceChangedAreas,
  getDraftRecoveryDeadline,
  parseApplicationsStorage,
  parseAnswersStorage,
  parseDraftRecoveryStorage,
  parseProfileExportText,
  parseProfileStorage,
  parseStoredValue,
  parseWorkspaceExportText,
  readStoredValue,
  serializeProfileExport,
  serializeWorkspaceExport,
  summarizeWorkspace,
  writeStoredValue,
} from './storage';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test('profile exports round-trip every field', () => {
  const profile = {
    ...emptyProfile,
    name_prefix: 'Dr.',
    first_name: 'Ada',
    last_name: 'Lovelace',
    preferred_name: 'Ada',
    email: 'ada@example.com',
    phone: '+1 555 0100',
    phone_authority: 'mobile',
    linkedin_url: 'https://linkedin.com/in/ada',
    street_address: '1 Analytical Engine Way',
    city: 'London',
    region: 'London',
    postal_code: 'NW1',
    country: 'United Kingdom',
  };

  assert.deepEqual(parseProfileExportText(serializeProfileExport(profile)), { ok: true, profile });
});

test('profile imports reject unsupported schemas and invalid values with feedback', () => {
  assert.deepEqual(parseProfileExportText(JSON.stringify({ schema: 'other-app', version: 1, profile: emptyProfile })), {
    ok: false,
    error: 'This file is not an EscapeHatch profile export.',
  });
  assert.deepEqual(parseProfileExportText(JSON.stringify({ schema: 'escape-hatch-profile', version: 99, profile: emptyProfile })), {
    ok: false,
    error: 'This EscapeHatch export version is not supported.',
  });
  assert.deepEqual(parseProfileExportText(JSON.stringify({ schema: 'escape-hatch-profile', version: 1, profile: { ...emptyProfile, email: 42 } })), {
    ok: false,
    error: 'This profile export has missing or invalid text fields.',
  });
  assert.deepEqual(parseProfileExportText('{not-json'), { ok: false, error: 'This file is not valid JSON.' });
});

test('workspace backups round-trip profile, answers, and applications without dropping fields', () => {
  const profile = { ...emptyProfile, first_name: 'Ada', email: 'ada@example.com' };
  const answers = [{ id: 'answer-1', title: 'Why this role', category: 'Motivation', content: 'A thoughtful answer.', updatedAt: '2026-09-19T12:00:00.000Z' }];
  const applications = [{ id: 'application-1', company: 'Acme', role: 'Designer', url: 'https://acme.example/jobs/1', status: 'preparing' as const, priority: 'high' as const, notes: 'Strong fit.', nextAction: 'Review portfolio', updatedAt: '2026-09-19T12:00:00.000Z' }];

  assert.deepEqual(parseWorkspaceExportText(serializeWorkspaceExport(profile, answers, applications)), {
    ok: true,
    workspace: { profile, answers, applications },
  });
});

test('workspace summaries describe profile details and both saved collections', () => {
  const workspace = {
    profile: { ...emptyProfile, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
    answers: [{ id: 'answer-1', title: 'Why this role', category: 'Motivation', content: 'A thoughtful answer.', updatedAt: '2026-09-19T12:00:00.000Z' }],
    applications: [{ id: 'application-1', company: 'Acme', role: 'Designer', url: '', status: 'preparing' as const, priority: 'high' as const, notes: '', nextAction: '', updatedAt: '2026-09-19T12:00:00.000Z' }],
  };

  assert.deepEqual(summarizeWorkspace(workspace), {
    profile: { displayName: 'Ada Lovelace', email: 'ada@example.com', filledFields: 3, totalFields: 13 },
    answers: { count: 1, titles: ['Why this role'] },
    applications: {
      count: 1,
      labels: ['Acme · Designer'],
      byStatus: { saved: 0, preparing: 1, applied: 0, follow_up: 0, closed: 0 },
    },
  });
});

test('workspace restore comparisons identify only areas that would overwrite current work', () => {
  const backup = {
    profile: { ...emptyProfile, first_name: 'Ada' },
    answers: [{ id: 'answer-1', title: 'Why this role', category: 'Motivation', content: 'Original answer.', updatedAt: '2026-09-19T12:00:00.000Z' }],
    applications: [{ id: 'application-1', company: 'Acme', role: 'Designer', url: '', status: 'preparing' as const, priority: 'high' as const, notes: '', nextAction: '', updatedAt: '2026-09-19T12:00:00.000Z' }],
  };
  const current = {
    ...backup,
    answers: [{ ...backup.answers[0], content: 'Newer answer.' }],
  };

  assert.deepEqual(getWorkspaceChangedAreas(current, backup), ['answers']);
  assert.deepEqual(getWorkspaceChangedAreas(backup, backup), []);
});

test('workspace imports validate every collection and reject the whole backup on any invalid value', () => {
  const valid = {
    schema: 'escape-hatch-workspace',
    version: 1,
    profile: emptyProfile,
    answers: [],
    applications: [],
  };
  assert.deepEqual(parseWorkspaceExportText(JSON.stringify({ ...valid, answers: [{ id: 'broken' }] })), {
    ok: false,
    error: 'This workspace backup has missing or invalid answer data.',
  });
  assert.deepEqual(parseWorkspaceExportText(JSON.stringify({ ...valid, applications: [{ id: 'broken' }] })), {
    ok: false,
    error: 'This workspace backup has missing or invalid application data.',
  });
  assert.deepEqual(parseWorkspaceExportText(JSON.stringify({ ...valid, profile: { ...emptyProfile, email: 42 } })), {
    ok: false,
    error: 'This workspace backup has missing or invalid profile data.',
  });
  assert.deepEqual(parseWorkspaceExportText(JSON.stringify({ ...valid, schema: 'escape-hatch-profile' })), {
    ok: false,
    error: 'This file is not an EscapeHatch workspace backup.',
  });
});

test('malformed local storage falls back without leaking invalid values', () => {
  const storage = memoryStorage();
  storage.setItem('profile', JSON.stringify({ ...emptyProfile, first_name: 42 }));
  storage.setItem('answers', JSON.stringify([{ id: 'a', title: 'Broken', category: 'Other', content: 'x', updatedAt: 'not-a-date' }]));
  storage.setItem('applications', JSON.stringify([{ id: 'a', company: 'Broken', role: 'Role', url: '', status: 'invalid', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() }]));

  assert.deepEqual(readStoredValue(storage, 'profile', emptyProfile, parseProfileStorage), emptyProfile);
  assert.deepEqual(readStoredValue(storage, 'answers', [], parseAnswersStorage), []);
  assert.deepEqual(readStoredValue(storage, 'applications', [], parseApplicationsStorage), []);
});

test('draft recovery storage accepts only configured durations and falls back safely', () => {
  assert.equal(parseDraftRecoveryStorage(DEFAULT_DRAFT_RECOVERY_SECONDS), DEFAULT_DRAFT_RECOVERY_SECONDS);
  for (const option of DRAFT_RECOVERY_OPTIONS) assert.equal(parseDraftRecoveryStorage(option), option);
  for (const invalid of [0, -1, 7, 90, 8.5, '30', null, undefined, {}]) {
    assert.equal(parseDraftRecoveryStorage(invalid), null);
  }

  const storage = memoryStorage();
  storage.setItem(DRAFT_RECOVERY_KEY, JSON.stringify(30));
  assert.equal(readStoredValue(storage, DRAFT_RECOVERY_KEY, DEFAULT_DRAFT_RECOVERY_SECONDS, parseDraftRecoveryStorage), 30);
  storage.setItem(DRAFT_RECOVERY_KEY, JSON.stringify(999));
  assert.equal(readStoredValue(storage, DRAFT_RECOVERY_KEY, DEFAULT_DRAFT_RECOVERY_SECONDS, parseDraftRecoveryStorage), DEFAULT_DRAFT_RECOVERY_SECONDS);
});

test('draft recovery deadlines are anchored to the dismissal time', () => {
  assert.equal(getDraftRecoveryDeadline(30, 1_000), 31_000);
});

test('malformed storage events fall back without leaking invalid values', () => {
  const validAnswer = { id: 'answer-1', title: 'Valid', category: 'Other', content: 'A valid answer.', updatedAt: '2026-09-19T12:00:00.000Z' };
  assert.deepEqual(parseStoredValue(null, [], parseAnswersStorage), []);
  assert.deepEqual(parseStoredValue('{not-json', [], parseAnswersStorage), []);
  assert.deepEqual(parseStoredValue(JSON.stringify([validAnswer]), [], parseAnswersStorage), [validAnswer]);
});

test('answer and application CRUD state survives storage writes and reads', () => {
  const storage = memoryStorage();
  const updatedAt = new Date().toISOString();
  const answers = [{ id: 'answer-1', title: 'Why this role', category: 'Motivation', content: 'A thoughtful answer.', updatedAt }];
  const applications = [{ id: 'application-1', company: 'Acme', role: 'Designer', url: 'https://acme.example/jobs/1', status: 'preparing' as const, priority: 'high' as const, notes: 'Strong fit.', nextAction: 'Review portfolio', updatedAt }];

  // Create, reload, edit, reload, delete, and reload for both local collections.
  writeStoredValue(storage, 'answers', answers);
  writeStoredValue(storage, 'applications', applications);
  assert.deepEqual(readStoredValue(storage, 'answers', [], parseAnswersStorage), answers);
  assert.deepEqual(readStoredValue(storage, 'applications', [], parseApplicationsStorage), applications);

  const editedAnswers = answers.map((answer) => ({ ...answer, content: 'An edited thoughtful answer.' }));
  const editedApplications = applications.map((application) => ({ ...application, status: 'applied' as const, nextAction: 'Send a follow-up' }));
  writeStoredValue(storage, 'answers', editedAnswers);
  writeStoredValue(storage, 'applications', editedApplications);
  assert.deepEqual(readStoredValue(storage, 'answers', [], parseAnswersStorage), editedAnswers);
  assert.deepEqual(readStoredValue(storage, 'applications', [], parseApplicationsStorage), editedApplications);

  writeStoredValue(storage, 'answers', editedAnswers.filter((answer) => answer.id !== 'answer-1'));
  writeStoredValue(storage, 'applications', editedApplications.filter((application) => application.id !== 'application-1'));
  assert.deepEqual(readStoredValue(storage, 'answers', [], parseAnswersStorage), []);
  assert.deepEqual(readStoredValue(storage, 'applications', [], parseApplicationsStorage), []);
});

test('storage writes report unavailable or full browser storage without throwing', () => {
  const unavailableStorage = undefined;
  const fullStorage = {
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };

  assert.equal(writeStoredValue(unavailableStorage, 'profile', emptyProfile), false);
  assert.equal(writeStoredValue(fullStorage, 'profile', emptyProfile), false);
  assert.equal(writeStoredValue(memoryStorage(), 'profile', emptyProfile), true);
});