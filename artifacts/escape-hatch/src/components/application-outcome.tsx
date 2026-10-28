import { Link } from 'wouter';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { Application } from '@/lib/storage';

export function ApplicationOutcome({ application, receiptCaptured, onChooseAnother }: {
  application: Application;
  receiptCaptured: boolean;
  onChooseAnother: () => void;
}) {
  return (
    <section aria-labelledby="application-outcome-heading" data-testid="application-outcome"
      className="rounded-[1.5rem] border border-primary/20 bg-card p-6 sm:p-9">
      <div className="flex items-start gap-5">
        <img src="/escapehatch-mascot.webp" alt="" width="72" height="72" className="h-16 w-16 shrink-0 sm:h-[72px] sm:w-[72px]" />
        <div className="min-w-0">
          <h2 id="application-outcome-heading" className="font-display text-3xl leading-tight sm:text-4xl">Application recorded.</h2>
          <p className="mt-3 break-words text-lg font-medium">{application.company}</p>
          <p className="mt-1 text-muted-foreground">{application.role}</p>
        </div>
      </div>
      <p className="mt-6 max-w-prose text-sm leading-relaxed text-muted-foreground">
        This job is marked applied in your private workspace. Keep the employer confirmation for your records; you don’t need to apply again.
      </p>
      <dl className="my-7 divide-y divide-border border-y border-border text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <dt>Saved application</dt>
          <dd className="flex items-center gap-2 font-medium text-primary"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Applied</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <dt>Employer receipt capture</dt>
          <dd className="font-medium">{receiptCaptured ? 'Captured in this session' : 'Needs review'}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <dt>Automatic tracker sync</dt>
          <dd className="font-medium">Not verified for this application</dd>
        </div>
      </dl>
      {!receiptCaptured && <p className="mb-6 max-w-prose text-sm leading-relaxed text-muted-foreground">
        The listener hasn’t captured an employer receipt for this job. That is separate from its saved applied status. Review the confirmation; don’t submit again to test the listener.
      </p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/applications" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          View applications <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <button type="button" onClick={onChooseAnother} className="min-h-11 rounded-xl border border-border px-5 py-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Choose another job</button>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">Your <Link href="/answers" className="underline underline-offset-4">saved answers</Link> stay in your private workspace for the next application.</p>
    </section>
  );
}
