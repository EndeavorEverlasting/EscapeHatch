#!/usr/bin/env python3
from pathlib import Path
import json, re, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]
required=[
 'artifacts/escape-hatch/src/App.tsx','artifacts/escape-hatch/src/lib/storage.ts',
 'artifacts/escape-hatch/src/lib/assist-contract.ts','artifacts/escape-hatch/package.json',
 'docs/plans/index.md','docs/plans/recovered-task-export.v1.json',
 'scripts/replit-plan-sync/task-plan-sync.ts','scripts/replit-plan-sync/task-plan-sync.test.ts',
 'docs/migrations/REPLIT_TRANSFER_2026-09-20.md']
for rel in required:
    if not (ROOT/rel).is_file(): errors.append(f'missing {rel}')
for rel in ['.replit','.replitignore','replit.md','.agents','attached_assets','.conversation']:
    if (ROOT/rel).exists(): errors.append(f'forbidden donor residue tracked/present: {rel}')
plans=sorted((ROOT/'docs/plans').glob('task-*.md'))
refs=[]
for p in plans:
    m=re.match(r'task-(\d{3})-',p.name)
    if not m: errors.append(f'bad plan filename: {p.name}'); continue
    refs.append(int(m.group(1)))
    text=p.read_text(encoding='utf-8')
    if 'attached_assets/' in text or 'Richard_Perez_Master_Resume' in text:
        errors.append(f'private donor asset reference in {p.name}')
if refs != list(range(1,121)): errors.append(f'expected plan refs 1..120, got {refs[:3]}..{refs[-3:] if refs else []} count={len(refs)}')
try:
    snap=json.loads((ROOT/'docs/plans/recovered-task-export.v1.json').read_text(encoding='utf-8'))
    srefs=[int(str(t['taskRef']).lstrip('#')) for t in snap['tasks']]
    if srefs != list(range(1,121)): errors.append('snapshot refs are not contiguous 1..120')
except Exception as exc: errors.append(f'invalid recovered task snapshot: {exc}')
pkg=json.loads((ROOT/'artifacts/escape-hatch/package.json').read_text(encoding='utf-8'))
if pkg.get('version')!='1.1.0': errors.append('cockpit package version must mirror 1.1.0')
for depmap in ('dependencies','devDependencies'):
    for name,value in pkg.get(depmap,{}).items():
        if name.startswith('@replit/') or name.startswith('@workspace/') or value=='catalog:': errors.append(f'nonportable dependency {name}={value}')
for rel in ['artifacts/escape-hatch/vite.config.ts','artifacts/escape-hatch/tests/assist.spec.ts']:
    text=(ROOT/rel).read_text(encoding='utf-8')
    if '@replit/' in text or 'attached_assets' in text: errors.append(f'provider/private dependency in {rel}')
ledger=(ROOT/'docs/migrations/REPLIT_TRANSFER_2026-09-20.md').read_text(encoding='utf-8')
for ref in ('#121','#122','#123','#124','#125'):
    if ref not in ledger: errors.append(f'missing explicit board-gap disposition {ref}')
if errors:
    print('REPLIT_TRANSFER_VALIDATION FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)
print('REPLIT_TRANSFER_VALIDATION PASS')
print('recovered_plans=120 refs=#001-#120; #121-#125 explicitly dispositioned')
