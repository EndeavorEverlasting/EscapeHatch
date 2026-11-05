import gallery from './profile-puzzle-gallery.v1.json';
import type { ProfilePuzzleSnapshot, ProfilePuzzleStatus } from './profile-puzzle-projection.ts';

export type PuzzleGallerySet = (typeof gallery.sets)[number];
export const PUZZLE_GALLERY_SETS: readonly PuzzleGallerySet[] = gallery.sets;
export const PUZZLE_GALLERY_VERSION = gallery.schema_version;

export function resolvePuzzleGallerySet(id: string): PuzzleGallerySet {
  return PUZZLE_GALLERY_SETS.find(set => set.id === id) ?? PUZZLE_GALLERY_SETS[0];
}

/** This is a read-only rendering of the existing profile evidence owner. */
export function projectPuzzleGallery(snapshot: ProfilePuzzleSnapshot, chosenId: string) {
  const set = resolvePuzzleGallerySet(chosenId);
  const byKey = new Map(snapshot.pieces.map(piece => [piece.key, piece.status]));
  const pieces = set.piece_keys.map(key => ({
    key,
    status: (byKey.get(key) ?? 'unmeasured') as ProfilePuzzleStatus,
  }));
  const saved = pieces.filter(piece => piece.status === 'saved').length;
  const unlocked = snapshot.coverageMeasured && pieces.length > 0 &&
    pieces.every(piece => piece.status === 'saved');
  return { set, pieces, saved, total: pieces.length, unlocked };
}
