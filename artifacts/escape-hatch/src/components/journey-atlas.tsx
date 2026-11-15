import { useEffect, useRef, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { ArrowLeft, ArrowRight, CheckCircle2, Map, Puzzle, ShieldCheck } from 'lucide-react';
import { JOURNEY_DESTINATIONS, getJourneyStop, getJourneyBranches, containerAssistLabel, journeyAtlasHref, journeyOpportunityHref, projectJourneyWayfinding } from '@/lib/journey-wayfinding';
import type { Application } from '@/lib/storage';

const containerWorkspace = import.meta.env.VITE_ESCAPEHATCH_CONTAINER === '1';
const tour = JOURNEY_DESTINATIONS.filter(stop => stop.id !== 'materials').map(stop => getJourneyStop(stop.id, containerWorkspace));
const canonicalScenes = projectJourneyWayfinding(containerWorkspace);
const materials = getJourneyStop('materials');
export function JourneyAtlas({ applications }: { applications: Application[] }) {
  const [selected, setSelected] = useState(0);
  const stage = tour[selected];
  const query = new URLSearchParams(useSearch());
  const sceneId = query.get('scene');
  const requestedId = query.get('opportunityId');
  const opportunityId = applications.find(item => item.id === requestedId && item.url &&
    !['applied', 'closed'].includes(item.status))?.id;
  const preview = canonicalScenes.find(scene => scene.id === sceneId);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    previewHeading.current?.focus();
  }, [preview]);
  const branches = preview ? getJourneyBranches(preview.id, containerWorkspace) : [];
  const destination = (route: string) => route === '/assist' || route === '/materials'
    ? journeyOpportunityHref(route, opportunityId)
    : route;

  return <div className="journey-atlas space-y-8" data-testid="journey-atlas">
    <header className="journey-atlas-header relative overflow-hidden rounded-3xl border border-primary/25 bg-primary/5 p-6 sm:p-9">
      <div className="relative z-10 max-w-2xl">
        <p className="text-xs font-semibold text-primary">{containerWorkspace ? "You made it through the hatch." : "Your application journey"}</p>
        <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{containerWorkspace ? "Welcome to EscapeHatch." : "See every piece of the application."}</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">Explore your sources, saved answers and role materials, then choose a job to prepare. Open any scene to find your next action. Each employer form still needs its own verification.</p>
        <p className="mt-3 text-xs text-muted-foreground">{applications.length} locally tracked {applications.length === 1 ? 'opportunity' : 'opportunities'}. Employer submission requires separate confirmation.</p>
      </div>
      <img src="/escapehatch-mascot.webp" alt="" aria-hidden="true" width={140} height={140} className="pointer-events-none absolute -bottom-6 right-0 w-28 opacity-30 sm:bottom-2 sm:right-7 sm:w-36" />
    </header>

    {preview && <section aria-labelledby="journey-preview-title" className="journey-atlas-inspection rounded-2xl border border-primary/25 bg-card p-5 sm:p-7" data-testid="journey-branch-preview">
      <div className="flex items-start gap-3">
        <img src="/escapehatch-mascot.webp" alt="" width={48} height={48} className="h-12 w-12 shrink-0" />
        <div className="min-w-0" aria-live="polite" aria-atomic="true">
          <p className="text-xs font-semibold text-primary">{preview.location}{preview.operatorOnly && ' · You decide'}</p>
          <h2 id="journey-preview-title" ref={previewHeading} tabIndex={-1} className="mt-1 font-display text-2xl">{preview.title}</h2>
        </div>
      </div>
      {branches.length > 0 && <><h3 className="mt-5 text-sm font-bold">Where you can go from here</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {branches.map(edge => <li key={edge.to} className="rounded-lg border border-border bg-background/70 px-3 py-2">
          <p className="text-xs leading-5 text-muted-foreground">{edge.when}</p>
          <Link href={journeyAtlasHref(edge.to, opportunityId)} className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-primary underline underline-offset-4">{edge.title} <ArrowRight size={14} aria-hidden="true" /></Link>
        </li>)}
      </ul></>}
      <div className="mt-3 flex flex-wrap gap-3">
        {preview.location === 'Setup' ? <a href="#setup" className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline">Open setup guide</a> : <Link href={destination(preview.route)} className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline">{preview.action}</Link>}
        {preview.id === materials.host_scene && <Link href={destination(materials.route)} className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline">{materials.title}</Link>}
        <Link href="/journey" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground underline">Back to journey overview</Link>
      </div>
    </section>}

    <section aria-label="Guided preparation and application tour" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3"><Puzzle size={22} className="text-primary" aria-hidden="true" /><h2 className="font-display text-2xl">Find your next piece</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Pick any piece below; the highlighted scene can be opened directly. Nothing is locked behind a prior click.</p>
      <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tour.map((item, index) => <li key={item.id}><button type="button"
          onClick={() => setSelected(index)} aria-pressed={selected === index} aria-controls="journey-scene-inspection"
          className={'journey-atlas-piece flex min-h-20 w-full flex-col items-start justify-between rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
            (selected === index ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary')}
          data-testid={'journey-step-' + index}>
          <span className="font-mono-app text-[10px] text-muted-foreground">{item.badge}</span>
          <span className="mt-2 text-xs font-bold">{item.title}</span>
        </button></li>)}
      </ol>
      <div id="journey-scene-inspection" className="journey-atlas-inspection mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5" data-testid="journey-selected-step">
        <div aria-live="polite" aria-atomic="true">
        <h3 className="mt-2 font-display text-3xl">{stage.title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{stage.detail}</p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={destination(stage.route)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" data-testid="journey-open-stage">Open this scene <ArrowRight size={16} /></Link>
          {stage.host_scene && <Link href={journeyAtlasHref(stage.host_scene, opportunityId)} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary underline">Explore possible paths</Link>}
          <button type="button" disabled={selected === 0} onClick={() => setSelected(s => Math.max(0, s - 1))} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold disabled:opacity-40"><ArrowLeft size={15} /> Previous</button>
          <button type="button" disabled={selected === tour.length - 1} onClick={() => setSelected(s => Math.min(tour.length - 1, s + 1))} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold disabled:opacity-40">Next <ArrowRight size={15} /></button>
        </div>
      </div>
    </section>

    {containerWorkspace ? <section id="setup" aria-label="Your container workspace" className="rounded-2xl border border-border bg-card p-5 sm:p-7">
      <h2 className="font-display text-2xl">Bring your work with you.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Start with a résumé in Sources or restore an exported workspace from Profile. Docker keeps this workspace between launches. Use your browser for employer forms. Managed Chrome and connected account features require a supported native install.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-primary">
        <Link href="/sources" className="underline underline-offset-4">Open Sources</Link>
        <Link href="/profile" className="underline underline-offset-4">Restore a workspace</Link>
      </div>
    </section> : <section id="setup" aria-label="Install and open EscapeHatch" className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="journey-setup">
      <p className="font-mono-app text-[11px] font-bold uppercase tracking-[.16em] text-primary">From download to first puzzle</p>
      <h2 className="mt-2 font-display text-3xl">Set up once. Return to your work.</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">The Windows developer-preview setup checks dependencies, offers supported recovery when tools are missing, preserves existing installations and starts the local cockpit. Build artifacts may include a bundled Node/npm runtime. Setup and build artifacts are unsigned previews; review their source and provenance before running. Employer sign-in stays with you.</p>
      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        <li className="rounded-xl border border-border p-4"><span className="font-mono-app text-xs text-primary">01 · Download</span><p className="mt-2 font-bold">Get the verified source path</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Review the unsigned setup script, or inspect available preview downloads and their checksums on the build page.</p></li>
        <li className="rounded-xl border border-border p-4"><span className="font-mono-app text-xs text-primary">02 · Install</span><p className="mt-2 font-bold">Confirm your Windows choices</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Review security prompts, missing dependencies and the installation location. Use the installation-owned launcher to return to your workspace. Existing user data and customized shortcuts are preserved.</p></li>
        <li className="rounded-xl border border-border p-4"><span className="font-mono-app text-xs text-primary">03 · Connect</span><p className="mt-2 font-bold">Choose a job and open Browser assist</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Recover your saved career workspace, choose an opportunity in Applications, then open Browser assist to prepare its employer form. This normal path does not require an extension. Extension enrollment is optional for supported companion workflows.</p></li>
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
        <a href="https://raw.githubusercontent.com/EndeavorEverlasting/EscapeHatch/main/Get-EscapeHatch.cmd" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground" data-testid="journey-download-setup">Review developer-preview setup <ArrowRight size={16} /></a>
        <a href="https://github.com/EndeavorEverlasting/EscapeHatch/actions/workflows/windows-preview-package.yml" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-bold text-primary underline underline-offset-4" data-testid="journey-bundled-package">Inspect preview build artifacts <ArrowRight size={15} /></a>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Open each step to check your setup and sign-in status. Your saved workspace stays on this computer. Use the optional extension only when you need its companion workflow.</p>
    </section>}

    <section aria-label="Website destinations" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[
        { route: '/', name: 'Today', detail: 'Home and recommendations' },
        { route: '/sources', name: 'Sources', detail: 'Review career documents' },
        { route: '/profile', name: 'Profile', detail: 'Your editable career details' },
        { route: '/answers', name: 'Answer library', detail: 'Reusable approved answers' },
        { route: '/applications', name: 'Applications', detail: 'Your tracked opportunities' },
        { route: '/materials', name: 'Materials', detail: 'Review role-specific documents before use' },
        { route: '/assist', name: containerWorkspace ? containerAssistLabel : 'Browser assist', detail: containerWorkspace ? 'Review saved answers and career details' : 'Employer-form puzzle and checkpoints' },
      ].filter(item => !containerWorkspace || item.route !== '/materials').map(item => <Link key={item.route} href={destination(item.route)}
        className="flex min-h-24 flex-col justify-between rounded-xl border border-border bg-card p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
        data-testid={'journey-destination-' + item.name.toLowerCase().replaceAll(' ', '-')}>
        <span className="flex items-center justify-between text-sm font-bold">{item.name}<ArrowRight size={17} className="text-primary" /></span>
        <span className="mt-2 text-xs text-muted-foreground">{item.detail}</span>
      </Link>)}
    </section>

    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-label={containerWorkspace ? 'Workspace scenes' : 'Installation, sign-in and recovery'}>
      <div className="flex items-center gap-2"><Map size={20} aria-hidden="true" className="text-primary" /><h2 className="font-display text-2xl">{containerWorkspace ? 'Workspace scenes' : 'Installation, sign-in and recovery'}</h2></div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{containerWorkspace ? 'Review the steps you can take in this workspace before opening the employer’s site.' : 'Find the next place to continue, including setup, employer sign-in and recovery. Some actions happen in the installer or employer browser; the links below help you reach their instructions.'}</p>
      <ol className="mt-5 grid gap-2 md:grid-cols-2">
        {canonicalScenes.map(scene => <li key={scene.id} className="rounded-xl border border-border p-3" data-testid={'journey-canonical-' + scene.id.toLowerCase()}>
          <p className="text-xs text-muted-foreground">{scene.location}</p>
          <p className="mt-2 text-sm font-semibold">{scene.title}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            {scene.location === 'Setup' ? <a href="#setup" className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-primary underline underline-offset-4">{scene.action} <ArrowRight size={13} /></a> : <Link href={destination(scene.route)} className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-primary underline underline-offset-4">{scene.action} <ArrowRight size={13} /></Link>}
            <Link href={journeyAtlasHref(scene.id, opportunityId)} aria-label={`Explore paths from: ${scene.title}`} className="inline-flex min-h-10 items-center text-xs font-bold text-primary underline underline-offset-4">Explore paths</Link>
            {scene.operatorOnly && <span className="text-[10px] font-bold text-muted-foreground">You decide</span>}
          </div>
        </li>)}
      </ol>
    </section>
    <footer className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm text-muted-foreground">
      <ShieldCheck size={19} className="mt-0.5 shrink-0 text-primary" />
      {containerWorkspace ? <p>Use your browser to complete the employer form. Check the actual fields and attachments before submitting.</p> : <p>Autofill uses reviewed facts through a user-invoked preparation step. Employer sign-in, sensitive choices and final Submit stay in your control. <CheckCircle2 size={14} className="inline text-primary" /> Saved answers are not employer acceptance.</p>}
    </footer>
  </div>;
}
