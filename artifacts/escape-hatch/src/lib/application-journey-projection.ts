import registry from '../../../../contracts/application-journey-scenes.v1.json';

type Scene = (typeof registry.scenes)[number];
export type JourneyInput = {
  jobUrl: string;
  emailApproved: boolean;
  documentsApproved: boolean;
  browserOpen: boolean;
  authPhase?: string | null;
  formCanResume?: boolean;
  needsOpportunityConfirmation?: boolean;
  preparationState?: string | null;
};
export type JourneyProjection = {
  current: Scene;
  next: Scene;
  blockers: string[];
  mayAutoSubmit: false;
};

const byId = new Map<string, Scene>(registry.scenes.map(scene => [scene.id, scene]));
function scene(id: string): Scene {
  const item = byId.get(id);
  if (!item) throw new Error('missing_canonical_application_scene:' + id);
  return item;
}
function publicHttps(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.hostname.includes('.') && url.port === '';
  } catch { return false; }
}
/** Derive visible scene guidance from observed state, not a history of button clicks. */
export function projectApplicationJourney(input: JourneyInput): JourneyProjection {
  if (!publicHttps(input.jobUrl)) return {
    current: scene('OPPORTUNITY_INTAKE'), next: scene('OPPORTUNITY_INTAKE'),
    blockers: ['Paste a valid public HTTPS employer job link.'], mayAutoSubmit: false,
  };
  if (!input.emailApproved) return {
    current: scene('PREREQUISITES'), next: scene('PREREQUISITES'),
    blockers: ['Confirm which email employers should use to contact you.'], mayAutoSubmit: false,
  };
  if (!input.browserOpen) return {
    current: scene('APPLICATION_ENTRY'), next: scene('AUTH_HANDOFF'),
    blockers: input.documentsApproved ? [] : ['Review the role-specific résumé and cover-letter package.'],
    mayAutoSubmit: false,
  };
  if (['AUTH_HANDOFF', 'SESSION_ORIGIN_CHANGED'].includes(input.authPhase || '')) return {
    current: scene('AUTH_HANDOFF'), next: scene('AUTH_RECHECK'),
    blockers: ['Finish signing in directly in the managed employer browser.'],
    mayAutoSubmit: false,
  };
  if (input.needsOpportunityConfirmation) return {
    current: scene('AUTH_RECHECK'), next: scene('FORM_PREPARATION'),
    blockers: ['Confirm the returned employer page still belongs to the same job.'],
    mayAutoSubmit: false,
  };
  if (!input.formCanResume) return {
    current: scene('AUTH_RECHECK'), next: scene('FORM_PREPARATION'),
    blockers: ['Employer application form has not passed two stable same-session observations.'],
    mayAutoSubmit: false,
  };
  if (!input.documentsApproved) return {
    current: scene('PREREQUISITES'), next: scene('FORM_PREPARATION'),
    blockers: ['Select and review this opportunity\'s exact documents before any upload.'],
    mayAutoSubmit: false,
  };
  if (input.preparationState === 'REVIEW_READY') return {
    current: scene('FINAL_REVIEW'), next: scene('FINAL_REVIEW'),
    blockers: ['Final Submit is always yours. Review the employer form personally.'],
    mayAutoSubmit: false,
  };
  return {
    current: scene('FORM_PREPARATION'), next: scene('FINAL_REVIEW'),
    blockers: input.preparationState === 'BLOCKED' ? ['Resolve the current blocked form state before continuing.'] : [],
    mayAutoSubmit: false,
  };
}
