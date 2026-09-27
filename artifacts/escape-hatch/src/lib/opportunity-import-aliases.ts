export const OPPORTUNITY_IMPORT_ALIASES = {
  organization: ['Company', 'Employer', 'Organization'],
  title: ['Role', 'Job Title', 'Position'],
  location: ['Location', 'Job Location'],
  work_mode: ['Work Mode', 'Work Arrangement'],
  employment_type: ['Employment', 'Employment Type'],
  compensation_text: ['Compensation', 'Pay', 'Salary'],
  priority: ['Priority'],
  fit_score: ['Fit Score'],
  fit_rationale: ['Why It Fits', 'Key Observations'],
  requirements_gaps: ['Requirements / Gaps', 'Requirements', 'Gaps'],
  found_on: ['Date Found', 'Found Date'],
  follow_up_due_on: ['Follow-Up Due', 'Follow Up Due'],
  next_action: ['Next Action'],
  apply_link: ['Apply Link', 'Application URL'],
  source: ['Source Link', 'Posting URL'],
  source_guidance: ['Source Guidance'],
  notes: ['Notes'],
  tracker_status: ['Status'],
  applied: ['Applied?'],
  date_applied: ['Date Applied'],
  resume_doc: ['Resume Doc'],
  resume_pdf: ['Resume PDF'],
  study_concepts: ['Study Concepts'],
  study_resources: ['Books / Study Resources'],
  study_guidance: ['StudySyndicate Guidance'],
} as const;

export type OpportunityImportField = keyof typeof OPPORTUNITY_IMPORT_ALIASES;

const normalizedAliasEntries = Object.entries(OPPORTUNITY_IMPORT_ALIASES).flatMap(([field, names]) =>
  names.map((name) => [name.trim().toLowerCase(), field as OpportunityImportField] as const),
);

export const OPPORTUNITY_IMPORT_ALIAS_LOOKUP = new Map(normalizedAliasEntries);
