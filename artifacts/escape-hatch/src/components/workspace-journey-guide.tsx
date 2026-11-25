import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { getJourneyStop, getWorkspaceGuide, journeyAtlasHref } from '@/lib/journey-wayfinding';

const containerWorkspace = import.meta.env.VITE_ESCAPEHATCH_CONTAINER === '1';

/** Guidance for the standalone workspace pages. Assist uses its live coach. */
export function WorkspaceJourneyGuide({ route }: { route: string }) {
  if (route === '/' || route === '/journey' || ((route === '/assist' || route === '/materials') && !containerWorkspace)) return null;
  const current = getWorkspaceGuide(route);
  if (!current) return null;
  const stop = getJourneyStop(current.id, containerWorkspace);
  const next = getJourneyStop(stop.next, containerWorkspace);

  return <section aria-label="EscapeHatch guide" className="mascot-guidance mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:items-center" data-testid="workspace-journey-guide">
    <img src="/escapehatch-mascot.webp" alt="" width={40} height={40} className="tutorial-scene-avatar h-10 w-10 shrink-0" />
    <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">{stop.detail}</p>
    <div className="flex flex-wrap items-center gap-x-4">
      <Link href={next.route} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">{stop.action} <ArrowRight size={14} aria-hidden="true" /></Link>
      <Link href={stop.host_scene ? journeyAtlasHref(stop.host_scene) : '/journey'} className="inline-flex min-h-11 items-center text-xs font-semibold text-muted-foreground underline underline-offset-4">Your journey</Link>
    </div>
  </section>;
}
