import { useOpportunityDocuments } from './opportunity-documents';
import { ApplicationPuzzle } from './application-puzzle';
import { ApplicationOutcome } from './application-outcome';
import type { CurrentApplicationPage } from '@/lib/application-puzzle';
import { parseSubmissionEvidence, reconcileSubmissionReceipts, submissionMatchesApplication } from '@/lib/submission-reconciliation';
import type { AssistProfile } from '@/lib/assist-contract';
import { CareerRecords } from './career-records';
import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { ArrowUpRight, CheckCircle2, FileUp, LoaderCircle, ShieldCheck } from 'lucide-react';
import { getLocalStorage, readStoredValue, writeStoredValue, type Application, type Profile } from '@/lib/storage';
import { ApplicationPreferences } from './application-preferences';
import { connectionFromSnapshot, isSubmittedLocked, mergeTrackerIntoApplications, parseTrackerSnapshot, selectNextActionableOpportunity, trackerOpportunityId } from '@/lib/tracker-bridge';
import { refreshBoundTrackerOnStartup, type TrackerStatusEnvelope } from '@/lib/tracker-refresh-client';
import { consumeManagedLaunchIntent } from '@/lib/managed-launch-intent';
import { projectApplicationJourney, JOURNEY_RESUME_KEY, EMPTY_JOURNEY_RESUME, parseJourneyResume } from '@/lib/application-journey-projection';

const API = '/__escapehatch/managed-assist';

type PreparationResult = {
  state: 'REVIEW_READY' | 'REVIEW_REQUIRED' | 'BLOCKED';
  code: string;
  pagesPrepared: number;
  intermediateSteps: number;
  finalActionActivated: false;
  evidenceRefs: string[];
  pendingManual: string[];
};

type AuthCheckpoint = {
  phase: 'AUTH_HANDOFF' | 'AUTH_RECHECK' | 'APPLICATION_FORM_READY' | 'ENTRY_REVIEW_REQUIRED' | 'SESSION_ORIGIN_CHANGED';
  stableReads: number;
  canResume: boolean;
  reason: string;
};

type ServerResponse = {
  ok: boolean;
  state?: string;
  browserOpen?: boolean;
  authCheckpoint?: AuthCheckpoint;
  needsOpportunityConfirmation?: boolean;
  currentPage?: CurrentApplicationPage | null;
  error?: string;
  filled?: string[];
  evidenceSummary?: string;
  networkDiagnosis?: { code: 'VPN_INTERFERENCE_SUSPECTED' | 'NETWORK_FAILURE_UNATTRIBUTED' | 'NAVIGATION_FAILURE_UNCLASSIFIED'; causeVerified: false; vpnCandidateDetected: boolean } | null;
  recorded?: string[];
  skipped?: string[];
  attachments?: Record<string, string>;
  requiresOperatorSubmission?: boolean;
  preparation?: PreparationResult;
  preparationState?: PreparationResult['state'] | null;
  preparationCode?: string | null;
  pagesPrepared?: number;
  intermediateSteps?: number;
  pendingManual?: string[];
  listeners?: { recordingAnswers: boolean; savedAnswers: number; opportunityId: string; error: string;
    submission: { state: string; reason: string; receipt: unknown | null } | null; receipts: unknown[] };
  trackerSync?: { state: string; pending: number; synced: number; authRequired: number; conflicts: number; retryRequired: number };
};

async function request(endpoint: string, body?: object): Promise<ServerResponse> {
  const response = await fetch(API + endpoint, body ? {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
    body: JSON.stringify(body),
  } : { credentials: 'same-origin' });
  const json = await response.json() as ServerResponse;
  if (!response.ok || !json.ok) throw new Error(json.error || 'Local browser action failed.');
  return json;
}

const titles: Record<string, string> = {
  idle: 'Ready to launch',
  browser_open: 'Chrome opened — verify the application',
  application_open_review_required: 'Application opened — sign in if requested',
  application_form_open_review_required: 'Application form opened — ready to fill',
  browser_open_navigation_unverified: 'Chrome opened — verify the URL manually',
  fields_filled_review_required: 'Verified fields read back — review the page',
  fields_partially_filled_review_required: 'Some fields verified — other fields need review',
  fields_unverified_review_required: 'No fields verified — review the employer form',
  attachments_staged_review_required: 'File controls populated — verify attachments',
  attachments_partially_staged_review_required: 'Some file controls populated — review needed',
  attachments_unverified_review_required: 'No file controls verified — review needed',
  browser_closed: 'Managed browser closed',
  REVIEW_READY: 'REVIEW_READY — final Submit is operator-only',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED — resolve gates before continuing',
  BLOCKED: 'BLOCKED — fail closed; re-inspect before retry',
};

export function ManagedBrowserAssist({ profile, setProfile, applications, setApplications, assistProfile, setAssistProfile }: { assistProfile: AssistProfile; setAssistProfile: Dispatch<SetStateAction<AssistProfile>>; profile: Profile; setProfile: Dispatch<SetStateAction<Profile>>; applications: Application[]; setApplications: Dispatch<SetStateAction<Application[]>> }) {
  // Never silently reuse an earlier/submitted employer as the next application.
  const [url, setUrl] = useState('');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('');
  const [dismissedOutcomeId, setDismissedOutcomeId] = useState('');
  const operatorSelected = useRef(false);
  const [savedJourney, setSavedJourney] = useState(() => readStoredValue(getLocalStorage(), JOURNEY_RESUME_KEY, EMPTY_JOURNEY_RESUME, parseJourneyResume));
  const autoLaunchAttempted = useRef(false);
  const [explicitLaunchId] = useState(() => consumeManagedLaunchIntent(window.sessionStorage));
  const [verifiedNextReadyId, setVerifiedNextReadyId] = useState<string | null>(null);
  const [trackerChecked, setTrackerChecked] = useState(false);
  const [runtimeChecked, setRuntimeChecked] = useState(false);
  const documents = useOpportunityDocuments(selectedOpportunityId, url);
  const [autoPrepareRequested, setAutoPrepareRequested] = useState(false);
  const [status, setStatus] = useState('idle');
  const [authCheckpoint, setAuthCheckpoint] = useState<AuthCheckpoint | null>(null);
  const [pendingAfterLogin, setPendingAfterLogin] = useState(false);
  const [needsOpportunityConfirmation, setNeedsOpportunityConfirmation] = useState(false);
  const [observedPageUrl, setObservedPageUrl] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [emailInputError, setEmailInputError] = useState('');
  const [message, setMessage] = useState('');
  const [continuityError, setContinuityError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recordMilitary, setRecordMilitary] = useState(false);
  const [preferencesRefresh, setPreferencesRefresh] = useState(0);
  const [recordingMessage, setRecordingMessage] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<CurrentApplicationPage | null>(null);
  const [preparation, setPreparation] = useState<PreparationResult | null>(null);
  const [formObservation, setFormObservation] = useState<{ opportunityId: string; url: string; revision: number } | null>(null);
  const [listenerStatus, setListenerStatus] = useState<ServerResponse['listeners']>();
  const [trackerSync, setTrackerSync] = useState<ServerResponse['trackerSync']>();
  // A historical ARMED snapshot is not proof of a current listener connection.
  const [listenerConnected, setListenerConnected] = useState(false);
  const seenAnswers = useRef(0);
  const submissionState = !listenerConnected ? 'DISCONNECTED' : !browserOpen ? 'BROWSER_CLOSED' :
    !selectedOpportunityId || listenerStatus?.opportunityId !== selectedOpportunityId ? 'NOT_BOUND' :
    listenerStatus?.submission?.state || 'DISARMED';
  const rememberOpportunity = (opportunity?: Application) => {
    // An unsaved URL or blank view selection cannot erase the last saved journey.
    if (!opportunity) return;
    const candidate = { opportunityId: opportunity.id, applicationUrl: opportunity.url };
    const pointer = parseJourneyResume(candidate);
    if (!pointer || opportunity && ['applied', 'closed'].includes(opportunity.status)) { setContinuityError('This opportunity cannot be saved as a resumable application. Its existing records are preserved.'); return; }
    if (pointer.opportunityId === savedJourney.opportunityId && pointer.applicationUrl === savedJourney.applicationUrl) return;
    if (!writeStoredValue(getLocalStorage(), JOURNEY_RESUME_KEY, pointer)) {
      setContinuityError('Could not save the pending application on this browser. Existing saved progress is preserved.'); return;
    }
    setContinuityError('');
    setSavedJourney(pointer);
  };
  const journey = projectApplicationJourney({
    jobUrl: url,
    emailApproved: Boolean(profile.email?.trim()),
    documentsApproved: documents.canUpload,
    browserOpen,
    authPhase: authCheckpoint?.phase,
    formCanResume: Boolean(authCheckpoint?.canResume),
    needsOpportunityConfirmation,
    preparationState: preparation?.state,
  });

  useEffect(() => {
    let active = true;
    // Direct /assist shares Home's provider-bound read-only refresh; stale data never
    // authorizes an automatic browser launch. Preserve the prior snapshot on failure.
    async function hydrateTracker() {
      try {
        const response = await fetch('/__escapehatch/tracker/status', { credentials: 'same-origin' });
        if (!response.ok) return;
        const original = await response.json() as TrackerStatusEnvelope;
        const current = await refreshBoundTrackerOnStartup(original) ?? original;
        if (!active || current.connection !== 'CONNECTED') return;
        const snapshot = parseTrackerSnapshot(current.snapshot);
        if (!snapshot || connectionFromSnapshot(snapshot).status !== 'CONNECTED') return;
        setApplications((existing) => mergeTrackerIntoApplications(existing, snapshot));
        const next = selectNextActionableOpportunity(snapshot);
        if (next?.applyUrl && !isSubmittedLocked(next)) setVerifiedNextReadyId(trackerOpportunityId(next));
      } catch {
        // Local selection remains available. Failed authorization/refresh never
        // upgrades an unverified snapshot into an automatic-launch candidate.
      } finally {
        if (active) setTrackerChecked(true);
      }
    }
    void hydrateTracker();
    return () => { active = false; };
  }, [setApplications]);

  useEffect(() => {
    if (operatorSelected.current || browserOpen) return;
    const requestedId = new URLSearchParams(window.location.search).get('opportunityId');
    const permitted = (item: Application) => !!item.url && item.status !== 'applied' && item.status !== 'closed';
    const requested = applications.find((item) => item.id === requestedId && permitted(item));
    // Align the default selection to Home's fresh, validated tracker candidate.
    // Do not silently choose the first stale Ready entry when order changes.
    const ready = applications.find((item) => permitted(item) &&
      item.id === verifiedNextReadyId &&
      /provider status:\s*ready to apply/i.test(item.notes) &&
      /Applied\? unchecked/i.test(item.notes));
    const remembered = applications.find(item => item.id === savedJourney.opportunityId &&
      item.url === savedJourney.applicationUrl && permitted(item));
    if (savedJourney.opportunityId && !remembered && !requested) {
      setSelectedOpportunityId(''); setUrl('');
      setContinuityError('Your saved pending application changed or is no longer active. Review its original opportunity before continuing.');
      return;
    }
    const next = requested || remembered || ready;
    if (next) {
      setSelectedOpportunityId(next.id);
      setUrl(next.url);
    }
  }, [applications, browserOpen, savedJourney, verifiedNextReadyId]);

  useEffect(() => {
    let active = true;
    request('/status').then((result) => {
      if (active) {
        setStatus(result.state || 'idle');
        setAuthCheckpoint(result.authCheckpoint || null);
        setNeedsOpportunityConfirmation(Boolean(result.needsOpportunityConfirmation));
        setObservedPageUrl(result.currentPage?.pageUrl || '');
        if (result.state === 'browser_open_navigation_unverified' && result.networkDiagnosis?.code === 'VPN_INTERFERENCE_SUSPECTED') {
          setMessage('Navigation failed and a VPN tunnel error was detected. VPN interference is suspected, not proven. Your VPN has not been changed.');
        }
        setBrowserOpen(Boolean(result.browserOpen));
        setCurrentPage(result.currentPage || null);
        setListenerStatus(result.listeners);
        setListenerConnected(true);
        if (result.trackerSync) setTrackerSync(result.trackerSync);
        if (result.listeners?.receipts?.length) setApplications(current => reconcileSubmissionReceipts(current, result.listeners!.receipts));
        if (result.preparationState) {
          setPreparation({
            state: result.preparationState,
            code: result.preparationCode || '',
            pagesPrepared: result.pagesPrepared || 0,
            intermediateSteps: result.intermediateSteps || 0,
            finalActionActivated: false,
            evidenceRefs: [],
            pendingManual: result.pendingManual || [],
          });
        }
      }
    }).catch(() => { if (active) { setListenerConnected(false); setListenerStatus(undefined); setTrackerSync(undefined); setMessage('Managed browser is unavailable until EscapeHatch is started with its Windows launcher.'); } })
      .finally(() => { if (active) setRuntimeChecked(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!browserOpen || !currentPage || operatorSelected.current) return;
    // Readback restores a known binding; it never issues new launch/fill authority.
    autoLaunchAttempted.current = true;
    if (applications.some(item => item.id === currentPage.opportunityId && item.url === currentPage.applicationUrl && item.status === 'applied')) {
      setContinuityError('');
      return; // Completed jobs have an outcome, never another pending journey.
    }
    const bound = applications.find(item => item.id === currentPage.opportunityId &&
      item.url === currentPage.applicationUrl && item.status !== 'applied' && item.status !== 'closed');
    if (bound) {
      operatorSelected.current = true;
      setSelectedOpportunityId(bound.id);
      setUrl(bound.url);
      rememberOpportunity(bound);
      setMessage('Recovered the opportunity already open in managed Chrome. Continue in the same session.');
    } else {
      setSelectedOpportunityId('');
      setUrl('');
      setContinuityError('Managed Chrome is open, but its saved opportunity binding needs review. Select the original matching opportunity before resuming.');
    }
  }, [browserOpen, currentPage?.opportunityId, currentPage?.applicationUrl, applications]);

  useEffect(() => {
    // Keep the listener/runtime and outbox observable even after Chrome closes.
    // A closed tab must not freeze the last displayed sync result.
    if (!runtimeChecked) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function observe() {
      try {
        const result = await request('/status');
        if (cancelled) return;
        setCurrentPage(result.currentPage || null);
        setListenerStatus(result.listeners);
        setListenerConnected(true);
        if (result.trackerSync) setTrackerSync(result.trackerSync);
        setAuthCheckpoint(result.authCheckpoint || null);
        setNeedsOpportunityConfirmation(Boolean(result.needsOpportunityConfirmation));
        setObservedPageUrl(result.currentPage?.pageUrl || '');
        if (result.listeners) {
          setApplications(current => reconcileSubmissionReceipts(current, result.listeners!.receipts));
          if (result.listeners.savedAnswers !== seenAnswers.current) {
            seenAnswers.current = result.listeners.savedAnswers;
            setPreferencesRefresh(value => value + 1);
          }
        }
        setBrowserOpen(Boolean(result.browserOpen));
      } catch { if (!cancelled) { setCurrentPage(null); setListenerConnected(false); setListenerStatus(undefined); setTrackerSync(undefined); setRecordingMessage('Listener connection interrupted. No submission is assumed.'); } }
      if (!cancelled) timer = setTimeout(observe, browserOpen ? 1500 : 5000);
    }
    void observe();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [browserOpen, runtimeChecked, setApplications]);

  async function updateListeners(change: { recordAnswers?: boolean; trackSubmission?: boolean }) {
    try {
      const result = await request('/listeners', { ...change, opportunityId: selectedOpportunityId, url });
      setListenerStatus(result.listeners);
      setListenerConnected(true);
    } catch (error) { setListenerStatus(undefined); setRecordingMessage(error instanceof Error ? error.message : 'Listener update failed.'); }
  }

  async function trackExistingTab() {
    setBusy(true);
    try {
      const live = new URL(url);
      if (live.hostname === 'jobs.lever.co' && /^\/[^/]+\/[^/]+\/?$/.test(live.pathname)) live.pathname = live.pathname.replace(/\/$/, '') + '/apply';
      const result = await request('/listeners/bind-existing', { opportunityId: selectedOpportunityId, url, livePageUrl: live.href, employerName: applications.find(item => item.id === selectedOpportunityId)?.company || '' });
      setListenerStatus(result.listeners);
      setListenerConnected(true);
      // The binding response is server-scoped to the exact employer tab. Keep the
      // current-page guard active before the first status poll arrives.
      setCurrentPage(result.currentPage ?? { opportunityId: selectedOpportunityId, applicationUrl: url, pageUrl: live.href });
      if (result.trackerSync) setTrackerSync(result.trackerSync);
      setRecordingMessage(result.listeners?.submission?.reason || 'Check the submission listener status before submitting.');
    } catch (error) { setListenerStatus(undefined); setRecordingMessage(error instanceof Error ? error.message : 'Could not track the existing tab. No submission is assumed.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!explicitLaunchId || autoLaunchAttempted.current || !trackerChecked || !runtimeChecked) return;
    const queryId = new URLSearchParams(window.location.search).get('opportunityId');
    if (queryId !== explicitLaunchId || verifiedNextReadyId !== explicitLaunchId) {
      autoLaunchAttempted.current = true;
      setMessage('Automatic launch paused: the requested opportunity is no longer the freshly verified next Ready-to-Apply job. Review the selection before launching.');
      return;
    }
    const selected = applications.find((item) => item.id === explicitLaunchId);
    if (!selected || !selected.url || selected.status === 'applied' || selected.status === 'closed') {
      autoLaunchAttempted.current = true;
      setMessage('Automatic launch stopped: no active matching opportunity was available.');
      return;
    }
    // Selection is populated in a separate effect. Never launch a stale or other employer URL.
    if (selectedOpportunityId !== selected.id || url !== selected.url) return;
    if (operatorSelected.current) {
      autoLaunchAttempted.current = true;
      setMessage('Automatic launch cancelled because the opportunity selection was changed.');
      return;
    }
    autoLaunchAttempted.current = true;
    void run('launch');
  }, [applications, explicitLaunchId, runtimeChecked, trackerChecked, selectedOpportunityId, url, verifiedNextReadyId]);

  useEffect(() => {
    if (!recordMilitary || !browserOpen) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function record() {
      try {
        const result = await request('/capture-military', {});
        if (cancelled) return;
        if (result.recorded?.length) {
          setPreferencesRefresh(value => value + 1);
          setRecordingMessage('Saved your selected veteran/service answer on this computer.');
        } else setRecordingMessage('Listening for a recognized native veteran/service select or radio answer. Unknown or ambiguous fields remain unsaved.');
        timer = setTimeout(record, 1500);
      } catch {
        if (!cancelled) { setRecordMilitary(false); setRecordingMessage('Recording paused: verify the managed application origin and restart recording.'); }
      }
    }
    void record();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [recordMilitary, browserOpen]);

  useEffect(() => {
    if (!autoPrepareRequested || busy || documents.loading || !browserOpen) return;
    setAutoPrepareRequested(false);
    if (!documents.canUpload) { setMessage('Automatic preparation paused: save the opportunity documents and complete required review.'); return; }
    void run('prepare');
  }, [autoPrepareRequested, busy, documents.loading, documents.canUpload, browserOpen]);

  useEffect(() => {
    if (!pendingAfterLogin || !authCheckpoint?.canResume || needsOpportunityConfirmation || busy || !browserOpen) return;
    // A prior explicit Launch authorizes only the guarded Fill, not navigation or Submit.
    setPendingAfterLogin(false);
    void run('resume');
  }, [pendingAfterLogin, authCheckpoint?.canResume, needsOpportunityConfirmation, busy, browserOpen]);

  async function checkSignIn() {
    try {
      const result = await request('/status');
      setAuthCheckpoint(result.authCheckpoint || null);
      setNeedsOpportunityConfirmation(Boolean(result.needsOpportunityConfirmation));
      setObservedPageUrl(result.currentPage?.pageUrl || '');
      setMessage(result.authCheckpoint?.reason || 'The employer form could not be inspected. Continue in Chrome and check again.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to inspect the managed session.');
    }
  }

  async function run(action: 'launch' | 'fill' | 'attach' | 'prepare' | 'resume') {
    setBusy(true);
    setMessage('');
    try {
      let body: object;
      if (action === 'launch') {
        setRecordMilitary(false);
        const opportunity = applications.find((item) => item.id === selectedOpportunityId && item.url === url);
        if (applications.some((item) => item.url === url && (item.status === 'applied' || item.status === 'closed'))) {
          throw new Error('This opportunity is already applied or closed. Do not reapply.');
        }
        body = { url, opportunityId: opportunity?.id || '', employerName: opportunity?.company || '' };
      } else if (action === 'fill' || action === 'resume') {
        if (currentPage && (url !== currentPage.applicationUrl || currentPage.opportunityId &&
            (currentPage.opportunityId !== selectedOpportunityId || !applications.some(item =>
              item.id === currentPage.opportunityId && item.url === currentPage.applicationUrl &&
              item.status !== 'applied' && item.status !== 'closed')))) {
          throw new Error('Select the original opportunity bound to this managed browser before filling or resuming.');
        }
        body = { profile, careerProfile: assistProfile, targetRole: applications.find(item => item.id === selectedOpportunityId)?.role || '', employerName: applications.find(item => item.id === selectedOpportunityId)?.company || '' };
      }
      else if (action === 'attach') {
        if (!documents.canUpload) throw new Error('Save opportunity documents and complete required review before uploading.');
        body = { opportunityId: selectedOpportunityId, url };
      }
      else {
        // Prepare uses a trusted adapter registry supplied by the operator/runtime host.
        // Without registry evidence the control plane fails closed — never invent consequences.
        const registryRaw = window.localStorage.getItem('escapehatch.trustedAdapterRegistry.v1');
        const opportunity = applications.find((item) => item.id === selectedOpportunityId && item.url === url &&
          item.status !== 'applied' && item.status !== 'closed');
        if (!opportunity) throw new Error('Select an active saved opportunity before preparing this application.');
        body = {
          profile, careerProfile: assistProfile, targetRole: opportunity.role, employerName: opportunity.company, opportunityId: opportunity.id, url,
          authorization: {
            sessionId: 'cockpit-' + opportunity.id,
            opportunityId: opportunity.id,
            navigationEnabled: true,
            allowedEffectClasses: ['LOCAL_STEP_ONLY', 'DRAFT_WRITE_AND_ADVANCE'],
            allowedDataCategories: ['synthetic_cover_note'],
          },
          adapterRegistry: registryRaw ? JSON.parse(registryRaw) as object : null,
        };
      }
      if (action === 'resume' && needsOpportunityConfirmation) {
        if (!selectedOpportunityId || !observedPageUrl)
          throw new Error('Save and select the opportunity before confirming a changed employer path.');
        await request('/resume/bind', {
          opportunityId: selectedOpportunityId, livePageUrl: observedPageUrl, confirmedSameOpportunity: true,
        });
        setNeedsOpportunityConfirmation(false);
      }
      let result = await request('/' + action, body);
      const launchedApplicationForm = action === 'launch' && result.state === 'application_form_open_review_required';
      let autoFillMessage = '';
      if (launchedApplicationForm) {
        // Explicit operator launch authorizes the existing bounded DOM filler, not navigation or submission.
        // If this is a landing/login page, no fill occurs; the manual Fill control remains available.
        try {
          const filled = await request('/fill', { profile, careerProfile: assistProfile, targetRole: applications.find(item => item.id === selectedOpportunityId)?.role || '', employerName: applications.find(item => item.id === selectedOpportunityId)?.company || '' });
          result = filled;
          autoFillMessage = 'Managed Chrome opened the application form. ' +
            (filled.filled?.length ? 'Filled: ' + filled.filled.join(', ') + '. ' : 'No approved fields were filled. ') +
            (filled.skipped?.length ? 'Skipped: ' + filled.skipped.join(', ') + '. ' : '') +
            'Review the employer form before continuing.';
        } catch (error) {
          autoFillMessage = 'Managed Chrome opened, but guarded autofill was blocked: ' +
            (error instanceof Error ? error.message : 'Unknown error') + '. Use Fill after reviewing the page.';
        }
      }
      setStatus(result.state || 'idle');
      if (result.authCheckpoint) setAuthCheckpoint(result.authCheckpoint);
      setFormObservation({ opportunityId: selectedOpportunityId, url, revision: Date.now() });
      if (result.preparation) setPreparation(result.preparation);
      if (action === 'launch') {
        setBrowserOpen(true);
        const launchedOpportunity = applications.find(item => item.id === selectedOpportunityId && item.url === url);
        if (launchedOpportunity) rememberOpportunity(launchedOpportunity);
        setPendingAfterLogin(result.authCheckpoint?.phase === 'AUTH_HANDOFF' ||
          result.authCheckpoint?.phase === 'SESSION_ORIGIN_CHANGED');
        // A previously reviewed exact PDF is already authorized for staging:
        // don't make the operator press Fill and Attach again after launch.
        if (launchedApplicationForm && documents.canUpload) setAutoPrepareRequested(true);
        setPreparation(null);
        setApplications((items) => {
          const existing = items.find((item) => item.id === selectedOpportunityId && item.url === url);
          if (existing) return items.map((item) => item.id === existing.id && item.status === 'saved'
            ? { ...item, status: 'preparing', updatedAt: new Date().toISOString() }
            : item);
          return items; // A custom URL never creates an unverified employer ledger record.
        });
      }
      if (action === 'fill' || action === 'resume' || action === 'launch') {
        await request('/questions', {}).then(() => setPreferencesRefresh(value => value + 1)).catch(() => {});
      }
      if (action === 'fill' || action === 'resume') setMessage(
        (result.filled?.length ? 'Filled: ' + result.filled.join(', ') + '. ' : 'No fields filled. ') +
        (result.skipped?.length ? 'Skipped: ' + result.skipped.join(', ') + '. ' : '') +
        (result.evidenceSummary || 'Review before continuing on the employer website.')
      );
      if (action === 'attach') setMessage(
        Object.entries(result.attachments || {}).map(([kind, state]) => kind + ': ' + state.replaceAll('_', ' ')).join(' · ') +
        '. ' + (result.evidenceSummary || 'Confirm the employer form accepted each document.')
      );
      if (action === 'launch') setMessage(result.networkDiagnosis?.code === 'VPN_INTERFERENCE_SUSPECTED'
        ? 'Application navigation failed with a tunnel/proxy error and a VPN-like interface present. VPN interference is suspected, not proven. The VPN was not modified.'
        : result.state === 'browser_open_navigation_unverified'
          ? 'Chrome opened but application navigation was not verified. Check connectivity and the employer page; no form completion is claimed.'
          : autoFillMessage || 'A separate managed Chrome window is opening. Authentication stays under your control.');
      if (action === 'prepare' && result.preparation) {
        setMessage(
          result.preparation.state + ' (' + result.preparation.code + '). Pages prepared: ' +
          result.preparation.pagesPrepared + '; intermediate steps: ' + result.preparation.intermediateSteps +
          (result.filled?.length ? '. Filled approved fields: ' + result.filled.join(', ') : '') +
          (result.attachments ? '. Document staging: ' + Object.entries(result.attachments).map(([kind, status]) => kind + '=' + status.replaceAll('_', ' ')).join(', ') : '') +
          '. Final submission remains operator-only.'
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const handleUrl = (event: ChangeEvent<HTMLInputElement>) => {
    operatorSelected.current = true;
    setSelectedOpportunityId('');
    setPendingAfterLogin(false);
    setUrl(event.target.value);
  };
  const button = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';

  const completedApplication = currentPage && applications.find(item =>
    item.id === currentPage.opportunityId && item.url === currentPage.applicationUrl && item.status === 'applied');
  if (completedApplication && completedApplication.id !== dismissedOutcomeId) {
    const receipt = parseSubmissionEvidence(listenerStatus?.submission?.receipt);
    const captured = listenerConnected && listenerStatus?.opportunityId === completedApplication.id &&
      listenerStatus.submission?.state === 'CONFIRMED' && receipt?.opportunityId === completedApplication.id &&
      submissionMatchesApplication(receipt, completedApplication.url);
    return <ApplicationOutcome application={completedApplication} receiptCaptured={Boolean(captured)}
      onChooseAnother={() => {
        setDismissedOutcomeId(completedApplication.id);
        operatorSelected.current = true;
        setSelectedOpportunityId(''); setUrl(''); setContinuityError(''); setMessage('Choose a saved job to prepare next. The previous employer tab stays open.');
      }} />;
  }

  return (
    <><section className="mb-6 rounded-2xl border border-primary/25 bg-card p-5 shadow-sm sm:p-7" data-testid="managed-browser-assist">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Native application launch</p>
          <h2 className="mt-2 font-display text-3xl">Apply from EscapeHatch.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Open a job in managed Chrome, fill permitted contact fields, and attach PDFs from here.
            No unpacked extension or terminal steps. Your browser stays visible and you control every submission.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
          <ShieldCheck size={15} /> Manual final Submit
        </div>
      </div>

      {continuityError && <p role="alert" className="mt-4 text-sm">{continuityError}</p>}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          {applications.some((application) => application.url) && (
            <label className="block text-xs font-bold text-muted-foreground">
              Saved opportunity
              <select className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm"
                value={selectedOpportunityId}
                onChange={(event) => {
                  const opportunity = applications.find((item) => item.id === event.target.value);
                  operatorSelected.current = true;
                  setSelectedOpportunityId(opportunity?.id || '');
                  setPendingAfterLogin(false);
                  setUrl(opportunity?.url || '');
                  rememberOpportunity(opportunity);
                }}>
                <option value="">Current / custom URL</option>
                {applications.filter((item) => item.url && item.status !== 'applied' && item.status !== 'closed').map((item) => <option key={item.id} value={item.id}>{item.company} — {item.role}</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs font-bold text-muted-foreground">
            Application URL
            <input type="url" className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm"
              value={url} onChange={handleUrl} aria-label="Application URL" data-testid="managed-job-url" />
          </label>
        </div>
        <div className="flex flex-col justify-end gap-2">
          <button className={button} type="button" disabled={busy || documents.intakePending || !url.trim()} onClick={() => void run('launch')} data-testid="button-managed-launch">
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUpRight size={16} />}
            {browserOpen ? 'Open another job' : 'Launch application'}
          </button>
          <a href={url} target="_blank" rel="noreferrer noopener" className="text-center text-xs text-muted-foreground underline">Open in ordinary browser instead</a>
        </div>
      </div>

      <section aria-label="Application guidance" data-testid="application-journey-coach"
        className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4" aria-live="polite">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Your next step</p>
        <dl className="mt-2 grid gap-2 rounded-lg border border-border bg-card p-3 text-xs sm:grid-cols-2" data-testid="journey-scene-status">
          <div><dt className="font-semibold text-muted-foreground">Current</dt>
            <dd className="mt-1 font-semibold" data-testid="journey-current">{journey.current.coach_prompt}</dd></div>
          <div><dt className="font-semibold text-muted-foreground">Next</dt>
            <dd className="mt-1 font-semibold" data-testid="journey-next">{journey.next.coach_prompt}</dd></div>
        </dl>
        {journey.blockers.length > 0 && <div className="mt-2 space-y-1" data-testid="journey-blockers">
          <p className="text-xs font-semibold">What's missing now</p>
          {journey.blockers.map((item, index) => <p key={index} className="text-xs text-muted-foreground">{item}</p>)}
        </div>}
        {!profile.email?.trim() ? (
          <form className="mt-2 space-y-2" onSubmit={event => {
            event.preventDefault();
            const email = emailDraft.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
              setEmailInputError('Enter a valid email address for your applications.'); return;
            }
            setProfile(current => ({ ...current, email }));
            setEmailDraft('');
            setEmailInputError('');
            setMessage('Application email saved in your private EscapeHatch profile. Employer acceptance is not yet proven.');
          }}>
            <label className="block text-sm font-semibold" htmlFor="eh-coach-email">Which email should employers use to contact you?</label>
            <p className="text-xs text-muted-foreground">This fills your approved identity prerequisite, not the employer's login password.</p>
            <input id="eh-coach-email" type="email" autoComplete="email" required
              value={emailDraft} onChange={e => setEmailDraft(e.target.value)}
              className="w-full rounded-lg border border-input bg-background p-3 text-sm"
              data-testid="coach-approved-email" />
            {emailInputError && <p role="alert" className="text-xs">{emailInputError}</p>}
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="submit">Save email to profile</button>
          </form>
        ) : authCheckpoint?.phase === 'AUTH_HANDOFF' || authCheckpoint?.phase === 'SESSION_ORIGIN_CHANGED' ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm font-semibold">Finish signing in to the employer website in Chrome.</p>
            <p className="text-xs text-muted-foreground">{authCheckpoint.reason} EscapeHatch never asks for passwords, MFA codes, or CAPTCHA answers here.</p>
            <button className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold" type="button"
              data-testid="button-auth-check-again" onClick={() => void checkSignIn()}>I've signed in — check again</button>
          </div>
        ) : authCheckpoint?.canResume ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm font-semibold">{needsOpportunityConfirmation
              ? 'Is this the same job you selected before signing in?'
              : 'Application form recognized. Continue where you left off.'}</p>
            <p className="text-xs text-muted-foreground">The form was observed twice in the same browser session. No final Submit is automated.</p>
            {needsOpportunityConfirmation && <p className="text-xs text-muted-foreground">The employer returned to a different page path. Confirm this is the same selected opportunity before any automated field changes. Do not confirm another job.</p>}
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="button"
              data-testid="button-auth-resume" disabled={busy || (needsOpportunityConfirmation && !selectedOpportunityId)} onClick={() => void run('resume')}>
              {needsOpportunityConfirmation ? 'Yes, same job — resume filling' : 'Resume filling this application'}
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-sm">Paste or select an employer job link, then open it in managed Chrome.</p>
            {browserOpen && <p className="text-xs text-muted-foreground">{authCheckpoint?.reason || 'Inspecting the employer page...'}</p>}
            {browserOpen && <button type="button" className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
              data-testid="button-auth-check-again" onClick={() => void checkSignIn()}>Check this page again</button>}
          </div>
        )}
        {!!url.trim() && !selectedOpportunityId && <p className="mt-3 text-xs text-muted-foreground">This pasted URL is not yet bound to a saved opportunity. Save it to retain role-specific documents and answers across sessions.</p>}
        {!!selectedOpportunityId && !documents.canUpload && <p className="mt-3 text-xs text-muted-foreground">You may prepare this application without a cover letter. EscapeHatch checks the live employer form and asks for documents only when required. File uploads still require review.</p>}
      </section>
      <ApplicationPuzzle opportunity={applications.find(item => item.id === selectedOpportunityId)} url={url} documents={documents} disabled={busy || autoPrepareRequested} refresh={formObservation} currentPage={currentPage} onBypass={() => { if (browserOpen) setAutoPrepareRequested(true); }} />
      <div className="mt-5 rounded-xl bg-secondary/55 p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="text-primary" size={16} />
          {titles[status] || status.replaceAll('_', ' ')}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Your Chrome sign-in remains private. Fill and Attach stay page-local. Prepare advances only through
          trusted adapter evidence under the managed-browser progression contract; the MV3 extension still
          forbids automatic Next/Submit. A button labeled Submit may be intermediate or terminal — the label alone never authorizes a click.
        </p>
        {preparation && (
          <div className="mt-3 rounded-lg border border-border bg-card p-3 text-xs leading-5"
            data-testid="managed-preparation-state" data-preparation-state={preparation.state}>
            <p className="font-bold">{preparation.state}</p>
            <p className="mt-1 text-muted-foreground">
              code={preparation.code} · pages={preparation.pagesPrepared} · intermediates={preparation.intermediateSteps} ·
              finalActionActivated=false
              {preparation.pendingManual.length ? ' · pending: ' + preparation.pendingManual.join(', ') : ''}
            </p>
          </div>
        )}
        <label className="mt-3 block text-sm">
          <input type="checkbox" checked={recordMilitary} disabled={!browserOpen || busy}
            onChange={event => setRecordMilitary(event.target.checked)} /> Record my veteran/service answers from this managed application
        </label>
        <p className="text-xs">While enabled and this page stays open, selected native dropdown/radio answers are saved locally for reuse. Protected-veteran status and military service are separate facts. Other fields and custom widgets are not recorded.</p>
        <p role="status" className="text-xs">{recordingMessage}</p>
        <section className="mt-4 rounded-lg border border-border bg-card p-3 text-sm" aria-label="Answer memory and submission tracking">
          <label className="flex items-start gap-2"><input type="checkbox" checked={listenerStatus?.recordingAnswers ?? false} disabled={!browserOpen || busy}
            onChange={event => void updateListeners({ recordAnswers: event.target.checked })} />Remember answers I enter in this application</label>
          <p className="mt-1 text-xs text-muted-foreground">Recognized answers are saved locally. New questions appear in reusable answers for review. Passwords, files, agreements and certifications are excluded.</p>
          <p className="mb-2 text-xs text-muted-foreground">Select the saved job and start listening in its existing Chrome tab. Your employer form will not reload.</p>
          <button type="button" className={secondary} disabled={busy || !browserOpen || !selectedOpportunityId || !url} onClick={() => void trackExistingTab()}>Track existing application tab</button>
          <p role="status" aria-live="polite" data-testid="submission-listener-state" data-listener-state={submissionState}
             className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold">
             Submission listener: {submissionState}{submissionState === 'ARMED' ? ' — observing form transitions for this job' :
               submissionState === 'DISCONNECTED' ? ' — running connection not verified' :
               submissionState === 'NOT_BOUND' ? ' — select and bind this saved job' :
               submissionState === 'PENDING' ? ' — a form action was observed; awaiting another step or an employer receipt' :
               submissionState === 'IN_PROGRESS' ? ' — another application step needs completion' :
               submissionState === 'PROCESSING' ? ' — employer is processing; final receipt not yet verified' :
               submissionState === 'CONFIRMED' ? ' — employer receipt observed' :
               submissionState === 'VALIDATION_FAILED' ? ' — employer did not accept the application' :
               ' — tracking is not armed for this job'}
          </p>
          <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={listenerConnected && listenerStatus?.opportunityId === selectedOpportunityId && !!listenerStatus?.submission && !['DISARMED', 'BLOCKED'].includes(listenerStatus.submission.state)}
            disabled={!browserOpen || busy || listenerStatus?.opportunityId !== selectedOpportunityId || listenerStatus?.submission?.state === 'CONFIRMED'} onChange={event => void updateListeners({ trackSubmission: event.target.checked })} />Track my application through its pages and final confirmation in Chrome</label>
          <p className="mt-2" role="status" data-testid="submission-listener-status">{listenerStatus?.error || listenerStatus?.submission?.reason || 'Launch an application to connect tracking. Final submission stays yours.'}</p>
          {listenerStatus?.submission?.state === 'CONFIRMED' && listenerStatus.receipts?.some(receipt => !!receipt && typeof receipt === 'object' && 'opportunityId' in receipt && receipt.opportunityId === selectedOpportunityId) && <p className="mt-2 font-semibold">Employer confirmation received. This application is marked Applied in your local queue.</p>}
          <p className="mt-2 text-xs text-muted-foreground">A Submit or Next button can lead to more questions. EscapeHatch stays connected through verified same-job pages. Neither a click nor a processing message marks Applied; only an explicit employer receipt does. Receipt and tracker synchronization are independently verified.</p>
          <p className="mt-2 text-sm" role="status">{trackerSync ? `Tracker synchronization: ${trackerSync.state}. Saved receipts: ${trackerSync.synced} synced, ${trackerSync.pending} pending, ${trackerSync.authRequired} need Google authorization, ${trackerSync.conflicts} have conflicts, ${trackerSync.retryRequired} need retry.` : 'External tracker synchronization has not been verified.'}</p>
          <button type="button" className={secondary} disabled={busy} onClick={() => { setBusy(true); void request('/submission-sync/retry', {}).then(result => { setRecordingMessage(''); if (result.trackerSync) setTrackerSync(result.trackerSync); }).catch(() => setRecordingMessage('Tracker sync did not complete. The saved receipt is preserved for retry.')).finally(() => setBusy(false)); }}>Retry tracker synchronization</button>
        </section>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={secondary} disabled={busy || documents.intakePending || !browserOpen} onClick={() => void run('fill')} data-testid="button-managed-fill">
            Fill approved profile and answers
          </button>
          <button type="button" className={secondary} disabled={busy || documents.loading || !browserOpen || !documents.canUpload}
            onClick={() => void run('attach')} data-testid="button-managed-attach">
            Attach selected PDFs
          </button>
          <button type="button" className={button} disabled={busy || documents.loading || documents.intakePending || !browserOpen}
            onClick={() => void run('prepare')} data-testid="button-managed-prepare">
            Prepare to final review
          </button>
        </div>
      </div>
      {message && <p role="status" aria-live="polite" data-testid="managed-browser-feedback"
        className="mt-4 rounded-xl border border-border p-3 text-sm leading-6">{message}</p>}
      <p className="mt-4 text-xs text-muted-foreground">
        Selected PDFs are saved privately for this opportunity. Employer upload is a separate action gated by your review setting; private documents are never committed.
        A file input being populated does not prove the employer accepted an upload.
      </p>
    </section>
    <section aria-label="Reusable application knowledge"><ApplicationPreferences currentRole={applications.find(item => item.id === selectedOpportunityId)?.role} currentPosting={applications.find(item => item.id === selectedOpportunityId)?.jobDescription || ''} reviewedExperience={assistProfile.experience.filter(item => item.id === assistProfile.selectedExperienceId).map(item => item.title + ' ' + item.bullets.join(' ')).join(' ')} refresh={preferencesRefresh} onEdit={() => setRecordMilitary(false)} onLoad={data => setProfile(current => {
      const next = { ...current };
      for (const key of Object.keys(current) as (keyof Profile)[]) {
        const id = 'identity.' + (key === 'linkedin_url' ? 'linkedin' : key === 'name_prefix' ? 'title' : key);
        const value = data.preferences[id]?.value;
        if (!next[key] && value) next[key] = value;
      }
      return next;
    })} /><CareerRecords profile={assistProfile} setProfile={setAssistProfile} opportunity={applications.find(item => item.id === selectedOpportunityId)} setApplications={setApplications} /></section></>
  );
}
