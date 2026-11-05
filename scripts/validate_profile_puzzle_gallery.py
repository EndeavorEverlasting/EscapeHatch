#!/usr/bin/env python3
"""Integrity gate for the canonical public puzzle catalog and its shipped artwork."""
import hashlib
import json
import re
import struct
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / 'artifacts' / 'escape-hatch'
manifest = APP / 'src' / 'lib' / 'profile-puzzle-gallery.v1.json'
data = json.loads(manifest.read_text(encoding='utf-8'))
assert data['schema_version'] == 'escapehatch-profile-puzzle-gallery/v1'
keys = data['piece_keys']
assert len(keys) == len(set(keys)) == 10
assert data['source_projection'] == 'src/lib/profile-puzzle-projection.ts'
seen = set()
for entry in data['sets']:
    assert re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*', entry['id'])
    assert entry['id'] not in seen
    seen.add(entry['id'])
    assert entry['piece_keys'] == keys
    assert entry['reward']['type'] == 'decorative-local-milestone'
    art = entry['artwork']
    if art is None:
        assert entry['kind'] == 'minimal'
        continue
    assert entry['kind'] == 'illustrated'
    assert art['alt'] and art['provenance']
    assert re.fullmatch('/puzzles/[a-z0-9-]+[.]png', art['path'])
    blob = (APP / 'public' / art['path'].lstrip('/')).read_bytes()
    assert len(blob) == art['bytes']
    assert hashlib.sha256(blob).hexdigest() == art['sha256']
    assert blob[:8] == bytes([137,80,78,71,13,10,26,10])
    assert struct.unpack('>II', blob[16:24]) == (art['width'], art['height'])
print(f'PASS: {len(seen)} gallery sets, {len(keys)} evidence-bound pieces, exact artwork checksum')
