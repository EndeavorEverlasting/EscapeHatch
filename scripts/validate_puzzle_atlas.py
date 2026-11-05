#!/usr/bin/env python3
"""Validate the ten-world puzzle atlas without treating absent artwork as installed."""
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'artifacts' / 'escape-hatch'
CATALOG = APP / 'src/lib/puzzle-atlas.v1.json'

def validate():
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    assert data['schema_version'] == 'escapehatch-puzzle-atlas/v1'
    assert data['canonical_existing_gallery'] == 'src/lib/profile-puzzle-gallery.v1.json'
    ids, rewards, asset_ids = set(), set(), set()
    assert len(data['modules']) == 10
    for module in data['modules']:
        id_ = module['id']
        assert re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', id_)
        assert id_ not in ids
        ids.add(id_)
        assert module['title'] and module['description'] and module['href'] in [
            '/profile','/sources','/answers','/assist','/materials'
        ]
        keys = module['signals']
        assert keys and len(keys) == len(set(keys))
        assert len(module['variations']) >= 3
        assert {x['id'] for x in module['variations']} >= {'illustrated','quiet','focus'}
        assert module['reward']['id'] not in rewards
        assert module['reward']['policy'].startswith('cosmetic-only')
        rewards.add(module['reward']['id'])
        art = module['artwork']
        assert art['asset_id'] not in asset_ids
        asset_ids.add(art['asset_id'])
        assert art['target_path'] == f'/puzzles/{id_}-v1.png'
        assert art['width'] == 1448 and art['height'] == 1086
        assert re.fullmatch('[a-f0-9]{64}', art['sha256'])
        assert art['original_filename'] == Path(art['original_filename']).name
        if art['path']:
            assert art['path'] == art['target_path']
            blob = (APP / 'public' / art['path'].lstrip('/')).read_bytes()
            assert blob[:8] == bytes([137,80,78,71,13,10,26,10])
            assert struct.unpack('>II', blob[16:24]) == (art['width'],art['height'])
            assert hashlib.sha256(blob).hexdigest() == art['sha256']
            assert art['status'] == 'shipped'
        else:
            assert art['status'] == 'source-recovered-not-yet-shipped'
            # Prevent a phantom source-state from masquerading as installed art.
            assert not (APP / 'public' / art['target_path'].lstrip('/')).exists()
    kinds = {x['id'] for x in data['answer_kinds']}
    assert kinds == {'standard','narrative','rare','restricted'}
    print(f'PASS: {len(ids)} distinct puzzle modules, {len(asset_ids)} original-art identities, {len(rewards)} decorative milestones; {len(kinds)} answer kinds')

if __name__ == '__main__':
    validate()
