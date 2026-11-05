import manifest from './puzzle-atlas.v1.json';
import type { ProfilePuzzleSnapshot, ProfilePuzzleStatus } from './profile-puzzle-projection.ts';
import type { RecoveredKnowledge } from './answer-recovery.ts';

export type AnswerKind = 'standard' | 'narrative' | 'rare' | 'restricted';
export type AtlasPiece = { key: string; status: ProfilePuzzleStatus; label: string };
export type AtlasModule = (typeof manifest.modules)[number];
export const PUZZLE_ATLAS_MODULES: readonly AtlasModule[] = manifest.modules;
export const PUZZLE_ANSWER_KINDS = manifest.answer_kinds;

/** Classification of question identity, NOT permission to autofill. */
export function classifyRecoveredAnswer(item: Pick<RecoveredKnowledge, 'scope' | 'questionKey' | 'category'>): AnswerKind {
  const key = item.questionKey.toLowerCase();
  const family = item.category.toLowerCase();
  if (/^(eeo\.|legal\.|military\.|demographic|consent\.)/.test(key) ||
      /(?:legal|attest|signature|demographic|eeo|sensitive)/.test(family)) return 'restricted';
  if (item.scope === 'reusable') return 'narrative';
  if (key.startsWith('prompt:')) return 'rare';
  return 'standard';
}

export function projectPuzzleAtlas(snapshot: ProfilePuzzleSnapshot, recovery?: {
  items: readonly RecoveredKnowledge[];
  loading: boolean;
  unavailable: readonly string[];
}) {
  const known = new Map(snapshot.pieces.map(piece => [piece.key, piece.status]));
  const measuredAnswers = Boolean(recovery && !recovery.loading && recovery.unavailable.length === 0);
  const answers = measuredAnswers ? recovery!.items : [];
  const statusFrom = (group: readonly RecoveredKnowledge[]): ProfilePuzzleStatus => {
    if (!measuredAnswers) return 'unmeasured';
    if (!group.length) return 'unmeasured'; // No expected inventory: never invent a missing requirement.
    if (group.some(item => item.status === 'needs-review')) return 'needs_review';
    return group.some(item => item.status === 'recovered') ? 'saved' : 'missing';
  };
  const pickAnswer = (test: (item: RecoveredKnowledge) => boolean) => statusFrom(answers.filter(test));
  const stateFor = (key: string): ProfilePuzzleStatus => {
    if (key.startsWith('answer:')) {
      const name = key.slice('answer:'.length);
      return pickAnswer(item => item.scope === 'reusable' && item.questionKey === name);
    }
    if (key.startsWith('question:')) {
      const name = key.slice('question:'.length);
      return pickAnswer(item => item.scope === 'question' && item.questionKey === name);
    }
    if (key.startsWith('answers:')) {
      const name = key.slice('answers:'.length);
      return pickAnswer(item => classifyRecoveredAnswer(item) === name && item.status !== 'missing');
    }
    // Materials, education and extension data have independent owners. No inferred
    // source presence or readiness without their actual authorizing projections.
    if (key.includes(':')) return 'unmeasured';
    return known.get(key) ?? 'unmeasured';
  };
  return PUZZLE_ATLAS_MODULES.map(module => {
    const pieces: AtlasPiece[] = module.signals.map(key => ({ key, label: key.replace(/^(answer:|question:|answers:|document:|source:|integration:)/, '').replace(/[_.-]/g, ' '), status: stateFor(key) }));
    const saved = pieces.filter(piece => piece.status === 'saved').length;
    const pending = pieces.filter(piece => piece.status === 'needs_review').length;
    const fullyMeasured = pieces.every(piece => piece.status !== 'unmeasured');
    const unlocked = fullyMeasured && pieces.length > 0 && pieces.every(piece => piece.status === 'saved');
    return { ...module, pieces, saved, pending, fullyMeasured, unlocked, total: pieces.length };
  });
}
