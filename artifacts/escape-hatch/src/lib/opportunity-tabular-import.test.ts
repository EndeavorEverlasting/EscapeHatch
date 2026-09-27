import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { OPPORTUNITY_IMPORT_ALIASES } from './opportunity-import-aliases';
import {
  buildTabularImportPreview,
  decodeTabularRows,
  excelSerialToIsoDate,
  MAX_XLSX_COMPRESSED_BYTES,
  MAX_XLSX_ENTRY_COUNT,
  MAX_XLSX_INFLATED_BYTES,
  TabularImportError,
} from './opportunity-tabular-import';

function buildXlsx(parts: Record<string, string>) {
  return zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])));
}

test('alias contract and runtime registries stay bipartite in both directions', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const contractPath = resolve(here, '../../../../contracts/opportunity-import.v1.json');
  const contract = JSON.parse(await readFile(contractPath, 'utf8')) as { field_mapping: { aliases: Record<string, string[]> } };
  const runtimeFields = Object.keys(OPPORTUNITY_IMPORT_ALIASES).sort();
  const contractFields = Object.keys(contract.field_mapping.aliases).sort();
  assert.deepEqual(runtimeFields, contractFields, 'field set drift between runtime and contract');
  for (const field of runtimeFields) {
    assert.deepEqual(
      contract.field_mapping.aliases[field],
      [...OPPORTUNITY_IMPORT_ALIASES[field as keyof typeof OPPORTUNITY_IMPORT_ALIASES]],
      `runtime→contract alias drift: ${field}`,
    );
    assert.deepEqual(
      [...OPPORTUNITY_IMPORT_ALIASES[field as keyof typeof OPPORTUNITY_IMPORT_ALIASES]],
      contract.field_mapping.aliases[field],
      `contract→runtime alias drift: ${field}`,
    );
  }
});

test('CSV tracker columns map deterministically and unknown columns remain visible', async () => {
  const csv = [
    'Company,Role,Work Mode,Location,Employment,Compensation,Fit Score,Why It Fits,Requirements / Gaps,Date Found,Follow-Up Due,Next Action,Apply Link,Status,Applied?,Date Applied,Resume PDF,Custom Column',
    '"Example, Inc.",AI Automation Engineer,Remote,"New York, NY",Full-time,"$120,000-$150,000",92,Strong automation fit,"LLM evidence;Cloud depth",2026-09-24,2026-10-01,Prepare application,https://example.invalid/apply,Ready to Apply,No,,resume.pdf,Keep me visible',
  ].join('\n');
  const preview = await buildTabularImportPreview('tracker.csv', csv, 7);
  assert.equal(preview.expected_revision, 7);
  assert.equal(preview.source.type, 'csv');
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

test('family1 negative: JSON preview never emits bare json source type', async () => {
  const preview = await buildTabularImportPreview(
    'ledger.json',
    JSON.stringify({ Applications: [{ Employer: 'A', Position: 'B' }] }),
    1,
  );
  assert.notEqual(preview.source.type, 'json');
});

test('family1 positive: JSON sources emit career_state_json or legacy_workspace_json', async () => {
  const legacy = await buildTabularImportPreview(
    'ledger.json',
    JSON.stringify({ Applications: [{ Employer: 'Legacy Co', Position: 'Engineer' }] }),
    2,
  );
  assert.equal(legacy.source.type, 'legacy_workspace_json');

  const career = await buildTabularImportPreview(
    'state.json',
    JSON.stringify({
      schema_version: 'escapehatch-career-state/v1',
      opportunities: [{ organization: 'Career Co', title: 'Platform Engineer' }],
      applications: [],
    }),
    2,
  );
  assert.equal(career.source.type, 'career_state_json');
});

test('family2 negative: career-state with applications-only decoy does not invent opportunity rows from applications', async () => {
  const json = JSON.stringify({
    schema_version: 'escapehatch-career-state/v1',
    opportunities: [{ organization: 'Real Org', title: 'Real Role' }],
    applications: [{ Employer: 'Decoy Employer', Position: 'Decoy Role' }],
  });
  const preview = await buildTabularImportPreview('state.json', json, 3);
  assert.equal(preview.candidates.length, 1);
  assert.equal(preview.candidates[0].mapped_fields.organization, 'Real Org');
  assert.equal(preview.candidates[0].mapped_fields.title, 'Real Role');
  assert.notEqual(preview.candidates[0].mapped_fields.organization, 'Decoy Employer');
});

test('family2 positive: canonical career-state JSON reads opportunities', async () => {
  const json = JSON.stringify({
    schema_version: 'escapehatch-career-state/v1',
    opportunities: [
      {
        organization: 'Example Employer',
        title: 'AI Automation Engineer',
        work_mode: 'remote',
        location: { display: 'Remote / United States' },
        source: { locator: 'https://example.invalid/jobs/123' },
        apply_link: { locator: 'https://example.invalid/apply/123' },
      },
    ],
    applications: [],
  });
  const preview = await buildTabularImportPreview('career-state.json', json, 4);
  assert.equal(preview.source.type, 'career_state_json');
  assert.deepEqual(preview.candidates[0].source_ref, { sheet_or_section: 'opportunities', row: 1 });
  assert.deepEqual(preview.candidates[0].mapped_fields, {
    organization: 'Example Employer',
    title: 'AI Automation Engineer',
    work_mode: 'remote',
    location: 'Remote / United States',
    source: 'https://example.invalid/jobs/123',
    apply_link: 'https://example.invalid/apply/123',
  });
});

test('JSON application ledgers map without inventing absent values', async () => {
  const json = JSON.stringify({
    Applications: [
      { Employer: 'JSON Co', Position: 'Systems Engineer', Priority: 'Normal', 'Source Link': 'https://example.invalid/jobs/2' },
    ],
  });
  const preview = await buildTabularImportPreview('ledger.json', json, 3);
  assert.equal(preview.source.type, 'legacy_workspace_json');
  assert.deepEqual(preview.candidates[0].mapped_fields, {
    organization: 'JSON Co',
    title: 'Systems Engineer',
    priority: 'medium',
    source: 'https://example.invalid/jobs/2',
  });
  assert.deepEqual(preview.candidates[0].unmapped_fields, {});
});

test('family3 negative: numeric cells without date styles stay raw serials', async () => {
  const workbook = '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
  const shared = '<?xml version="1.0"?><sst><si><t>Company</t></si><si><t>Date Found</t></si><si><t>Serial Co</t></si></sst>';
  const sheet =
    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>46289</v></c></row></sheetData></worksheet>';
  const preview = await buildTabularImportPreview(
    'raw-date.xlsx',
    buildXlsx({
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
      'xl/workbook.xml': workbook,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/sharedStrings.xml': shared,
      'xl/worksheets/sheet1.xml': sheet,
    }),
    2,
  );
  assert.equal(preview.candidates[0].mapped_fields.found_on, '46289');
});

test('family3 positive: styled XLSX date serials become canonical ISO dates', async () => {
  const workbook =
    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="0"/><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
  const styles =
    '<?xml version="1.0"?><styleSheet><numFmts count="0"/><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>';
  const shared = '<?xml version="1.0"?><sst><si><t>Company</t></si><si><t>Date Found</t></si><si><t>Date Co</t></si></sst>';
  const sheet =
    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>46289</v></c></row></sheetData></worksheet>';
  const preview = await buildTabularImportPreview(
    'dated.xlsx',
    buildXlsx({
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
      'xl/workbook.xml': workbook,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/styles.xml': styles,
      'xl/sharedStrings.xml': shared,
      'xl/worksheets/sheet1.xml': sheet,
    }),
    2,
  );
  assert.equal(excelSerialToIsoDate(46289, false), '2026-09-24');
  assert.equal(preview.candidates[0].mapped_fields.found_on, '2026-09-24');
});

test('family4 negative: compacted blank skipping must not renumber later CSV rows', async () => {
  const csv = ['Company,Role', 'Alpha,One', '', 'Beta,Two'].join('\n');
  const preview = await buildTabularImportPreview('gaps.csv', csv, 1);
  assert.equal(preview.candidates.length, 2);
  assert.deepEqual(preview.candidates[0].source_ref, { sheet_or_section: 'CSV', row: 2 });
  assert.deepEqual(preview.candidates[1].source_ref, { sheet_or_section: 'CSV', row: 4 });
});

test('family4 positive: XLSX honors physical row r attributes across gaps', async () => {
  const workbook = '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
  const shared = '<?xml version="1.0"?><sst><si><t>Company</t></si><si><t>Role</t></si><si><t>Gap Co</t></si><si><t>Engineer</t></si></sst>';
  const sheet =
    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="5"><c r="A5" t="s"><v>2</v></c><c r="B5" t="s"><v>3</v></c></row></sheetData></worksheet>';
  const preview = await buildTabularImportPreview(
    'gap.xlsx',
    buildXlsx({
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
      'xl/workbook.xml': workbook,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/sharedStrings.xml': shared,
      'xl/worksheets/sheet1.xml': sheet,
    }),
    2,
  );
  assert.deepEqual(preview.candidates[0].source_ref, { sheet_or_section: 'Applications', row: 5 });
});

test('family5 negative: alias collisions become conflict evidence instead of last-writer-wins', async () => {
  const csv = ['Company,Employer,Role', 'First Org,Second Org,Engineer'].join('\n');
  const preview = await buildTabularImportPreview('conflict.csv', csv, 1);
  assert.equal(preview.candidates[0].classification, 'CONFLICT');
  assert.equal(preview.candidates[0].mapped_fields.organization, 'First Org');
  assert.deepEqual(preview.candidates[0].conflicts, [
    { field: 'organization', existing: 'First Org', incoming: 'Second Org' },
  ]);
});

test('family5 positive: single organization header maps without conflict', async () => {
  const csv = ['Company,Role', 'Only Org,Engineer'].join('\n');
  const preview = await buildTabularImportPreview('clean.csv', csv, 1);
  assert.equal(preview.candidates[0].classification, 'NEW');
  assert.equal(preview.candidates[0].mapped_fields.organization, 'Only Org');
  assert.deepEqual(preview.candidates[0].conflicts, []);
});

test('family6 negative: ambiguous Applied? stays unresolved and never invents false', async () => {
  const csv = ['Company,Role,Applied?', 'Ambiguous Co,Engineer,Unknown'].join('\n');
  const preview = await buildTabularImportPreview('applied.csv', csv, 1);
  assert.equal(preview.candidates[0].classification, 'CONFLICT');
  assert.equal('applied' in preview.candidates[0].mapped_fields, false);
  assert.notEqual(preview.candidates[0].mapped_fields.applied, false);
  assert.deepEqual(preview.candidates[0].conflicts, [{ field: 'applied', existing: null, incoming: 'Unknown' }]);
});

test('family6 positive: recognized Applied? tokens normalize to booleans', async () => {
  const csv = ['Company,Role,Applied?', 'Yes Co,Engineer,Yes', 'No Co,Engineer,No'].join('\n');
  const preview = await buildTabularImportPreview('applied-ok.csv', csv, 1);
  assert.equal(preview.candidates[0].mapped_fields.applied, true);
  assert.equal(preview.candidates[1].mapped_fields.applied, false);
  assert.deepEqual(preview.candidates[0].conflicts, []);
  assert.deepEqual(preview.candidates[1].conflicts, []);
});

test('XLSX shared strings preserve sheet and row provenance', async () => {
  const contentTypes = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';
  const workbook = '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
  const shared = '<?xml version="1.0"?><sst><si><t>Company</t></si><si><t>Role</t></si><si><t>Work Mode</t></si><si><t>XLSX Co</t></si><si><t>Data Engineer</t></si><si><t>Hybrid</t></si></sst>';
  const sheet = '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row></sheetData></worksheet>';
  const workbookBytes = buildXlsx({
    '[Content_Types].xml': contentTypes,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': rels,
    'xl/sharedStrings.xml': shared,
    'xl/worksheets/sheet1.xml': sheet,
  });
  const preview = await buildTabularImportPreview('tracker.xlsx', workbookBytes, 2);
  assert.equal(preview.source.type, 'xlsx');
  assert.deepEqual(preview.candidates[0].mapped_fields, {
    organization: 'XLSX Co',
    title: 'Data Engineer',
    work_mode: 'hybrid',
  });
  assert.deepEqual(preview.candidates[0].source_ref, { sheet_or_section: 'Applications', row: 2 });
});

test('family8 negative: XLSX unzip rejects oversized compressed archives and excess entries', async () => {
  assert.throws(
    () => decodeTabularRows('huge.xlsx', new Uint8Array(MAX_XLSX_COMPRESSED_BYTES + 1)),
    (error: unknown) => error instanceof TabularImportError && /compressed size limit/i.test(String(error)),
  );

  const tooMany: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types></Types>',
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Company</t></is></c></row></sheetData></worksheet>',
  };
  for (let index = 0; index < MAX_XLSX_ENTRY_COUNT; index += 1) {
    tooMany[`pad/entry-${index}.txt`] = 'x';
  }
  assert.throws(
    () => decodeTabularRows('entries.xlsx', buildXlsx(tooMany)),
    (error: unknown) => error instanceof TabularImportError && /entry count limit/i.test(String(error)),
  );

  const inflatedParts: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types></Types>',
    'xl/workbook.xml': '<workbook/>',
  };
  const chunk = 'a'.repeat(512 * 1024);
  const chunksNeeded = Math.floor(MAX_XLSX_INFLATED_BYTES / chunk.length) + 1;
  for (let index = 0; index < chunksNeeded; index += 1) {
    inflatedParts[`pad/blob-${index}.bin`] = chunk;
  }
  assert.throws(
    () => decodeTabularRows('inflated.xlsx', buildXlsx(inflatedParts)),
    (error: unknown) => error instanceof TabularImportError && /inflated byte limit/i.test(String(error)),
  );
});

test('family8 positive: bounded normal workbook still imports', async () => {
  const workbookBytes = buildXlsx({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml':
      '<?xml version="1.0"?><sst><si><t>Company</t></si><si><t>Role</t></si><si><t>Safe Co</t></si><si><t>Analyst</t></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>',
  });
  const preview = await buildTabularImportPreview('safe.xlsx', workbookBytes, 1);
  assert.equal(preview.candidates[0].mapped_fields.organization, 'Safe Co');
});

test('malformed tabular inputs fail before a preview can exist', async () => {
  assert.throws(() => decodeTabularRows('broken.csv', 'Company,Role\n"unterminated'), TabularImportError);
  assert.throws(() => decodeTabularRows('broken.json', '{not-json'), TabularImportError);
  assert.throws(() => decodeTabularRows('broken.xlsx', new Uint8Array([1, 2, 3])), TabularImportError);
});
