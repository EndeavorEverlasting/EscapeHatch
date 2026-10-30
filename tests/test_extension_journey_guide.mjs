import test from 'node:test';
import assert from 'node:assert/strict';
import guide from '../browser/application-assist/journey-guide.js';

test('the extension guide has reachable, distinct scenes and an explicit submission boundary', () => {
  assert.equal(guide.STEPS.length, 6);
  assert.equal(new Set(guide.STEPS.map(s => s.id)).size, 6);
  assert.deepEqual(guide.STEPS.map(s => s.id), ['profile','workspace','opportunity','session','fill','review']);
  assert.match(guide.guideStep(5).detail, /You alone choose final Submit/);
  assert.ok(guide.STEPS.every(s => s.action && s.detail && s.target));
});
test('clamped guidance cannot silently unlock capabilities or invent application completion', () => {
  for (const i of [-123, 0, 2, 5, 7, Number.NaN]) {
    const projected = guide.guideProgress(i);
    assert.equal(projected.capabilityUnlocked, false);
    assert.equal(projected.employerSubmissionConfirmed, false);
    assert.ok(projected.displayedStep >= 1 && projected.displayedStep <= 6);
  }
  assert.equal(guide.nextStep(5,1), 5);
  assert.equal(guide.nextStep(0,-1), 0);
});
test('phone interactions route to a visible command sheet rather than hidden mouse buttons', () => {
  assert.equal(guide.resolveTarget(guide.guideStep(3),'phone'),'phoneSheet');
  assert.equal(guide.resolveTarget(guide.guideStep(4),'phone'),'phoneSheet');
  assert.equal(guide.resolveTarget(guide.guideStep(0),'phone'),'profilePanel');
  assert.equal(guide.resolveTarget(guide.guideStep(4),'mouse'),'fillAllowed');
});
