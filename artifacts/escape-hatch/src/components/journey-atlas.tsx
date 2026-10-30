import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, CheckCircle2, Map, Puzzle, ShieldCheck } from 'lucide-react';
import { JOURNEY_DESTINATIONS, projectJourneyWayfinding } from '@/lib/journey-wayfinding';
import type { Application } from '@/lib/storage';

/** A visible user journey, not an agent-only debug route or application progress claim. */
export function JourneyAtlas({ applications }: { applications: Application[] }) {
  const [selected, setSelected] = useState(0);
  const stage = JOURNEY_DESTINATIONS[selected];
  const canonicalScenes = projectJourneyWayfinding();
  return <div className="space-y-8" data-testid="journey-atlas">
    <header className="relative overflow-hidden rounded-3xl border border-primary/25 bg-primary/5 p-6 sm:p-9">
      <div className="relative z-10 max-w-2xl">
        <p className="font-mono-app text-[11px] font-bold uppercase tracking-[.16em] text-primary">Your journey · always accessible</p>
        <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">See every piece of the application.</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">Prepare once, choose a job, and assemble its real employer form. Every destination is visible and usable without an agent opening a hidden page. The map is navigation—not a claim that any application is complete.</p>
        <p className="mt-3 text-xs text-muted-foreground">{applications.length} locally tracked {applications.length === 1 ? 'opportunity' : 'opportunities'}. Employer submission requires separate confirmation.</p>
      </div>
      <img src="/escapehatch-mascot.webp" alt="" aria-hidden="true" width={140} height={140} className="pointer-events-none absolute -bottom-6 right-0 w-28 opacity-30 sm:bottom-2 sm:right-7 sm:w-36" />
    </header>

    <section aria-label="Guided preparation and application tour" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3"><Puzzle size={22} className="text-primary" aria-hidden="true" /><h2 className="font-display text-2xl">The six-piece puzzle</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Pick any piece below; the highlighted scene can be opened directly. Nothing is locked behind a prior click.</p>
      <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {JOURNEY_DESTINATIONS.map((item, index) => <li key={index}><button type="button"
          onClick={() => setSelected(index)} aria-current={selected === index ? 'step' : undefined}
          className={'flex min-h-20 w-full flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
            (selected === index ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary')}
          data-testid={'journey-step-' + index}>
          <span className="font-mono-app text-[10px] text-muted-foreground">{item.badge} · {index + 1}/6</span>
          <span className="mt-2 text-xs font-bold">{item.title}</span>
        </button></li>)}
      </ol>
      <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5" data-testid="journey-selected-step">
        <p className="font-mono-app text-[11px] uppercase tracking-wider text-primary">Scene {selected + 1} of {JOURNEY_DESTINATIONS.length}</p>
        <h3 className="mt-2 font-display text-3xl">{stage.title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{stage.detail}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={stage.route} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" data-testid="journey-open-stage">Open this scene <ArrowRight size={16} /></Link>
          <button type="button" disabled={selected === 0} onClick={() => setSelected(s => Math.max(0, s - 1))} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold disabled:opacity-40"><ArrowLeft size={15} /> Previous</button>
          <button type="button" disabled={selected === JOURNEY_DESTINATIONS.length - 1} onClick={() => setSelected(s => Math.min(JOURNEY_DESTINATIONS.length - 1, s + 1))} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold disabled:opacity-40">Next <ArrowRight size={15} /></button>
        </div>
      </div>
    </section>

    <section aria-label="Website destinations" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[
        { route: '/', name: 'Today', detail: 'Home and recommendations' },
        { route: '/sources', name: 'Sources', detail: 'Review career documents' },
        { route: '/profile', name: 'Profile', detail: 'Your editable career details' },
        { route: '/answers', name: 'Answer library', detail: 'Reusable approved answers' },
        { route: '/applications', name: 'Applications', detail: 'Your tracked opportunities' },
        { route: '/assist', name: 'Browser assist', detail: 'Employer-form puzzle and checkpoints' },
      ].map(destination => <Link key={destination.route} href={destination.route}
        className="flex min-h-24 flex-col justify-between rounded-xl border border-border bg-card p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
        data-testid={'journey-destination-' + destination.name.toLowerCase().replaceAll(' ', '-')}>
        <span className="flex items-center justify-between text-sm font-bold">{destination.name}<ArrowRight size={17} className="text-primary" /></span>
        <span className="mt-2 text-xs text-muted-foreground">{destination.detail}</span>
      </Link>)}
    </section>

    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-label="All canonical application scenes">
      <div className="flex items-center gap-2"><Map size={20} aria-hidden="true" className="text-primary" /><h2 className="font-display text-2xl">From installation to final review</h2></div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">These are EscapeHatch’s canonical scene states, including sign-in and recovery. Each has a user-facing destination, even when the actual action belongs inside employer Chrome or the installer.</p>
      <ol className="mt-5 grid gap-2 md:grid-cols-2">
        {canonicalScenes.map((scene, index) => <li key={scene.id} className="rounded-xl border border-border p-3" data-testid={'journey-canonical-' + scene.id.toLowerCase()}>
          <p className="font-mono-app text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')} · {scene.id.replaceAll('_', ' ')} · {scene.location}</p>
          <p className="mt-2 text-sm font-semibold">{scene.title}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Link href={scene.route} className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-primary underline underline-offset-4">{scene.action} <ArrowRight size={13} /></Link>
            {scene.operatorOnly && <span className="text-[10px] font-bold text-muted-foreground">You decide</span>}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Transitions: {scene.outgoing.length ? scene.outgoing.map(id => id.replaceAll('_', ' ').toLowerCase()).join(' · ') : 'No next scene in this registry'}</p>
        </li>)}
      </ol>
    </section>
    <footer className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm text-muted-foreground">
      <ShieldCheck size={19} className="mt-0.5 shrink-0 text-primary" />
      <p>Autofill is a reviewed, user-invoked capability—not a reward that bypasses safeguards. Employer sign-in, sensitive choices and final Submit stay in your control. <CheckCircle2 size={14} className="inline text-primary" /> Saved answers are not employer acceptance.</p>
    </footer>
  </div>;
}
