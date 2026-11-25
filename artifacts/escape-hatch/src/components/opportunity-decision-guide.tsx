import { useState } from 'react';
import { Link } from 'wouter';
import registry from '../../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };
import { effectiveOpportunityDecision, evaluateOpportunityRubric, readOpportunityRubric, type OpportunityDecision } from '@/lib/opportunity-fit';
import type { Application } from '@/lib/storage';

const scenes = registry.opportunity_decision_scenes;
const selectStyle = 'mt-1 block w-full rounded-lg border border-input bg-card p-2 text-sm';

export function OpportunityDecisionGuide({ application, onDecision }: { application: Application; onDecision: (value: OpportunityDecision) => void }) {
  const [step, setStep] = useState(0);
  const scene = scenes[step];
  const decision = effectiveOpportunityDecision(application.notes, application.opportunityDecision);
  const rubric = readOpportunityRubric(application.notes);
  const match = rubric && rubric !== 'invalid' ? evaluateOpportunityRubric(rubric) : null;
  const arrangement = match?.eligibility === 'incompatible' ? 'mismatch' : match?.eligibility === 'eligible' ? 'compatible' : 'not established';
  return <section data-testid="opportunity-decision-guide" data-scene={scene.id} aria-label="Opportunity decision tutorial" className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
    <div className="flex items-start gap-3">
      <img src="/escapehatch-mascot.webp" alt="" width={64} height={64} data-testid="decision-avatar" className="mascot-guidance-art h-16 w-16 shrink-0 object-contain" />
      <div className="min-w-0 flex-1"><p className="text-xs font-bold text-muted-foreground">Step {step + 1} of {scenes.length}</p><h4 className="font-bold">{scene.title}</h4><p aria-live="polite" className="text-sm leading-6">{scene.coach_prompt}</p></div>
    </div>
    {scene.id === 'MATCH_REVIEW' && <div className="mt-3 text-sm"><p>Work arrangement: {arrangement}</p><p>Overall mathematical fit is not established by this guide.</p></div>}
    {scene.id === 'JOB_DESIRE' && <label className="mt-3 block text-sm">Job desire<select className={selectStyle} value={decision.jobDesire} onChange={e => onDecision({ ...decision, jobDesire: e.target.value as OpportunityDecision['jobDesire'] })}><option value="want">Want</option><option value="do_not_want">Do not want</option><option value="unknown">Unknown</option></select></label>}
    {scene.id === 'APPLICATION_DECISION' && <div className="mt-3 space-y-3"><label className="block text-sm">Application decision<select className={selectStyle} value={decision.applicationDecision} onChange={e => onDecision({ ...decision, applicationDecision: e.target.value as OpportunityDecision['applicationDecision'] })}><option value="apply">Apply</option><option value="do_not_apply">Do not apply</option><option value="undecided">Undecided</option></select></label><label className="block text-sm">Application purpose<select className={selectStyle} value={decision.purpose} onChange={e => onDecision({ ...decision, purpose: e.target.value as OpportunityDecision['purpose'] })}><option value="career">Career</option><option value="interview_practice">Interview practice</option><option value="unknown">Unknown</option></select></label>
      {decision.applicationDecision === 'apply' && application.url && <Link href={'/assist?opportunityId=' + encodeURIComponent(application.id)} className="inline-flex min-h-11 items-center font-bold text-primary underline">Prepare this application</Link>}
    </div>}
    <div className="mt-3 flex flex-wrap gap-4">{step > 0 && <button type="button" className="min-h-11 text-sm font-bold underline" onClick={() => setStep(step - 1)}>Previous step</button>}{step < scenes.length - 1 && <button type="button" className="min-h-11 text-sm font-bold text-primary underline" onClick={() => setStep(step + 1)}>Next step</button>}</div>
  </section>;
}
