#!/usr/bin/env python3
"""Fail-closed completeness checks for the EscapeHatch harness."""
import json, re, subprocess, sys
from pathlib import Path
R=Path(__file__).resolve().parents[1]; M=R/'harness/manifest.v1.json'; S='escapehatch-harness/v1'
C={'codebase_map':'harness/CODEBASE_MAP.md','workflow_specs':'harness/WORKFLOWS.md','artifact_registry':'ARTIFACT_REGISTRY.md','harness_validator':'scripts/validate_harness.py','governance_validator':'scripts/validate_governance.py','pre_commit_hook':'.githooks/pre-commit','pre_push_hook':'.githooks/pre-push','scoped_skill':'skills/harness-operations/SKILL.md','operator_report':'harness/reports/CURRENT_STATE.md','lua_design_constraints':'harness/constraints/LUA_EMBEDDING.md','ci_workflow':'.github/workflows/harness.yml'}
OWN={'Agent governance doctrine':'AGENTS.md','Harness manifest':'harness/manifest.v1.json','Codebase map':'harness/CODEBASE_MAP.md','Workflow specs':'harness/WORKFLOWS.md','Lua embedding constraints':'harness/constraints/LUA_EMBEDDING.md','Current-state report':'harness/reports/CURRENT_STATE.md'}
MARK={C['codebase_map']:('## Repository floor','## Structure','## Product entry points','## Validation commands','## Build, test, and deploy commands','## Fresh-agent path'),C['workflow_specs']:('## Task Pickup','## Pre-commit validation','## Failure Recovery','## Artifact discipline','## Handoff','## Product-runtime introduction gate'),C['artifact_registry']:('## Naming rules','## Registered artifacts','## Validation output','## Product artifact gate'),C['lua_design_constraints']:('## Host owns the application','## State isolation','## Error boundary','## Sandboxing','## Execution model','## Type discipline','## Conceptual integrity','## Validation expectations for the first Lua product sprint'),C['scoped_skill']:('## Trigger','## Required inputs','## Procedure','## Failure behavior','## Expected outputs'),C['operator_report']:('## Working','## Broken','## Missing / intentionally not yet established','## Principal risks')}
PC=('repo=$(git rev-parse --show-toplevel)','git -C "$repo" checkout-index --all --prefix="$snapshot/"','python scripts/validate_governance.py','python scripts/validate_harness.py','git -C "$repo" diff --cached --check')
PP=('while read -r local_ref local_sha remote_ref remote_sha','git archive --format=tar --output="$archive" "$local_sha"','python scripts/validate_governance.py','python scripts/validate_harness.py','git diff --check "$base" "$local_sha" --')
class E(ValueError): pass
def rd(p):
 q=R/p
 if not q.is_file(): raise E(f'missing component: {p}')
 return q.read_text(encoding='utf-8')
def need(p,ms):
 t=rd(p); x=[m for m in ms if m not in t]
 if x: raise E(f'{p} missing markers: '+', '.join(x))
def manifest():
 try:d=json.loads(M.read_text(encoding='utf-8'))
 except (OSError,json.JSONDecodeError) as e: raise E(f'invalid harness manifest: {e}') from e
 if d.get('schema')!=S or d.get('canonical_governance')!='AGENTS.md' or d.get('components')!=C: raise E('manifest schema/governance/component map is not canonical')
 if len(set(C.values()))!=len(C): raise E('manifest component paths must be unique')
 for p in C.values():
  if Path(p).is_absolute() or '..' in Path(p).parts or not (R/p).is_file(): raise E(f'invalid or missing manifest component: {p}')
 if d.get('validation_order')!=['python scripts/validate_governance.py','python scripts/validate_harness.py','git diff --check']: raise E('manifest validation_order is not canonical')
 if d.get('artifact_registry')!=C['artifact_registry']: raise E('artifact_registry alias mismatch')
 return d
def active(t): return {x.strip() for x in t.splitlines() if x.strip() and not x.lstrip().startswith('#')}
def hookbody(p,t,req):
 if not t.startswith('#!/bin/sh\nset -eu\n'): raise E(f'{p} must start with #!/bin/sh and set -eu')
 a=active(t); x=[v for v in req if v not in a]
 if x: raise E(f'{p} missing active commands: '+', '.join(x))
def hooks():
 n=0
 for p,req in ((C['pre_commit_hook'],PC),(C['pre_push_hook'],PP)):
  t=rd(p); hookbody(p,t,req); target='python scripts/validate_harness.py'
  for rep in ('# '+target,"echo '"+target+"'"):
   try:hookbody(p,t.replace(target,rep,1),req)
   except E:n+=1
   else:raise E(f'hook negative fixture unexpectedly passed: {p}')
 return n
def ylines(t):
 z=[]
 for raw in t.splitlines():
  if not raw.strip() or raw.lstrip().startswith('#'):continue
  pre=raw[:len(raw)-len(raw.lstrip(' '))]
  if '\t' in pre: raise E('CI workflow indentation must use spaces')
  z.append((len(pre),raw.strip()))
 return z
def sub(z,key,ind):
 tok=key+':'
 for i,(n,s) in enumerate(z):
  if n==ind and s==tok:
   j=next((j for j in range(i+1,len(z)) if z[j][0]<=ind),len(z)); return z[i+1:j]
 raise E(f'CI workflow missing active mapping: {tok}')
def ciruns(t):
 z=ylines(t)
 if (0,'name: Harness Validation') not in z: raise E('CI missing active top-level name')
 on=sub(z,'on',0); ev={s[:-1] for n,s in on if n==2 and s.endswith(':')}
 if not {'push','pull_request'}<=ev: raise E('CI must actively enable push and pull_request')
 st=sub(sub(sub(z,'jobs',0),'validate',2),'steps',4); runs={}; i=0
 while i<len(st):
  n,s=st[i]
  if n!=6 or not s.startswith('- name: '): i+=1; continue
  name=s[8:].strip(); j=i+1
  while j<len(st) and not (st[j][0]==6 and st[j][1].startswith('- ')): j+=1
  part=st[i+1:j]; val=None
  for k,(a,b) in enumerate(part):
   if a==8 and b.startswith('run:'):
    tail=b[4:].strip()
    if tail and tail!='|': val=tail
    elif tail=='|': val='\n'.join(x for q,x in part[k+1:] if q>8)
    break
  if val is not None:runs[name]=val
  i=j
 return runs
def cibody(t):
 r=ciruns(t)
 if r.get('Validate governance')!='python scripts/validate_governance.py': raise E('CI governance validator must be an active run step')
 if r.get('Validate harness')!='python scripts/validate_harness.py': raise E('CI harness validator must be an active run step')
 if not r.get('Check whitespace') or not any(x.strip().startswith('git diff --check') for x in r['Check whitespace'].splitlines()): raise E('CI whitespace step must actively execute git diff --check')
def ci():
 t=rd(C['ci_workflow']); cibody(t); n=0
 for m in (t.replace('  pull_request:\n','  # pull_request:\n',1),t.replace('run: python scripts/validate_harness.py','note: python scripts/validate_harness.py',1)):
  try:cibody(m)
  except E:n+=1
  else:raise E('CI negative fixture unexpectedly passed')
 return n
def sect(t,h):
 k=h+'\n'
 if k not in t: raise E(f'artifact registry missing section: {h}')
 return t.split(k,1)[1].split('\n## ',1)[0]
def rows(t):
 out=[]
 for raw in sect(t,'## Registered artifacts').splitlines():
  if not raw.strip().startswith('|'):continue
  a=[x.strip() for x in raw.strip().strip('|').split('|')]
  if not a or a[0] in ('Artifact','---'):continue
  if len(a)!=5 or not(a[1].startswith('`') and a[1].endswith('`')):raise E('artifact registry row/owner format invalid')
  out.append((a[0],a[1][1:-1],a[2],a[3],a[4]))
 if not out:raise E('artifact registry has no rows')
 return out
def regbody(t,files=True):
 a=rows(t); names=[x[0] for x in a]; owners=[x[1] for x in a]
 if len(names)!=len(set(names)):raise E('artifact names must be unique')
 if len(owners)!=len(set(owners)):raise E('artifact owner paths must be unique')
 by={x[0]:x for x in a}
 for name,owner in OWN.items():
  if name not in by:raise E(f'missing registered artifact: {name}')
  row=by[name]
  if row[1]!=owner:raise E(f'wrong owner for {name}: expected {owner}, got {row[1]}')
  if not row[3] or not row[4]:raise E(f'missing generation/validation contract for {name}')
  if files and not (R/owner).is_file():raise E(f'artifact owner does not exist: {owner}')
def registry():
 t=rd(C['artifact_registry']); regbody(t); n=0
 for m in (t.replace('| Codebase map | `harness/CODEBASE_MAP.md` |','| Codebase map | `AGENTS.md` |',1),t.replace('| Codebase map | `harness/CODEBASE_MAP.md` |','| Codebase map | `harness/DOES_NOT_EXIST.md` |',1)):
  try:regbody(m)
  except E:n+=1
  else:raise E('artifact registry negative fixture unexpectedly passed')
 return n
def gov():
 p=subprocess.run([sys.executable,str(R/'scripts/validate_governance.py')],cwd=R,text=True,capture_output=True)
 if p.returncode:raise E('governance validator failed: '+(p.stdout+p.stderr).strip())
def main():
 try:
  d=manifest()
  for p,ms in MARK.items():need(p,ms)
  ar=registry(); hk=hooks(); cy=ci()
  for p in MARK:
   if re.search(r'\b(?:TODO|TBD|FIXME)\b',rd(p)):raise E(f'placeholder marker found in {p}')
  gov()
 except E as e:print(f'HARNESS_VALIDATION: FAIL: {e}',file=sys.stderr);return 1
 print('HARNESS_VALIDATION: PASS');print(f'manifest={M.relative_to(R)}');print(f'components={len(C)}');print(f'schema={S}');print(f'artifact_self_tests={ar}');print(f'hook_self_tests={hk}');print(f'ci_self_tests={cy}');print('governance_validator=PASS');return 0
if __name__=='__main__':raise SystemExit(main())
