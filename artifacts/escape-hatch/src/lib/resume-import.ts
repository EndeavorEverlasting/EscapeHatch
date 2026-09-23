import type { AssistEducation, AssistExperience, AssistProfile, AssistProject, Confidence, Provenance, ReviewedProposal } from './assist-contract';

export type ResumeImport = {
  fileName: string;
  text: string;
  proposals: ReviewedProposal[];
  projects: AssistProject[];
  experience: AssistExperience[];
  education: AssistEducation[];
  profilePatch: Partial<AssistProfile['contact']>;
  links: AssistProfile['links'];
  summary: string;
  skills: string[];
};

function decodePdfLiteral(value: string) {
  let decoded = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '\\') {
      decoded += character;
      continue;
    }
    const escaped = value[index + 1];
    if (!escaped) break;
    if (/[0-7]/.test(escaped)) {
      const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? '';
      decoded += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    const escapedCharacters: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
    if (escapedCharacters[escaped]) decoded += escapedCharacters[escaped];
    else if (escaped === '\r' && value[index + 2] === '\n') index += 1;
    else if (escaped !== '\n') decoded += escaped;
    index += 1;
  }
  return decoded;
}

function decodePdfHex(value: string) {
  const normalized = value.replace(/\s/g, '');
  const bytes = new Uint8Array(Math.ceil(normalized.length / 2));
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(`${normalized[index]}${normalized[index + 1] ?? '0'}`, 16);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let result = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) result += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return result;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    let result = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) result += String.fromCharCode((bytes[index + 1] << 8) | bytes[index]);
    return result;
  }
  return new TextDecoder('latin1').decode(bytes);
}

const PDF_PARSE_TIMEOUT_MS = 1500;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_INFLATED_STREAM_BYTES = 2 * 1024 * 1024;
export const UNSUPPORTED_RESUME_PDF_MESSAGE = 'This PDF could not be fully read locally. Scanned, encrypted, or unsupported PDF layouts are not supported. Try exporting a text-based PDF or importing a .txt file.';

async function inflatePdfStream(bytes: Uint8Array, deadline: number): Promise<string | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    reader = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        void reader.cancel();
        return null;
      }
      let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timeout = globalThis.setTimeout(() => reject(new Error('PDF stream timeout')), remaining);
        }),
      ]);
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      if (result.done) break;
      if (result.value) {
        size += result.value.byteLength;
        if (size > MAX_INFLATED_STREAM_BYTES) {
          void reader.cancel();
          return null;
        }
        chunks.push(result.value);
      }
    }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('latin1').decode(output);
  } catch {
    if (reader) void reader.cancel();
    return null;
  }
}

type PdfToken = { kind: 'string' | 'array' | 'word'; value: string | PdfToken[] };

function skipPdfWhitespace(content: string, start: number) {
  let index = start;
  while (index < content.length) {
    if (/\s/.test(content[index])) {
      index += 1;
      continue;
    }
    if (content[index] === '%') {
      while (index < content.length && !/[\r\n]/.test(content[index])) index += 1;
      continue;
    }
    break;
  }
  return index;
}

function readPdfToken(content: string, start: number): { token: PdfToken | null; next: number } {
  let index = skipPdfWhitespace(content, start);
  if (index >= content.length) return { token: null, next: index };
  if (content[index] === '(') {
    const begin = index + 1;
    let depth = 1;
    index += 1;
    while (index < content.length && depth > 0) {
      if (content[index] === '\\') {
        index += content[index + 1] === '\r' && content[index + 2] === '\n' ? 3 : 2;
        continue;
      }
      if (content[index] === '(') depth += 1;
      if (content[index] === ')') depth -= 1;
      index += 1;
    }
    const end = depth === 0 ? index - 1 : content.length;
    return { token: { kind: 'string', value: decodePdfLiteral(content.slice(begin, end)) }, next: index };
  }
  if (content[index] === '<' && content[index + 1] !== '<') {
    const begin = index + 1;
    index = content.indexOf('>', begin);
    if (index < 0) return { token: null, next: content.length };
    return { token: { kind: 'string', value: decodePdfHex(content.slice(begin, index)) }, next: index + 1 };
  }
  if (content[index] === '[') {
    const values: PdfToken[] = [];
    index += 1;
    while (index < content.length) {
      index = skipPdfWhitespace(content, index);
      if (content[index] === ']') return { token: { kind: 'array', value: values }, next: index + 1 };
      const nested = readPdfToken(content, index);
      if (!nested.token || nested.next <= index) return { token: null, next: content.length };
      values.push(nested.token);
      index = nested.next;
    }
    return { token: null, next: content.length };
  }
  const begin = index;
  while (index < content.length && !/[\s()[\]<>]/.test(content[index])) index += 1;
  return { token: { kind: 'word', value: content.slice(begin, index) }, next: index };
}

function extractPdfTextOperators(content: string) {
  const tokens: PdfToken[] = [];
  let index = 0;
  while (index < content.length) {
    const parsed = readPdfToken(content, index);
    if (!parsed.token || parsed.next <= index) break;
    tokens.push(parsed.token);
    index = parsed.next;
  }
  const chunks: string[] = [];
  let textOperatorCount = 0;
  const valueOf = (token: PdfToken | undefined) => token?.kind === 'string' ? token.value as string : '';
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (token.kind !== 'word') continue;
    const operator = token.value as string;
    if (operator === 'Tj' || operator === "'" || operator === '"') {
      textOperatorCount += 1;
      const value = valueOf(tokens[tokenIndex - 1]);
      if (value) chunks.push(value);
    } else if (operator === 'TJ') {
      textOperatorCount += 1;
      const array = tokens[tokenIndex - 1];
      if (array?.kind === 'array') chunks.push((array.value as PdfToken[]).map(valueOf).join(''));
    }
  }
  return { chunks, textOperatorCount };
}

/**
 * Extracts text-bearing PDF streams without uploading the file. The parser is
 * intentionally bounded and skips font/image streams; it does not attempt OCR
 * or decode arbitrary filters.
 */
export async function extractResumeText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error(UNSUPPORTED_RESUME_PDF_MESSAGE);
  const raw = new TextDecoder('latin1').decode(bytes);
  if (!raw.startsWith('%PDF-')) throw new Error('This file is not a supported PDF.');
  const chunks: string[] = [];
  const parseDeadline = Date.now() + PDF_PARSE_TIMEOUT_MS;
  let incomplete = false;
  const streamPattern = /stream(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw))) {
    if (Date.now() >= parseDeadline) throw new Error(UNSUPPORTED_RESUME_PDF_MESSAGE);
    const start = match.index + match[0].indexOf(match[1]);
    const source = bytes.slice(start, start + match[1].length);
    const objectStart = raw.lastIndexOf('obj', match.index);
    const context = raw.slice(objectStart >= 0 ? objectStart : Math.max(0, match.index - 2000), match.index);
    const isFontStream = /\/(?:FontFile|FontFile2|FontFile3|Length1)\b/i.test(context) || /\/Type\s*\/Font\b/i.test(context);
    const isImageStream = /\/Subtype\s*\/Image\b/i.test(context);
    if (isFontStream || isImageStream) continue;
    const filterDeclaration = context.match(/\/Filter\s+(\[[^\]]*\]|\/[A-Za-z0-9]+)/i)?.[1] ?? '';
    const isFlate = /^\/FlateDecode$/i.test(filterDeclaration) || /^\[\s*\/FlateDecode\s*\]$/i.test(filterDeclaration);
    if (filterDeclaration && !isFlate) {
      incomplete = true;
      continue;
    }
    if (source.byteLength > MAX_INFLATED_STREAM_BYTES) {
      incomplete = true;
      continue;
    }
    const content = isFlate ? await inflatePdfStream(source, parseDeadline) : new TextDecoder('latin1').decode(source);
    if (content === null) {
      incomplete = true;
      continue;
    }
    const extracted = extractPdfTextOperators(content);
    if (extracted.textOperatorCount > 0 && extracted.chunks.length === 0) incomplete = true;
    chunks.push(...extracted.chunks);
  }
  const annotations = [...raw.matchAll(/\/URI\s+\((.*?)\)/g)].map((item) => decodePdfLiteral(item[1]));
  const text = [...chunks, ...annotations].join('\n').replace(/[^\S\r\n]+/g, ' ').trim();
  if (!text || incomplete) throw new Error(UNSUPPORTED_RESUME_PDF_MESSAGE);
  return text;
}

const stamp = (fileName: string, snippet: string, page?: number): Provenance => ({
  source: 'resume',
  label: fileName,
  snippet: snippet.slice(0, 280),
  page,
  capturedAt: new Date().toISOString(),
});

const clean = (value: string) => value.replace(/\s+/g, ' ').replace(/^[•·▪]\s*/, '').trim();
const idFor = (section: string, field: string, value: string) => `${section}-${field}-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`;
const heading = (line: string) => /^(professional summary|summary|core strengths|skills|selected software\b.*|projects|professional experience|experience|education)$/i.test(line.trim());
const sectionText = (lines: string[], names: RegExp) => {
  const start = lines.findIndex((line) => names.test(line));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && heading(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
};
const addProposal = (proposals: ReviewedProposal[], section: ReviewedProposal['section'], field: string, value: string, confidence: Confidence, source: Provenance) => {
  if (!value.trim()) return;
  const normalized = section === 'education'
    ? value.split(/\r?\n/).map(clean).filter(Boolean).join('\n')
    : clean(value);
  proposals.push({ id: idFor(section, field, value), section, field, value: normalized, confidence, review: 'proposed', provenance: source });
};

type ParsedContactLocation = Pick<Partial<AssistProfile['contact']>, 'street_address' | 'city' | 'region' | 'postal_code' | 'country'> & { raw?: string };

function parseResumeName(value: string) {
  let remaining = clean(value);
  let name_prefix = '';
  const prefixMatch = remaining.match(/^(Mr|Mrs|Ms|Mx|Dr|Prof)\.?\s+/i);
  if (prefixMatch) {
    name_prefix = prefixMatch[1];
    remaining = remaining.slice(prefixMatch[0].length).trim();
  }

  let preferred_name = '';
  const preferredMatch = remaining.match(/(?:\(([^()]{1,40})\)|["“]([^"”]{1,40})["”])/);
  if (preferredMatch) {
    preferred_name = clean(preferredMatch[1] ?? preferredMatch[2] ?? '');
    remaining = clean(remaining.replace(preferredMatch[0], ' '));
  }

  const parts = remaining.split(/\s+/).filter(Boolean);
  return {
    name_prefix,
    first_name: parts[0] ?? '',
    last_name: parts.slice(1).join(' '),
    preferred_name,
  };
}

function parseContactLocation(lines: string[]): ParsedContactLocation {
  const firstHeading = lines.findIndex((line) => heading(line));
  const contactLines = lines.slice(0, firstHeading >= 0 ? firstHeading : Math.min(lines.length, 10));
  const candidates = contactLines
    .map((line) => line.split(/\s*[|•·]\s*/)[0].trim())
    .filter((line) => line.includes(',') && !/@|https?:\/\/|linkedin\.com/i.test(line));

  for (const candidate of candidates) {
    const parts = candidate.split(',').map(clean).filter(Boolean);
    if (parts.length < 2) continue;
    const hasStreet = /^\d{1,6}\s+\S+/.test(parts[0]);
    const street_address = hasStreet ? parts.shift() ?? '' : '';
    const city = parts.shift() ?? '';
    if (!city || !parts.length) continue;

    let country = '';
    if (parts.length > 1 && /^(?:united states(?: of america)?|usa|u\.s\.a\.|us)$/i.test(parts[parts.length - 1])) {
      country = parts.pop() ?? '';
    }
    const regionPostal = parts.join(', ').trim();
    const regionPostalMatch = regionPostal.match(/^(.+?)(?:\s+(\d{5}(?:-\d{4})?))?$/);
    const region = clean(regionPostalMatch?.[1] ?? '');
    const postal_code = clean(regionPostalMatch?.[2] ?? '');
    if (!region) continue;
    return { raw: candidate, street_address, city, region, postal_code, country };
  }
  return {};
}

export function parseResumeText(text: string, fileName = 'Imported resume'): ResumeImport {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const proposals: ReviewedProposal[] = [];
  const profilePatch: ResumeImport['profilePatch'] = {};
  const links: ResumeImport['links'] = [];
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  const phone = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/)?.[0] ?? '';
  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s|]+|linkedin\.com\/[^\s|]+/i)?.[0] ?? '';
  const urls = [...text.matchAll(/https?:\/\/[^\s|]+/gi)].map((match) => match[0].replace(/[),.;]+$/, ''));
  const name = lines[0] ?? '';
  const contactLocation = parseContactLocation(lines);
  if (name && name.length < 80) {
    const parsedName = parseResumeName(name);
    profilePatch.first_name = parsedName.first_name;
    profilePatch.last_name = parsedName.last_name;
    profilePatch.name_prefix = parsedName.name_prefix;
    profilePatch.preferred_name = parsedName.preferred_name;
    addProposal(proposals, 'contact', 'name', [parsedName.first_name, parsedName.last_name].filter(Boolean).join(' '), 'high', stamp(fileName, name, 1));
    if (parsedName.name_prefix) addProposal(proposals, 'contact', 'name_prefix', parsedName.name_prefix, 'high', stamp(fileName, name, 1));
    if (parsedName.preferred_name) addProposal(proposals, 'contact', 'preferred_name', parsedName.preferred_name, 'high', stamp(fileName, name, 1));
  }
  if (email) { profilePatch.email = email; addProposal(proposals, 'contact', 'email', email, 'high', stamp(fileName, email, 1)); }
  if (phone) { profilePatch.phone = phone; addProposal(proposals, 'contact', 'phone', phone, 'high', stamp(fileName, phone, 1)); }
  if (linkedin) {
    const url = linkedin.startsWith('http') ? linkedin : `https://${linkedin}`;
    links.push({ label: 'LinkedIn', url, provenance: stamp(fileName, linkedin, 1) });
    addProposal(proposals, 'links', 'linkedin_url', url, 'high', stamp(fileName, linkedin, 1));
    profilePatch.linkedin_url = url;
  }
  if (contactLocation.city && contactLocation.region) {
    profilePatch.city = contactLocation.city;
    profilePatch.region = contactLocation.region;
    addProposal(proposals, 'contact', 'location', `${contactLocation.city}, ${contactLocation.region}`, 'high', stamp(fileName, contactLocation.raw ?? `${contactLocation.city}, ${contactLocation.region}`, 1));
  }
  for (const field of ['street_address', 'postal_code', 'country'] as const) {
    const value = contactLocation[field] ?? '';
    if (!value) continue;
    profilePatch[field] = value;
    addProposal(proposals, 'contact', field, value, 'high', stamp(fileName, value, 1));
  }
  for (const url of urls.filter((item) => !item.includes('linkedin.com'))) {
    links.push({ label: new URL(url).hostname, url, provenance: stamp(fileName, url, 1) });
    addProposal(proposals, 'links', 'website', url, 'high', stamp(fileName, url, 1));
  }

  const summaryLines = sectionText(lines, /^(professional summary|summary)$/i);
  const summary = summaryLines.join(' ');
  addProposal(proposals, 'summary', 'professional_summary', summary, summary ? 'high' : 'low', stamp(fileName, summary, 1));
  const skills = (sectionText(lines, /^(core strengths|skills)$/i).join(' • ').split(/[•·|]/).map(clean).filter((item) => item.length > 1));
  [...new Set(skills)].forEach((skill) => addProposal(proposals, 'skills', 'skill', skill, 'medium', stamp(fileName, skill, 1)));

  const projectLines = sectionText(lines, /^(selected software\b.*|projects)$/i);
  const projects: AssistProject[] = [];
  for (const line of projectLines.filter((item) => item.startsWith('•'))) {
    const content = clean(line);
    const [namePart, ...descriptionParts] = content.split(/\s+[—-]\s+/);
    const url = urls.find((item) => content.includes(item)) ?? '';
    projects.push({ id: idFor('project', namePart, content), name: clean(namePart), url, description: clean(descriptionParts.join(' — ') || content), provenance: stamp(fileName, content, 1) });
    addProposal(proposals, 'projects', 'project', content, 'medium', stamp(fileName, content, 1));
  }

  const experienceLines = sectionText(lines, /^(professional experience|experience)$/i);
  const experience: AssistExperience[] = [];
  let current: AssistExperience | null = null;
  for (const line of experienceLines) {
    if (line.startsWith('•')) { if (current) current.bullets.push(clean(line)); continue; }
    if (current) experience.push(current);
    const [head, dates = ''] = line.split(/\s+\|\s+/);
    const [company = '', title = ''] = head.split(/\s+[—-]\s+/);
    current = { id: idFor('experience', company, line), company: clean(company), title: clean(title), dates: clean(dates), location: '', bullets: [], provenance: stamp(fileName, line, 1) };
    addProposal(proposals, 'experience', 'role', line, 'medium', stamp(fileName, line, 1));
  }
  if (current) experience.push(current);

  const educationLines = sectionText(lines, /^education$/i);
  const education: AssistEducation[] = [];
  if (educationLines.length) {
    const educationBlocks: string[][] = [];
    let currentBlock: string[] = [];
    for (const line of educationLines) {
      const startsEntry = !line.startsWith('•') && line.includes('|');
      if (startsEntry && currentBlock.length) {
        educationBlocks.push(currentBlock);
        currentBlock = [];
      }
      currentBlock.push(line);
    }
    if (currentBlock.length) educationBlocks.push(currentBlock);
    for (const block of educationBlocks) {
      const first = block[0];
      const [institution = '', ...rest] = first.split(/\s+\|\s+/);
      const value = block.join('\n');
      const source = stamp(fileName, value, 2);
      education.push({ id: idFor('education', institution, value), institution: clean(institution), credential: clean(rest.join(' | ')), dates: '', details: block.slice(1).map(clean).join(' '), provenance: source });
      addProposal(proposals, 'education', 'education', value, 'medium', source);
    }
  }

  return { fileName, text, proposals, projects, experience, education, profilePatch, links, summary, skills: [...new Set(skills)] };
}

export function getDeterministicResumeProposals(imported: ResumeImport): ReviewedProposal[] {
  return imported.proposals
    .filter((proposal) => proposal.confidence === 'high' || proposal.confidence === 'medium')
    .map((proposal) => ({ ...proposal, review: 'accepted' as const }));
}

type AssistContact = AssistProfile['contact'];
type AssistContactField = keyof AssistContact;

const assistContactFields = new Set<AssistContactField>([
  'name_prefix',
  'first_name',
  'last_name',
  'preferred_name',
  'email',
  'phone',
  'phone_authority',
  'linkedin_url',
  'street_address',
  'city',
  'region',
  'postal_code',
  'country',
]);

const acceptedProposal = (proposal: ReviewedProposal) => proposal.review === 'accepted' || proposal.review === 'edited';
const proposalValue = (proposal: ReviewedProposal) => proposal.value.trim();
const proposalsFor = (proposals: ReviewedProposal[], section: ReviewedProposal['section'], field: string) =>
  proposals.filter((proposal) => proposal.section === section && proposal.field === field);

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') };
}

function splitLocation(value: string) {
  const [location] = value.split('|');
  const [city = '', region = ''] = location.split(',').map((part) => part.trim());
  return { city, region };
}

function splitRole(value: string) {
  const [head, dates = ''] = value.split(/\s+\|\s+/);
  const [company = '', title = ''] = head.split(/\s+[—-]\s+/);
  return { company: company.trim(), title: title.trim(), dates: dates.trim() };
}

function splitProject(value: string) {
  const content = value.trim();
  const [namePart, ...descriptionParts] = content.split(/\s+[—-]\s+/);
  const url = content.match(/https?:\/\/[^\s|]+/i)?.[0]?.replace(/[),.;]+$/, '') ?? '';
  return {
    name: namePart?.trim() ?? '',
    url,
    description: (descriptionParts.join(' — ') || content).trim(),
  };
}

function splitEducation(value: string, existing: AssistEducation | undefined) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const [first = '', ...detailLines] = lines;
  const [institution = '', ...credentialParts] = first.split(/\s+\|\s+/);
  return {
    institution: institution.trim(),
    credential: credentialParts.join(' | ').trim(),
    dates: existing?.dates ?? '',
    details: detailLines.join(' ').trim() || existing?.details || '',
  };
}

function linkLabel(url: string, field: string) {
  if (field === 'linkedin_url') return 'LinkedIn';
  return url.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/i)?.[1] ?? 'Website';
}

export function getAcceptedResumeContactPatch(accepted: ReviewedProposal[]): Partial<AssistContact> {
  const patch: Partial<AssistContact> = {};
  for (const proposal of accepted.filter(acceptedProposal).filter((item) => item.section === 'contact')) {
    const value = proposalValue(proposal);
    if (proposal.field === 'name') {
      Object.assign(patch, splitName(value));
      continue;
    }
    if (proposal.field === 'location') {
      const location = splitLocation(value);
      if (location.city) patch.city = location.city;
      if (location.region) patch.region = location.region;
      continue;
    }
    if (assistContactFields.has(proposal.field as AssistContactField)) {
      patch[proposal.field as AssistContactField] = value;
    }
  }
  for (const proposal of accepted.filter(acceptedProposal).filter((item) => item.section === 'links' && item.field === 'linkedin_url')) {
    patch.linkedin_url = proposalValue(proposal);
  }
  return patch;
}

export function applyAcceptedResumeImport(imported: ResumeImport, accepted: ReviewedProposal[], profile: AssistProfile): AssistProfile {
  const approved = accepted.filter(acceptedProposal);
  const acceptedText = (section: ReviewedProposal['section'], field: string) =>
    approved.find((item) => item.section === section && item.field === field)?.value.trim();
  const linkProposals = approved.filter((item) => item.section === 'links');
  const skillProposals = approved.filter((item) => item.section === 'skills' && item.field === 'skill');
  const projectProposals = approved.filter((item) => item.section === 'projects' && item.field === 'project');
  const experienceProposals = approved.filter((item) => item.section === 'experience' && item.field === 'role');
  const educationProposals = approved.filter((item) => item.section === 'education' && item.field === 'education');
  const originalProjectProposals = proposalsFor(imported.proposals, 'projects', 'project');
  const originalExperienceProposals = proposalsFor(imported.proposals, 'experience', 'role');
  const originalEducationProposals = proposalsFor(imported.proposals, 'education', 'education');
  const contactPatch = getAcceptedResumeContactPatch(approved);
  const links = linkProposals
    .map((proposal) => {
      const url = proposalValue(proposal);
      return url ? { label: linkLabel(url, proposal.field), url, provenance: proposal.provenance } : null;
    })
    .filter((link): link is AssistProfile['links'][number] => link !== null);
  const skills = skillProposals.map(proposalValue).filter(Boolean);
  const projects = projectProposals.map((proposal) => {
    const parsed = splitProject(proposal.value);
    return {
      id: proposal.id,
      ...parsed,
      provenance: proposal.provenance,
    };
  }).filter((project) => project.name || project.description);
  const experience = experienceProposals.map((proposal) => {
    const parsed = splitRole(proposal.value);
    const originalProposal = originalExperienceProposals.find((item) => item.id === proposal.id);
    const originalRole = originalProposal
      ? imported.experience.find((role) => role.company === splitRole(originalProposal.value).company)
      : undefined;
    return {
      id: proposal.id,
      ...parsed,
      location: originalRole?.location ?? '',
      bullets: originalRole?.bullets ?? [],
      provenance: proposal.provenance,
    };
  }).filter((role) => role.company || role.title);
  const education = educationProposals.map((proposal) => {
    const originalProposal = originalEducationProposals.find((item) => item.id === proposal.id);
    const originalEducation = originalProposal
      ? imported.education.find((item) => item.institution === splitEducation(originalProposal.value, undefined).institution)
      : undefined;
    return {
      id: proposal.id,
      ...splitEducation(proposal.value, originalEducation),
      provenance: proposal.provenance,
    };
  }).filter((item) => item.institution || item.credential || item.details);
  return {
    ...profile,
    updatedAt: new Date().toISOString(),
    contact: { ...profile.contact, ...contactPatch },
    links: [...profile.links, ...links],
    summary: acceptedText('summary', 'professional_summary') ?? profile.summary,
    skills: [...new Set([...profile.skills, ...skills])],
    projects: [...profile.projects, ...projects],
    experience: [...profile.experience, ...experience],
    education: [...profile.education, ...education],
    proposals: approved,
    approvedAt: new Date().toISOString(),
  };
}

export function applyDeterministicResumeImport(
  imported: ResumeImport,
  profile: AssistProfile,
  authoritativeContact: AssistProfile['contact'] = profile.contact,
) {
  const accepted = getDeterministicResumeProposals(imported);
  const contactPatch = getAcceptedResumeContactPatch(accepted);
  const canonicalContact = { ...profile.contact };
  for (const field of assistContactFields) {
    const authoritative = authoritativeContact[field];
    if (authoritative) canonicalContact[field] = authoritative;
  }
  const canonicalProfile = { ...profile, contact: canonicalContact };
  const projected = applyAcceptedResumeImport(imported, accepted, canonicalProfile);
  const mergedContact = { ...projected.contact };
  for (const field of assistContactFields) {
    const existing = canonicalProfile.contact[field];
    if (existing && mergedContact[field] !== existing) mergedContact[field] = existing;
  }
  const uniqueById = <T extends { id: string }>(items: T[]) =>
    items.filter((item, index) => items.findIndex((candidate) => candidate.id === item.id) === index);
  return {
    accepted,
    contactPatch,
    profile: {
      ...projected,
      contact: mergedContact,
      links: projected.links.filter((item, index) => projected.links.findIndex((candidate) => candidate.url === item.url) === index),
      summary: profile.summary || projected.summary,
      projects: uniqueById(projected.projects),
      experience: uniqueById(projected.experience),
      education: uniqueById(projected.education),
      proposals: uniqueById(projected.proposals),
    },
  };
}