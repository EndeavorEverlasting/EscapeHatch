import { useState } from 'react';
import { Link } from 'wouter';
import { Puzzle, Sparkles } from 'lucide-react';
import { projectPuzzleAtlas } from '@/lib/puzzle-atlas';
import type { ProfilePuzzleSnapshot } from '@/lib/profile-puzzle-projection';
import type { RecoveredKnowledge } from '@/lib/answer-recovery';
import './puzzle-atlas-shelf.css';

const stateWords = {
  saved: 'Saved locally',
  needs_review: 'Review required',
  missing: 'Open piece',
  unmeasured: 'Not measured',
} as const;

export function PuzzleAtlasShelf({ snapshot, recovery }: {
  snapshot: ProfilePuzzleSnapshot;
  recovery?: { items: readonly RecoveredKnowledge[]; loading: boolean; unavailable: readonly string[] };
}) {
  const modules = projectPuzzleAtlas(snapshot, recovery);
  const [selectedId, setSelectedId] = useState('identity-hatch');
  const [variation, setVariation] = useState('illustrated');
  const selected = modules.find(item => item.id === selectedId) || modules[0];
  const setSelection = (id: string) => { setSelectedId(id); setVariation('illustrated'); };
  const visiblePieces = variation === 'focus' ? selected.pieces.filter(piece => piece.status !== 'saved') : selected.pieces;
  const availableArtwork = variation === 'illustrated' ? selected.artwork.path : null;
  const status = selected.fullyMeasured ? `${selected.saved} / ${selected.total} locally saved signals`
    : `${selected.saved} confirmed locally · source coverage not fully measured`;
  return <section className="puzzle-atlas mt-5" aria-labelledby="puzzle-atlas-title" data-testid="puzzle-atlas">
    <div className="puzzle-atlas-heading">
      <div>
        <p className="puzzle-atlas-eyebrow"><Sparkles size={14} aria-hidden="true" /> Your puzzle universe</p>
        <h3 id="puzzle-atlas-title" className="font-display text-2xl sm:text-3xl">Ten worlds. One story.</h3>
        <p className="mt-1 text-xs leading-5">Each module covers a different part of your workspace. Explore any world or focus on the next useful piece.</p>
      </div>
      <span className="puzzle-atlas-number">10 worlds · 3 ways to play</span>
    </div>
    <div className="puzzle-atlas-rail" role="group" aria-label="Choose a puzzle module">
      {modules.map(module => <button type="button" key={module.id}
        className="puzzle-atlas-card" data-testid={`puzzle-module-${module.id}`}
        data-selected={selected.id === module.id}
        aria-pressed={selected.id === module.id} onClick={() => setSelection(module.id)}>
        <span className="puzzle-atlas-card-icon"><Puzzle size={18} aria-hidden="true" /></span>
        <span className="puzzle-atlas-card-title">{module.title}</span>
        <span className="puzzle-atlas-card-caption">{module.fullyMeasured ? `${module.saved} of ${module.total} saved` : 'Explore this world'}</span>
      </button>)}
    </div>
    <div className="puzzle-atlas-stage" data-variation={variation}>
      <div className="puzzle-atlas-stage-art">
        {availableArtwork ? <img src={availableArtwork} width={selected.artwork.width} height={selected.artwork.height}
          loading="lazy" alt={selected.title + ' original illustrated puzzle world'} data-testid="puzzle-atlas-artwork"/> :
          <div className="puzzle-atlas-stage-motif" aria-label="Illustration unavailable in this installed release">
            <Puzzle size={48} aria-hidden="true" />
            <span>{variation === 'illustrated' ? 'Original artwork is in the source collection; not installed here yet.' : 'An uncluttered way to explore your pieces.'}</span>
          </div>}
      </div>
      <div className="puzzle-atlas-stage-info">
        <p className="puzzle-atlas-eyebrow">Selected world</p>
        <h4 className="font-display text-3xl">{selected.title}</h4>
        <p className="mt-2 text-sm leading-6">{selected.description}</p>
        <label className="mt-5 block text-xs font-bold" htmlFor="puzzle-atlas-variation">Choose your variation</label>
        <select id="puzzle-atlas-variation" className="puzzle-atlas-variation mt-2"
          data-testid="puzzle-atlas-variation" value={variation} onChange={event => setVariation(event.target.value)}>
          {selected.variations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <p className="mt-4 text-xs font-bold" data-testid="puzzle-atlas-status">{status}</p>
        {selected.pending > 0 && <p className="mt-1 text-xs">Some recorded pieces require your review; they are not counted as saved.</p>}
        <div className="puzzle-atlas-pieces mt-3" role="group" aria-label={selected.title + ' evidence pieces'}>
          {visiblePieces.length ? visiblePieces.map(piece => <span key={piece.key} className="puzzle-atlas-piece"
            data-state={piece.status} title={piece.label + ': ' + stateWords[piece.status]}>
            <span aria-hidden="true" className="puzzle-atlas-piece-mark">{piece.status === 'saved' ? '✓' : piece.status === 'needs_review' ? '!' : '?'}</span>
            <span>{piece.label}</span>
            <small>{stateWords[piece.status]}</small>
          </span>) : <span className="text-xs">No open pieces in this measured view.</span>}
        </div>
        <Link href={selected.href} className="puzzle-atlas-action mt-4" data-testid="puzzle-atlas-action">Explore {selected.title}</Link>
        <p className="mt-3 text-xs leading-5">Artwork and variations never change your verified facts, employer form, answer approvals, or Submit authority.</p>
        {selected.unlocked && <p className="mt-2 text-xs font-bold" data-testid="puzzle-atlas-reward">{selected.reward.title} — decorative milestone unlocked</p>}
      </div>
    </div>
  </section>;
}
