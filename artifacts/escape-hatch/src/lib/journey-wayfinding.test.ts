import assert from 'node:assert/strict';
import test from 'node:test';
import registry from '../../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };
import { JOURNEY_DESTINATIONS, PUBLIC_ROUTES, projectJourneyWayfinding } from './journey-wayfinding.ts';

test('all canonical scenes have a visible route and direct action', () => {
  const items = projectJourneyWayfinding();
  assert.equal(items.length, registry.scenes.length);
  assert.deepEqual(items.map(s => s.id), registry.scenes.map(s => s.id));
  for (const item of items) {
    assert.ok(PUBLIC_ROUTES.includes(item.route));
    assert.ok(item.action.trim().length >= 4);
    assert.ok(item.location);
    const scene = registry.scenes.find(scene => scene.id === item.id)!;
    assert.equal(item.title, scene.coach_prompt);
    assert.deepEqual(item.outgoing, registry.transitions.filter(edge => edge.from === item.id).map(edge => edge.to));
    for (const target of item.outgoing) assert.ok(items.some(s => s.id === target));
  }
});
test('submission, legal decisions, login and install consent stay operator-owned', () => {
  const map = new Map(projectJourneyWayfinding().map(s => [s.id, s]));
  for (const id of ['FINAL_REVIEW', 'MANUAL_DECISION', 'AUTH_HANDOFF', 'INSTALL_APPROVAL']) {
    assert.equal(map.get(id)?.operatorOnly, true);
  }
  assert.equal(map.get('FINAL_REVIEW')?.route, '/assist');
  assert.equal(registry.final_submission, 'operator_only');
  assert.ok(registry.scenes.every(scene => scene.terminal_submit_automated === false));
  assert.deepEqual([...map.values()].filter(scene => scene.operatorOnly).map(scene => scene.id),
    ['INSTALL_APPROVAL', 'AUTH_HANDOFF', 'MANUAL_DECISION', 'FINAL_REVIEW']);
  assert.ok(JOURNEY_DESTINATIONS.every(s => PUBLIC_ROUTES.includes(s.route)));
});
test('prepare-before-apply destinations remain visible, not gated by agent invocation', () => {
  const stages = JOURNEY_DESTINATIONS.map(s => s.route);
  assert.equal(stages.length, 6);
  assert.deepEqual(stages.slice(0,3), ['/sources','/profile','/answers']);
  assert.ok(stages.includes('/applications') && stages.includes('/assist'));
});

test('materials is a real website route without inventing a seventh sequential stage', () => {
  assert.ok(PUBLIC_ROUTES.includes('/materials'));
  assert.equal(new Set(PUBLIC_ROUTES).size, PUBLIC_ROUTES.length);
  assert.deepEqual(PUBLIC_ROUTES, ['/', '/profile', '/sources', '/answers', '/applications', '/assist', '/materials', '/journey']);
});

test('profile and employer destinations advertise only the work their surfaces own', () => {
  const profile = JOURNEY_DESTINATIONS.find(stage => stage.route === '/profile')!;
  assert.match(profile.detail, /names, contact details and location/);
  assert.doesNotMatch(profile.detail, /work history|experience|education/);
  const map = new Map(projectJourneyWayfinding().map(scene => [scene.id, scene]));
  for (const id of ['APPLICATION_ENTRY', 'AUTH_HANDOFF', 'AUTH_RECHECK', 'FORM_PREPARATION', 'MANUAL_DECISION', 'FINAL_REVIEW', 'RECOVERY']) {
    assert.equal(map.get(id)?.route, '/assist');
  }
  for (const id of ['INSTALL_ACQUIRE', 'INSTALL_PREFLIGHT', 'INSTALL_APPROVAL', 'INSTALL_VERIFY']) {
    assert.equal(map.get(id)?.route, '/journey');
  }
  assert.match(map.get('FINAL_REVIEW')!.action, /your own Submit/);
});

test('navigation projection carries no completion counts, runtime readiness or action authority', () => {
  const before = JSON.stringify(registry);
  const first = projectJourneyWayfinding();
  assert.deepEqual(projectJourneyWayfinding(), first);
  assert.equal(JSON.stringify(registry), before);
  for (const scene of first) {
    assert.deepEqual(Object.keys(scene).sort(), ['action', 'id', 'location', 'operatorOnly', 'outgoing', 'route', 'title']);
    assert.doesNotMatch(scene.action, /review.ready|100%|complete application|submitted successfully/i);
  }
  for (const stage of JOURNEY_DESTINATIONS) {
    assert.deepEqual(Object.keys(stage).sort(), ['badge', 'detail', 'route', 'title']);
  }
});
