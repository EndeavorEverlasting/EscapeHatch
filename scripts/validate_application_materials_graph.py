#!/usr/bin/env python3
"""P00/P01 guard: supporting documents may not be eliminated or inferred by slot count."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/'harness/contracts/application-materials-graph.v1.json').read_text())
assert p['schema']=='escapehatch/application-materials-graph/v1' and p['version']==1
assert {'cover_letter','case_study','narrative_answer','job_resume'} <= set(p['node_types'])
cap=p['capacity_policy']
for key in ('one_observed_supporting_slot','two_observed_supporting_slots','three_or_more_observed_supporting_slots','unknown_capacity','named_resume_slot','never_overwrite_shared_resume','never_auto_attach','never_submit'):
    assert cap.get(key), 'missing capacity or safety gate '+key
assert cap['never_overwrite_shared_resume'] is True
assert cap['never_auto_attach'] is True and cap['never_submit'] is True
assert p['narrative_answer_policy']['no_invented_qualifications'] is True
for key in ('planner','tests','private_documents','review_ui','inspection','attachment_controller','canonical_answer_owner'):
    assert (ROOT/p['implementation'][key]).exists(),key
planner=(ROOT/p['implementation']['planner']).read_text()
for marker in ('proposeApplicationMaterials(', 'validateMaterialsGraph(', 'UPLOAD_SLOT_NOT_VERIFIED',
               'FILE_CAPACITY_UNKNOWN','JOB_RESUME_MAY_REPLACE_PLATFORM_MASTER','mayAutoUpload: false','mayAutoSubmit: false'):
    assert marker in planner,marker
store=(ROOT/p['implementation']['private_documents']).read_text()
assert "'case_study'" in store and 'forCurrentEmployerForm' in store
ui=(ROOT/p['implementation']['review_ui']).read_text()
assert "['resume', 'cover', 'case_study']" in ui
browser=(ROOT/p['implementation']['attachment_controller']).read_text()
assert "['resume', resume], ['cover', cover], ['case_study', caseStudy]" in browser
assert "case_study" in (ROOT/p['implementation']['inspection']).read_text()
print("APPLICATION_MATERIALS_GRAPH_CONTRACT: PASS (static, not live Indeed)")
