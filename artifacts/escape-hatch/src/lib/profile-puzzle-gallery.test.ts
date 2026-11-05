import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLE_GALLERY_SETS, projectPuzzleGallery } from './profile-puzzle-gallery.ts';
import type { ProfilePuzzleSnapshot } from './profile-puzzle-projection.ts';
const keys = PUZZLE_GALLERY_SETS[0].piece_keys;
const sample: ProfilePuzzleSnapshot = {
  pieces: keys.map(key => ({ key, label: key, status: 'missing', sourceOwner: 'profile', nextAction: { label: 'Review', href: '/profile' } })),
  savedCount: 0, total: 10, coverageMeasured: true
};
test('selection only changes art, not profile state', () => {
  const one = projectPuzzleGallery(sample, 'identity-hatch-v1');
  const two = projectPuzzleGallery(sample, 'classic-board-v1');
  assert.deepEqual(one.pieces, two.pieces);
  assert.equal(one.total, 10);
  assert.equal(one.unlocked, false);
});
