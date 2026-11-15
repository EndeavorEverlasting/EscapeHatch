import registry from '../../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };

export const PUBLIC_ROUTES = ['/', '/profile', '/sources', '/answers', '/applications', '/assist', '/materials', '/journey'] as const;

/** The guide only projects catalogued text and destinations. Host code owns progression. */
export const JOURNEY_DESTINATIONS = registry.guide_stops;

export function projectJourneyWayfinding() {
  return registry.scenes.map(scene => ({
    id: scene.id,
    title: scene.coach_prompt,
    route: scene.wayfinding.route,
    action: scene.wayfinding.action,
    location: scene.wayfinding.location,
    operatorOnly: scene.wayfinding.operator_only,
    outgoing: registry.transitions.filter(edge => edge.from === scene.id).map(edge => edge.to),
  }));
}

export function getJourneyBranches(sceneId: string) {
  return registry.transitions.filter(edge => edge.from === sceneId).map(edge => ({
    to: edge.to,
    title: registry.scenes.find(scene => scene.id === edge.to)?.coach_prompt ?? edge.to,
    when: edge.guide_when,
  }));
}

export function getJourneyStop(id: string) {
  const stop = JOURNEY_DESTINATIONS.find(item => item.id === id);
  if (!stop) throw new Error('Unknown journey stop: ' + id);
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
