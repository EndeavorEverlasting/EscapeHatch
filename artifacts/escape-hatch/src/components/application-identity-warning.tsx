import type { Application } from '@/lib/storage';

export function ApplicationIdentityWarning({ application }: { application: Application }) {
  if (!application.reconciliationConflict) return null;
  return <p role="alert" className="m-5 text-sm text-destructive">
    The job link changed during reconciliation. Your original opportunity and evidence were preserved.
    Check the tracker link; add a separate opportunity for a different job.
  </p>;
}
