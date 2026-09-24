import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { OPPORTUNITY_IMPORT_ALIASES } from './opportunity-import-aliases';
import { buildTabularImportPreview, decodeTabularRows, TabularImportError } from './opportunity-tabular-import';

test('runtime alias registry remains synchronized with the canonical import contract', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const contractPath = resolve(here, '../../../../contracts/opportunity-import.v1.json');
  const contract = JSON.parse(await readFile(contractPath, 'utf8')) as { field_mapping: { aliases: Record<string, string[]> } };
  for (const [field, aliases] of Object.entries(OPPORTUNITY_IMPORT_ALIASES)) {
    assert.deepEqual(contract.field_mapping.aliases[field], [...aliases], `alias drift: ${field}`);
  }
});

test('CSV tracker columns map deterministically and unknown columns remain visible', async () => {
  const csv = [
    'Company,Role,Work Mode,Location,Employment,Compensation,Fit Score,Why It Fits,Requirements / Gaps,Date Found,Follow-Up Due,Next Action,Apply Link,Status,Applied?,Date Applied,Resume PDF,Custom Column',
    '"Example, Inc.",AI Automation Engineer,Remote,"New York, NY",Full-time,"$120,000-$150,000",92,Strong automation fit,"LLM evidence;Cloud depth",2026-09-24,2026-10-01,Prepare application,https://example.invalid/apply,Ready to Apply,No,,resume.pdf,Keep me visible',
  ].join('\n');
  const preview = await buildTabularImportPreview('tracker.csv', csv, 7);
  assert.equal(preview.expected_revision, 7);
  assert.equal(preview.candidates.length, 1);
  assert.deepEqual(preview.candidates[0].mapped_fields, {
    organization: 'Example, Inc.',
    title: 'AI Automation Engineer',
    work_mode: 'remote',
    location: 'New York, NY',
    employment_type: 'Full-time',
    compensation_text: '$120,000-$150,000',
    fit_score: 92,
    fit_rationale: 'Strong automation fit',
    requirements_gaps: ['LLM evidence', 'Cloud depth'],
    found_on: '2026-09-24',
    follow_up_due_on: '2026-10-01',
    next_action: 'Prepare application',
    apply_link: 'https://example.invalid/apply',
    tracker_status: 'Ready to Apply',
    applied: false,
    resume_pdf: 'resume.pdf',
  });
  assert.deepEqual(preview.candidates[0].unmapped_fields, { 'Custom Column': 'Keep me visible' });
  assert.deepEqual(preview.candidates[0].source_ref, { sheet_or_section: 'CSV', row: 2 });
});

test('JSON application ledgers map without inventing absent values', async () => {
  const json = JSON.stringify({
    Applications: [
      { Employer: 'JSON Co', Position: 'Systems Engineer', Priority: 'Normal', 'Source Link': 'https://example.invalid/jobs/2' },
    ],
  });
  const preview = await buildTabularImportPreview('ledger.json', json, 3);
  assert.deepEqual(preview.candidates[0].mapped_fields, {
    organization: 'JSON Co',
    title: 'Systems Engineer',
    priority: 'medium',
    source: 'https://example.invalid/jobs/2',
  });
  assert.deepEqual(preview.candidates[0].unmapped_fields, {});
});

test('XLSX shared strings preserve sheet and row provenance', async () => {
  const contentTypes = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';
  const workbook = '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
  const shared = '<?xml version="1.0"?><sst><si><t>Company</t></si><si><t>Role</t></si><si><t>Work Mode</t></si><si><t>XLSX Co</t></si><si><t>Data Engineer</t></si><si><t>Hybrid</t></si></sst>';
  const sheet = '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row></sheetData></worksheet>';
  const workbookBytes = zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(rels),
    'xl/sharedStrings.xml': strToU8(shared),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
  const preview = await buildTabularImportPreview('tracker.xlsx', workbookBytes, 2);
  assert.deepEqual(preview.candidates[0].mapped_fields, {
    organization: 'XLSX Co',
    title: 'Data Engineer',
    work_mode: 'hybrid',
  });
  assert.deepEqual(preview.candidates[0].source_ref, { sheet_or_section: 'Applications', row: 2 });
});

test('malformed tabular inputs fail before a preview can exist', async () => {
  assert.throws(() => decodeTabularRows('broken.csv', 'Company,Role\n"unterminated'), TabularImportError);
  assert.throws(() => decodeTabularRows('broken.json', '{not-json'), TabularImportError);
  assert.throws(() => decodeTabularRows('broken.xlsx', new Uint8Array([1, 2, 3])), TabularImportError);
});
