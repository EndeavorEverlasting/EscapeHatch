import { useState } from 'react';
import { Link } from 'wouter';
import { FolderInput, Layers, ListChecks, Volume2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { projectMascotGuidance } from '@/lib/mascot-guidance';
import type { Profile, Application } from '@/lib/storage';

/** A quiet, user-triggered original two-note chirp; never an automatic notification. */
function playChirp() {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
  try {
    const audio = new window.AudioContext();
    const start = audio.currentTime + 0.015;
    for (const [index, from, to] of [[0, 880, 1150], [1, 1120, 1450]]) {
      const at = start + index * 0.115;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(from, at);
      oscillator.frequency.exponentialRampToValueAtTime(to, at + 0.095);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.035, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.115);
    }
    window.setTimeout(() => { void audio.close().catch(() => undefined); }, 350);
  } catch {
    // Audio output is optional; visual guidance and navigation remain available.
  }
}

export function GuidedStart({ profile, applications }: { profile: Profile; applications: Application[] }) {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const guidance = projectMascotGuidance(profile, applications);
  const steps = [
    { title: 'Bring your career sources', description: 'Drop a résumé into Sources. Review the facts you want to reuse.', href: '/sources', icon: FolderInput },
    { title: 'Choose an opportunity', description: 'Save the employer and application link you want to work on.', href: '/applications', icon: Layers },
    { title: 'Assemble this application', description: 'Inspect the employer’s form, add its documents, and resolve its questions.', href: '/assist', icon: ListChecks },
  ];
  return <section className="guided-start mb-7" aria-label="Start here">
    <div className="max-w-2xl"><h2 className="font-display text-3xl sm:text-4xl">{guidance.essentialMissing.length ? 'Start with what you already have.' : 'Your next application starts here.'}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Your sources become reviewed facts. Each opportunity becomes its own workbench. You stay in control of what reaches an employer.</p></div>
    <div className="mascot-guidance mt-5 flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:p-5" data-testid="mascot-guidance">
      <img src="/escapehatch-mascot.webp" alt="" aria-hidden="true" decoding="async" width={100} height={100} className="mascot-guidance-art h-20 w-20 shrink-0 self-start object-contain sm:h-24 sm:w-24" data-testid="mascot-tutorial-avatar" />
      <div className="min-w-0 flex-1">
        <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.15em] text-primary">{guidance.eyebrow}</p>
        <p className="mt-1 text-sm font-semibold leading-6" data-testid="mascot-chirp-message">{guidance.message}</p>
        <p className="mt-1 text-xs text-muted-foreground" data-testid="mascot-profile-progress">{guidance.profileCount} of {guidance.profileTotal} reusable profile details saved locally. Employer requirements are checked separately.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href={guidance.href} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" data-testid="mascot-next-action">{guidance.action}</Link>
          <button type="button" className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline underline-offset-4" onClick={() => setTutorialOpen(true)} data-testid="button-mascot-puzzle">See the puzzle pieces</button>
          <button type="button" onClick={playChirp} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:text-foreground" aria-label="Play optional chick chirp" title="Play a chirp (off by default)" data-testid="button-mascot-chirp"><Volume2 size={15} aria-hidden="true" /> Hear chirp</button>
        </div>
      </div>
    </div>
    <ol className="mt-6 grid gap-4 md:grid-cols-3">{steps.map((step, index) => <li key={step.href} className={index === guidance.nextStep ? 'guide-step guide-step-current' : 'guide-step'}>
      <step.icon size={24} aria-hidden="true" className="text-primary" />
      <p className="mt-4 text-xs font-bold text-muted-foreground">Step {index + 1}{index === guidance.nextStep ? ' · Suggested next' : ''}</p>
      <h3 className="mt-2 text-base font-bold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
      <Link href={step.href} className="mt-4 inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">{index === guidance.nextStep ? 'Start this step' : 'Open step'}</Link>
    </li>)}</ol>
    <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-bold">How does EscapeHatch work?</summary><p className="max-w-2xl leading-6 text-muted-foreground">You can add career sources before saving a job. Nothing from a dropped file is approved until you review it. In Application Assist, choose a saved opportunity and inspect its current form to see what it asks for. Save and review the exact documents for that job, then prepare the form. Sign-in, sensitive declarations, and final Submit stay with you. Revisit this guide from Today at any time.</p></details>
    <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
      <DialogContent aria-describedby="mascot-tutorial-description" className="max-w-xl" data-testid="mascot-tutorial-overlay">
        <div className="flex items-center gap-4 pr-6">
          <img src="/escapehatch-mascot.webp" alt="" aria-hidden="true" decoding="async" width={72} height={72} className="h-16 w-16 shrink-0 object-contain" data-testid="mascot-overlay-avatar" />
          <div><p className="font-mono-app text-[10px] uppercase tracking-widest text-primary">EscapeHatch guide</p><DialogTitle className="mt-1 font-display text-2xl">Your next puzzle pieces</DialogTitle></div>
        </div>
        <DialogDescription id="mascot-tutorial-description">These are reusable local profile details, not a claim about a particular employer's requirements. Nothing is submitted from this guide.</DialogDescription>
        <div className="rounded-lg border border-border bg-secondary/50 p-4">
          <p className="text-sm font-bold" data-testid="mascot-overlay-progress">{guidance.profileCount} / {guidance.profileTotal} profile details filled</p>
          <div role="progressbar" aria-label="Reusable profile details" aria-valuemin={0} aria-valuemax={guidance.profileTotal} aria-valuenow={guidance.profileCount} className="mt-3 h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-primary" style={{ width: `${guidance.profileCount / guidance.profileTotal * 100}%` }} />
          </div>
        </div>
        {guidance.missing.length ? <div><p className="text-sm font-semibold">Still blank in your reusable profile</p><ul className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="mascot-missing-pieces">{guidance.missing.map(piece => <li key={piece.key} className="flex items-start gap-2 text-sm"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" /><span>{piece.label}<span className="block text-xs text-muted-foreground">{piece.essential ? 'Local profile essential' : 'Optional profile detail'}</span></span></li>)}</ul></div> :
          <p className="text-sm" data-testid="mascot-profile-complete">Your reusable profile checklist is filled. Employer-specific forms may still require more information.</p>}
        <div className="flex flex-wrap gap-3">
          <Link href={guidance.missing.length ? '/profile' : guidance.href} onClick={() => setTutorialOpen(false)} data-testid="mascot-overlay-action" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{guidance.missing.length ? 'Review profile details' : guidance.action}</Link>
          <button type="button" onClick={() => setTutorialOpen(false)} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-bold">Back to guide</button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
