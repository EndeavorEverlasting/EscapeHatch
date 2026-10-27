import { useEffect, useRef, useState } from 'react';
import { ArtifactDropzone } from './artifact-dropzone';
import { Link } from 'wouter';
import type { AssistProfile, ReviewedProposal } from '../lib/assist-contract';
import type { Application, Profile } from '../lib/storage';
import { approveSource, previewLocalSource, sourcePackageStatus, type SourceBinding, type SourcePreview } from '../lib/source-bridge';
import { connectionFromSnapshot, isSubmittedLocked, parseTrackerSnapshot, selectNextActionableOpportunity, trackerOpportunityId } from '../lib/tracker-bridge';
import { stageManagedLaunchIntent } from '../lib/managed-launch-intent';
import { CareerSourceStatus } from './career-source-status';

export type SourceStateProps = {
  profile: Profile;
  assistProfile: AssistProfile;
  applications: Application[];
  sourceBindings: SourceBinding[];
};

export function SourcePackageSummary(props: SourceStateProps) {
  const [result, setResult] = useState<{ inputs: SourceStateProps; statuses: string[] } | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all(props.sourceBindings.map((binding) => sourcePackageStatus(binding, props.applications, props.profile, props.assistProfile)))
      .then((values) => { if (active) setResult({ inputs: props, statuses: values }); }).catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [props.sourceBindings, props.applications, props.profile, props.assistProfile]);
  const statuses = result && result.inputs.sourceBindings === props.sourceBindings && result.inputs.applications === props.applications &&
    result.inputs.profile === props.profile && result.inputs.assistProfile === props.assistProfile ? result.statuses : [];
  return <section aria-label="Shared application sources" className="my-5 rounded-xl border border-border bg-card p-5">
    <h2 className="font-display text-2xl">Application sources</h2>
    {!props.sourceBindings.length && <p>No source approved for an opportunity yet. <Link href="/sources" className="underline">Choose a source</Link>.</p>}
    {props.sourceBindings.map((binding, index) => <p key={`${binding.sourceId}:${binding.opportunityId}`} className="mt-3" data-testid="source-binding">
      <strong>{binding.label}</strong> · {props.applications.find((item) => item.id === binding.opportunityId)?.role ?? 'Unavailable opportunity'}<br />
      <span role="status">{statuses[index] ?? 'Checking source binding…'}</span>
    </p>)}
  </section>;
}

export function SourcesPage(props: SourceStateProps & {
  onApprove: (value: { profile: Profile; assist: AssistProfile; bindings: SourceBinding[] }) => void;
  onForget: () => void;
}) {
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [proposals, setProposals] = useState<ReviewedProposal[]>([]);
  const [opportunityId, setOpportunityId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [nextReady, setNextReady] = useState<{ id: string; company: string; role: string } | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    fetch('/__escapehatch/tracker/status', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() as Promise<{ connection?: string; snapshot?: unknown }> : null)
      .then((response) => {
        if (!active || response?.connection !== 'CONNECTED') return;
        const snapshot = parseTrackerSnapshot(response.snapshot);
        if (!snapshot || connectionFromSnapshot(snapshot).status !== 'CONNECTED') return;
        const next = selectNextActionableOpportunity(snapshot);
        if (next?.applyUrl && !isSubmittedLocked(next)) {
          setNextReady({ id: trackerOpportunityId(next), company: next.company, role: next.role });
        }
      }).catch(() => { /* Explicit launch shortcut unavailable; ordinary Sources remains usable. */ });
    return () => { active = false; };
  }, []);
  const current = useRef(props);
  current.current = props;
  useEffect(() => () => { generation.current += 1; }, []);
  const choose = async (file?: File) => {
    const request = ++generation.current;
    setPreview(null); setProposals([]);
    if (!file) return;
    setBusy(true); setFeedback('Reading selected file locally…');
    try {
      const result = await previewLocalSource(file, props.profile, props.assistProfile);
      if (request !== generation.current) return;
      setPreview(result); setProposals(result.imported.proposals);
      setFeedback('Content read. Select the claims to approve; existing values are shown for comparison.');
    } catch { if (request === generation.current) setFeedback('This file could not be read. Choose a nonempty text file or supported text-based PDF, up to 20 MB.'); }
    finally { if (request === generation.current) setBusy(false); }
  };
  const approve = async () => {
    if (!preview || busy) return;
    setBusy(true);
    const request = ++generation.current;
    const snapshot = current.current;
    try {
      const value = await approveSource(preview, proposals, opportunityId, snapshot.applications, snapshot.profile, snapshot.assistProfile, snapshot.sourceBindings);
      if (request !== generation.current) return;
      if (snapshot.profile !== current.current.profile || snapshot.assistProfile !== current.current.assistProfile || snapshot.applications !== current.current.applications || snapshot.sourceBindings !== current.current.sourceBindings) throw new Error('PROFILE_CHANGED_REVIEW_AGAIN');
      props.onApprove(value); setPreview(null); setProposals([]); setFeedback(opportunityId ? 'Selected claims approved in your existing profile and bound to this opportunity.' : 'Selected claims saved in your career profile. Choose an opportunity next.');
    } catch (error) { if (request === generation.current) setFeedback(error instanceof Error ? error.message : 'Source approval failed.'); }
    finally { if (request === generation.current) setBusy(false); }
  };
  const existingValue = (proposal: ReviewedProposal) => {
    if (proposal.section === 'summary') return props.assistProfile.summary;
    if (proposal.section === 'contact') {
      if (proposal.field === 'name') return `${props.profile.first_name} ${props.profile.last_name}`.trim();
      return props.profile[proposal.field as keyof Profile] ?? '';
    }
    return 'Existing entries are retained; selected entries are added.';
  };
  const readSavedResume = async () => {
    try {
      const response = await fetch('/__escapehatch/workspace/resume');
      if (!response.ok) throw new Error('No saved résumé is available yet. Choose a local file below.');
      const result = await response.json() as { label: string; text: string };
      if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('Saved résumé could not be read. Original files are preserved.');
      await choose(new File([result.text], result.label + '.txt', { type: 'text/plain' }));
    } catch (error) { setFeedback((error as Error).message); }
  };
  return <div>
    <h1 className="font-display text-4xl">Sources &amp; identity</h1>
    <p className="my-3">Start with a résumé. Drop it below, review its claims, then save the facts you want to reuse. You can choose an opportunity later. Managed startup saves approved details on this computer.</p>
    <CareerSourceStatus />
    <button disabled={busy} onClick={() => void readSavedResume()}>Review saved résumé</button>
    <p className="my-3">Google connection is unavailable in this build. Existing Google credentials are never copied into this page. Locally synced files can be selected below.</p>
    <ArtifactDropzone label="Résumé source (.txt or .pdf)" hint="Drop one career source here, or choose a file. Text or text-based PDF, up to 20 MB. Review comes next; dropping never approves claims." accept=".txt,.pdf" disabled={busy} onFile={choose} />
    <label className="block my-4">Opportunity
      <select aria-label="Opportunity" className="block mt-2 border rounded p-2 bg-card" value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)}>
        <option value="">Career profile only — choose a job later</option>
        {props.applications.filter((item) => item.status !== 'closed').map((item) => <option key={item.id} value={item.id}>{item.company} — {item.role}</option>)}
      </select>
    </label>
    <p className="my-3 text-sm">After reviewing your source, <Link href="/applications" className="font-bold text-primary underline">add an opportunity</Link>, then <Link href="/assist" className="font-bold text-primary underline">assemble its application</Link>.</p>
    <p role="status" className="my-4">{feedback}</p>
    {preview && <section aria-label="Source review">
      <h2 className="font-display text-2xl">Review {preview.imported.fileName}</h2>
      <p>{preview.byteCount} bytes read. Nothing is saved until you approve selected claims.</p>
      {proposals.map((proposal) => <label key={proposal.id} className="block my-3 border border-border rounded p-3">
        <input type="checkbox" checked={proposal.review === 'accepted'} onChange={(event) => setProposals((items) => items.map((item) => item.id === proposal.id ? { ...item, review: event.target.checked ? 'accepted' : 'proposed' } : item))} />
        <strong className="ml-2">{proposal.section} / {proposal.field}</strong>
        <span className="block whitespace-pre-wrap">Proposed: {proposal.value}</span>
        <span className="block whitespace-pre-wrap text-muted-foreground">Current: {existingValue(proposal) || '(empty)'}</span>
      </label>)}
      <button className="min-h-11 rounded bg-primary text-primary-foreground px-4 py-2" disabled={busy || !proposals.some((item) => item.review === 'accepted')} onClick={() => void approve()}>Approve selected claims</button>
    </section>}
    <SourcePackageSummary {...props} />
    {props.sourceBindings.length > 0 && <button className="underline" onClick={props.onForget}>Forget source bindings (keep approved profile)</button>}
    <p className="my-5"><Link href="/assist" className="underline">Continue to application assist</Link></p>
    {nextReady && <section className="my-4 rounded-xl border border-border p-4" aria-label="Next managed application">
      <strong>Next ready opportunity: {nextReady.company} — {nextReady.role}</strong>
      <p className="my-2 text-sm">Launch the employer form in managed Chrome and fill only permitted, approved answers. Résumé and cover-letter files still require your review and attachment approval.</p>
      <Link href={`/assist?opportunityId=${encodeURIComponent(nextReady.id)}`}
        onClick={() => stageManagedLaunchIntent(nextReady.id, window.sessionStorage)}
        className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        data-testid="sources-launch-next">Launch &amp; fill next application</Link>
    </section>}
  </div>;
}
