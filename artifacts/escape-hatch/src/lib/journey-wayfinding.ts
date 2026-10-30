import registry from '../../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };

/** Website wayfinding is a projection of canonical scenes, not a second scene registry. */
export const PUBLIC_ROUTES = ['/', '/profile', '/sources', '/answers', '/applications', '/assist', '/journey'] as const;
export type PublicRoute = typeof PUBLIC_ROUTES[number];
export type JourneyWayfinding = {
  id: string;
  title: string;
  route: PublicRoute;
  action: string;
  location: string;
  operatorOnly: boolean;
  outgoing: string[];
};
const routeForScene: Record<string, { route: PublicRoute; action: string; location: string }> = {
  INSTALL_ACQUIRE: { route: '/journey', action: 'Read installation and setup guide', location: 'Setup' },
  INSTALL_PREFLIGHT: { route: '/journey', action: 'See setup requirements', location: 'Setup' },
  INSTALL_APPROVAL: { route: '/journey', action: 'Review installation choices', location: 'Setup' },
  INSTALL_VERIFY: { route: '/journey', action: 'Check the setup checklist', location: 'Setup' },
  HOME_READY: { route: '/', action: 'Open Today', location: 'Website' },
  OPPORTUNITY_INTAKE: { route: '/applications', action: 'Find or add an opportunity', location: 'Website' },
  PREREQUISITES: { route: '/profile', action: 'Review reusable identity details', location: 'Website' },
  APPLICATION_ENTRY: { route: '/assist', action: 'Open browser assist', location: 'Website + employer Chrome' },
  AUTH_HANDOFF: { route: '/assist', action: 'See employer sign-in instructions', location: 'Employer Chrome' },
  AUTH_RECHECK: { route: '/assist', action: 'Check whether the same form returned', location: 'Website + employer Chrome' },
  FORM_PREPARATION: { route: '/assist', action: 'Inspect and prepare the form', location: 'Website + employer Chrome' },
  MANUAL_DECISION: { route: '/assist', action: 'Review the pending decision', location: 'Employer Chrome' },
  FINAL_REVIEW: { route: '/assist', action: 'Review before your own Submit', location: 'Employer Chrome' },
  RECOVERY: { route: '/assist', action: 'See checkpoint and recovery', location: 'Website + employer Chrome' },
};
/** Fail closed if the owning contract adds scenes without a human-reachable destination. */
export function projectJourneyWayfinding(): JourneyWayfinding[] {
  return registry.scenes.map(scene => {
    const destination = routeForScene[scene.id];
    if (!destination) throw new Error('scene_without_public_wayfinding:' + scene.id);
    return {
      id: scene.id,
      title: scene.coach_prompt,
      route: destination.route,
      action: destination.action,
      location: destination.location,
      operatorOnly: scene.id === 'MANUAL_DECISION' || scene.id === 'FINAL_REVIEW' ||
        scene.id === 'INSTALL_APPROVAL' || scene.id === 'AUTH_HANDOFF',
      outgoing: registry.transitions.filter(edge => edge.from === scene.id).map(edge => edge.to),
    };
  });
}
/** This ordered guide is navigation, never an application completion calculation. */
export const JOURNEY_DESTINATIONS: { route: PublicRoute; title: string; detail: string; badge: string }[] = [
  { route: '/sources', title: 'Bring your career sources', detail: 'Import facts you can verify; choose which ones to approve.', badge: 'Prepare' },
  { route: '/profile', title: 'Build your reusable profile', detail: 'Review names, contact details and work history once.', badge: 'Prepare' },
  { route: '/answers', title: 'Prepare reusable answers', detail: 'Save truthful responses before applications interrupt you.', badge: 'Prepare' },
  { route: '/applications', title: 'Select an opportunity', detail: 'Choose the exact employer and save its job-specific context.', badge: 'Apply' },
  { route: '/assist', title: 'Assemble the employer puzzle', detail: 'Open Chrome, inspect required fields, and resume your checkpoint.', badge: 'Apply' },
  { route: '/assist', title: 'Review and submit yourself', detail: 'Review verified fields, documents and the employer’s final action.', badge: 'You decide' },
];
