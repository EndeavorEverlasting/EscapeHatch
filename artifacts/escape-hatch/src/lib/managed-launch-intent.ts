/**
 * One-shot same-tab launch intent issued by an explicit EscapeHatch UI click.
 * A direct URL, page reload, or external website cannot issue the intent.
 * No personal data, URLs, or credentials are persisted.
 */
export const MANAGED_LAUNCH_INTENT_KEY = 'escapehatch.managed-launch-intent.v1';
const INTENT_TTL_MS = 90_000;

type StoragePort = Pick<Storage, 'setItem' | 'getItem' | 'removeItem'>;

export function stageManagedLaunchIntent(
  opportunityId: string,
  storage: StoragePort,
  now = Date.now(),
): void {
  if (!opportunityId || opportunityId.length > 128) return;
  storage.setItem(MANAGED_LAUNCH_INTENT_KEY, JSON.stringify({
    opportunityId, issuedAt: now,
  }));
}

export function consumeManagedLaunchIntent(
  storage: StoragePort,
  now = Date.now(),
): string | null {
  const raw = storage.getItem(MANAGED_LAUNCH_INTENT_KEY);
  storage.removeItem(MANAGED_LAUNCH_INTENT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { opportunityId?: unknown; issuedAt?: unknown };
    if (typeof value.opportunityId !== 'string' || !value.opportunityId ||
        value.opportunityId.length > 128 || typeof value.issuedAt !== 'number' ||
        !Number.isFinite(value.issuedAt) ||
        now < value.issuedAt || now - value.issuedAt > INTENT_TTL_MS) return null;
    return value.opportunityId;
  } catch {
    return null;
  }
}
