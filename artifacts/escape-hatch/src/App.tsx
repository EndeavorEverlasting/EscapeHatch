import { forwardRef, type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clipboard,
  ClipboardCheck,
  ExternalLink,
  FileDown,
  FileUp,
  FolderOpen,
  Home,
  LayoutList,
  Link2,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  ANSWERS_KEY,
  APPLICATIONS_KEY,
  DEFAULT_DRAFT_RECOVERY_SECONDS,
  DRAFT_RECOVERY_KEY,
  DRAFT_RECOVERY_OPTIONS,
  emptyProfile,
  getLocalStorage,
  getDraftRecoveryDeadline,
  getWorkspaceChangedAreas,
  parseApplicationsStorage,
  parseAnswersStorage,
  parseDraftRecoveryStorage,
  parseProfileExportText,
  parseProfileStorage,
  parseStoredValue,
  parseWorkspaceExportText,
  PROFILE_KEY,
  readStoredValue,
  serializeProfileExport,
  serializeWorkspaceExport,
  summarizeWorkspace,
  type AnswerSnippet,
  type Application,
  type ApplicationStatus,
  type DraftRecoverySeconds,
  type Profile,
  type WorkspaceArea,
  type WorkspaceExport,
  writeStoredValue,
} from '@/lib/storage';
import {
  ASSIST_KEY,
  ASSIST_ANSWERS_KEY,
  ASSIST_SESSION_KEY,
  emptyAssistProfile,
  mergeSyncPayload,
  parseAssistProfile,
  parseSyncPayload,
  serializeAssistProfile,
  serializeSyncPayload,
  type AssistAnswer,
  type AssistProfile,
} from '@/lib/assist-contract';
import { applyDeterministicResumeImport, extractResumeText, parseResumeText } from '@/lib/resume-import';
import { initialSession, parseAssistSessionStatus, type AssistSession } from '@/lib/assist-session';

const queryClient = new QueryClient();

const statusLabels: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  preparing: 'Preparing',
  applied: 'Applied',
  follow_up: 'Follow up',
  closed: 'Closed',
};

const categories = ['Career story', 'Motivation', 'Strengths', 'Experience', 'Other'];
const HOME_STATUS_UNDO_DURATION_MS = 8000;

type AnswerDraft = Omit<AnswerSnippet, 'id' | 'updatedAt'>;
type ApplicationDraft = Omit<Application, 'id' | 'updatedAt'>;
type DismissedAnswerDraft = { value: AnswerDraft; answer: AnswerSnippet | null; expiresAt: number };
type DismissedApplicationDraft = { value: ApplicationDraft; application: Application | null; expiresAt: number };

function useStoredState<T>(key: string, initial: T, parse: (value: unknown) => T | null) {
  const [value, setValue] = useState<T>(() => readStoredValue(getLocalStorage(), key, initial, parse));
  useEffect(() => {
    writeStoredValue(getLocalStorage(), key, value);
  }, [key, value]);
  useEffect(() => {
    const storage = getLocalStorage();
    if (!storage) return;
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== key || (event.storageArea && event.storageArea !== storage)) return;
      setValue(parseStoredValue(event.newValue, initial, parse));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [initial, key, parse]);
  return [value, setValue] as const;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'just now';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function formatRecoveryDuration(seconds: number) {
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

function useDraftRecoverySeconds(expiresAt: number | null) {
  const [remainingMs, setRemainingMs] = useState(() => expiresAt === null ? 0 : Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    if (expiresAt === null) {
      setRemainingMs(0);
      return;
    }
    const update = () => setRemainingMs(Math.max(0, expiresAt - Date.now()));
    update();
    const interval = window.setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [expiresAt]);

  // The first render after a draft is dismissed can retain the previous
  // hook state (0) until the interval effect runs. Read the deadline once
  // more in that narrow window so the notice never appears to regain time
  // after a backgrounded tab returns.
  const liveRemainingMs = expiresAt === null ? 0 : Math.max(0, expiresAt - Date.now());
  return Math.ceil((remainingMs > 0 ? remainingMs : liveRemainingMs) / 1000);
}

function displayName(profile: Profile) {
  return profile.preferred_name || profile.first_name || 'Your profile';
}

function initials(profile: Profile) {
  const first = profile.first_name?.[0] || 'E';
  const last = profile.last_name?.[0] || 'H';
  return `${first}${last}`.toUpperCase();
}

function profileCompletion(profile: Profile) {
  const keys: (keyof Profile)[] = ['first_name', 'last_name', 'email', 'phone', 'linkedin_url', 'city', 'region', 'country'];
  return Math.round((keys.filter((key) => profile[key].trim()).length / keys.length) * 100);
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const helper = document.createElement('textarea');
      helper.value = value;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  };
  return { copied, copy };
}

const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'outline' | 'danger' }>(function Button({
  children,
  className = '',
  variant = 'primary',
  ...props
}, ref) {
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:brightness-95 shadow-sm',
    quiet: 'bg-secondary text-secondary-foreground hover:bg-muted',
    outline: 'border border-border bg-card text-foreground hover:bg-secondary',
    danger: 'border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10',
  };
  return (
    <button {...props} ref={ref} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-bold transition duration-200 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
});

function Field({
  label,
  hint,
  error,
  required,
  inputRef,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; inputRef?: React.Ref<HTMLInputElement> }) {
  const fieldId = props.id || props.name;
  const errorId = fieldId ? `${fieldId}-error` : undefined;
  const describedBy = [props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</span>
      <input {...props} ref={inputRef} id={fieldId} aria-describedby={describedBy} aria-invalid={error ? true : undefined} aria-required={required ? true : undefined} data-testid={`input-${props.name}`} className={`w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 ${error ? 'border-destructive' : 'border-input'} ${props.className || ''}`} />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span id={errorId} data-testid={errorId} role="alert" className="mt-1 block text-xs font-bold text-destructive">{error}</span>}
    </label>
  );
}

function TextArea({
  label,
  error,
  required,
  textareaRef,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; textareaRef?: React.Ref<HTMLTextAreaElement> }) {
  const fieldId = props.id || props.name;
  const errorId = fieldId ? `${fieldId}-error` : undefined;
  const describedBy = [props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</span>
      <textarea {...props} ref={textareaRef} id={fieldId} aria-describedby={describedBy} aria-invalid={error ? true : undefined} aria-required={required ? true : undefined} data-testid={`textarea-${props.name}`} className={`min-h-28 w-full resize-y rounded-lg border bg-background px-3 py-2.5 text-sm leading-6 outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 ${error ? 'border-destructive' : 'border-input'} ${props.className || ''}`} />
      {error && <span id={errorId} data-testid={errorId} role="alert" className="mt-1 block text-xs font-bold text-destructive">{error}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  testId: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</span>
      <span className="relative block">
        <select value={value} onChange={onChange} data-testid={testId} className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2.5 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
          {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" />
      </span>
    </label>
  );
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof FolderOpen; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/60 px-5 py-12 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"><Icon size={21} /></div>
      <h3 className="font-display text-2xl text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = initialFocusRef?.current || closeButtonRef.current;
    const focusOnOpen = () => {
      if (!cancelled) focusTarget?.focus();
    };
    window.requestAnimationFrame(focusOnOpen);

    const getFocusableElements = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [],
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', handleKeyDown);
      const returnTarget = (returnFocusRef?.current?.isConnected ? returnFocusRef.current : null)
        || (fallbackFocusRef?.current?.isConnected ? fallbackFocusRef.current : null)
        || previousActiveElement;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, []);

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-7">
          <div>
            {eyebrow && <p className="font-mono-app text-[10px] font-medium uppercase tracking-[.18em] text-primary">{eyebrow}</p>}
            <h2 id="dialog-title" className="mt-1 font-display text-3xl">{title}</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog" className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"><X size={19} /></button>
        </div>
        <div className="p-5 sm:p-7">{children}</div>
      </div>
    </div>
  );
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function listSummary(items: string[], emptyLabel: string) {
  if (items.length === 0) return emptyLabel;
  if (items.length <= 3) return items.join(', ');
  return `${items.slice(0, 3).join(', ')}, and ${items.length - 3} more`;
}

function WorkspaceRestoreDialog({
  workspace,
  changedAreas,
  onCancel,
  onConfirm,
  returnFocusRef,
}: {
  workspace: WorkspaceExport;
  changedAreas: WorkspaceArea[];
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const summary = summarizeWorkspace(workspace);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const statuses = (Object.entries(summary.applications.byStatus) as [ApplicationStatus, number][])
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${statusLabels[status].toLowerCase()}${count === 1 ? '' : ' opportunities'}`)
    .join(' · ');

  return (
    <Modal title="Restore this workspace?" eyebrow="Replace local workspace" onClose={onCancel} initialFocusRef={cancelButtonRef} returnFocusRef={returnFocusRef}>
      <p className="text-sm leading-6 text-muted-foreground">
        Restoring will replace the profile, answer library, and application queue currently saved in this browser.
        Review the selected backup below before continuing.
      </p>
      {changedAreas.length > 0 && (
        <div className="mt-5 rounded-xl border border-accent/45 bg-accent/10 p-4" data-testid="workspace-restore-newer-changes-warning">
          <p className="font-bold text-foreground">Newer local changes detected</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            This backup is different from your current workspace. Restoring will replace these areas:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-bold text-foreground">
            {changedAreas.includes('profile') && <li data-testid="workspace-restore-newer-profile">Profile</li>}
            {changedAreas.includes('answers') && <li data-testid="workspace-restore-newer-answers">Answer library</li>}
            {changedAreas.includes('applications') && <li data-testid="workspace-restore-newer-applications">Application queue</li>}
          </ul>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Choose Cancel to keep all current workspace data unchanged.
          </p>
        </div>
      )}
      <div className="mt-6 space-y-3" data-testid="workspace-restore-summary">
        <div className="flex gap-3 rounded-xl border border-border bg-secondary/45 p-4" data-testid="workspace-restore-profile-summary">
          <UserRound size={18} className="mt-0.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-mono-app text-[10px] uppercase tracking-[.15em] text-muted-foreground">Profile</p>
            <p className="mt-1 font-bold">{summary.profile.displayName}</p>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {summary.profile.email || 'No email saved'} · {summary.profile.filledFields} of {summary.profile.totalFields} fields filled
            </p>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl border border-border bg-secondary/45 p-4" data-testid="workspace-restore-answers-summary">
          <Clipboard size={18} className="mt-0.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-mono-app text-[10px] uppercase tracking-[.15em] text-muted-foreground">Answer library</p>
            <p className="mt-1 font-bold">{countLabel(summary.answers.count, 'saved answer')}</p>
            <p className="mt-1 break-words text-sm text-muted-foreground">{listSummary(summary.answers.titles, 'No saved answers')}</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl border border-border bg-secondary/45 p-4" data-testid="workspace-restore-applications-summary">
          <BriefcaseBusiness size={18} className="mt-0.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-mono-app text-[10px] uppercase tracking-[.15em] text-muted-foreground">Application queue</p>
            <p className="mt-1 font-bold">{countLabel(summary.applications.count, 'opportunity', 'opportunities')}</p>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {listSummary(summary.applications.labels, 'No saved opportunities')}
              {statuses && <span className="mt-1 block">{statuses}</span>}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-5 rounded-lg border border-accent/35 bg-accent/10 px-3.5 py-3 text-sm leading-6 text-foreground">
        Your current workspace stays unchanged until you confirm.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button ref={cancelButtonRef} type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-restore-workspace">Cancel</Button>
        <Button type="button" onClick={onConfirm} data-testid="button-confirm-restore-workspace"><Check size={16} /> Restore workspace</Button>
      </div>
    </Modal>
  );
}

function AppShell({ children, profile }: { children: ReactNode; profile: Profile }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = [
    { href: '/', label: 'Today', icon: Home },
    { href: '/applications', label: 'Applications', icon: BriefcaseBusiness },
    { href: '/answers', label: 'Answer library', icon: Clipboard },
    { href: '/profile', label: 'Profile', icon: UserRound },
    { href: '/assist', label: 'Browser assist', icon: RefreshCw },
  ];
  return (
    <div className="shell-grain min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur-md lg:hidden">
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-mobile-logo">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">E</span>
          <span className="font-display text-xl">EscapeHatch</span>
        </Link>
        <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" data-testid="button-toggle-nav" className="rounded-lg p-2 hover:bg-secondary"><Menu size={21} /></button>
      </header>
      {menuOpen && <div className="fixed inset-x-0 top-16 z-30 border-b border-border bg-card p-3 shadow-md lg:hidden">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} data-testid={`link-mobile-${label.toLowerCase().replaceAll(' ', '-')}`} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold ${location === href ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}><Icon size={17} />{label}</Link>)}</div>}
      <aside className="fixed inset-y-0 left-0 hidden w-[244px] flex-col border-r border-border bg-card/55 px-5 py-6 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2" data-testid="link-sidebar-logo">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-extrabold text-primary-foreground">E</span>
          <span className="font-display text-[22px]">EscapeHatch</span>
        </Link>
        <p className="mt-2 px-2 font-mono-app text-[9px] uppercase tracking-[.16em] text-muted-foreground">your application cockpit</p>
        <nav className="mt-12 space-y-1.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return <Link key={href} href={href} data-testid={`link-sidebar-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}><Icon size={17} className={active ? 'text-primary' : ''} />{label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}</Link>;
          })}
        </nav>
        <div className="mt-auto rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /><span className="text-xs font-bold">Local by default</span></div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Your profile and notes stay in this browser. You choose what leaves it.</p>
        </div>
        <div className="mt-4 flex items-center gap-3 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/25 font-mono-app text-xs font-medium text-foreground">{initials(profile)}</span>
          <div className="min-w-0"><p className="truncate text-xs font-bold">{displayName(profile)}</p><p className="font-mono-app text-[10px] text-muted-foreground">private workspace</p></div>
        </div>
      </aside>
      <main className="lg:pl-[244px]">
        <div className="mx-auto w-full max-w-[1230px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</div>
      </main>
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div><p className="font-mono-app text-[10px] font-medium uppercase tracking-[.2em] text-primary">{eyebrow}</p><h1 className="mt-2 font-display text-4xl leading-tight tracking-[-.02em] sm:text-5xl">{title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p></div>
    {action}
  </div>;
}

function HomePage({ profile, answers, applications, setApplications }: { profile: Profile; answers: AnswerSnippet[]; applications: Application[]; setApplications: React.Dispatch<React.SetStateAction<Application[]>> }) {
  const completion = profileCompletion(profile);
  const active = applications.filter((application) => application.status !== 'closed');
  const next = active.find((application) => application.status !== 'applied' && application.nextAction.trim()) || active.find((application) => application.status !== 'applied') || active[0];
  const [appliedUndo, setAppliedUndo] = useState<{ applicationId: string; company: string; previousStatus: ApplicationStatus } | null>(null);
  useEffect(() => {
    if (!appliedUndo) return;
    const timeout = window.setTimeout(() => setAppliedUndo(null), HOME_STATUS_UNDO_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [appliedUndo]);
  const markApplied = (application: Application) => {
    setApplications((items) => items.map((item) => item.id === application.id ? { ...item, status: 'applied', updatedAt: now() } : item));
    setAppliedUndo({ applicationId: application.id, company: application.company, previousStatus: application.status });
  };
  const undoMarkApplied = () => {
    if (!appliedUndo) return;
    setApplications((items) => items.map((item) => item.id === appliedUndo.applicationId ? { ...item, status: appliedUndo.previousStatus, updatedAt: now() } : item));
    setAppliedUndo(null);
  };
  return <div>
    <PageIntro eyebrow="Wednesday · your cockpit" title={profile.first_name ? `Keep going, ${displayName(profile)}.` : 'Make room for momentum.'} description="A small, private place to move one good opportunity forward at a time." />
    <div className="grid gap-4 md:grid-cols-[1.35fr_.65fr]">
      <section className="animate-rise rounded-2xl bg-primary p-6 text-primary-foreground shadow-md sm:p-8">
        <div className="flex items-start justify-between gap-4"><div><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-primary-foreground/65">one useful thing</p><h2 className="mt-3 max-w-lg font-display text-3xl leading-tight sm:text-4xl">{next ? `Move ${next.company} one step closer.` : 'Add one opportunity to your queue.'}</h2></div><span className="rounded-full border border-primary-foreground/20 px-3 py-1 font-mono-app text-[10px] uppercase tracking-widest text-primary-foreground/70">next</span></div>
        {next ? <div className="mt-8 flex flex-col gap-4 rounded-xl bg-primary-foreground/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{next.nextAction || `Review the ${next.role} opportunity`}</p><p className="mt-1 text-xs text-primary-foreground/65">{next.company} · {next.role}</p></div>{next.status === 'applied' ? <span className="shrink-0 rounded-lg border border-primary-foreground/20 px-3.5 py-2.5 text-sm font-bold text-primary-foreground/80">Applied</span> : <Button variant="quiet" onClick={() => markApplied(next)} data-testid={`button-progress-${next.id}`} className="shrink-0">Mark applied <ArrowRight size={15} /></Button>}</div> : <Link href="/applications" data-testid="link-add-first-application" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-bold text-foreground transition hover:brightness-95">Add an opportunity <ArrowRight size={15} /></Link>}
        {appliedUndo && <div role="status" aria-live="polite" data-testid="home-applied-undo-notice" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3 text-sm"><span>Marked {appliedUndo.company} applied.</span><Button type="button" variant="quiet" onClick={undoMarkApplied} data-testid="button-undo-mark-applied">Undo</Button></div>}
      </section>
      <section className="animate-rise-delay-1 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-muted-foreground">profile readiness</p><p className="mt-5 font-display text-5xl">{completion}<span className="text-2xl text-muted-foreground">%</span></p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 text-accent-foreground"><UserRound size={19} /></div></div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(completion, 2)}%` }} /></div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{completion === 100 ? 'Ready when you are.' : 'Complete the reusable details once. Reuse them everywhere.'}</p>
        <Link href="/profile" data-testid="link-home-profile" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">{completion === 100 ? 'Review profile' : 'Finish profile'} <ArrowRight size={15} /></Link>
      </section>
    </div>
    <div className="mt-10 grid gap-4 md:grid-cols-3">
       {[{ label: 'In motion', value: active.filter((item) => item.status !== 'saved').length, caption: 'applications beyond saved', href: '/applications' }, { label: 'On deck', value: active.filter((item) => item.status === 'saved').length, caption: 'opportunities to explore', href: '/applications' }, { label: 'Reusable answers', value: answers.length, caption: 'answers ready to borrow', href: '/answers' }].map((stat, index) => <Link href={stat.href} data-testid={`link-stat-${index}`} key={stat.label} className="animate-rise-delay-2 rounded-xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md"><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">{stat.label}</p><p className="mt-4 font-display text-4xl">{stat.value}</p><p className="mt-1 text-xs text-muted-foreground">{stat.caption}</p></Link>)}
    </div>
    <div className="mt-10 flex flex-col gap-5 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">quiet reminder</p><p className="mt-2 font-display text-2xl">You do not have to finish the whole search today.</p></div>
      <p className="max-w-xs text-sm leading-6 text-muted-foreground sm:text-right">EscapeHatch never submits anything for you. It just keeps the repeatable parts close at hand.</p>
    </div>
  </div>;
}

function ProfilePage({
  profile,
  answers,
  applications,
  setProfile,
  setAnswers,
  setApplications,
  onRestoreWorkspace,
  draftRecoverySeconds,
  setDraftRecoverySeconds,
}: {
  profile: Profile;
  answers: AnswerSnippet[];
  applications: Application[];
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  setAnswers: React.Dispatch<React.SetStateAction<AnswerSnippet[]>>;
  setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
  onRestoreWorkspace: (workspace: WorkspaceExport) => boolean;
  draftRecoverySeconds: DraftRecoverySeconds;
  setDraftRecoverySeconds: React.Dispatch<React.SetStateAction<DraftRecoverySeconds>>;
}) {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [workspaceImportFeedback, setWorkspaceImportFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingWorkspace, setPendingWorkspace] = useState<WorkspaceExport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const workspaceFileRef = useRef<HTMLInputElement>(null);
  const restoreWorkspaceButtonRef = useRef<HTMLButtonElement>(null);
  const completion = profileCompletion(draft);
  useEffect(() => setDraft(profile), [profile]);
  const update = (key: keyof Profile) => (event: ChangeEvent<HTMLInputElement>) => setDraft((value) => ({ ...value, [key]: event.target.value }));
  const save = (event: FormEvent) => { event.preventDefault(); setProfile(draft); setSaved(true); window.setTimeout(() => setSaved(false), 1800); };
  const exportData = () => { const blob = new Blob([serializeProfileExport(draft)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'escape-hatch-profile.json'; anchor.click(); URL.revokeObjectURL(url); };
  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseProfileExportText(String(reader.result));
      if (result.ok) {
        setDraft(result.profile);
        setImportFeedback({ type: 'success', text: 'Profile imported. Review the details, then save your profile.' });
      } else {
        setImportFeedback({ type: 'error', text: result.error });
      }
    };
    reader.onerror = () => setImportFeedback({ type: 'error', text: 'The profile file could not be read.' });
    reader.readAsText(file);
    event.target.value = '';
  };
  const exportWorkspace = () => {
    const blob = new Blob([serializeWorkspaceExport(draft, answers, applications)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'escape-hatch-workspace.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importWorkspace = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseWorkspaceExportText(String(reader.result));
      if (result.ok) {
        setWorkspaceImportFeedback(null);
        setPendingWorkspace(result.workspace);
      } else {
        setPendingWorkspace(null);
        setWorkspaceImportFeedback({ type: 'error', text: result.error });
      }
    };
    reader.onerror = () => setWorkspaceImportFeedback({ type: 'error', text: 'The workspace backup could not be read.' });
    reader.readAsText(file);
    event.target.value = '';
  };
  const confirmWorkspaceImport = () => {
    if (!pendingWorkspace) return;
    const restoredWorkspace = pendingWorkspace;
    const persisted = onRestoreWorkspace(restoredWorkspace);
    setDraft(pendingWorkspace.profile);
    setPendingWorkspace(null);
    setWorkspaceImportFeedback(
      persisted
        ? { type: 'success', text: 'Workspace restored. Your profile, answers, and applications are back.' }
        : {
            type: 'error',
            text: 'Workspace restored in this tab, but it could not be saved to this browser. Your changes are still visible for now, but they will be lost if you reload or leave. Browser storage may be unavailable or full; export a backup before continuing.',
          },
    );
  };
  return <div>
      <PageIntro eyebrow="Reusable profile" title="Your details, once." description="Keep the information applications ask for in one calm, editable place. Nothing is sent anywhere from here." action={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" type="button" onClick={exportWorkspace} data-testid="button-export-workspace"><FileDown size={16} /> Back up workspace</Button><Button ref={restoreWorkspaceButtonRef} variant="outline" type="button" onClick={() => workspaceFileRef.current?.click()} data-testid="button-import-workspace"><FileUp size={16} /> Restore workspace</Button><Button variant="outline" type="button" onClick={exportData} data-testid="button-export-profile"><FileDown size={16} /> Export profile</Button><Button variant="outline" type="button" onClick={() => fileRef.current?.click()} data-testid="button-import-profile"><FileUp size={16} /> Import profile</Button><input ref={fileRef} type="file" accept="application/json,.json" onChange={importData} className="hidden" data-testid="input-import-profile" /><input ref={workspaceFileRef} type="file" accept="application/json,.json" onChange={importWorkspace} className="hidden" data-testid="input-import-workspace" /></div>} />
     {importFeedback && <p role="alert" aria-live="polite" data-testid="profile-import-feedback" className={`mb-5 rounded-lg border px-4 py-3 text-sm font-bold ${importFeedback.type === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-primary/25 bg-primary/5 text-primary'}`}>{importFeedback.text}</p>}
     {workspaceImportFeedback && <p role="alert" aria-live="polite" data-testid="workspace-import-feedback" className={`mb-5 rounded-lg border px-4 py-3 text-sm font-bold ${workspaceImportFeedback.type === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-primary/25 bg-primary/5 text-primary'}`}>{workspaceImportFeedback.text}</p>}
    <form onSubmit={save} className="grid gap-5 lg:grid-cols-[1fr_285px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="mb-6 flex items-start justify-between"><div><h2 className="font-display text-2xl">Name & contact</h2><p className="mt-1 text-sm text-muted-foreground">How you want to show up on an application.</p></div><UserRound size={20} className="text-primary" /></div><div className="grid gap-4 sm:grid-cols-[105px_1fr_1fr]"><Field label="Prefix" name="name_prefix" value={draft.name_prefix} onChange={update('name_prefix')} placeholder="Ms." data-testid="input-name-prefix" /><Field label="First name" name="first_name" value={draft.first_name} onChange={update('first_name')} placeholder="First" required data-testid="input-first-name" /><Field label="Last name" name="last_name" value={draft.last_name} onChange={update('last_name')} placeholder="Last" required data-testid="input-last-name" /></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Preferred name" name="preferred_name" value={draft.preferred_name} onChange={update('preferred_name')} placeholder="What should we call you?" data-testid="input-preferred-name" /><Field label="Email" name="email" type="email" value={draft.email} onChange={update('email')} placeholder="you@example.com" required data-testid="input-profile-email" /><Field label="Phone" name="phone" value={draft.phone} onChange={update('phone')} placeholder="+1 555 000 0000" data-testid="input-profile-phone" /><Field label="Phone authority" name="phone_authority" value={draft.phone_authority} onChange={update('phone_authority')} placeholder="Mobile, home, work..." data-testid="input-phone-authority" /></div></section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="mb-6 flex items-start justify-between"><div><h2 className="font-display text-2xl">Online & location</h2><p className="mt-1 text-sm text-muted-foreground">Useful context for forms and recruiter follow-up.</p></div><Link2 size={20} className="text-primary" /></div><div className="grid gap-4"><Field label="LinkedIn URL" name="linkedin_url" type="url" value={draft.linkedin_url} onChange={update('linkedin_url')} placeholder="linkedin.com/in/your-name" data-testid="input-linkedin-url" /><Field label="Street address" name="street_address" value={draft.street_address} onChange={update('street_address')} placeholder="Optional" data-testid="input-street-address" /></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="City" name="city" value={draft.city} onChange={update('city')} placeholder="City" data-testid="input-city" /><Field label="Region / state" name="region" value={draft.region} onChange={update('region')} placeholder="Region" data-testid="input-region" /><Field label="Postal code" name="postal_code" value={draft.postal_code} onChange={update('postal_code')} placeholder="Postal code" data-testid="input-postal-code" /><Field label="Country" name="country" value={draft.country} onChange={update('country')} placeholder="Country" data-testid="input-country" /></div></section>
        <div className="flex items-center justify-end gap-3"><span className={`text-sm font-bold text-primary transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`}><Check size={15} className="mr-1 inline" />Saved locally</span><Button type="submit" data-testid="button-save-profile">Save profile <ArrowRight size={15} /></Button></div>
      </div>
      <aside className="h-fit rounded-2xl border border-border bg-secondary/55 p-5 sm:p-6 lg:sticky lg:top-8"><div className="flex items-center justify-between"><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">readiness</p><span className="font-mono-app text-sm text-primary">{completion}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(completion, 2)}%` }} /></div><p className="mt-5 text-sm leading-6 text-muted-foreground">{completion < 100 ? 'A few essentials make copying details into a form much faster.' : 'Everything essential is in place. Nice work.'}</p><div className="mt-6 border-t border-border pt-5"><div className="flex gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" /><p className="text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Private by design.</strong> This profile is stored in this browser's local storage. Export it when you want a backup; delete it whenever you want.</p></div></div></aside>
    </form>
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" data-testid="draft-recovery-settings">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">Draft recovery</p>
          <h2 className="mt-2 font-display text-2xl">Give yourself more time</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Choose how long an unsaved answer or opportunity draft stays available after you close its form. This preference applies to drafts dismissed afterward; an open notice keeps its original deadline. It is stored only in this browser.</p>
        </div>
        <label className="block w-full sm:max-w-[180px]">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">Recovery window</span>
          <select
            value={draftRecoverySeconds}
            onChange={(event) => {
              const next = parseDraftRecoveryStorage(Number(event.target.value));
              if (next !== null) setDraftRecoverySeconds(next);
            }}
            data-testid="select-draft-recovery-duration"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            {DRAFT_RECOVERY_OPTIONS.map((seconds) => <option key={seconds} value={seconds}>{formatRecoveryDuration(seconds)}</option>)}
          </select>
        </label>
      </div>
    </section>
      {pendingWorkspace && <WorkspaceRestoreDialog workspace={pendingWorkspace} changedAreas={getWorkspaceChangedAreas({ profile: draft, answers, applications }, pendingWorkspace)} onCancel={() => setPendingWorkspace(null)} onConfirm={confirmWorkspaceImport} returnFocusRef={restoreWorkspaceButtonRef} />}
  </div>;
}

function AnswerCard({ answer, onEdit, onDelete }: { answer: AnswerSnippet; onEdit: () => void; onDelete: () => void }) {
  const { copied, copy } = useCopy();
  return <article className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"><div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-accent/15 px-2.5 py-1 font-mono-app text-[10px] uppercase tracking-wide text-accent-foreground">{answer.category}</span><h3 className="mt-4 font-display text-2xl leading-tight">{answer.title}</h3></div><div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"><button type="button" onClick={onEdit} aria-label={`Edit ${answer.title}`} data-testid={`button-edit-answer-${answer.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil size={15} /></button><button type="button" onClick={onDelete} aria-label={`Delete ${answer.title}`} data-testid={`button-delete-answer-${answer.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={15} /></button></div></div><p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{answer.content}</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="font-mono-app text-[10px] text-muted-foreground">updated {formatUpdated(answer.updatedAt)}</span><Button type="button" variant={copied === answer.id ? 'quiet' : 'outline'} onClick={() => copy(answer.content, answer.id)} data-testid={`button-copy-answer-${answer.id}`}>{copied === answer.id ? <><ClipboardCheck size={15} />Copied</> : <><Clipboard size={15} />Copy answer</>}</Button></div></article>;
}

function AnswersPage({
  answers,
  setAnswers,
  dismissedDraft,
  setDismissedDraft,
  draftExpiryAnnouncement,
  onDraftStarted,
  draftRecoverySeconds,
  draftRecoveryWindowSeconds,
}: {
  answers: AnswerSnippet[];
  setAnswers: React.Dispatch<React.SetStateAction<AnswerSnippet[]>>;
  dismissedDraft: DismissedAnswerDraft | null;
  setDismissedDraft: React.Dispatch<React.SetStateAction<DismissedAnswerDraft | null>>;
  draftExpiryAnnouncement: string;
  onDraftStarted: () => void;
  draftRecoverySeconds: number;
  draftRecoveryWindowSeconds: DraftRecoverySeconds;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [editing, setEditing] = useState<AnswerSnippet | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formAnnouncement, setFormAnnouncement] = useState('');
  const [deleted, setDeleted] = useState<{ item: AnswerSnippet; index: number } | null>(null);
  const pageAddButtonRef = useRef<HTMLButtonElement>(null);
  const formReturnFocusRef = useRef<HTMLElement | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<AnswerDraft | undefined>(undefined);
  const openForm = (answer: AnswerSnippet | null, draft?: AnswerDraft) => {
    formReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onDraftStarted();
    setFormAnnouncement('');
    setEditing(answer);
    setRecoveredDraft(draft);
    setShowForm(true);
  };
  const filtered = useMemo(() => answers.filter((answer) => (category === 'All' || answer.category === category) && `${answer.title} ${answer.content}`.toLowerCase().includes(search.toLowerCase())), [answers, category, search]);
  useEffect(() => {
    if (!deleted) return;
    const timeout = window.setTimeout(() => setDeleted(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [deleted]);
  useEffect(() => {
    if (!draftExpiryAnnouncement) return;
    setFormAnnouncement(draftExpiryAnnouncement);
    window.requestAnimationFrame(() => pageAddButtonRef.current?.focus());
  }, [draftExpiryAnnouncement]);
  const remove = (id: string) => {
    if (!window.confirm('Delete this answer snippet?')) return;
    const index = answers.findIndex((item) => item.id === id);
    if (index < 0) return;
    const item = answers[index];
    setAnswers((items) => items.filter((current) => current.id !== id));
    setDeleted({ item, index });
  };
  const undo = () => {
    if (!deleted) return;
    setAnswers((items) => {
      if (items.some((item) => item.id === deleted.item.id)) return items;
      const index = Math.min(deleted.index, items.length);
      return [...items.slice(0, index), deleted.item, ...items.slice(index)];
    });
    setDeleted(null);
  };
  const closeForm = (draft: AnswerDraft) => {
    setFormAnnouncement('No changes were saved.');
    setShowForm(false);
    const changed = editing
      ? draft.title !== editing.title || draft.category !== editing.category || draft.content !== editing.content
      : Boolean(draft.title.trim() || draft.content.trim() || draft.category !== categories[0]);
    setDismissedDraft(changed ? { value: draft, answer: editing, expiresAt: getDraftRecoveryDeadline(draftRecoveryWindowSeconds) } : null);
  };
  const saveAnswer = (value: Omit<AnswerSnippet, 'id' | 'updatedAt'>) => {
    setAnswers((items) => editing ? items.map((item) => item.id === editing.id ? { ...item, ...value, updatedAt: now() } : item) : [{ ...value, id: uid(), updatedAt: now() }, ...items]);
    setFormAnnouncement('Answer saved.');
    setShowForm(false);
    setRecoveredDraft(undefined);
  };
  const recoverDraft = () => {
    if (!dismissedDraft) return;
    if (dismissedDraft.expiresAt <= Date.now()) {
      setDismissedDraft(null);
      setFormAnnouncement('Your unsaved answer draft is no longer available.');
      window.requestAnimationFrame(() => pageAddButtonRef.current?.focus());
      return;
    }
    openForm(dismissedDraft.answer, dismissedDraft.value);
    setDismissedDraft(null);
    setFormAnnouncement('Your saved answer draft was reopened.');
  };
  const discardDraft = () => {
    setDismissedDraft(null);
    setFormAnnouncement('Unsaved answer draft discarded.');
  };
  return <div>
    <PageIntro eyebrow="Answer library" title="Say it once. Reuse it well." description="Keep your best thinking close by for the questions that come around again and again." action={<Button ref={pageAddButtonRef} onClick={() => openForm(null)} data-testid="button-add-answer"><Plus size={16} /> New answer</Button>} />
    <div role="status" aria-live="polite" aria-atomic="true" data-testid="answer-form-announcement" className="sr-only">{formAnnouncement}</div>
    {dismissedDraft && dismissedDraft.expiresAt > Date.now() && <div role="status" aria-live="polite" data-testid="answer-draft-notice" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/35 bg-accent/10 px-4 py-3 text-sm"><span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span>You have an unsaved answer draft.</span><span data-testid="answer-draft-recovery-time">Recovery available for {formatRecoveryDuration(draftRecoverySeconds)}</span></span><span className="flex items-center gap-2"><Button type="button" onClick={recoverDraft} data-testid="button-recover-answer-draft">Recover draft</Button><Button type="button" variant="quiet" onClick={discardDraft} data-testid="button-discard-answer-draft">Discard</Button></span></div>}
    {deleted && <div role="status" aria-live="polite" data-testid="answer-undo-notice" className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm"><span>Answer deleted.</span><Button type="button" variant="outline" onClick={undo} data-testid="button-undo-answer">Undo</Button></div>}
    <div className="mb-6 flex flex-col gap-3 sm:flex-row"><label className="relative block flex-1"><Search size={17} className="absolute left-3 top-3 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your answers" data-testid="input-search-answers" className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-secondary p-1">{['All', ...categories].map((item) => <button type="button" key={item} onClick={() => setCategory(item)} data-testid={`button-filter-${item.toLowerCase().replaceAll(' ', '-')}`} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition ${category === item ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{item}</button>)}</div></div>
    {filtered.length === 0 ? <EmptyState icon={Clipboard} title={answers.length ? 'No matches here.' : 'Your good answers belong here.'} body={answers.length ? 'Try another search or category, or clear the filter.' : 'Save the thoughtful parts of applications once, then borrow them when time is tight.'} action={!answers.length ? <Button onClick={() => openForm(null)} data-testid="button-empty-add-answer"><Plus size={16} /> Add your first answer</Button> : undefined} /> : <div className="grid gap-4 lg:grid-cols-2">{filtered.map((answer) => <AnswerCard key={answer.id} answer={answer} onEdit={() => openForm(answer)} onDelete={() => remove(answer.id)} />)}</div>}
    {showForm && <AnswerForm answer={editing} initialDraft={recoveredDraft} returnFocusRef={formReturnFocusRef} fallbackFocusRef={pageAddButtonRef} onClose={closeForm} onSave={saveAnswer} />}
  </div>;
}

function AnswerForm({ answer, initialDraft, returnFocusRef, fallbackFocusRef, onClose, onSave }: { answer: AnswerSnippet | null; initialDraft?: AnswerDraft; returnFocusRef: React.RefObject<HTMLElement | null>; fallbackFocusRef: React.RefObject<HTMLElement | null>; onClose: (draft: AnswerDraft) => void; onSave: (value: AnswerDraft) => void }) {
  const [title, setTitle] = useState(initialDraft?.title ?? answer?.title ?? '');
  const [category, setCategory] = useState(initialDraft?.category ?? answer?.category ?? categories[0]);
  const [content, setContent] = useState(initialDraft?.content ?? answer?.content ?? '');
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const clearError = (key: 'title' | 'content') => setErrors((current) => {
    if (!current[key]) return current;
    const next = { ...current };
    delete next[key];
    return next;
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = {
      ...(title.trim() ? {} : { title: 'Add a short title before saving.' }),
      ...(content.trim() ? {} : { content: 'Write an answer before saving.' }),
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.requestAnimationFrame(() => {
        if (!title.trim()) titleRef.current?.focus();
        else contentRef.current?.focus();
      });
      return;
    }
    onSave({ title: title.trim(), category, content: content.trim() });
  };
  const dismiss = () => onClose({ title, category, content });
  return <Modal title={answer ? 'Edit answer' : 'New answer'} eyebrow="Answer library" onClose={dismiss} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}><form onSubmit={submit} className="space-y-5"><Field label="Short title" name="answer-title" value={title} onChange={(event) => { setTitle(event.target.value); if (event.target.value.trim()) clearError('title'); }} placeholder="Why I am interested in this kind of work" required inputRef={titleRef} error={errors.title} data-testid="input-answer-title" /><SelectField label="Category" value={category} onChange={(event) => setCategory(event.target.value)} options={categories.map((item) => ({ value: item, label: item }))} testId="select-answer-category" /><TextArea label="Your answer" name="answer-content" value={content} onChange={(event) => { setContent(event.target.value); if (event.target.value.trim()) clearError('content'); }} placeholder="Write it in your own voice. It does not need to be perfect." required textareaRef={contentRef} error={errors.content} data-testid="textarea-answer-content" /><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={dismiss} data-testid="button-cancel-answer">Cancel</Button><Button type="submit" data-testid="button-save-answer"><Check size={16} /> Save answer</Button></div></form></Modal>;
}

function statusTone(status: ApplicationStatus) {
  return status === 'applied' ? 'bg-primary/12 text-primary' : status === 'follow_up' ? 'bg-accent/20 text-accent-foreground' : status === 'closed' ? 'bg-muted text-muted-foreground' : 'bg-secondary text-secondary-foreground';
}

function ApplicationRow({ application, onEdit, onDelete }: { application: Application; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return <article className={`rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md ${application.status === 'closed' ? 'opacity-70' : ''}`}><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${application.priority === 'high' ? 'bg-accent/20 text-accent-foreground' : 'bg-secondary text-primary'}`}><BriefcaseBusiness size={18} /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-display text-2xl">{application.company}</h3><span className={`rounded-full px-2.5 py-1 font-mono-app text-[10px] uppercase tracking-wide ${statusTone(application.status)}`}>{statusLabels[application.status]}</span></div><p className="mt-1 truncate text-sm text-muted-foreground">{application.role}</p>{application.nextAction && <p className="mt-3 text-xs font-bold text-foreground"><span className="mr-1.5 text-primary">Next:</span>{application.nextAction}</p>}</div></div><div className="flex items-center gap-2 sm:shrink-0"><button type="button" onClick={() => setExpanded(!expanded)} data-testid={`button-expand-application-${application.id}`} className="rounded-lg px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-foreground">{expanded ? 'Hide details' : 'Details'}</button><Button type="button" variant="outline" onClick={onEdit} data-testid={`button-edit-application-${application.id}`}><Pencil size={14} /> Edit</Button></div></div>{expanded && <div className="border-t border-border bg-secondary/35 px-5 py-5 sm:px-6"><div className="grid gap-5 sm:grid-cols-2"><div><p className="font-mono-app text-[10px] uppercase tracking-[.14em] text-muted-foreground">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{application.notes || 'No notes yet.'}</p></div><div><p className="font-mono-app text-[10px] uppercase tracking-[.14em] text-muted-foreground">Opportunity link</p>{application.url ? <a href={application.url} target="_blank" rel="noreferrer" data-testid={`link-application-url-${application.id}`} className="mt-2 inline-flex items-center gap-1.5 break-all text-sm font-bold text-primary hover:underline">{application.url}<ExternalLink size={13} /></a> : <p className="mt-2 text-sm text-muted-foreground">No link added.</p>}<p className="mt-5 font-mono-app text-[10px] text-muted-foreground">updated {formatUpdated(application.updatedAt)}</p></div></div><div className="mt-5 flex justify-end"><Button type="button" variant="danger" onClick={onDelete} data-testid={`button-delete-application-${application.id}`}><Trash2 size={14} /> Delete opportunity</Button></div></div>}</article>;
}

function ApplicationsPage({
  applications,
  setApplications,
  dismissedDraft,
  setDismissedDraft,
  draftExpiryAnnouncement,
  onDraftStarted,
  draftRecoverySeconds,
  draftRecoveryWindowSeconds,
}: {
  applications: Application[];
  setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
  dismissedDraft: DismissedApplicationDraft | null;
  setDismissedDraft: React.Dispatch<React.SetStateAction<DismissedApplicationDraft | null>>;
  draftExpiryAnnouncement: string;
  onDraftStarted: () => void;
  draftRecoverySeconds: number;
  draftRecoveryWindowSeconds: DraftRecoverySeconds;
}) {
  const [filter, setFilter] = useState<'all' | ApplicationStatus>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Application | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formAnnouncement, setFormAnnouncement] = useState('');
  const [deleted, setDeleted] = useState<{ item: Application; index: number } | null>(null);
  const pageAddButtonRef = useRef<HTMLButtonElement>(null);
  const activeFilterButtonRef = useRef<HTMLButtonElement>(null);
  const formReturnFocusRef = useRef<HTMLElement | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<ApplicationDraft | undefined>(undefined);
  const openForm = (application: Application | null, draft?: ApplicationDraft) => {
    formReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onDraftStarted();
    setFormAnnouncement('');
    setEditing(application);
    setRecoveredDraft(draft);
    setShowForm(true);
  };
  const filtered = useMemo(() => applications.filter((application) => (filter === 'all' || application.status === filter) && `${application.company} ${application.role} ${application.notes}`.toLowerCase().includes(search.toLowerCase())), [applications, filter, search]);
  useEffect(() => {
    if (!deleted) return;
    const timeout = window.setTimeout(() => setDeleted(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [deleted]);
  useEffect(() => {
    if (!draftExpiryAnnouncement) return;
    setFormAnnouncement(draftExpiryAnnouncement);
    window.requestAnimationFrame(() => pageAddButtonRef.current?.focus());
  }, [draftExpiryAnnouncement]);
  const remove = (id: string) => {
    if (!window.confirm('Delete this opportunity from your queue?')) return;
    const index = applications.findIndex((item) => item.id === id);
    if (index < 0) return;
    const item = applications[index];
    setApplications((items) => items.filter((current) => current.id !== id));
    setDeleted({ item, index });
  };
  const undo = () => {
    if (!deleted) return;
    setApplications((items) => {
      if (items.some((item) => item.id === deleted.item.id)) return items;
      const index = Math.min(deleted.index, items.length);
      return [...items.slice(0, index), deleted.item, ...items.slice(index)];
    });
    setDeleted(null);
  };
  const closeForm = (draft: ApplicationDraft) => {
    setFormAnnouncement('No changes were saved.');
    setShowForm(false);
    const changed = editing
      ? draft.company !== editing.company
        || draft.role !== editing.role
        || draft.url !== editing.url
        || draft.status !== editing.status
        || draft.priority !== editing.priority
        || draft.notes !== editing.notes
        || draft.nextAction !== editing.nextAction
      : Boolean(draft.company.trim() || draft.role.trim() || draft.url.trim() || draft.nextAction.trim() || draft.notes.trim() || draft.status !== 'saved' || draft.priority !== 'normal');
    setDismissedDraft(changed ? { value: draft, application: editing, expiresAt: getDraftRecoveryDeadline(draftRecoveryWindowSeconds) } : null);
  };
  const saveApplication = (value: Omit<Application, 'id' | 'updatedAt'>) => {
    setApplications((items) => editing ? items.map((item) => item.id === editing.id ? { ...item, ...value, updatedAt: now() } : item) : [{ ...value, id: uid(), updatedAt: now() }, ...items]);
    setFormAnnouncement('Opportunity saved.');
    setShowForm(false);
    setRecoveredDraft(undefined);
  };
  const recoverDraft = () => {
    if (!dismissedDraft) return;
    if (dismissedDraft.expiresAt <= Date.now()) {
      setDismissedDraft(null);
      setFormAnnouncement('Your unsaved opportunity draft is no longer available.');
      window.requestAnimationFrame(() => pageAddButtonRef.current?.focus());
      return;
    }
    openForm(dismissedDraft.application, dismissedDraft.value);
    setDismissedDraft(null);
    setFormAnnouncement('Your saved opportunity draft was reopened.');
  };
  const discardDraft = () => {
    setDismissedDraft(null);
    setFormAnnouncement('Unsaved opportunity draft discarded.');
  };
  return <div>
    <PageIntro eyebrow="Application queue" title="Keep the queue small." description="A short list you can actually move through is more useful than a perfect list you never open." action={<Button ref={pageAddButtonRef} onClick={() => openForm(null)} data-testid="button-add-application"><Plus size={16} /> Add opportunity</Button>} />
    <div role="status" aria-live="polite" aria-atomic="true" data-testid="application-form-announcement" className="sr-only">{formAnnouncement}</div>
    {dismissedDraft && dismissedDraft.expiresAt > Date.now() && <div role="status" aria-live="polite" data-testid="application-draft-notice" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/35 bg-accent/10 px-4 py-3 text-sm"><span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span>You have an unsaved opportunity draft.</span><span data-testid="application-draft-recovery-time">Recovery available for {formatRecoveryDuration(draftRecoverySeconds)}</span></span><span className="flex items-center gap-2"><Button type="button" onClick={recoverDraft} data-testid="button-recover-application-draft">Recover draft</Button><Button type="button" variant="quiet" onClick={discardDraft} data-testid="button-discard-application-draft">Discard</Button></span></div>}
    {deleted && <div role="status" aria-live="polite" data-testid="application-undo-notice" className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm"><span>Opportunity deleted.</span><Button type="button" variant="outline" onClick={undo} data-testid="button-undo-application">Undo</Button></div>}
    <div className="mb-6 flex flex-col gap-3 sm:flex-row"><label className="relative block flex-1"><Search size={17} className="absolute left-3 top-3 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, role, or notes" data-testid="input-search-applications" className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-secondary p-1">{(['all', 'saved', 'preparing', 'applied', 'follow_up', 'closed'] as const).map((item) => <button ref={item === filter ? activeFilterButtonRef : undefined} type="button" key={item} onClick={() => setFilter(item)} aria-pressed={filter === item} data-testid={`button-filter-application-${item}`} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition ${filter === item ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{item === 'all' ? 'All' : statusLabels[item]}</button>)}</div></div>
    {filtered.length === 0 ? <EmptyState icon={BriefcaseBusiness} title={applications.length ? 'Nothing matches that filter.' : 'Your next move starts here.'} body={applications.length ? 'Try a different search or status.' : 'Add a role you are curious about. Keep it light: company, title, and one next action is enough.'} action={!applications.length ? <Button onClick={() => openForm(null)} data-testid="button-empty-add-application"><Plus size={16} /> Add first opportunity</Button> : undefined} /> : <div className="space-y-3">{filtered.map((application) => <ApplicationRow key={application.id} application={application} onEdit={() => openForm(application)} onDelete={() => remove(application.id)} />)}</div>}
    {showForm && <ApplicationForm application={editing} initialDraft={recoveredDraft} returnFocusRef={formReturnFocusRef} fallbackFocusRef={activeFilterButtonRef} onClose={closeForm} onSave={saveApplication} />}
  </div>;
}

function ApplicationForm({ application, initialDraft, returnFocusRef, fallbackFocusRef, onClose, onSave }: { application: Application | null; initialDraft?: ApplicationDraft; returnFocusRef: React.RefObject<HTMLElement | null>; fallbackFocusRef: React.RefObject<HTMLElement | null>; onClose: (draft: ApplicationDraft) => void; onSave: (value: ApplicationDraft) => void }) {
  const [form, setForm] = useState<ApplicationDraft>({ company: initialDraft?.company ?? application?.company ?? '', role: initialDraft?.role ?? application?.role ?? '', url: initialDraft?.url ?? application?.url ?? '', status: initialDraft?.status ?? application?.status ?? 'saved', priority: initialDraft?.priority ?? application?.priority ?? 'normal', notes: initialDraft?.notes ?? application?.notes ?? '', nextAction: initialDraft?.nextAction ?? application?.nextAction ?? '' });
  const [errors, setErrors] = useState<{ company?: string; role?: string }>({});
  const companyRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);
  const clearError = (key: 'company' | 'role') => setErrors((current) => {
    if (!current[key]) return current;
    const next = { ...current };
    delete next[key];
    return next;
  });
  const update = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    if ((key === 'company' || key === 'role') && value.trim()) clearError(key);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = {
      ...(form.company.trim() ? {} : { company: 'Add a company before saving.' }),
      ...(form.role.trim() ? {} : { role: 'Add a role before saving.' }),
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.requestAnimationFrame(() => {
        if (!form.company.trim()) companyRef.current?.focus();
        else roleRef.current?.focus();
      });
      return;
    }
    onSave({ ...form, company: form.company.trim(), role: form.role.trim() });
  };
  const dismiss = () => onClose(form);
  return <Modal title={application ? 'Edit opportunity' : 'Add opportunity'} eyebrow="Application queue" onClose={dismiss} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Company" name="company" value={form.company} onChange={update('company')} placeholder="Company name" required inputRef={companyRef} error={errors.company} data-testid="input-application-company" /><Field label="Role" name="role" value={form.role} onChange={update('role')} placeholder="Role or title" required inputRef={roleRef} error={errors.role} data-testid="input-application-role" /></div><Field label="Job link" name="url" type="url" value={form.url} onChange={update('url')} placeholder="https://..." data-testid="input-application-url" /><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Status" value={form.status} onChange={update('status')} options={(Object.keys(statusLabels) as ApplicationStatus[]).map((key) => ({ value: key, label: statusLabels[key] }))} testId="select-application-status" /><SelectField label="Priority" value={form.priority} onChange={update('priority')} options={[{ value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }]} testId="select-application-priority" /></div><Field label="Next action" name="nextAction" value={form.nextAction} onChange={update('nextAction')} placeholder="Read the role brief, ask for a referral..." data-testid="input-application-next-action" /><TextArea label="Notes" name="notes" value={form.notes} onChange={update('notes')} placeholder="What stood out? What do you want to remember?" data-testid="textarea-application-notes" /><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={dismiss} data-testid="button-cancel-application">Cancel</Button><Button type="submit" data-testid="button-save-application"><Check size={16} /> Save opportunity</Button></div></form></Modal>;
}

function AssistProgress({ session }: { session: AssistSession }) {
  const current = session.pages.find((page) => page.key === session.currentPageKey);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" data-testid="assist-session-progress">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">Observed page progress</p>
          <h2 className="mt-2 font-display text-2xl">The user stays in control</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{session.message}</p>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="assist-session-context">Origin: {session.origin || 'Not connected'} · {session.pages.length} page{session.pages.length === 1 ? '' : 's'} observed</p>
        </div>
        <span className={`rounded-full px-3 py-1 font-mono-app text-[10px] uppercase tracking-wide ${session.emergencyStopped ? 'bg-destructive/10 text-destructive' : session.paused ? 'bg-accent/20 text-accent-foreground' : 'bg-secondary text-primary'}`}>
          {session.emergencyStopped ? 'Emergency stop' : session.paused ? 'Paused' : session.active ? 'Active' : 'Not connected'}
        </span>
      </div>
      {current && <div className="mt-5 grid gap-3 sm:grid-cols-5">
        {[
          ['Filled', current.filled],
          ['Already populated', current.alreadyPopulated],
          ['Manual review', current.manualReview],
          ['Blocked', current.blocked],
          ['Unknown', current.unknown],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-secondary/55 p-3"><p className="font-mono-app text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl">{value}</p></div>)}
      </div>}
      <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">These are observations of pages the assist session has seen. A route change or filled page is never treated as an application submission or completion.</p>
    </section>
  );
}

function AssistPage({
  profile,
  answers,
  applications,
  setProfile,
  setAnswers,
  setApplications,
}: {
  profile: Profile;
  answers: AnswerSnippet[];
  applications: Application[];
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  setAnswers: React.Dispatch<React.SetStateAction<AnswerSnippet[]>>;
  setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
}) {
  const [assistProfile, setAssistProfile] = useStoredState<AssistProfile>(ASSIST_KEY, emptyAssistProfile(profile), parseAssistProfile);
  const [session, setSession] = useStoredState<AssistSession>(ASSIST_SESSION_KEY, initialSession(), parseAssistSessionStatus);
  const [assistAnswers, setAssistAnswers] = useStoredState<AssistAnswer[]>(ASSIST_ANSWERS_KEY, [], (value) => Array.isArray(value) ? value.filter((item): item is AssistAnswer => Boolean(item && typeof item === 'object' && typeof (item as AssistAnswer).id === 'string' && typeof (item as AssistAnswer).content === 'string')) : null);
  const [feedback, setFeedback] = useState('');
  const [pendingSync, setPendingSync] = useState<{ profile: AssistProfile; answers: AssistAnswer[]; baseProfile?: Profile } | null>(null);
  const [milestone, setMilestone] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionFileRef = useRef<HTMLInputElement>(null);
  const resumeImportGenerationRef = useRef(0);
  const assistProfileRef = useRef(assistProfile);
  const profileRef = useRef(profile);
  assistProfileRef.current = assistProfile;
  profileRef.current = profile;
  const currentAnswers: AssistAnswer[] = [...answers.map((answer) => ({ ...answer, scope: 'reusable' as const })), ...assistAnswers].filter((answer, index, items) => items.findIndex((item) => item.id === answer.id) === index);

  const importResume = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const generation = ++resumeImportGenerationRef.current;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = file.type === 'text/plain' || file.name.endsWith('.txt') ? String(reader.result) : await extractResumeText(file);
        if (generation !== resumeImportGenerationRef.current) return;
        const imported = parseResumeText(text, file.name);
        const currentAssistProfile = assistProfileRef.current;
        const currentProfile = profileRef.current;
        const deterministic = applyDeterministicResumeImport(imported, currentAssistProfile, currentProfile);
        const conflicts = Object.entries(deterministic.contactPatch).filter(([field, value]) => {
          const existing = currentProfile[field as keyof Profile];
          return Boolean(existing && value && existing !== value);
        });
        setAssistProfile(deterministic.profile);
        setProfile((current) => {
          const next = { ...current };
          for (const [field, value] of Object.entries(deterministic.contactPatch) as [keyof Profile, string][]) {
            if (!value) continue;
            if (!next[field] || next[field] === value) next[field] = value;
          }
          return next;
        });
        const summaryAnswer = deterministic.accepted.find((item) => item.section === 'summary' && item.field === 'professional_summary');
        if (summaryAnswer && !answers.some((answer) => answer.title === 'Professional summary')) {
          setAnswers((items) => [{ id: uid(), title: 'Professional summary', category: 'Career story', content: summaryAnswer.value, updatedAt: now() }, ...items]);
          setAssistAnswers((items) => [{ id: uid(), title: 'Professional summary', category: 'Career story', content: summaryAnswer.value, updatedAt: now(), scope: 'reusable', canonicalId: 'professional-summary' }, ...items.filter((item) => item.canonicalId !== 'professional-summary')]);
        }
        const preserved = conflicts.length ? ` ${conflicts.length} existing profile value${conflicts.length === 1 ? ' was' : 's were'} preserved because the resume disagreed.` : '';
        setFeedback(`Resume parsed locally. ${deterministic.accepted.length} deterministic value${deterministic.accepted.length === 1 ? '' : 's'} are ready with no setup step.${preserved}`);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'The resume could not be read.');
      }
    };
    reader.onerror = () => setFeedback('The resume could not be read.');
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const exportSync = () => {
    const blob = new Blob([serializeSyncPayload(assistProfile, currentAnswers, profile, 'cockpit')], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'escape-hatch-assist-sync.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback('Assist sync exported. Nothing was sent to a server.');
  };
  const importSync = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = parseSyncPayload(JSON.parse(String(reader.result)));
        if (!result.ok) { setFeedback(result.error); return; }
        setPendingSync(result.payload);
        setFeedback('Sync validated. Choose how to handle the incoming changes.');
      } catch { setFeedback('This sync file is not valid JSON.'); }
    };
    reader.onerror = () => setFeedback('The sync file could not be read.');
    reader.readAsText(file);
    event.target.value = '';
  };
  const applySync = (choice: 'keep-current' | 'use-incoming' | 'merge') => {
    if (!pendingSync) return;
    const currentPayload = JSON.parse(serializeSyncPayload(assistProfile, currentAnswers, profile, 'cockpit')) as Parameters<typeof mergeSyncPayload>[0];
    const next = mergeSyncPayload(currentPayload, { ...pendingSync, schema: 'escape-hatch-assist-sync', version: 1, exportedAt: new Date().toISOString(), source: 'recovery-import' }, choice);
    setAssistProfile(next.profile);
    if (next.baseProfile) setProfile(next.baseProfile);
    setAnswers(next.answers.map(({ scope: _scope, canonicalId: _canonicalId, opportunityId: _opportunityId, provenance: _provenance, ...answer }) => answer));
    setAssistAnswers(next.answers);
    setPendingSync(null);
    setFeedback(choice === 'keep-current' ? 'Current work kept. Incoming sync was not applied.' : 'Sync applied after your explicit choice.');
  };
  const recordMilestone = () => {
    if (!milestone) return;
    setApplications((items) => items.map((item) => item.id === milestone ? { ...item, status: 'applied', updatedAt: now() } : item));
    setFeedback('Applied milestone recorded by you. EscapeHatch did not infer it from page progress.');
  };
  const importSession = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const value = parseAssistSessionStatus(JSON.parse(String(reader.result)));
        if (!value) throw new Error('This file is not an assist session status export.');
        setSession(value);
        setFeedback('Observed assist session imported. It does not change application status.');
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'The assist session could not be imported.');
      }
    };
    reader.onerror = () => setFeedback('The assist session could not be read.');
    reader.readAsText(file);
    event.target.value = '';
  };
  const exportSession = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'escape-hatch-assist-session.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback('Assist session status exported. Profile data and application milestones were not changed.');
  };

  return <div>
     <PageIntro eyebrow="Browser assist" title="Fill the repeatable parts." description="Import a resume once and EscapeHatch deterministically builds the reusable profile locally. Then use the MV3 assistant to scan and fill one page at a time." action={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" type="button" onClick={() => fileRef.current?.click()} data-testid="button-import-resume"><FileUp size={16} /> Import resume</Button><Button variant="outline" type="button" onClick={exportSync} data-testid="button-export-assist-sync"><FileDown size={16} /> Export assist sync</Button><Button variant="outline" type="button" onClick={exportSession} data-testid="button-export-assist-session"><FileDown size={16} /> Export session status</Button><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-bold hover:bg-secondary"><FileUp size={16} /> Import session<input ref={sessionFileRef} type="file" accept="application/json,.json" onChange={importSession} className="hidden" data-testid="input-import-assist-session" /></label><input ref={fileRef} type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={importResume} className="hidden" data-testid="input-import-resume" /></div>} />
    {feedback && <p role="status" aria-live="polite" data-testid="assist-feedback" className="mb-5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-bold text-primary">{feedback}</p>}
    <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">Resume-derived local knowledge</p><h2 className="mt-2 font-display text-2xl">Ready for an application page</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Explicit resume facts become reusable data automatically. Existing non-empty profile values win on conflicts; missing or ambiguous facts are never guessed.</p></div><ShieldCheck size={21} className="text-primary" /></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ['Contact', `${[assistProfile.contact.first_name, assistProfile.contact.last_name].filter(Boolean).join(' ') || 'Not found'} · ${assistProfile.contact.email || 'No email'}`],
            ['Summary', assistProfile.summary ? 'Resume summary ready' : 'No summary found'],
            ['Skills', `${assistProfile.skills.length} reusable skills`],
            ['Experience', `${assistProfile.experience.length} resume roles`],
            ['Projects', `${assistProfile.projects.length} resume projects`],
            ['Education', `${assistProfile.education.length} resume entries`],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-secondary/55 p-4"><p className="font-mono-app text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-sm font-bold">{value}</p></div>)}
        </div>
        <div className="mt-6 border-t border-border pt-5">
          <p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">Bridge recovery</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Sync is user initiated and validated. If the extension is unavailable, export this JSON and import it from its Profile bridge panel later.</p>
       <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={exportSync}>Export assist sync</Button><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-bold hover:bg-secondary"><FileUp size={16} /> Import assist sync<input type="file" accept="application/json,.json" onChange={importSync} className="hidden" data-testid="input-import-assist-sync" /></label></div>
        </div>
      </section>
      <aside className="h-fit rounded-2xl border border-border bg-primary p-5 text-primary-foreground shadow-sm sm:p-6">
        <p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary-foreground/65">Load unpacked</p>
        <h2 className="mt-2 font-display text-2xl">Use the active tab, not automation.</h2>
        <ol className="mt-5 space-y-3 text-sm leading-6 text-primary-foreground/80"><li><strong className="text-primary-foreground">1.</strong> Open browser extensions and enable developer mode.</li><li><strong className="text-primary-foreground">2.</strong> Choose Load unpacked and select <code className="rounded bg-primary-foreground/10 px-1">browser/application-assist</code>.</li><li><strong className="text-primary-foreground">3.</strong> Export an assist sync, import it in the extension, then Start Assist on the application tab.</li></ol>
        <p className="mt-5 border-t border-primary-foreground/15 pt-4 text-xs leading-5 text-primary-foreground/65">Active-tab access only. Passwords, uploads, attestations, demographic fields, and navigation controls are blocked.</p>
      </aside>
    </div>
    {pendingSync && <section className="mt-5 rounded-2xl border border-accent/45 bg-accent/10 p-5" data-testid="assist-sync-conflict"><p className="font-bold">Incoming sync needs a choice</p><p className="mt-1 text-sm leading-6 text-muted-foreground">The incoming profile or answers differ from current work. Choose a side or merge unique entries; nothing is overwritten silently.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => applySync('keep-current')}>Keep current</Button><Button type="button" onClick={() => applySync('merge')}>Merge unique items</Button><Button type="button" onClick={() => applySync('use-incoming')}>Use incoming</Button></div></section>}
    <div className="mt-5"><AssistProgress session={session} /></div>
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-muted-foreground">Explicit milestone</p><h2 className="mt-2 font-display text-2xl">Record what you decided</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Observed pages are not applications. Choose an opportunity only when you personally want to record an applied milestone.</p></div><div className="flex gap-2"><select value={milestone} onChange={(event) => setMilestone(event.target.value)} data-testid="select-assist-milestone" className="max-w-[220px] rounded-lg border border-input bg-background px-3 py-2.5 text-sm"><option value="">Choose opportunity</option>{applications.filter((item) => item.status !== 'closed').map((item) => <option key={item.id} value={item.id}>{item.company} · {item.role}</option>)}</select><Button type="button" onClick={recordMilestone} disabled={!milestone} data-testid="button-record-assist-milestone">Record applied</Button></div></div>{session.pages.length > 0 && <div className="mt-6 space-y-2">{session.pages.map((page) => <div key={page.key} className="flex flex-col gap-1 rounded-lg bg-secondary/55 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-bold">{page.title || 'Application page'}</span><span className="text-xs text-muted-foreground">{page.status} · {page.filled} filled · {formatUpdated(page.scannedAt)}</span></div>)}</div>}</section>
  </div>;
}

function NotFoundPage() {
  return <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center"><XCircle size={34} className="text-accent" /><h1 className="mt-5 font-display text-4xl">That hatch is closed.</h1><p className="mt-2 text-sm text-muted-foreground">The page you were looking for does not exist.</p><Link href="/" data-testid="link-back-home" className="mt-6 font-bold text-primary hover:underline">Back to today</Link></div>;
}

function Router() {
  const [profile, setProfile] = useStoredState<Profile>(PROFILE_KEY, emptyProfile, parseProfileStorage);
  const [answers, setAnswers] = useStoredState<AnswerSnippet[]>(ANSWERS_KEY, [], parseAnswersStorage);
  const [applications, setApplications] = useStoredState<Application[]>(APPLICATIONS_KEY, [], parseApplicationsStorage);
  const [draftRecoverySeconds, setDraftRecoverySeconds] = useStoredState(
    DRAFT_RECOVERY_KEY,
    DEFAULT_DRAFT_RECOVERY_SECONDS,
    parseDraftRecoveryStorage,
  );
  const [dismissedAnswerDraft, setDismissedAnswerDraft] = useState<DismissedAnswerDraft | null>(null);
  const [dismissedApplicationDraft, setDismissedApplicationDraft] = useState<DismissedApplicationDraft | null>(null);
  const [answerDraftExpiryAnnouncement, setAnswerDraftExpiryAnnouncement] = useState('');
  const [applicationDraftExpiryAnnouncement, setApplicationDraftExpiryAnnouncement] = useState('');
  const answerDraftRecoverySeconds = useDraftRecoverySeconds(dismissedAnswerDraft?.expiresAt ?? null);
  const applicationDraftRecoverySeconds = useDraftRecoverySeconds(dismissedApplicationDraft?.expiresAt ?? null);
  useEffect(() => {
    if (!dismissedAnswerDraft) return;
    const remainingMs = Math.max(0, dismissedAnswerDraft.expiresAt - Date.now());
    const expire = () => {
      if (dismissedAnswerDraft.expiresAt > Date.now()) return;
      setDismissedAnswerDraft(null);
      setAnswerDraftExpiryAnnouncement('Your unsaved answer draft is no longer available.');
    };
    const timeout = window.setTimeout(expire, remainingMs);
    document.addEventListener('visibilitychange', expire);
    window.addEventListener('focus', expire);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', expire);
      window.removeEventListener('focus', expire);
    };
  }, [dismissedAnswerDraft, draftRecoverySeconds]);
  useEffect(() => {
    if (!dismissedApplicationDraft) return;
    const remainingMs = Math.max(0, dismissedApplicationDraft.expiresAt - Date.now());
    const expire = () => {
      if (dismissedApplicationDraft.expiresAt > Date.now()) return;
      setDismissedApplicationDraft(null);
      setApplicationDraftExpiryAnnouncement('Your unsaved opportunity draft is no longer available.');
    };
    const timeout = window.setTimeout(expire, remainingMs);
    document.addEventListener('visibilitychange', expire);
    window.addEventListener('focus', expire);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', expire);
      window.removeEventListener('focus', expire);
    };
  }, [dismissedApplicationDraft, draftRecoverySeconds]);
  const restoreWorkspace = (workspace: WorkspaceExport) => {
    const storage = getLocalStorage();
    const persisted = [
      writeStoredValue(storage, PROFILE_KEY, workspace.profile),
      writeStoredValue(storage, ANSWERS_KEY, workspace.answers),
      writeStoredValue(storage, APPLICATIONS_KEY, workspace.applications),
    ].every(Boolean);
    setProfile(workspace.profile);
    setAnswers(workspace.answers);
    setApplications(workspace.applications);
    return persisted;
  };
  return <AppShell profile={profile}><Switch><Route path="/"><HomePage profile={profile} answers={answers} applications={applications} setApplications={setApplications} /></Route><Route path="/profile"><ProfilePage profile={profile} answers={answers} applications={applications} setProfile={setProfile} setAnswers={setAnswers} setApplications={setApplications} onRestoreWorkspace={restoreWorkspace} draftRecoverySeconds={draftRecoverySeconds} setDraftRecoverySeconds={setDraftRecoverySeconds} /></Route><Route path="/answers"><AnswersPage answers={answers} setAnswers={setAnswers} dismissedDraft={dismissedAnswerDraft} setDismissedDraft={setDismissedAnswerDraft} draftExpiryAnnouncement={answerDraftExpiryAnnouncement} onDraftStarted={() => setAnswerDraftExpiryAnnouncement('')} draftRecoverySeconds={answerDraftRecoverySeconds} draftRecoveryWindowSeconds={draftRecoverySeconds} /></Route><Route path="/applications"><ApplicationsPage applications={applications} setApplications={setApplications} dismissedDraft={dismissedApplicationDraft} setDismissedDraft={setDismissedApplicationDraft} draftExpiryAnnouncement={applicationDraftExpiryAnnouncement} onDraftStarted={() => setApplicationDraftExpiryAnnouncement('')} draftRecoverySeconds={applicationDraftRecoverySeconds} draftRecoveryWindowSeconds={draftRecoverySeconds} /></Route><Route path="/assist"><AssistPage profile={profile} answers={answers} applications={applications} setProfile={setProfile} setAnswers={setAnswers} setApplications={setApplications} /></Route><Route component={NotFoundPage} /></Switch></AppShell>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><Router /></RoutedErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;