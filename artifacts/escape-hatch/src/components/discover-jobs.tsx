import { useMemo, useState, type FormEvent, type Dispatch, type SetStateAction } from 'react';
import type { Application } from '../lib/storage';
import { normalizeHimalayas, applyDiscoveryFilters, candidateToApplication, payLabel, type DiscoveryJob, type Domain, type Seniority, type WorkMode } from '../lib/job-discovery';

export function DiscoverJobs({applications,setApplications}:{applications:Application[];setApplications:Dispatch<SetStateAction<Application[]>>}) {
  const [title,setTitle]=useState('');
  const [jobs,setJobs]=useState<DiscoveryJob[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [modes,setModes]=useState<WorkMode[]>([]);
  const [seniorities,setSeniorities]=useState<Seniority[]>([]);
  const [domain,setDomain]=useState<Domain|'all'>('all');
  const [floor,setFloor]=useState('');
  const [salaryOnly,setSalaryOnly]=useState(false);
  const filtered=useMemo(()=>applyDiscoveryFilters(jobs,{modes,seniorities,domain,usdAnnualFloor:floor?Number(floor):null,salaryOnly}),[jobs,modes,seniorities,domain,floor,salaryOnly]);
  async function search(event:FormEvent) {
    event.preventDefault();
    if (title.trim().length<2 || title.length>80) return setMessage('Enter a title between 2 and 80 characters.');
    setBusy(true);setJobs([]);setMessage('Searching live remote openings…');
    try {
      const response=await fetch('/__escapehatch/discovery/search?q='+encodeURIComponent(title.trim()),{credentials:'same-origin'});
      const payload=await response.json() as {ok?:boolean;jobs?:unknown[];error?:string};
      if(!response.ok||!payload.ok) throw new Error(payload.error==='SOURCE_RATE_LIMITED'?'Provider rate limit reached; try again later.':'Job search unavailable. No existing opportunities changed.');
      const result=normalizeHimalayas({jobs:payload.jobs});
      setJobs(result);setMessage(`${result.length} remote jobs returned. Hybrid/on-site coverage is coming from other provider adapters.`);
    } catch(error) {setMessage(error instanceof Error?error.message:'Search unavailable.');}
    finally {setBusy(false);}
  }
  function toggle<T>(value:T,list:T[],setter:Dispatch<SetStateAction<T[]>>) {setter(list.includes(value)?list.filter(x=>x!==value):[...list,value]);}
  function save(job:DiscoveryJob) {
    const application=candidateToApplication(job,new Date().toISOString());
    setApplications(old=>old.some(v=>v.id===application.id||v.url===application.url)?old:[application,...old]);
    setMessage('Saved to your existing opportunity queue. Verify the posting before applying.');
  }
  return <section className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="Discover jobs" data-testid="discover-jobs">
    <h2 className="font-display text-2xl">Find jobs by title</h2>
    <p className="mt-2 text-sm text-muted-foreground">No spreadsheet needed. Search, filter, and save the opportunities you choose.</p>
    <form onSubmit={search} className="mt-4 flex flex-wrap items-end gap-2">
      <label className="flex-1 text-sm font-semibold">Job title
        <input type="search" required minLength={2} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}
          data-testid="discovery-title" placeholder="e.g. IT Project Manager" className="mt-1 block w-full rounded-lg border border-input bg-background p-2.5 font-normal"/>
      </label>
      <button type="submit" disabled={busy} data-testid="discovery-search" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy?'Searching…':'Search jobs'}</button>
    </form>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <fieldset><legend>Work arrangement</legend><div className="mt-2 flex flex-wrap gap-2">
        {([['remote','Remote'],['hybrid','Hybrid'],['on_site','On-site']] as [WorkMode,string][]).map(([v,label])=><button type="button" key={v} aria-pressed={modes.includes(v)} onClick={()=>toggle(v,modes,setModes)}>{label}</button>)}
      </div></fieldset>
      <fieldset><legend>Seniority</legend><div className="mt-2 flex flex-wrap gap-2">
        {([['junior','Junior'],['mid','Mid-level'],['senior','Senior']] as [Seniority,string][]).map(([v,label])=><button type="button" key={v} aria-pressed={seniorities.includes(v)} onClick={()=>toggle(v,seniorities,setSeniorities)}>{label}</button>)}
      </div></fieldset>
    </div>

    <p className="text-sm">Search filters are applied to results.</p>
    <label>Minimum USD annual pay <input type="number" value={floor} onChange={event=>setFloor(event.target.value)}/></label>
    <p role="status">{message}</p>
    <p>{filtered.length} matching results</p>
  </section>;
}
