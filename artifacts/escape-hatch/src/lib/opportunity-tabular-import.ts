import { strFromU8, unzipSync } from 'fflate';
import { OPPORTUNITY_IMPORT_ALIAS_LOOKUP, type OpportunityImportField } from './opportunity-import-aliases';

export type TabularSourceType = 'json' | 'csv' | 'xlsx';

export type TabularRow = {
  sheet: string;
  rowNumber: number;
  values: Record<string, string>;
};

export type TabularCandidate = {
  candidate_id: string;
  classification: 'NEW';
  source_ref: { sheet_or_section: string; row: number };
  mapped_fields: Partial<Record<OpportunityImportField, unknown>>;
  unmapped_fields: Record<string, string>;
  conflicts: [];
};

export type TabularImportPreview = {
  schema_version: 'escapehatch-opportunity-import-preview/v1';
  import_id: string;
  source: {
    name: string;
    type: TabularSourceType;
    content_sha256: string;
  };
  expected_revision: number;
  candidates: TabularCandidate[];
};

export class TabularImportError extends Error {}

const decoder = new TextDecoder();

function decodeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function textOf(input: string | Uint8Array) {
  return typeof input === 'string' ? input : decoder.decode(input);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new TabularImportError('CSV contains an unterminated quoted field.');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}

function rowsFromMatrix(sheet: string, matrix: string[][]): TabularRow[] {
  if (!matrix.length) return [];
  const headers = matrix[0].map((value) => value.trim());
  if (!headers.some(Boolean)) throw new TabularImportError(`${sheet}: header row is empty.`);
  const seen = new Set<string>();
  for (const header of headers.filter(Boolean)) {
    const normalized = header.toLowerCase();
    if (seen.has(normalized)) throw new TabularImportError(`${sheet}: duplicate header "${header}".`);
    seen.add(normalized);
  }
  return matrix.slice(1).flatMap((values, offset) => {
    const rowValues: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = values[index]?.trim() ?? '';
      if (value) rowValues[header] = value;
    });
    return Object.keys(rowValues).length ? [{ sheet, rowNumber: offset + 2, values: rowValues }] : [];
  });
}

function stringifyJsonCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function parseJsonRows(text: string): TabularRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TabularImportError('JSON source is malformed.');
  }

  const sheets: Array<[string, unknown[]]> = [];
  if (Array.isArray(parsed)) {
    sheets.push(['JSON', parsed]);
  } else if (parsed && typeof parsed === 'object') {
    const object = parsed as Record<string, unknown>;
    const preferred = ['Applications', 'applications', 'Opportunities', 'opportunities'];
    const selected = preferred.find((key) => Array.isArray(object[key]));
    if (selected) sheets.push([selected, object[selected] as unknown[]]);
    else {
      for (const [name, value] of Object.entries(object)) {
        if (Array.isArray(value) && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
          sheets.push([name, value]);
        }
      }
    }
  }

  if (!sheets.length) throw new TabularImportError('JSON source does not contain a tabular array.');
  return sheets.flatMap(([sheet, values]) =>
    values.flatMap((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TabularImportError(`${sheet}: row ${index + 1} is not an object.`);
      }
      const record = Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .map(([key, cell]) => [key, stringifyJsonCell(cell).trim()])
          .filter(([, cell]) => cell),
      );
      return Object.keys(record).length ? [{ sheet, rowNumber: index + 1, values: record }] : [];
    }),
  );
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
  let value = 0;
  for (const character of letters) value = value * 26 + character.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function xmlTextRuns(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join('');
}

function parseSharedStrings(xml: string | undefined) {
  if (!xml) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => xmlTextRuns(match[1]));
}

function parseSheetMatrix(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const values: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attributes.match(/\br="([^"]+)"/)?.[1] ?? '';
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? '';
      const index = columnIndex(reference);
      let value = '';
      if (type === 'inlineStr') value = xmlTextRuns(body);
      else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        value = type === 's' ? sharedStrings[Number(raw)] ?? '' : decodeXml(raw);
      }
      values[index] = value;
    }
    if (values.some((value) => value?.trim())) rows.push(values.map((value) => value ?? ''));
  }
  return rows;
}

function parseXlsx(bytes: Uint8Array): TabularRow[] {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new TabularImportError('XLSX source is not a readable ZIP workbook.');
  }
  const workbook = archive['xl/workbook.xml'] ? strFromU8(archive['xl/workbook.xml']) : '';
  const relationships = archive['xl/_rels/workbook.xml.rels'] ? strFromU8(archive['xl/_rels/workbook.xml.rels']) : '';
  if (!workbook || !relationships) throw new TabularImportError('XLSX workbook metadata is missing.');

  const relationshipTargets = new Map(
    [...relationships.matchAll(/<Relationship\s+([^>]+?)\/?>(?:<\/Relationship>)?/g)].flatMap((match) => {
      const id = match[1].match(/\bId="([^"]+)"/)?.[1];
      const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
      return id && target ? [[id, target] as const] : [];
    }),
  );
  const sheets = [...workbook.matchAll(/<sheet\s+([^>]+?)\/?>(?:<\/sheet>)?/g)].flatMap((match) => {
    const name = decodeXml(match[1].match(/\bname="([^"]+)"/)?.[1] ?? '');
    const id = match[1].match(/\br:id="([^"]+)"/)?.[1] ?? '';
    const target = relationshipTargets.get(id);
    if (!name || !target) return [];
    const normalized = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`;
    return [{ name, path: normalized.replace(/\\/g, '/') }];
  });
  const sharedStrings = parseSharedStrings(archive['xl/sharedStrings.xml'] ? strFromU8(archive['xl/sharedStrings.xml']) : undefined);
  const rows: TabularRow[] = [];
  for (const sheet of sheets) {
    const data = archive[sheet.path];
    if (!data) continue;
    rows.push(...rowsFromMatrix(sheet.name, parseSheetMatrix(strFromU8(data), sharedStrings)));
  }
  if (!rows.length) throw new TabularImportError('XLSX workbook contains no readable tabular rows.');
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function normalizeMappedValue(field: OpportunityImportField, value: string): unknown {
  const trimmed = value.trim();
  if (field === 'fit_score') {
    const numeric = Number(trimmed.replace(/%$/, ''));
    return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : trimmed;
  }
  if (field === 'requirements_gaps' || field === 'study_concepts' || field === 'study_resources') {
    return trimmed.split(/(?:\r?\n|;|\s+\|\s+)/).map((part) => part.trim()).filter(Boolean);
  }
  if (field === 'applied') return /^(?:y|yes|true|1|applied|submitted)$/i.test(trimmed);
  if (field === 'priority') {
    const lowered = trimmed.toLowerCase();
    if (lowered === 'normal' || lowered === 'medium') return 'medium';
    if (lowered === 'high' || lowered === 'low') return lowered;
  }
  if (field === 'work_mode') {
    const lowered = trimmed.toLowerCase().replace(/[ -]+/g, '_');
    if (['remote', 'hybrid', 'on_site'].includes(lowered)) return lowered;
    return 'unknown';
  }
  return trimmed;
}

function candidateId(fileName: string, row: TabularRow, index: number) {
  const seed = `${fileName}-${row.sheet}-${row.rowNumber}-${row.values.Company ?? row.values.Employer ?? ''}-${row.values.Role ?? row.values['Job Title'] ?? ''}`;
  return `candidate-${index + 1}-${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72)}`;
}

function mapRow(fileName: string, row: TabularRow, index: number): TabularCandidate {
  const mapped_fields: Partial<Record<OpportunityImportField, unknown>> = {};
  const unmapped_fields: Record<string, string> = {};
  for (const [header, value] of Object.entries(row.values)) {
    const field = OPPORTUNITY_IMPORT_ALIAS_LOOKUP.get(normalizeHeader(header));
    if (field) mapped_fields[field] = normalizeMappedValue(field, value);
    else unmapped_fields[header] = value;
  }
  return {
    candidate_id: candidateId(fileName, row, index),
    classification: 'NEW',
    source_ref: { sheet_or_section: row.sheet, row: row.rowNumber },
    mapped_fields,
    unmapped_fields,
    conflicts: [],
  };
}

async function sha256(bytes: Uint8Array) {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function detectTabularSourceType(fileName: string): TabularSourceType {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith('.json')) return 'json';
  if (lowered.endsWith('.csv')) return 'csv';
  if (lowered.endsWith('.xlsx')) return 'xlsx';
  throw new TabularImportError('Supported tabular sources are .json, .csv, and .xlsx.');
}

export function decodeTabularRows(fileName: string, input: string | Uint8Array): TabularRow[] {
  const type = detectTabularSourceType(fileName);
  if (type === 'json') return parseJsonRows(textOf(input));
  if (type === 'csv') return rowsFromMatrix('CSV', parseCsv(textOf(input)));
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return parseXlsx(bytes);
}

export async function buildTabularImportPreview(
  fileName: string,
  input: string | Uint8Array,
  expectedRevision: number,
): Promise<TabularImportPreview> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new TabularImportError('Expected revision must be a positive integer.');
  const type = detectTabularSourceType(fileName);
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const rows = decodeTabularRows(fileName, input);
  const contentHash = await sha256(bytes);
  return {
    schema_version: 'escapehatch-opportunity-import-preview/v1',
    import_id: `tabular-${contentHash.slice(0, 20)}`,
    source: { name: fileName, type, content_sha256: contentHash },
    expected_revision: expectedRevision,
    candidates: rows.map((row, index) => mapRow(fileName, row, index)),
  };
}
