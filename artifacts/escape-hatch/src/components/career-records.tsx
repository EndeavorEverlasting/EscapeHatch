import { useState, type Dispatch, type SetStateAction } from 'react';
import type { AssistEducation, AssistExperience, AssistProfile } from '@/lib/assist-contract';
import type { Application } from '@/lib/storage';
import { extractResumeText, parseResumeText, type ResumeImport } from '@/lib/resume-import';

export function CareerRecords({ profile, setProfile, opportunity, setApplications }: {
  profile: AssistProfile; setProfile: Dispatch<SetStateAction<AssistProfile>>;
  opportunity?: Application; setApplications: Dispatch<SetStateAction<Application[]>>;
}) {
  const blankWork = () => ({ id: '', company: '', title: '', dates: '', location: '', bullets: [] as string[] });
  const blankEducation = () => ({ id: '', institution: '', credential: '', fieldOfStudy: '', dates: '', details: '' });
  const [work, setWork] = useState(() => profile.experience.find(item => item.id === profile.selectedExperienceId) || blankWork());
  const [education, setEducation] = useState(() => profile.education.find(item => item.id === profile.selectedEducationId) || blankEducation());
  const [source, setSource] = useState<ResumeImport | null>(null);
  const [message, setMessage] = useState('Select the exact work and education record to reuse. Resume imports are drafts until saved.');
  const [posting, setPosting] = useState({ id: '', text: '' });
  const provenance = () => ({ source: 'user' as const, label: 'Reviewed career record', capturedAt: new Date().toISOString() });
  const inputClass = 'mt-1 block w-full rounded border border-input bg-background p-2';
  return <section className="mb-6 rounded-2xl border border-border bg-card p-5" data-testid="career-records">
    <h2 className="font-display text-2xl">Reusable work and education</h2>
    <p>Keep your responsibilities separate from the employer posting. Choose one reviewed record of each kind for filling. Repeated or ambiguous employer sections stay manual.</p>
    <label className="block my-3">Load work and education drafts from résumé (.txt or .pdf)
      <input type="file" accept=".txt,.pdf" onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        try {
          if (file.size > 5 * 1024 * 1024) throw new Error('Resume exceeds size limit');
          const imported = parseResumeText(/\.txt$/i.test(file.name) ? await file.text() : await extractResumeText(file), file.name);
          setSource(imported); setMessage('Resume drafts loaded. Choose a source record, check every field, then save reviewed records. No facts were approved automatically.');
        } catch { setMessage('Resume could not be read. Existing records were preserved.'); }
        event.target.value = '';
      }} />
    </label>
    <div className="grid gap-5 sm:grid-cols-2">
      <fieldset className="space-y-3"><legend className="font-bold">Your work and responsibilities</legend>
        <label className="block">Saved work record<select aria-label="Saved work record" className={inputClass} value={profile.experience.some(item => item.id === work.id) ? work.id : ''} onChange={event => setWork(profile.experience.find(item => item.id === event.target.value) || blankWork())}>
          <option value="">New work record</option>{profile.experience.map(item => <option key={item.id} value={item.id}>{item.company} — {item.title}</option>)}
        </select></label>
        {source && <label className="block">Work draft from résumé<select aria-label="Work draft from résumé" className={inputClass} defaultValue="" onChange={event => { const item = source.experience.find(item => item.id === event.target.value); if (item) setWork(item); }}><option value="">Choose source record</option>{source.experience.map(item => <option key={item.id} value={item.id}>{item.company} — {item.title}</option>)}</select></label>}
        {(['company', 'title', 'dates', 'location'] as const).map(key => <label className="block" key={key}>{'Work ' + key}<input aria-label={'Work ' + key} className={inputClass} maxLength={512} value={work[key]} onChange={event => setWork({ ...work, [key]: event.target.value })} /></label>)}
        <label className="block">Work responsibilities<textarea aria-label="Work responsibilities" className={inputClass} maxLength={8000} rows={6} value={work.bullets.join('\n')} onChange={event => setWork({ ...work, bullets: event.target.value.split('\n') })} /></label>
        <button type="button" disabled={!work.company.trim() || !work.title.trim()} onClick={() => {
          const item: AssistExperience = { ...work, id: work.id || crypto.randomUUID(), provenance: { ...((work as Partial<AssistExperience>).provenance || {}), ...provenance() } };
          setProfile(current => ({ ...current, selectedExperienceId: item.id, experience: [...current.experience.filter(old => old.id !== item.id), item], updatedAt: new Date().toISOString() }));
          setWork(item); setMessage('Reviewed work record saved and selected for reuse.');
        }}>Save reviewed work record</button>
      </fieldset>
      <fieldset className="space-y-3"><legend className="font-bold">Your education</legend>
        <label className="block">Saved education record<select aria-label="Saved education record" className={inputClass} value={profile.education.some(item => item.id === education.id) ? education.id : ''} onChange={event => setEducation(profile.education.find(item => item.id === event.target.value) || blankEducation())}>
          <option value="">New education record</option>{profile.education.map(item => <option key={item.id} value={item.id}>{item.institution} — {item.credential}</option>)}
        </select></label>
        {source && <label className="block">Education draft from résumé<select aria-label="Education draft from résumé" className={inputClass} defaultValue="" onChange={event => { const item = source.education.find(item => item.id === event.target.value); if (item) setEducation(item); }}><option value="">Choose source record</option>{source.education.map(item => <option key={item.id} value={item.id}>{item.institution} — {item.credential}</option>)}</select></label>}
        {(['institution', 'credential', 'fieldOfStudy', 'dates'] as const).map(key => <label className="block" key={key}>{'Education ' + (key === 'fieldOfStudy' ? 'field of study' : key)}<input aria-label={'Education ' + (key === 'fieldOfStudy' ? 'field of study' : key)} className={inputClass} maxLength={512} value={education[key] || ''} onChange={event => setEducation({ ...education, [key]: event.target.value })} /></label>)}
        <label className="block">Education details<textarea aria-label="Education details" className={inputClass} maxLength={8000} rows={6} value={education.details} onChange={event => setEducation({ ...education, details: event.target.value })} /></label>
        <button type="button" disabled={!education.institution.trim() || !education.credential.trim()} onClick={() => {
          const item: AssistEducation = { ...education, id: education.id || crypto.randomUUID(), provenance: { ...((education as Partial<AssistEducation>).provenance || {}), ...provenance() } };
          setProfile(current => ({ ...current, selectedEducationId: item.id, education: [...current.education.filter(old => old.id !== item.id), item], updatedAt: new Date().toISOString() }));
          setEducation(item); setMessage('Reviewed education record saved and selected for reuse.');
        }}>Save reviewed education record</button>
      </fieldset>
    </div>
    <div className="mt-5"><h3 className="font-bold">Employer posting — this opportunity only</h3>
      <p>{opportunity ? opportunity.company + ' — ' + opportunity.role : 'Choose a saved opportunity first.'} Posting text is context, never your work-history answer.</p>
      <label>Employer job description<textarea aria-label="Employer job description" className={inputClass} rows={6} maxLength={30000} disabled={!opportunity} value={posting.id === opportunity?.id ? posting.text : opportunity?.jobDescription || ''} onChange={event => setPosting({ id: opportunity?.id || '', text: event.target.value })} /></label>
      <button type="button" disabled={!opportunity} onClick={() => {
        if (!opportunity) return;
        const text = posting.id === opportunity.id ? posting.text : opportunity.jobDescription || '';
        setApplications(current => current.map(item => item.id === opportunity.id ? { ...item, jobDescription: text, updatedAt: new Date().toISOString() } : item));
        setMessage('Employer posting saved only on the selected opportunity.');
      }}>Save employer posting</button>
    </div>
    <p role="status">{message}</p>
  </section>;
}
