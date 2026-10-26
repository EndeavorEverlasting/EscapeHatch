import { Link } from 'wouter';
import { FolderInput, Layers, ListChecks } from 'lucide-react';
import type { Profile, Application } from '@/lib/storage';

export function GuidedStart({ profile, applications }: { profile: Profile; applications: Application[] }) {
  const hasIdentity = Boolean(profile.first_name.trim() && profile.email.trim());
  const hasOpportunity = applications.some(item => !['applied', 'closed'].includes(item.status));
  const steps = [
    { title: 'Bring your career sources', description: 'Drop a résumé into Sources. Review the facts you want to reuse.', href: '/sources', icon: FolderInput },
    { title: 'Choose an opportunity', description: 'Save the employer and application link you want to work on.', href: '/applications', icon: Layers },
    { title: 'Assemble this application', description: 'Inspect the employer’s form, add its documents, and resolve its questions.', href: '/assist', icon: ListChecks },
  ];
  const next = !hasIdentity ? 0 : !hasOpportunity ? 1 : 2;
  return <section className="guided-start mb-7" aria-label="Start here">
    <div className="max-w-2xl"><h2 className="font-display text-3xl sm:text-4xl">{hasIdentity ? 'Your next application starts here.' : 'Start with what you already have.'}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Your sources become reviewed facts. Each opportunity becomes its own workbench. You stay in control of what reaches an employer.</p></div>
    <ol className="mt-6 grid gap-4 md:grid-cols-3">{steps.map((step, index) => <li key={step.href} className={index === next ? 'guide-step guide-step-current' : 'guide-step'}>
      <step.icon size={24} aria-hidden="true" className="text-primary" />
      <p className="mt-4 text-xs font-bold text-muted-foreground">Step {index + 1}{index === next ? ' · Suggested next' : ''}</p>
      <h3 className="mt-2 text-base font-bold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
      <Link href={step.href} className="mt-4 inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">{index === next ? 'Start this step' : 'Open step'}</Link>
    </li>)}</ol>
    <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-bold">How does EscapeHatch work?</summary><p className="max-w-2xl leading-6 text-muted-foreground">You can add career sources before saving a job. Nothing from a dropped file is approved until you review it. In Application Assist, choose a saved opportunity and inspect its current form to see what it asks for. Save and review the exact documents for that job, then prepare the form. Sign-in, sensitive declarations, and final Submit stay with you. Revisit this guide from Today at any time.</p></details>
  </section>;
}
