import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyProfile } from './storage';
import {
  emptyAssistProfile,
  mergeSyncPayload,
  parseAssistProfile,
  parseSyncPayload,
  serializeSyncPayload,
} from './assist-contract';
import { applyAcceptedResumeImport, extractResumeText, parseResumeText, UNSUPPORTED_RESUME_PDF_MESSAGE } from './resume-import';
import { classifyQuestion } from './assist-policy';

const provenance = { source: 'user' as const, label: 'test', capturedAt: '2026-09-20T00:00:00.000Z' };

function pdfWithStream(dictionary: string, content: string) {
  return `%PDF-1.4
1 0 obj
<< /Length ${content.length} ${dictionary} >>
stream
${content}
endstream
endobj
%%EOF`;
}

test('resume PDF extraction supports uncompressed text operators and escaped strings', async () => {
  const pdf = pdfWithStream('', [
    'BT',
    '/F1 12 Tf 72 720 Td',
    '(Uncompressed \\(text\\)) Tj',
    '[(layer) 120 (with)] TJ',
    '<2068657820> Tj',
    '(quoted) \'',
    'ET',
  ].join('\n'));

  const text = await extractResumeText(new File([pdf], 'synthetic-layout.pdf', { type: 'application/pdf' }));
  assert.equal(text.includes('Uncompressed (text)'), true);
  assert.equal(text.includes('layerwith'), true);
  assert.equal(text.includes('hex'), true);
  assert.equal(text.includes('quoted'), true);
});

test('resume PDF extraction skips font streams and explains unsupported documents', async () => {
  const fontStream = pdfWithStream('/Length1 999999 /Filter /FlateDecode', 'not compressed font data');
  const readableStream = pdfWithStream('', 'BT (Local text layer) Tj ET');
  const pdf = `${fontStream}\n${readableStream}`;
  const text = await extractResumeText(new File([pdf], 'font-and-text.pdf', { type: 'application/pdf' }));
  assert.equal(text, 'Local text layer');

  await assert.rejects(
    extractResumeText(new File(['%PDF-1.4\n1 0 obj\n<< /Length 18 >>\nstream\nBT ET\nendstream\nendobj\n%%EOF'], 'scanned.pdf', { type: 'application/pdf' })),
    (error: unknown) => error instanceof Error && error.message === UNSUPPORTED_RESUME_PDF_MESSAGE,
  );
});

test('resume text maps representable sections into reviewable proposals without committing them', () => {
  const imported = parseResumeText([
    'Alex Example',
    'Metro City, NY | alex@example.test | https://linkedin.com/in/alex-example',
    'PROFESSIONAL SUMMARY',
    'Product engineer who turns complex workflows into reliable tools.',
    'CORE STRENGTHS',
    'TypeScript • Python • Testing',
    'SELECTED SOFTWARE & AGENTIC SYSTEMS',
    '• Atlas — Built a workflow tool for small teams.',
    'PROFESSIONAL EXPERIENCE',
    'Example Co — Product Engineer | 2024–Present',
    '• Built accessible workflow tooling.',
    'EDUCATION',
    'Example University | B.S. Computer Science',
  ].join('\n'), 'synthetic.txt');

  assert.equal(imported.profilePatch.first_name, 'Alex');
  assert.equal(imported.profilePatch.email, 'alex@example.test');
  assert.equal(imported.summary.includes('reliable tools'), true);
  assert.equal(imported.skills.includes('TypeScript'), true);
  assert.equal(imported.projects.length, 1);
  assert.equal(imported.experience.length, 1);
  assert.equal(imported.education.length, 1);
  assert.ok(imported.proposals.every((proposal) => proposal.review === 'proposed'));
  const profile = emptyAssistProfile(emptyProfile);
  const accepted = imported.proposals.map((proposal) => ({ ...proposal, review: 'accepted' as const }));
  const saved = applyAcceptedResumeImport(imported, accepted, profile);
  assert.equal(saved.contact.email, 'alex@example.test');
  assert.equal(saved.summary.includes('reliable tools'), true);
  assert.equal(profile.contact.email, '');
});

test('accepted resume edits drive every reviewed field while rejected contact data stays unchanged', () => {
  const imported = parseResumeText([
    'Review Candidate',
    'Review City, NY | source@example.test | (555) 010-0101 | https://linkedin.com/in/source | https://source.example.test',
    'PROFESSIONAL SUMMARY',
    'Original summary text.',
    'CORE STRENGTHS',
    'Original Skill • Another Skill',
    'PROJECTS',
    '• Original Project — Original project details.',
    'PROFESSIONAL EXPERIENCE',
    'Original Org — Original Role | 2020–Present',
    '• Original contribution.',
    'EDUCATION',
    'Original Institute | Original Credential',
  ].join('\n'), 'synthetic-review.txt');
  const edits: Record<string, string> = {
    'contact:name': 'Reviewed Candidate',
    'contact:email': 'reviewed@example.test',
    'contact:location': 'Reviewed City, CA',
    'links:linkedin_url': 'https://linkedin.com/in/reviewed',
    'links:website': 'https://reviewed.example.test',
    'summary:professional_summary': 'Reviewed summary text.',
    'skills:skill': 'Reviewed Skill',
    'projects:project': 'Reviewed Project — Reviewed project details.',
    'experience:role': 'Reviewed Org — Reviewed Role | 2030–Present',
    'education:education': 'Reviewed Institute | Reviewed Credential',
  };
  const reviewed = imported.proposals.map((proposal) => {
    const key = `${proposal.section}:${proposal.field}`;
    if (key === 'contact:phone') return { ...proposal, review: 'rejected' as const };
    return edits[key]
      ? { ...proposal, value: edits[key], review: 'edited' as const }
      : { ...proposal, review: 'accepted' as const };
  });
  const existing = emptyAssistProfile({ ...emptyProfile, phone: 'keep-this-phone', country: 'Keep Country' });
  const saved = applyAcceptedResumeImport(imported, reviewed, existing);
  assert.deepEqual(
    {
      first_name: saved.contact.first_name,
      last_name: saved.contact.last_name,
      email: saved.contact.email,
      phone: saved.contact.phone,
      city: saved.contact.city,
      region: saved.contact.region,
      linkedin_url: saved.contact.linkedin_url,
    },
    {
      first_name: 'Reviewed',
      last_name: 'Candidate',
      email: 'reviewed@example.test',
      phone: 'keep-this-phone',
      city: 'Reviewed City',
      region: 'CA',
      linkedin_url: 'https://linkedin.com/in/reviewed',
    },
  );
  assert.equal(saved.links.some((link) => link.url === 'https://reviewed.example.test'), true);
  assert.equal(saved.links.some((link) => link.url === 'https://source.example.test'), false);
  assert.equal(saved.summary, 'Reviewed summary text.');
  assert.equal(saved.skills.includes('Reviewed Skill'), true);
  assert.equal(saved.skills.includes('Original Skill'), false);
  assert.equal(saved.projects.at(-1)?.name, 'Reviewed Project');
  assert.equal(saved.projects.at(-1)?.description, 'Reviewed project details.');
  assert.equal(saved.experience.at(-1)?.company, 'Reviewed Org');
  assert.equal(saved.experience.at(-1)?.title, 'Reviewed Role');
  assert.equal(saved.experience.at(-1)?.dates, '2030–Present');
  assert.equal(saved.education.at(-1)?.institution, 'Reviewed Institute');
  assert.equal(saved.education.at(-1)?.credential, 'Reviewed Credential');
  assert.ok(saved.proposals.every((proposal) => proposal.review !== 'rejected'));
  assert.equal(existing.contact.email, '');
});

test('multiple reviewed resume entries keep edits paired with their own details and provenance', () => {
  const imported = parseResumeText([
    'Multi Entry Candidate',
    'Review City, NY | source@example.test',
    'PROJECTS',
    '• Atlas — Atlas project details.',
    '• Beacon — Beacon project details.',
    '• Comet — Comet project details.',
    'PROFESSIONAL EXPERIENCE',
    'North Org — North Role | 2020–2022',
    '• North contribution.',
    'South Org — South Role | 2022–Present',
    '• South contribution.',
    'West Org — West Role | 2018–2020',
    '• West contribution.',
    'EDUCATION',
    'North University | B.S. Computer Science',
    '• North education detail.',
    'South College | M.S. Data Science',
    '• South education detail.',
    'West Institute | Certificate in Design',
    '• West education detail.',
  ].join('\n'), 'synthetic-multi-entry.txt');

  assert.equal(imported.projects.length, 3);
  assert.equal(imported.experience.length, 3);
  assert.equal(imported.education.length, 3);
  assert.equal(new Set(imported.proposals.filter((proposal) => proposal.section === 'projects').map((proposal) => proposal.id)).size, 3);
  assert.equal(new Set(imported.proposals.filter((proposal) => proposal.section === 'experience').map((proposal) => proposal.id)).size, 3);
  assert.equal(new Set(imported.proposals.filter((proposal) => proposal.section === 'education').map((proposal) => proposal.id)).size, 3);

  const projectEdits = new Map([
    ['Atlas — Atlas project details.', { value: 'Reviewed Atlas — Reviewed Atlas details.', review: 'edited' as const }],
    ['Beacon — Beacon project details.', { value: 'Reviewed Beacon — Reviewed Beacon details.', review: 'edited' as const }],
  ]);
  const experienceEdits = new Map([
    ['North Org — North Role | 2020–2022', { value: 'Reviewed North Org — Reviewed North Role | 2030–2032', review: 'edited' as const }],
    ['South Org — South Role | 2022–Present', { value: 'Reviewed South Org — Reviewed South Role | 2032–Present', review: 'edited' as const }],
  ]);
  const educationEdits = new Map([
    ['North University | B.S. Computer Science\nNorth education detail.', { value: 'Reviewed North University | Reviewed B.S. Computer Science\nReviewed North education detail.', review: 'edited' as const }],
    ['South College | M.S. Data Science\nSouth education detail.', { value: 'Reviewed South College | Reviewed M.S. Data Science\nReviewed South education detail.', review: 'edited' as const }],
  ]);
  const reviewed = imported.proposals.map((proposal) => {
    const edits = proposal.section === 'projects'
      ? projectEdits.get(proposal.value)
      : proposal.section === 'experience'
        ? experienceEdits.get(proposal.value)
        : proposal.section === 'education'
          ? educationEdits.get(proposal.value)
          : undefined;
    if (proposal.section === 'projects' && proposal.value.startsWith('Comet')) return { ...proposal, review: 'rejected' as const };
    if (proposal.section === 'experience' && proposal.value.startsWith('West Org')) return { ...proposal, review: 'rejected' as const };
    if (proposal.section === 'education' && proposal.value.startsWith('West Institute')) return { ...proposal, review: 'rejected' as const };
    return edits ? { ...proposal, ...edits } : { ...proposal, review: 'accepted' as const };
  });
  const saved = applyAcceptedResumeImport(imported, reviewed, emptyAssistProfile(emptyProfile));

  assert.deepEqual(saved.projects.map(({ name, description }) => ({ name, description })), [
    { name: 'Reviewed Atlas', description: 'Reviewed Atlas details.' },
    { name: 'Reviewed Beacon', description: 'Reviewed Beacon details.' },
  ]);
  assert.deepEqual(saved.projects.map((project) => project.provenance), [
    imported.proposals.find((proposal) => proposal.value === 'Atlas — Atlas project details.')?.provenance,
    imported.proposals.find((proposal) => proposal.value === 'Beacon — Beacon project details.')?.provenance,
  ]);
  assert.deepEqual(saved.experience.map(({ company, title, dates, bullets }) => ({ company, title, dates, bullets })), [
    { company: 'Reviewed North Org', title: 'Reviewed North Role', dates: '2030–2032', bullets: ['North contribution.'] },
    { company: 'Reviewed South Org', title: 'Reviewed South Role', dates: '2032–Present', bullets: ['South contribution.'] },
  ]);
  assert.deepEqual(saved.education.map(({ institution, credential, details }) => ({ institution, credential, details })), [
    { institution: 'Reviewed North University', credential: 'Reviewed B.S. Computer Science', details: 'Reviewed North education detail.' },
    { institution: 'Reviewed South College', credential: 'Reviewed M.S. Data Science', details: 'Reviewed South education detail.' },
  ]);
  assert.deepEqual(saved.experience.map((role) => role.provenance), [
    imported.proposals.find((proposal) => proposal.value === 'North Org — North Role | 2020–2022')?.provenance,
    imported.proposals.find((proposal) => proposal.value === 'South Org — South Role | 2022–Present')?.provenance,
  ]);
  assert.deepEqual(saved.education.map((item) => item.provenance), [
    imported.proposals.find((proposal) => proposal.value.startsWith('North University |'))?.provenance,
    imported.proposals.find((proposal) => proposal.value.startsWith('South College |'))?.provenance,
  ]);
  assert.equal(saved.projects.some((project) => project.name.includes('Comet')), false);
  assert.equal(saved.experience.some((role) => role.company.includes('West Org')), false);
  assert.equal(saved.education.some((item) => item.institution.includes('West Institute')), false);
  assert.ok(saved.proposals.every((proposal) => !proposal.value.startsWith('Comet') && !proposal.value.startsWith('West Org') && !proposal.value.startsWith('West Institute')));
});

test('saving a review with no accepted proposals leaves existing assist data unchanged', () => {
  const imported = parseResumeText('Candidate\nCandidate City, NY | candidate@example.test', 'synthetic-empty.txt');
  const existing = emptyAssistProfile({ ...emptyProfile, first_name: 'Existing', city: 'Saved City' });
  existing.summary = 'Saved summary';
  existing.skills = ['Saved skill'];
  const saved = applyAcceptedResumeImport(
    imported,
    imported.proposals.map((proposal) => ({ ...proposal, review: 'rejected' as const })),
    existing,
  );
  assert.deepEqual(saved.contact, existing.contact);
  assert.equal(saved.summary, 'Saved summary');
  assert.deepEqual(saved.skills, ['Saved skill']);
  assert.deepEqual(saved.links, []);
  assert.deepEqual(saved.projects, []);
  assert.deepEqual(saved.experience, []);
  assert.deepEqual(saved.education, []);
  assert.deepEqual(saved.proposals, []);
});

test('assist sync rejects malformed answers and round-trips reviewed data', () => {
  const profile = emptyAssistProfile({ ...emptyProfile, first_name: 'Alex' });
  const answer = { id: 'answer-1', title: 'Summary', category: 'Career story', content: 'A reviewed answer.', updatedAt: '2026-09-20T00:00:00.000Z', scope: 'reusable' as const, canonicalId: 'professional-summary' as const };
  const parsed = parseSyncPayload(JSON.parse(serializeSyncPayload(profile, [answer], profile.contact as typeof emptyProfile, 'cockpit')));
  assert.equal(parsed.ok, true);
  assert.equal(parseAssistProfile(profile)?.contact.first_name, 'Alex');
  assert.equal(parseSyncPayload({ schema: 'escape-hatch-assist-sync', version: 1, profile, answers: [{ id: 'broken' }] }).ok, false);
});

test('sync merge keeps existing work and adds only unique incoming items', () => {
  const current = JSON.parse(serializeSyncPayload(emptyAssistProfile(emptyProfile), [], emptyProfile, 'cockpit'));
  const incomingProfile = { ...emptyAssistProfile(emptyProfile), skills: ['TypeScript'], links: [{ label: 'Site', url: 'https://example.test', provenance }] };
  const incoming = JSON.parse(serializeSyncPayload(incomingProfile, [], emptyProfile, 'extension'));
  const merged = mergeSyncPayload(current, incoming, 'merge');
  assert.deepEqual(merged.profile.skills, ['TypeScript']);
  assert.equal(merged.profile.links[0].url, 'https://example.test');
  assert.deepEqual(mergeSyncPayload(current, incoming, 'keep-current'), current);
});

test('sensitive and unknown questions fail closed while supported questions match canonically', () => {
  assert.deepEqual(classifyQuestion('Are you legally authorized to work?').status, 'sensitive');
  assert.deepEqual(classifyQuestion('Why do you want this role?').id, 'why-this-role');
  assert.deepEqual(classifyQuestion('Favorite color').status, 'unknown');
});