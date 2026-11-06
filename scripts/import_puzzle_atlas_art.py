#!/usr/bin/env python3
"""Import operator-original illustrated EscapeHatch puzzle worlds, hash-first.

Usage:
  python scripts/import_puzzle_atlas_art.py --source-dir PATH
  python scripts/import_puzzle_atlas_art.py --source-dir PATH --apply
  python scripts/import_puzzle_atlas_art.py --archive EscapeHatch_Ten_Puzzle_Original_Art_2026-11-05.zip --apply

Do not generate, crop or reinterpret artwork. This script changes no applicant data.
"""
import argparse
import hashlib
import json
import os
import re
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'artifacts' / 'escape-hatch'
CATALOG = APP / 'src/lib/puzzle-atlas.v1.json'
TARGET_DIR = APP / 'public/puzzles'
PNG = bytes([137,80,78,71,13,10,26,10])

def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--source-dir')
    source.add_argument('--archive', help='An exact-original ZIP with originals/<filename>.png entries')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    source_dir = Path(args.source_dir).resolve(strict=True) if args.source_dir else None
    archive_path = Path(args.archive).resolve(strict=True) if args.archive else None
    archive = zipfile.ZipFile(archive_path) if archive_path else None
    if archive:
        assert len(archive.infolist()) <= 100, 'Unexpected archive size'
        assert all(info.file_size <= 20_000_000 for info in archive.infolist()), 'Oversized archive entry'
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    assert data['schema_version'] == 'escapehatch-puzzle-atlas/v1'
    prepared = []
    for module in data['modules']:
        art = module['artwork']
        assert art['original_filename'] == Path(art['original_filename']).name
        assert re.fullmatch(r'/puzzles/[a-z0-9-]+[.]png', art['target_path'])
        target = APP / 'public' / art['target_path'].lstrip('/')
        if art['path']:
            continue  # Already verified by the repository's atlas validator.
        if archive:
            entry = 'originals/' + art['original_filename']
            assert entry in archive.namelist(), f'Missing original: {entry}'
            blob = archive.read(entry)
        else:
            source_file = source_dir / art['original_filename']
            assert source_file.is_file(), f'Missing original: {source_file}'
            blob = source_file.read_bytes()
        assert 0 < len(blob) <= 20_000_000 and blob[:8] == PNG, f'Invalid PNG: {art["original_filename"]}'
        assert struct.unpack('>II', blob[16:24]) == (art['width'],art['height']), f'Wrong size: {art["original_filename"]}'
        assert hashlib.sha256(blob).hexdigest() == art['sha256'], f'Hash mismatch: {art["original_filename"]}'
        if target.exists():
            assert target.read_bytes() == blob, f'Unrelated destination exists: {target}'
        prepared.append((module, target, blob))
    if archive: archive.close()
    print(f'PREFLIGHT: {len(prepared)} original, immutable illustrations matched to versioned catalog.')
    if not args.apply:
        print('DRY RUN: no files or catalog changed. Use --apply to install exactly these verified originals.')
        return
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    for module, target, blob in prepared:
        if not target.exists():
            # Original write is exclusive, so existing unrelated art cannot be replaced.
            with target.open('xb') as output:
                output.write(blob)
        module['artwork']['path'] = module['artwork']['target_path']
        module['artwork']['status'] = 'shipped'
    tmp = CATALOG.with_suffix('.json.tmp')
    with tmp.open('x', encoding='utf-8') as output:
        json.dump(data, output, indent=2)
        output.write('\n')
    os.replace(tmp, CATALOG)
    print('REGISTERED:', ', '.join(module['id'] for module, _, _ in prepared))
    print('NEXT: python scripts/validate_puzzle_atlas.py')

if __name__ == '__main__':
    main()
