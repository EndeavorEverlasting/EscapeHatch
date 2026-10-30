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
    for (const target of item.outgoing) assert.ok(items.some(s => s.id === target));
  }
});
test('submission, legal decisions, login and install consent stay operator-owned', () => {
  const map = new Map(projectJourneyWayfinding().map(s => [s.id, s]));
  for (const id of ['FINAL_REVIEW', 'MANUAL_DECISION', 'AUTH_HANDOFF', 'INSTALL_APPROVAL']) {
    assert.equal(map.get(id)?.operatorOnly, true);
  }
  assert.equal(map.get('FINAL_REVIEW')?.route, '/assist');
  assert.ok(JOURNEY_DESTINATIONS.every(s => PUBLIC_ROUTES.includes(s.route)));
});
test('prepare-before-apply destinations remain visible, not gated by agent invocation', () => {
  const stages = JOURNEY_DESTINATIONS.map(s => s.route);
  assert.deepEqual(stages.slice(0,3), ['/sources','/profile','/answers']);
  assert.ok(stages.includes('/applications') && stages.includes('/assist'));
});
