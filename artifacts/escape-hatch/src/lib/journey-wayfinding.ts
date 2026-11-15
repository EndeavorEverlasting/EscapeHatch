import registry from '../../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };

export const PUBLIC_ROUTES = ['/', '/profile', '/sources', '/answers', '/applications', '/assist', '/materials', '/journey'] as const;

/** The guide only projects catalogued text and destinations. Host code owns progression. */
export const JOURNEY_DESTINATIONS = registry.guide_stops;

const containerSceneIds = new Set(['HOME_READY', 'OPPORTUNITY_INTAKE', 'PREREQUISITES']);

export const containerAssistLabel = 'Application prep';
export const containerMaterialsHelp = 'Open the posting in your browser and attach your files there. EscapeHatch’s exact-PDF review is available in the native Windows workspace.';

export function projectJourneyWayfinding(container = false) {
  const scenes = container ? registry.scenes.filter(scene => containerSceneIds.has(scene.id)) : registry.scenes;
  return scenes.map(scene => ({
    id: scene.id,
    title: scene.coach_prompt,
    route: scene.wayfinding.route,
    action: scene.wayfinding.action,
    location: scene.wayfinding.location,
    operatorOnly: scene.wayfinding.operator_only,
    outgoing: getJourneyBranches(scene.id, container).map(edge => edge.to),
  }));
}

export function getJourneyBranches(sceneId: string, container = false) {
  if (container && !containerSceneIds.has(sceneId)) return [];
  return registry.transitions.filter(edge => edge.from === sceneId && (!container || containerSceneIds.has(edge.to))).map(edge => ({
    to: edge.to,
    title: registry.scenes.find(scene => scene.id === edge.to)?.coach_prompt ?? edge.to,
    when: edge.guide_when,
  }));
}

export function getJourneyStop(id: string, container = false) {
  const stop = JOURNEY_DESTINATIONS.find(item => item.id === id);
  if (!stop) throw new Error('Unknown journey stop: ' + id);
  if (container && stop.id === 'applications') return { ...stop, action: 'Open ' + containerAssistLabel };
  if (container && stop.id === 'assist') return {
    ...stop, title: 'Prepare for the employer form',
    detail: 'Review your saved answers and career details, then open the posting in your browser.',
    host_scene: null, next: 'review', action: 'Review your application',
  };
  if (container && stop.id === 'review') return {
    ...stop, route: '/applications', title: 'Review and submit in your browser',
    detail: 'Open the posting from Applications. Check the employer’s fields and attachments before you submit.',
    host_scene: null, action: 'Open Applications', next: 'applications',
  };
  return stop;
}

export function getWorkspaceGuide(route: string) {
  return JOURNEY_DESTINATIONS.find(stop => stop.route === route);
}

export function journeyAtlasHref(sceneId: string, opportunityId?: string) {
  const query = new URLSearchParams({ scene: sceneId });
  if (opportunityId) query.set('opportunityId', opportunityId);
  return '/journey?' + query;
}

export function journeyOpportunityHref(route: '/assist' | '/materials', opportunityId?: string) {
  return opportunityId ? route + '?' + new URLSearchParams({ opportunityId }).toString() : route;
}
