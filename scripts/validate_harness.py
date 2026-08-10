#!/usr/bin/env python3
"""Validate EscapeHatch operational harness completeness and ownership."""
from __future__ import annotations
import json, re, subprocess, sys
from pathlib import Path
REPO_ROOT=Path(__file__).resolve().parents[1]
MANIFEST=REPO_ROOT/'harness'/'manifest.v1.json'
EXPECTED_SCHEMA='escapehatch-harness/v1'
REQUIRED_COMPONENT_KEYS=('codebase_map','workflow_specs','artifact_registry','harness_validator','governance_validator','pre_commit_hook','pre_push_hook','scoped_skill','operator_report','lua_design_constraints','ci_workflow')
REQUIRED_MAP_MARKERS=('## Repository floor','## Structure','## Product entry points','## Validation commands','## Build, test, and deploy commands','## Fresh-agent path')
REQUIRED_WORKFLOW_MARKERS=('## Task Pickup','## Pre-commit validation','## Failure Recovery','## Artifact discipline','## Handoff','## Product-runtime introduction gate')
REQUIRED_ARTIFACT_MARKERS=('## Naming rules','## Registered artifacts','## Validation output','## Product artifact gate')
REQUIRED_LUA_MARKERS=('## Host owns the application','## State isolation','## Error boundary','## Sandboxing','## Execution model','## Type discipline','## Conceptual integrity','## Validation expectations for the first Lua product sprint')
class HarnessError(ValueError): pass
def fail(message): print(f'HARNESS_VALIDATION: FAIL: {message}',file=sys.stderr); return 1
def read_text(relative):
 p=REPO_ROOT/relative
 if not p.is_file(): raise HarnessError(f'missing component: {relative}')
 return p.read_text(encoding='utf-8')
def require_markers(relative,markers):
 text=read_text(relative); missing=[m for m in markers if m not in text]
 if missing: raise HarnessError(f'{relative} missing markers: '+', '.join(missing))
def validate_manifest():
 if not MANIFEST.is_file(): raise HarnessError('missing harness/manifest.v1.json')
 try: data=json.loads(MANIFEST.read_text(encoding='utf-8'))
 except json.JSONDecodeError as e: raise HarnessError(f'invalid harness manifest JSON: {e}') from e
 if data.get('schema')!=EXPECTED_SCHEMA: raise HarnessError(f'unexpected manifest schema: {data.get("schema")!r}')
 if data.get('canonical_governance')!='AGENTS.md': raise HarnessError('manifest must point canonical_governance to AGENTS.md')
 components=data.get('components')
 if not isinstance(components,dict): raise HarnessError('manifest components must be an object')
 missing=[k for k in REQUIRED_COMPONENT_KEYS if k not in components]
 if missing: raise HarnessError('manifest missing component keys: '+', '.join(missing))
 vals=[components[k] for k in REQUIRED_COMPONENT_KEYS]
 if len(vals)!=len(set(vals)): raise HarnessError('manifest component paths must be unique')
 for k in REQUIRED_COMPONENT_KEYS:
  rel=components[k]
  if not isinstance(rel,str) or not rel or rel.startswith('/') or '..' in Path(rel).parts: raise HarnessError(f'invalid component path for {k}: {rel!r}')
  if not (REPO_ROOT/rel).is_file(): raise HarnessError(f'manifest component missing on disk: {k} -> {rel}')
 expected=['python scripts/validate_governance.py','python scripts/validate_harness.py','git diff --check']
 if data.get('validation_order')!=expected: raise HarnessError('manifest validation_order is not canonical')
 if data.get('artifact_registry')!=components['artifact_registry']: raise HarnessError('artifact_registry alias must match registered component path')
 return data
def validate_hooks(components):
 for k in ('pre_commit_hook','pre_push_hook'):
  text=read_text(components[k])
  for command in ('python scripts/validate_governance.py','python scripts/validate_harness.py'):
   if command not in text: raise HarnessError(f'{components[k]} missing command: {command}')
  if not text.startswith('#!/bin/sh\nset -eu\n'): raise HarnessError(f'{components[k]} must fail closed with sh + set -eu')
def validate_ci(relative):
 text=read_text(relative); required=('name: Harness Validation','pull_request:','push:','python scripts/validate_governance.py','python scripts/validate_harness.py','git diff --check'); missing=[x for x in required if x not in text]
 if missing: raise HarnessError(f'{relative} missing CI controls: '+', '.join(missing))
def validate_skill(relative):
 text=read_text(relative)
 for marker in ('## Trigger','## Required inputs','## Procedure','## Failure behavior','## Expected outputs'):
  if marker not in text: raise HarnessError(f'{relative} missing skill section: {marker}')
def validate_report(relative):
 text=read_text(relative)
 for marker in ('## Working','## Broken','## Missing / intentionally not yet established','## Principal risks'):
  if marker not in text: raise HarnessError(f'{relative} missing operator section: {marker}')
def validate_no_placeholders(paths):
 for rel in paths:
  if re.search(r'\b(?:TODO|TBD|FIXME)\b',read_text(rel)): raise HarnessError(f'placeholder marker found in harness component: {rel}')
def validate_governance():
 proc=subprocess.run([sys.executable,str(REPO_ROOT/'scripts'/'validate_governance.py')],cwd=REPO_ROOT,text=True,capture_output=True,check=False)
 if proc.returncode: raise HarnessError('governance validator failed: '+(proc.stdout+proc.stderr).strip())
def main():
 try:
  data=validate_manifest(); c=data['components']
  require_markers(c['codebase_map'],REQUIRED_MAP_MARKERS); require_markers(c['workflow_specs'],REQUIRED_WORKFLOW_MARKERS); require_markers(c['artifact_registry'],REQUIRED_ARTIFACT_MARKERS); require_markers(c['lua_design_constraints'],REQUIRED_LUA_MARKERS)
  validate_hooks(c); validate_ci(c['ci_workflow']); validate_skill(c['scoped_skill']); validate_report(c['operator_report'])
  validate_no_placeholders([c['codebase_map'],c['workflow_specs'],c['artifact_registry'],c['lua_design_constraints'],c['scoped_skill'],c['operator_report']]); validate_governance()
 except HarnessError as e: return fail(str(e))
 print('HARNESS_VALIDATION: PASS'); print(f'manifest={MANIFEST.relative_to(REPO_ROOT)}'); print(f'components={len(REQUIRED_COMPONENT_KEYS)}'); print(f'schema={EXPECTED_SCHEMA}'); print('governance_validator=PASS'); return 0
if __name__=='__main__': raise SystemExit(main())
