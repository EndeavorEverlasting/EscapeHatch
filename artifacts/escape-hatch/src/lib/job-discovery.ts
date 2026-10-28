/**
 * EscapeHatch opportunity discovery projection.
 * Candidate discovery is NOT an application or permission to submit one.
 * Source-specific data is read-only until the user saves a candidate into the
 * existing application workspace (APPLICATIONS_KEY).
 */
import type { Application } from './storage';

export type WorkMode = 'remote' | 'hybrid' | 'on_site' | 'unknown';
export type Seniority = 'junior' | 'mid' | 'senior' | 'unknown';
export type Domain = 'Technology' | 'Healthcare' | 'Business & Operations' | 'Finance' | 'Education' | 'Other';
export type PayPeriod = 'annual' | 'monthly' | 'fortnightly' | 'weekly' | 'hourly';

export interface DiscoveryJob {
  id: string;
  provider: 'himalayas';
  company: string;
  title: string;
  applicationLink: string;
  sourceLink: string;
  workMode: WorkMode;
  seniority: Seniority;
  domain: Domain;
  occupation: string;
  location: string;
  pay: { min: number | null; max: number | null; period: PayPeriod; currency: string } | null;
  publishedAt: string | null;
}

export interface DiscoveryFilters {
  modes: WorkMode[];
  seniorities: Seniority[];
  domain: Domain | 'all';
  usdAnnualFloor: number | null;
  salaryOnly: boolean;
}

type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const trimmed = (v: unknown, max = 180) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const finitePay = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000000 ? v : null;

export function safePublicHttps(raw: unknown): string | null {
  const value = trimmed(raw, 2049);
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost') || host === 'localhost' ||
        host.endsWith('.test') || host.endsWith('.invalid') || /^\d+(?:\.\d+){3}$/.test(host) || host.startsWith('[')) return null;
    return value;
  } catch { return null; }
}

function inferSeniority(value: unknown, title: string): Seniority {
  const raw = (Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : '').toLowerCase();
  const lower = raw || title.toLowerCase();
  if (/\b(intern|entry.level|junior|associate|graduate)\b/.test(lower)) return 'junior';
  if (/\b(mid.level|intermediate|mid|ii)\b/.test(lower)) return 'mid';
  if (/\b(senior|sr\.?|staff|principal|lead|director|executive|head of|manager)\b/.test(lower)) return 'senior';
  return 'unknown';
}

const occupationRules: Array<[RegExp, Domain, string]> = [
  [/\b(cybersecurity|security engineer|soc analyst|infosec)\b/i, 'Technology', 'Cybersecurity'],
  [/\b(software|developer|frontend|backend|full.?stack|web engineer|programmer)\b/i, 'Technology', 'Software Engineering'],
  [/\b(data scientist|data engineer|machine learning|artificial intelligence|ai engineer)\b/i, 'Technology', 'Data & AI'],
  [/\b(it |information technology|systems administrator|sysadmin|network engineer|help desk|desktop support)\b/i, 'Technology', 'IT Operations'],
  [/\b(nurse|physician|clinical|healthcare|medical|patient)\b/i, 'Healthcare', 'Clinical & Healthcare'],
  [/\b(project manager|program manager|project coordinator|pmo|delivery manager)\b/i, 'Business & Operations', 'Project & Program Management'],
  [/\b(product manager|product owner)\b/i, 'Business & Operations', 'Product Management'],
  [/\b(operations|business analyst|customer success|recruiter|human resources)\b/i, 'Business & Operations', 'Business Operations'],
  [/\b(accountant|financial analyst|controller|audit|investment)\b/i, 'Finance', 'Finance & Accounting'],
  [/\b(teacher|educator|professor|instructional|curriculum)\b/i, 'Education', 'Education & Training'],
];
const categoryMap: Array<[RegExp, Domain]> = [
  [/health|medical|clinical|nursing/i, 'Healthcare'],
  [/finance|accounting|banking/i, 'Finance'],
  [/education|teaching|learning/i, 'Education'],
  [/software|engineering|data|information technology|it &|security|developer/i, 'Technology'],
  [/business|operation|management|product|human resources|administration/i, 'Business & Operations'],
];

export function classifyOccupation(title: string, categories: string[] = []): { domain: Domain; occupation: string } {
  for (const [pattern, domain, occupation] of occupationRules) if (pattern.test(title)) return { domain, occupation };
  for (const category of categories) for (const [pattern, domain] of categoryMap) {
    if (pattern.test(category)) return { domain, occupation: category.slice(0, 80) };
  }
  return { domain: 'Other', occupation: 'Unclassified' };
}

/** Unknown modes stay unknown; the remote-only provider is explicit evidence of remote. */
export function normalizeHimalayas(value: unknown, nowMs = Date.now()): DiscoveryJob[] {
  if (!record(value) || !Array.isArray(value.jobs)) return [];
  const seen = new Set<string>();
  const normalized: DiscoveryJob[] = [];
  for (const raw of value.jobs.slice(0, 60)) {
    if (!record(raw)) continue;
    const title = trimmed(raw.title);
    const company = trimmed(raw.companyName);
    const link = safePublicHttps(raw.applicationLink);
    const id = trimmed(raw.guid, 300);
    if (!title || !company || !link || !id || seen.has(id)) continue;
    if (typeof raw.expiryDate === 'number' && Number.isFinite(raw.expiryDate) && raw.expiryDate * 1000 < nowMs) continue;
    seen.add(id);
    const categories = [...(Array.isArray(raw.categories) ? raw.categories : []),
      ...(Array.isArray(raw.parentCategories) ? raw.parentCategories : [])].filter((v): v is string => typeof v === 'string');
    const seniority = inferSeniority(raw.seniority, title);
    const { domain, occupation } = classifyOccupation(title, categories);
    const min = finitePay(raw.minSalary);
    const max = finitePay(raw.maxSalary);
    const period = raw.salaryPeriod;
    const currency = trimmed(raw.currency, 3).toUpperCase();
    const hasPay = (min !== null || max !== null) && typeof period === 'string' &&
      ['annual', 'monthly', 'fortnightly', 'weekly', 'hourly'].includes(period) &&
      /^[A-Z]{3}$/.test(currency) && (min === null || max === null || min <= max);
    const published = typeof raw.pubDate === 'number' && Number.isFinite(raw.pubDate) && raw.pubDate > 0
      ? new Date(raw.pubDate * 1000) : null;
    const publicSource = safePublicHttps(raw.guid);
    normalized.push({
      id, provider: 'himalayas', company, title,
      // Provider terms: always use applicationLink unchanged for applying.
      applicationLink: link, sourceLink: publicSource?.startsWith('https://himalayas.app/') ? publicSource : 'https://himalayas.app/',
      workMode: 'remote', seniority, domain, occupation,
      location: Array.isArray(raw.locationRestrictions) && raw.locationRestrictions.length
        ? raw.locationRestrictions.map((v: unknown) => record(v) ? trimmed(v.name, 40) : trimmed(v, 40)).filter(Boolean).slice(0, 6).join(', ')
        : 'Worldwide / check location restrictions',
      pay: hasPay ? { min, max, currency, period: period as PayPeriod } : null,
      publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
    });
  }
  return normalized;
}

export function applyDiscoveryFilters(jobs: DiscoveryJob[], filters: DiscoveryFilters): DiscoveryJob[] {
  return jobs.filter((job) => {
    if (filters.modes.length && !filters.modes.includes(job.workMode)) return false;
    if (filters.seniorities.length && !filters.seniorities.includes(job.seniority)) return false;
    if (filters.domain !== 'all' && job.domain !== filters.domain) return false;
    if (filters.salaryOnly && !job.pay) return false;
    if (filters.usdAnnualFloor !== null) {
      if (!job.pay || job.pay.currency !== 'USD' || job.pay.period !== 'annual') return false;
      if ((job.pay.max ?? job.pay.min ?? -1) < filters.usdAnnualFloor) return false;
    }
    return true;
  });
}

export function payLabel(job: DiscoveryJob): string {
  if (!job.pay) return 'Pay not published';
  const { min, max, period, currency } = job.pay;
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${currency} ${min === null ? '' : fmt(min)}${min !== null && max !== null ? '–' : ''}${max === null ? '' : fmt(max)} / ${period}`;
}

export function candidateToApplication(job: DiscoveryJob, savedAt: string): Application {
  return {
    id: 'discover-himalayas-' + job.id.replace(/[^a-z0-9-]/gi, '-').slice(0, 120),
    company: job.company,
    role: job.title,
    url: job.applicationLink,
    status: 'saved',
    priority: 'normal',
    notes: `Discovered via Himalayas (remote jobs). Source: ${job.sourceLink}\n${job.workMode} · ${job.seniority} · ${job.domain} > ${job.occupation} · ${payLabel(job)}\nVerify the listing is still open before applying.`,
    nextAction: 'Review original job posting and prepare application',
    updatedAt: savedAt,
  };
}
