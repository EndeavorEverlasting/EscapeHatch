#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
# Product version: reviewed classification is backward-compatible user-visible feature -> minor.
(ROOT/'VERSION').write_text('1.1.0\n',encoding='utf-8')
manifest=ROOT/'browser/application-assist/manifest.json'
m=json.loads(manifest.read_text()); m['version']='1.1.0'; manifest.write_text(json.dumps(m,indent=2)+'\n')
contract=ROOT/'contracts/product-release.v1.json'; c=json.loads(contract.read_text())
mirror={'path':'artifacts/escape-hatch/package.json','json_pointer':'/version','kind':'mirrored','notes':'Local web cockpit package version mirrors VERSION.'}
if not any(x.get('path')==mirror['path'] for x in c['synchronized_mirrors']): c['synchronized_mirrors'].append(mirror)
if not any(x.get('surface')=='artifacts/escape-hatch/package.json#version' for x in c['surface_classification']):
 c['surface_classification'].append({'surface':'artifacts/escape-hatch/package.json#version','class':'PRODUCT_RELEASE_VERSION','role':'mirrored'})
contract.write_text(json.dumps(c,indent=2)+'\n')
ch=ROOT/'CHANGELOG.md'; text=ch.read_text()
if '## [1.1.0]' not in text:
 marker='\n## [1.0.0]'
 entry='''\n## [1.1.0] - 2026-09-20\n\n### Added\n\n- Recovered the portable local-first EscapeHatch web cockpit from the Replit donor into GitHub.\n- Added local resume review/import, workspace persistence/backup/restore, application/opportunity tracking, and browser-assist companion controls without automatic submit/navigation/attestation.\n- Added the recovered #001–#120 plan mirror, durable recovery snapshot, generator/tests, transfer validator, and web-cockpit CI.\n'''
 text=text.replace(marker,entry+marker)
 ch.write_text(text)
# Harness manifest registrations.
hp=ROOT/'harness/manifest.v1.json'; h=json.loads(hp.read_text()); comp=h['components']
comp.update({'web_cockpit':'artifacts/escape-hatch','replit_plan_mirror':'docs/plans','replit_plan_sync':'scripts/replit-plan-sync/task-plan-sync.ts','replit_transfer_validator':'scripts/validate_replit_transfer.py','web_cockpit_ci':'.github/workflows/web-cockpit.yml','replit_transfer_ledger':'docs/migrations/REPLIT_TRANSFER_2026-09-20.md'})
cmd='python scripts/validate_replit_transfer.py'
if cmd not in h['validation_order']: h['validation_order'].insert(-1,cmd)
hp.write_text(json.dumps(h,indent=2)+'\n')
# Append canonical docs only once.
reg=ROOT/'ARTIFACT_REGISTRY.md'; r=reg.read_text(); anchor='| Agent governance doctrine |'
rows='''| Local web cockpit | `artifacts/escape-hatch/` | tracked local-first product runtime | edit portable cockpit; keep browser Application Assist as canonical DOM-writer | `python scripts/validate_replit_transfer.py` + Web Cockpit Validation |\n| Recovered Replit plan mirror | `docs/plans/` | tracked generated recovery mirror | regenerate from `docs/plans/recovered-task-export.v1.json` with `scripts/replit-plan-sync/task-plan-sync.ts` | transfer validator + generator tests |\n| Replit transfer ledger | `docs/migrations/REPLIT_TRANSFER_2026-09-20.md` | tracked migration/provenance ledger | update only when stronger donor/provider evidence changes transfer state | `python scripts/validate_replit_transfer.py` |\n'''
if 'Local web cockpit | `artifacts/escape-hatch/`' not in r: r=r.replace(anchor,rows+anchor)
reg.write_text(r)
cb=ROOT/'harness/CODEBASE_MAP.md'; t=cb.read_text()
if '`artifacts/escape-hatch/` | Portable local-first web cockpit' not in t:
 needle='| `browser/application-assist/` | Manifest V3 unpacked extension implementing the assist-session control loop without auto-submit. |\n'
 add='| `artifacts/escape-hatch/` | Portable local-first web cockpit for profile, opportunity/application tracking, drafts, workspace backup/restore, and review-first resume intake. |\n| `docs/plans/` | Recovered #001–#120 generated plan mirror; tracked recovery input at `docs/plans/recovered-task-export.v1.json`. |\n| `scripts/replit-plan-sync/` | Canonical recovered plan-mirror generator and tests. |\n'
 t=t.replace(needle,needle+add)
cb.write_text(t)
wf=ROOT/'harness/WORKFLOWS.md'; w=wf.read_text()
if '## Local web cockpit workflow' not in w:
 w += '''\n## Local web cockpit workflow\n\n1. Work from `artifacts/escape-hatch/`; do not import `.replit`, provider plugins, private resume assets, or donor agent memory.\n2. Run `npm install`, `npm run typecheck`, `npm run test:unit`, and `npm run build` from that directory.\n3. Run browser validation through `npm run test:browser`; the app binds loopback by default and all test resume inputs are synthetic.\n4. Run `python scripts/validate_replit_transfer.py` to preserve the donor/privacy/plan-mirror boundary.\n5. Browser DOM-writing authority remains `browser/application-assist/`; the cockpit may prepare/review data but may not auto-submit, auto-navigate, or attest.\n'''
wf.write_text(w)
cs=ROOT/'harness/reports/CURRENT_STATE.md'; s=cs.read_text()
working='- A portable local-web cockpit now exists at `artifacts/escape-hatch/` with browser-local profile/opportunity/application state, workspace backup/restore, draft recovery, and review-first local resume intake.\n- The Replit task-plan mirror is durably recovered as #001–#120 with a tracked reconstructed export snapshot and generator/tests; #121–#125 remain explicitly incomplete rather than fabricated.\n'
if working.splitlines()[0] not in s:
 s=s.replace('## Working\n','## Working\n\n'+working)
s=s.replace('- A live local-web companion runtime with stable loopback/origin behavior.\n','')
cs.write_text(s)
