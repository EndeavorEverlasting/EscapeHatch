import type { FillRecord, RecognizedField } from './assist-policy';

export type PageProgress = {
  key: string;
  url: string;
  title: string;
  scannedAt: string;
  filled: number;
  alreadyPopulated: number;
  manualReview: number;
  blocked: number;
  unknown: number;
  status: 'ready-to-scan' | 'ready-to-fill' | 'filled' | 'paused';
};

export type AssistSession = {
  active: boolean;
  paused: boolean;
  emergencyStopped: boolean;
  origin: string;
  applicationKey: string;
  currentPageKey: string;
  pages: PageProgress[];
  undoHistory: { pageKey: string; records: FillRecord[] }[];
  message: string;
};

export const initialSession = (): AssistSession => ({
  active: false,
  paused: false,
  emergencyStopped: false,
  origin: '',
  applicationKey: '',
  currentPageKey: '',
  pages: [],
  undoHistory: [],
  message: 'Start Assist to inspect the active application page.',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function dateValue(value: unknown, fallback: string) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function pageStatus(value: unknown): PageProgress['status'] {
  if (value === 'filled') return 'filled';
  if (value === 'paused') return 'paused';
  if (value === 'ready-to-fill') return 'ready-to-fill';
  return 'ready-to-scan';
}

/**
 * Accepts both the cockpit's session shape and the plain status shape exported
 * by the browser extension. Session recovery is deliberately separate from
 * profile sync and application milestone data.
 */
export function parseAssistSessionStatus(value: unknown): AssistSession | null {
  if (!isRecord(value) || !Array.isArray(value.pages) || typeof value.message !== 'string') return null;
  const fallbackDate = dateValue(value.exportedAt, new Date(0).toISOString());
  const pages = value.pages
    .filter(isRecord)
    .map((page) => {
      const key = typeof page.key === 'string' ? page.key : '';
      if (!key) return null;
      return {
        key,
        url: typeof page.url === 'string' ? page.url : '',
        title: typeof page.title === 'string' ? page.title : '',
        scannedAt: dateValue(page.scannedAt, fallbackDate),
        filled: numberValue(page.filled),
        alreadyPopulated: numberValue(page.alreadyPopulated),
        manualReview: numberValue(page.manualReview),
        blocked: numberValue(page.blocked),
        unknown: numberValue(page.unknown),
        status: pageStatus(page.status),
      } satisfies PageProgress;
    })
    .filter((page): page is PageProgress => page !== null);
  const origin = typeof value.origin === 'string' ? value.origin : '';
  const currentPageKey = typeof value.currentPageKey === 'string'
    ? value.currentPageKey
    : typeof value.pageKey === 'string' ? value.pageKey : '';
  return {
    ...initialSession(),
    active: value.active === true,
    paused: value.paused === true,
    emergencyStopped: value.emergencyStopped === true,
    origin,
    applicationKey: typeof value.applicationKey === 'string' ? value.applicationKey : origin,
    currentPageKey,
    pages,
    undoHistory: Array.isArray(value.undoHistory) ? value.undoHistory as AssistSession['undoHistory'] : [],
    message: value.message,
  };
}

export function pageKey(url: string, document: Document) {
  return `${url.split('#')[0]}::${document.body?.innerText.slice(0, 160) ?? ''}`.replace(/\s+/g, ' ').slice(0, 240);
}

export function observePage(session: AssistSession, url: string, document: Document): AssistSession {
  const origin = new URL(url).origin;
  const key = pageKey(url, document);
  if (!session.active) return { ...session, origin, applicationKey: origin, currentPageKey: key };
  if (origin !== session.origin) return { ...session, paused: true, message: 'The site origin changed. Assist is paused until you start a new session.' };
  if (key === session.currentPageKey) return session;
  const existing = session.pages.some((page) => page.key === key);
  return { ...session, currentPageKey: key, message: existing ? 'This application page is ready to scan again.' : 'New application page detected. Review the controls, then scan this page.', pages: existing ? session.pages : [...session.pages, { key, url, title: document.title, scannedAt: new Date().toISOString(), filled: 0, alreadyPopulated: 0, manualReview: 0, blocked: 0, unknown: 0, status: 'ready-to-scan' }] };
}

export function progressFromFields(fields: RecognizedField[]) {
  return fields.reduce((summary, field) => {
    const key = field.status === 'fillable' ? 'filled' : field.status === 'manual-review' ? 'manualReview' : field.status === 'already-populated' ? 'alreadyPopulated' : field.status;
    summary[key] += 1;
    return summary;
  }, { filled: 0, alreadyPopulated: 0, manualReview: 0, blocked: 0, unknown: 0 });
}

export function recordScan(session: AssistSession, fields: RecognizedField[], url: string, title: string): AssistSession {
  const progress = progressFromFields(fields);
  const page: PageProgress = { key: session.currentPageKey, url, title, scannedAt: new Date().toISOString(), ...progress, status: 'ready-to-fill' };
  return { ...session, pages: [...session.pages.filter((item) => item.key !== page.key), page], message: 'Page scanned. Review proposed values and choose Fill This Page.' };
}

export function recordFill(session: AssistSession, records: FillRecord[]): AssistSession {
  const pages = session.pages.map((page) => page.key === session.currentPageKey ? { ...page, filled: page.filled + records.length, status: 'filled' as const } : page);
  return { ...session, pages, undoHistory: records.length ? [...session.undoHistory, { pageKey: session.currentPageKey, records }] : session.undoHistory, message: records.length ? 'Known empty fields populated. Review this page and use the site’s own Next or Continue control.' : 'No approved empty fields were changed.' };
}

export function setSessionMessage(session: AssistSession, message: string) {
  return { ...session, message };
}