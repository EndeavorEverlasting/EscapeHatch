import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';
import { OPPORTUNITY_IMPORT_ALIAS_LOOKUP, type OpportunityImportField } from './opportunity-import-aliases';

export type TabularSourceType = 'career_state_json' | 'legacy_workspace_json' | 'csv' | 'xlsx';

export type TabularConflict = {
  field: OpportunityImportField | string;
  existing: unknown;
  incoming: unknown;
};

export type TabularRow = {
  sheet: string;
  rowNumber: number;
  values: Record<string, string>;
};

export type TabularCandidate = {
  candidate_id: string;
  classification: 'NEW' | 'CONFLICT';
  source_ref: { sheet_or_section: string; row: number };
  mapped_fields: Partial<Record<OpportunityImportField, unknown>>;
  unmapped_fields: Record<string, string>;
  conflicts: TabularConflict[];
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

export const MAX_XLSX_COMPRESSED_BYTES = 5 * 1024 * 1024;
export const MAX_XLSX_ENTRY_COUNT = 64;
export const MAX_XLSX_INFLATED_BYTES = 8 * 1024 * 1024;

const CAREER_STATE_SCHEMA = 'escapehatch-career-state/v1';
const decoder = new TextDecoder();

const BUILTIN_DATE_FMT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

type MatrixRow = { rowNumber: number; cells: string[] };

type NormalizeResult = { kind: 'value'; value: unknown } | { kind: 'ambiguous'; raw: string };

type XlsxStyleInfo = {
  date1904: boolean;
  dateStyleIndexes: Set<number>;
};

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

function parseCsv(text: string): MatrixRow[] {
  const rows: MatrixRow[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let rowNumber = 1;
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
      rows.push({ rowNumber, cells: row });
      rowNumber += 1;
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new TabularImportError('CSV contains an unterminated quoted field.');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push({ rowNumber, cells: row });
  }
  return rows;
}

function rowsFromMatrix(sheet: string, matrix: MatrixRow[]): TabularRow[] {
  if (!matrix.length) return [];
  const headers = matrix[0].cells.map((value) => value.trim());
  if (!headers.some(Boolean)) throw new TabularImportError(`${sheet}: header row is empty.`);
  const seen = new Set<string>();
  for (const header of headers.filter(Boolean)) {
    const normalized = header.toLowerCase();
    if (seen.has(normalized)) throw new TabularImportError(`${sheet}: duplicate header "${header}".`);
    seen.add(normalized);
  }
  return matrix.slice(1).flatMap((entry) => {
    const rowValues: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = entry.cells[index]?.trim() ?? '';
      if (value) rowValues[header] = value;
    });
    return Object.keys(rowValues).length ? [{ sheet, rowNumber: entry.rowNumber, values: rowValues }] : [];
  });
}

function stringifyJsonCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isCareerStateDocument(parsed: unknown): parsed is Record<string, unknown> {
  return Boolean(
    parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>).schema_version === CAREER_STATE_SCHEMA,
  );
}

function classifyJsonSource(parsed: unknown): 'career_state_json' | 'legacy_workspace_json' {
  return isCareerStateDocument(parsed) ? 'career_state_json' : 'legacy_workspace_json';
}

function flattenCareerOpportunity(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (header: string, cell: unknown) => {
    const text = stringifyJsonCell(cell).trim();
    if (text) out[header] = text;
  };
  put('Organization', value.organization);
  put('Role', value.title);
  put('Priority', value.priority);
  put('Fit Score', value.fit_score);
  put('Why It Fits', value.fit_rationale);
  put('Next Action', value.next_action);
  put('Status', value.status);
  put('Work Mode', value.work_mode);
  put('Employment', value.employment_type);
  put('Compensation', value.compensation_text);
  put('Notes', value.notes);
  put('Date Found', value.found_on);
  put('Follow-Up Due', value.follow_up_due_on);
  put('Source Guidance', value.source_guidance);
  if (Array.isArray(value.requirements_gaps)) put('Requirements / Gaps', value.requirements_gaps.join(';'));
  if (value.location && typeof value.location === 'object' && !Array.isArray(value.location)) {
    put('Location', (value.location as Record<string, unknown>).display);
  }
  if (value.source && typeof value.source === 'object' && !Array.isArray(value.source)) {
    put('Source Link', (value.source as Record<string, unknown>).locator);
  }
  if (value.apply_link && typeof value.apply_link === 'object' && !Array.isArray(value.apply_link)) {
    put('Apply Link', (value.apply_link as Record<string, unknown>).locator);
  }
  return out;
}

function parseJsonRows(text: string): TabularRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TabularImportError('JSON source is malformed.');
  }

  if (isCareerStateDocument(parsed)) {
    const opportunities = parsed.opportunities;
    if (!Array.isArray(opportunities)) {
      throw new TabularImportError('Canonical career-state JSON is missing an opportunities array.');
    }
    return opportunities.flatMap((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TabularImportError(`opportunities: row ${index + 1} is not an object.`);
      }
      const record = flattenCareerOpportunity(value as Record<string, unknown>);
      return Object.keys(record).length
        ? [{ sheet: 'opportunities', rowNumber: index + 1, values: record }]
        : [];
    });
  }

  const sheets: Array<[string, unknown[]]> = [];
  if (Array.isArray(parsed)) {
    sheets.push(['JSON', parsed]);
  } else if (parsed && typeof parsed === 'object') {
    const object = parsed as Record<string, unknown>;
    const preferred = ['Applications', 'Opportunities', 'applications', 'opportunities'];
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

function isDateFormatCode(formatCode: string) {
  const code = formatCode.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
  if (!code || /[eE]/.test(code)) return false;
  return /[yY]/.test(code) || (/[dD]/.test(code) && /[mM]/.test(code)) || /mmm|mmmm|dddd/i.test(code);
}

function parseWorkbookDate1904(workbookXml: string) {
  const match = workbookXml.match(/<workbookPr\b([^>]*)\/?>/i)?.[1] ?? '';
  return /\bdate1904\s*=\s*"(?:1|true)"/i.test(match);
}

function parseStyleDateIndexes(stylesXml: string | undefined): Set<number> {
  const dateIndexes = new Set<number>();
  if (!stylesXml) return dateIndexes;
  const customFormats = new Map<number, string>();
  for (const match of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/gi)) {
    const attrs = match[1];
    const id = Number(attrs.match(/\bnumFmtId="(\d+)"/i)?.[1]);
    const code = decodeXml(attrs.match(/\bformatCode="([^"]*)"/i)?.[1] ?? '');
    if (Number.isFinite(id) && code) customFormats.set(id, code);
  }
  const cellXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i)?.[1] ?? '';
  let styleIndex = 0;
  for (const match of cellXfs.matchAll(/<xf\b([^>]*)\/?>/gi)) {
    const numFmtId = Number(match[1].match(/\bnumFmtId="(\d+)"/i)?.[1] ?? '0');
    const formatCode = customFormats.get(numFmtId);
    if (BUILTIN_DATE_FMT_IDS.has(numFmtId) || (formatCode ? isDateFormatCode(formatCode) : false)) {
      dateIndexes.add(styleIndex);
    }
    styleIndex += 1;
  }
  return dateIndexes;
}

export function excelSerialToIsoDate(serial: number, date1904: boolean): string {
  const wholeDays = Math.floor(serial);
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = epoch + wholeDays * 86_400_000;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseSheetMatrix(xml: string, sharedStrings: string[], styles: XlsxStyleInfo): MatrixRow[] {
  const rows: MatrixRow[] = [];
  let sequential = 1;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowMatch[1];
    const body = rowMatch[2];
    const explicit = Number(rowAttrs.match(/\br="(\d+)"/)?.[1] ?? '');
    const rowNumber = Number.isFinite(explicit) && explicit > 0 ? explicit : sequential;
    sequential = rowNumber + 1;
    const values: string[] = [];
    for (const cellMatch of body.matchAll(/<c\s+([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const cellBody = cellMatch[2] ?? '';
      const reference = attributes.match(/\br="([^"]+)"/)?.[1] ?? '';
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? '';
      const styleIndex = Number(attributes.match(/\bs="(\d+)"/)?.[1] ?? '');
      const index = columnIndex(reference);
      let value = '';
      if (type === 'inlineStr') value = xmlTextRuns(cellBody);
      else {
        const raw = cellBody.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        if (type === 's') value = sharedStrings[Number(raw)] ?? '';
        else if (!type && raw && Number.isFinite(styleIndex) && styles.dateStyleIndexes.has(styleIndex)) {
          const serial = Number(raw);
          value = Number.isFinite(serial) ? excelSerialToIsoDate(serial, styles.date1904) : decodeXml(raw);
        } else value = decodeXml(raw);
      }
      values[index] = value;
    }
    rows.push({ rowNumber, cells: values.map((value) => value ?? '') });
  }
  return rows;
}

function unzipWorkbook(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength > MAX_XLSX_COMPRESSED_BYTES) {
    throw new TabularImportError('XLSX source exceeds the compressed size limit.');
  }
  let entryCount = 0;
  let inflatedBytes = 0;
  try {
    return unzipSync(bytes, {
      filter(file: UnzipFileInfo) {
        entryCount += 1;
        if (entryCount > MAX_XLSX_ENTRY_COUNT) {
          throw new TabularImportError('XLSX source exceeds the archive entry count limit.');
        }
        inflatedBytes += file.originalSize;
        if (inflatedBytes > MAX_XLSX_INFLATED_BYTES) {
          throw new TabularImportError('XLSX source exceeds the inflated byte limit.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof TabularImportError) throw error;
    throw new TabularImportError('XLSX source is not a readable ZIP workbook.');
  }
}

function parseXlsx(bytes: Uint8Array): TabularRow[] {
  const archive = unzipWorkbook(bytes);
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
  const styles: XlsxStyleInfo = {
    date1904: parseWorkbookDate1904(workbook),
    dateStyleIndexes: parseStyleDateIndexes(archive['xl/styles.xml'] ? strFromU8(archive['xl/styles.xml']) : undefined),
  };
  const rows: TabularRow[] = [];
  for (const sheet of sheets) {
    const data = archive[sheet.path];
    if (!data) continue;
    rows.push(...rowsFromMatrix(sheet.name, parseSheetMatrix(strFromU8(data), sharedStrings, styles)));
  }
  if (!rows.length) throw new TabularImportError('XLSX workbook contains no readable tabular rows.');
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function normalizeMappedValue(field: OpportunityImportField, value: string): NormalizeResult {
  const trimmed = value.trim();
  if (field === 'fit_score') {
    const numeric = Number(trimmed.replace(/%$/, ''));
    return { kind: 'value', value: Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : trimmed };
  }
  if (field === 'requirements_gaps' || field === 'study_concepts' || field === 'study_resources') {
    return {
      kind: 'value',
      value: trimmed.split(/(?:\r?\n|;|\s+\|\s+)/).map((part) => part.trim()).filter(Boolean),
    };
  }
  if (field === 'applied') {
    if (/^(?:y|yes|true|1|applied|submitted)$/i.test(trimmed)) return { kind: 'value', value: true };
    if (/^(?:n|no|false|0)$/i.test(trimmed)) return { kind: 'value', value: false };
    return { kind: 'ambiguous', raw: trimmed };
  }
  if (field === 'priority') {
    const lowered = trimmed.toLowerCase();
    if (lowered === 'normal' || lowered === 'medium') return { kind: 'value', value: 'medium' };
    if (lowered === 'high' || lowered === 'low') return { kind: 'value', value: lowered };
  }
  if (field === 'work_mode') {
    const lowered = trimmed.toLowerCase().replace(/[ -]+/g, '_');
    if (['remote', 'hybrid', 'on_site'].includes(lowered)) return { kind: 'value', value: lowered };
    return { kind: 'value', value: 'unknown' };
  }
  return { kind: 'value', value: trimmed };
}

function candidateId(fileName: string, row: TabularRow, index: number) {
  const seed = `${fileName}-${row.sheet}-${row.rowNumber}-${row.values.Company ?? row.values.Employer ?? row.values.Organization ?? ''}-${row.values.Role ?? row.values['Job Title'] ?? ''}`;
  return `candidate-${index + 1}-${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72)}`;
}

function mapRow(fileName: string, row: TabularRow, index: number): TabularCandidate {
  const mapped_fields: Partial<Record<OpportunityImportField, unknown>> = {};
  const unmapped_fields: Record<string, string> = {};
  const conflicts: TabularConflict[] = [];
  const seenFields = new Map<OpportunityImportField, { header: string; value: unknown }>();

  for (const [header, value] of Object.entries(row.values)) {
    const field = OPPORTUNITY_IMPORT_ALIAS_LOOKUP.get(normalizeHeader(header));
    if (!field) {
      unmapped_fields[header] = value;
      continue;
    }
    const normalized = normalizeMappedValue(field, value);
    if (normalized.kind === 'ambiguous') {
      conflicts.push({ field, existing: null, incoming: normalized.raw });
      continue;
    }
    const prior = seenFields.get(field);
    if (prior && prior.value !== normalized.value) {
      conflicts.push({ field, existing: prior.value, incoming: normalized.value });
      continue;
    }
    if (!prior) {
      seenFields.set(field, { header, value: normalized.value });
      mapped_fields[field] = normalized.value;
    }
  }

  return {
    candidate_id: candidateId(fileName, row, index),
    classification: conflicts.length ? 'CONFLICT' : 'NEW',
    source_ref: { sheet_or_section: row.sheet, row: row.rowNumber },
    mapped_fields,
    unmapped_fields,
    conflicts,
  };
}

async function sha256(bytes: Uint8Array) {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function detectTabularSourceType(fileName: string, input?: string | Uint8Array): TabularSourceType {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith('.csv')) return 'csv';
  if (lowered.endsWith('.xlsx')) return 'xlsx';
  if (lowered.endsWith('.json')) {
    if (input === undefined) {
      throw new TabularImportError('JSON source classification requires source bytes.');
    }
    try {
      return classifyJsonSource(JSON.parse(textOf(input)));
    } catch (error) {
      if (error instanceof TabularImportError) throw error;
      throw new TabularImportError('JSON source is malformed.');
    }
  }
  throw new TabularImportError('Supported tabular sources are .json, .csv, and .xlsx.');
}

export function decodeTabularRows(fileName: string, input: string | Uint8Array): TabularRow[] {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith('.json')) return parseJsonRows(textOf(input));
  if (lowered.endsWith('.csv')) return rowsFromMatrix('CSV', parseCsv(textOf(input)));
  if (lowered.endsWith('.xlsx')) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    return parseXlsx(bytes);
  }
  throw new TabularImportError('Supported tabular sources are .json, .csv, and .xlsx.');
}

export async function buildTabularImportPreview(
  fileName: string,
  input: string | Uint8Array,
  expectedRevision: number,
): Promise<TabularImportPreview> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new TabularImportError('Expected revision must be a positive integer.');
  const type = detectTabularSourceType(fileName, input);
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
