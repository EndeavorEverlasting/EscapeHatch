import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyAssistProfile } from './assist-contract';
import { emptyProfile, type Application } from './storage';
import { approveSource, candidateRevision, parseSourceBindings, persistSourceApproval, previewLocalSource, sourcePackageStatus } from './source-bridge';

const application: Application = { id: 'op-1', company: 'Synthetic Company', role: 'Engineer', url: '', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-10-18T00:00:00Z' };
const corpus = 'Synthetic Candidate\nsynthetic@example.invalid\nSummary\nBuilds deterministic tools.\nSkills\nTypeScript • Python';
const file = (text = corpus) => new File([text], 'synthetic.txt', { type: 'text/plain' });
const fresh = () => ({ profile: { ...emptyProfile }, assist: emptyAssistProfile({ ...emptyProfile }) });

test('read stages claims without mutation and hashes actual bytes rather than filename', async () => {
  const { profile, assist } = fresh();
  const before = JSON.stringify({ profile, assist });
  const preview = await previewLocalSource(file(), profile, assist);
  assert.equal(JSON.stringify({ profile, assist }), before);
  assert.equal(preview.byteCount, new TextEncoder().encode(corpus).length);
  assert.ok(preview.imported.proposals.length);
  assert.notEqual((await previewLocalSource(file(corpus + '\nchanged'), profile, assist)).revision, preview.revision);
  assert.equal(preview.baseRevision, await candidateRevision(profile, assist));
});

test('explicit approval reuses existing candidate, stamps provenance, binds opportunity, and is idempotent', async () => {
  const { profile, assist } = fresh();
  const preview = await previewLocalSource(file(), profile, assist);
  const proposals = preview.imported.proposals.map((item) => ({ ...item, review: 'accepted' as const }));
  const next = await approveSource(preview, proposals, application.id, [application], profile, assist, []);
  assert.equal(next.profile.email, 'synthetic@example.invalid');
  assert.equal(next.assist.contact.email, next.profile.email);
  assert.equal(next.assist.proposals[0].provenance.sourceId, preview.sourceId);
  assert.equal(next.bindings[0].revision, preview.revision);
  assert.equal(parseSourceBindings(JSON.parse(JSON.stringify(next.bindings)))?.length, 1);
  const repeated = await approveSource(preview, proposals, application.id, [application], next.profile, next.assist, next.bindings);
  assert.deepEqual(repeated, next);
  const other = { ...application, id: 'op-2' };
  const attached = await approveSource(preview, proposals, other.id, [application, other], next.profile, next.assist, next.bindings);
  assert.equal(attached.assist, next.assist);
  assert.equal(attached.bindings.length, 2);
  assert.match(await sourcePackageStatus(next.bindings[0], [application], next.profile, next.assist), /unverified/);
});

test('profile edits, missing opportunities, unreviewed and forged proposals fail closed', async () => {
  const { profile, assist } = fresh();
  const preview = await previewLocalSource(file(), profile, assist);
  const proposals = preview.imported.proposals.map((item) => ({ ...item, review: 'accepted' as const }));
  await assert.rejects(approveSource(preview, proposals, 'unknown', [application], profile, assist, []), /OPPORTUNITY_REQUIRED/);
  await assert.rejects(approveSource(preview, [], application.id, [application], profile, assist, []), /APPROVAL_REQUIRED/);
  await assert.rejects(approveSource(preview, [{ ...proposals[0], value: 'forged' }], application.id, [application], profile, assist, []), /PROPOSAL_MISMATCH/);
  await assert.rejects(approveSource(preview, proposals, application.id, [application], { ...profile, city: 'User edited' }, assist, []), /PROFILE_CHANGED/);
  const next = await approveSource(preview, proposals, application.id, [application], profile, assist, []);
  await assert.rejects(approveSource(preview, proposals, application.id, [application], { ...next.profile, city: 'User edited' }, next.assist, next.bindings), /STALE/);
  assert.match(await sourcePackageStatus(next.bindings[0], [application], { ...next.profile, city: 'User edited' }, next.assist), /review required/);
  assert.match(await sourcePackageStatus(next.bindings[0], [], next.profile, next.assist), /unavailable/);
});

test('selection changes are reviewed rather than swallowed by idempotency', async () => {
  const { profile, assist } = fresh();
  const preview = await previewLocalSource(file(), profile, assist);
  const accepted = preview.imported.proposals.map((item) => ({ ...item, review: 'accepted' as const }));
  const next = await approveSource(preview, accepted, application.id, [application], profile, assist, []);
  await assert.rejects(approveSource(preview, accepted.slice(0, 1), application.id, [application], next.profile, next.assist, next.bindings), /PROFILE_CHANGED/);
});

test('empty, unsupported, oversized sources and corrupt persisted bindings cannot imply approval', async () => {
  const { profile, assist } = fresh();
  for (const source of [file(''), file('  '), new File(['hi'], 'unsupported.docx'), file('x'.repeat(20 * 1024 * 1024 + 1))]) {
    await assert.rejects(previewLocalSource(source, profile, assist));
  }
  assert.equal(parseSourceBindings([{ schema: 'escapehatch/approved-source/v1' }]), null);
  assert.equal(parseSourceBindings({}), null);
  assert.deepEqual(parseSourceBindings([]), []);
});

test('fresh review renews stale approval and an expanded subset does not duplicate rows', async () => {
  const { profile, assist } = fresh();
  const source = file(corpus + '\nProjects\n• Synthetic Tool — A deterministic utility');
  const preview = await previewLocalSource(source, profile, assist);
  const accepted = preview.imported.proposals.map((item) => ({ ...item, review: 'accepted' as const }));
  const project = accepted.filter((item) => item.section === 'projects');
  assert.ok(project.length);
  const first = await approveSource(preview, project, application.id, [application], profile, assist, []);
  const edited = { ...first.profile, city: 'User edited' };
  const freshPreview = await previewLocalSource(source, edited, first.assist);
  const expanded = await approveSource(freshPreview, accepted, application.id, [application], edited, first.assist, first.bindings);
  assert.equal(expanded.assist.projects.length, project.length);
  assert.equal(expanded.profile.city, 'User edited');
  const changed = { ...expanded.profile, city: 'Another edit' };
  const reread = await previewLocalSource(source, changed, expanded.assist);
  const renewed = await approveSource(reread, accepted, application.id, [application], changed, expanded.assist, expanded.bindings);
  assert.equal(renewed.assist.projects.length, project.length);
  assert.equal(renewed.bindings.length, 1);
  assert.match(await sourcePackageStatus(renewed.bindings[0], [application], renewed.profile, renewed.assist), /unverified/);
});

test('persistence publishes bindings last and reports storage failure with rollback', () => {
  const { profile, assist } = fresh();
  const values = new Map<string, string>([['escape-hatch-profile', 'previous']]);
  let failOnce = true;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (key === 'escape-hatch-source-bindings-v1' && failOnce) { failOnce = false; throw new Error('quota'); } values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
  assert.throws(() => persistSourceApproval(storage, { profile, assist, bindings: [] }), /STORAGE_SAVE_FAILED/);
  assert.deepEqual([...values], [['escape-hatch-profile', 'previous']]);
  persistSourceApproval(storage, { profile, assist, bindings: [] });
  assert.equal(values.get('escape-hatch-source-bindings-v1'), '[]');
  assert.throws(() => persistSourceApproval(undefined, { profile, assist, bindings: [] }), /STORAGE_UNAVAILABLE/);
});
