#!/usr/bin/env python3
"""Add a new original artwork variation to one existing puzzle module, never overwrite."""
import argparse
import hashlib
import json
import os
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'artifacts/escape-hatch/src/lib/puzzle-atlas.v1.json'
PUBLIC = ROOT / 'artifacts/escape-hatch/public/puzzles'
PNG = bytes([137,80,78,71,13,10,26,10])

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--module', required=True)
    p.add_argument('--id', required=True, help='Unique slug, e.g. starlit')
    p.add_argument('--title', required=True)
    p.add_argument('--artwork', required=True)
    p.add_argument('--alt', required=True)
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    assert re.fullmatch('[a-z][a-z0-9]*(?:-[a-z0-9]+)*', args.id)
    assert args.title.strip() and args.alt.strip()
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    assert data['schema_version'] == 'escapehatch-puzzle-atlas/v1'
    module = next((m for m in data['modules'] if m['id'] == args.module), None)
    assert module is not None, 'Use a registered puzzle module'
    assert args.id not in {v['id'] for v in module['variations']}, 'Variation already exists'
    source = Path(args.artwork).resolve(strict=True)
    assert source.suffix.lower() == '.png'
    blob = source.read_bytes()
    assert blob[:8] == PNG and 0 < len(blob) <= 20_000_000
    width, height = struct.unpack('>II', blob[16:24])
    assert 256 <= width <= 8192 and 256 <= height <= 8192
    asset_id = f"{args.module}-{args.id}-v1"
    target = PUBLIC / (asset_id + '.png')
    assert not target.exists(), 'Original asset cannot be overwritten'
    assert asset_id not in {a['asset_id'] for a in module['additional_artworks']}
    art = {
        'asset_id': asset_id, 'target_path': '/puzzles/' + target.name,
        'path': '/puzzles/' + target.name, 'sha256': hashlib.sha256(blob).hexdigest(),
        'width': width, 'height': height, 'bytes': len(blob),
        'alt': args.alt, 'status': 'shipped',
        'provenance': 'Operator-reviewed, versioned original art variant'
    }
    variation = {'id': args.id, 'title': args.title, 'mode': 'illustrated', 'artwork_asset_id': asset_id}
    print(json.dumps({'module': args.module, 'asset': art, 'variation': variation}, indent=2))
    if not args.apply:
        print('PREVIEW ONLY. Pass --apply after visual/source review.')
        return
    PUBLIC.mkdir(parents=True, exist_ok=True)
    with target.open('xb') as out:
        out.write(blob)
    module['additional_artworks'].append(art)
    module['variations'].append(variation)
    tmp = CATALOG.with_suffix('.json.tmp')
    with tmp.open('x', encoding='utf-8') as out:
        json.dump(data, out, indent=2)
        out.write('\n')
    os.replace(tmp, CATALOG)
    print('ADDED:', asset_id)
    print('NEXT: python scripts/validate_puzzle_atlas.py')

if __name__ == '__main__':
    main()
