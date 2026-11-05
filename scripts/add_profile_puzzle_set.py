#!/usr/bin/env python3
"""Register another original illustration without changing existing profile evidence."""
import argparse
import hashlib
import json
import re
import shutil
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'artifacts/escape-hatch/src/lib/profile-puzzle-gallery.v1.json'
PUBLIC = ROOT / 'artifacts/escape-hatch/public/puzzles'

def main():
    parser = argparse.ArgumentParser()
    for name in ('id', 'title', 'blurb', 'artwork', 'alt', 'reward-id', 'reward-label'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--apply', action='store_true', help='Write only after explicit review')
    args = parser.parse_args()
    assert re.fullmatch('[a-z][a-z0-9]*(?:-[a-z0-9]+)*', args.id)
    assert re.fullmatch('[a-z][a-z0-9]*(?:-[a-z0-9]+)*', args.reward_id)
    assert all(getattr(args, name).strip() for name in ('title', 'blurb', 'alt', 'reward_label'))
    source = Path(args.artwork).resolve(strict=True)
    assert source.is_file() and source.suffix.lower() == '.png'
    blob = source.read_bytes()
    assert 0 < len(blob) <= 20_000_000
    assert blob[:8] == bytes([137,80,78,71,13,10,26,10]), 'Original must be PNG'
    width, height = struct.unpack('>II', blob[16:24])
    assert 64 <= width <= 8192 and 64 <= height <= 8192
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    assert catalog['schema_version'] == 'escapehatch-profile-puzzle-gallery/v1'
    assert args.id not in {item['id'] for item in catalog['sets']}
    assert args.reward_id not in {item['reward']['id'] for item in catalog['sets']}
    destination = PUBLIC / (args.id + '.png')
    assert not destination.exists(), 'Never overwrite an existing illustration'
    entry = {
        'id': args.id, 'title': args.title, 'blurb': args.blurb,
        'kind': 'illustrated',
        'artwork': {'path': '/puzzles/' + destination.name, 'alt': args.alt,
                    'sha256': hashlib.sha256(blob).hexdigest(), 'bytes': len(blob),
                    'width': width, 'height': height,
                    'provenance': 'Operator-approved supplied original; review before publishing'},
        'piece_keys': catalog['piece_keys'],
        'reward': {'id': args.reward_id, 'label': args.reward_label,
                   'type': 'decorative-local-milestone'}
    }
    print(json.dumps(entry, indent=2))
    if not args.apply:
        print('PREVIEW ONLY: pass --apply to create the image and append the catalog entry')
        return
    PUBLIC.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as output:
        output.write(blob)
    catalog['sets'].append(entry)
    CATALOG.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
    print('ADDED:', destination)

if __name__ == '__main__':
    main()
