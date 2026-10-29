import type { Profile } from './storage.ts';

/**
 * A compatibility guard for legacy workspaces which do not yet have immutable
 * owner IDs. Names/emails are conflict signals, NOT authentication proofs.
 * Full owner binding must precede any multi-user, cloud or shared-device mode.
 */
export type OwnerContact = Pick<Profile, 'first_name' | 'last_name' | 'email'>;
export type OwnerContext = {
  profile?: Partial<OwnerContact> | null;
  assistContact?: Partial<OwnerContact> | null;
  hasContext: boolean;
  hasDependentData: boolean;
};
export type OwnerBoundary = 'OWNER_CONTEXT_CONFLICT' | 'OWNER_CONTEXT_UNVERIFIED' | null;

const norm = (value?: string) => (value || '').trim().toLocaleLowerCase('en-US');
const contacts = (context: OwnerContext) => [context.profile, context.assistContact].filter(
  (item): item is Partial<OwnerContact> => Boolean(item),
);
const fullName = (contact: Partial<OwnerContact>) => {
  const first = norm(contact.first_name), last = norm(contact.last_name);
  return first && last ? first + ' ' + last : '';
};
const differs = (a: Partial<OwnerContact>, b: Partial<OwnerContact>, dependents: boolean) => {
  const emailA = norm(a.email), emailB = norm(b.email);
  // An editable name can change before a projection's copied contact details.
  // A shared, nonempty legacy email may prevent a *false conflict*, but is
  // never proof of authenticated ownership or permission to cross tenants.
  if (emailA && emailB) return emailA !== emailB;
  return Boolean(fullName(a) && fullName(b) && fullName(a) !== fullName(b)) ||
    Boolean(dependents && norm(a.first_name) && norm(b.first_name) && norm(a.first_name) !== norm(b.first_name));
};
const matches = (a: Partial<OwnerContact>, b: Partial<OwnerContact>) =>
  Boolean(norm(a.email) && norm(a.email) === norm(b.email)) ||
  Boolean(fullName(a) && fullName(a) === fullName(b));

export function checkOwnerBoundary(left: OwnerContext, right: OwnerContext): OwnerBoundary {
  const a = contacts(left), b = contacts(right);
  const dependent = left.hasDependentData || right.hasDependentData;
  if (a.some((c, i) => a.slice(i + 1).some(d => differs(c, d, dependent))) ||
      b.some((c, i) => b.slice(i + 1).some(d => differs(c, d, dependent))) ||
      a.some(c => b.some(d => differs(c, d, dependent)))) return 'OWNER_CONTEXT_CONFLICT';

  // Blank target + imported source is an initial onboarding case, not a merger.
  if (!left.hasContext || !right.hasContext) return null;
  if (!dependent) return null;
  const shared = a.some(c => b.some(d => matches(c, d)));
  // A partial name is not sufficient to join two answer libraries, and
  // an empty profile must not silently inherit a different person's answers.
  return shared ? null : 'OWNER_CONTEXT_UNVERIFIED';
}
