import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDiscoveryFilters, candidateToApplication, classifyOccupation, normalizeHimalayas, payLabel, safePublicHttps, type DiscoveryFilters } from './job-discovery.ts';

const now = Date.parse('2026-10-28T12:00:00Z');
const base = {
  title: 'Senior IT Project Manager', companyName: 'Example Employer',
  guid: 'https://himalayas.app/companies/example/jobs/senior-it-project-manager',
  applicationLink: 'https://himalayas.app/companies/example/jobs/senior-it-project-manager/apply',
  seniority: ['Senior'], categories: ['Project Management'], parentCategories: ['Business'],
  salaryPeriod: 'annual', currency: 'USD', minSalary: 145000, maxSalary: 185000,
  pubDate: 1793174400, expiryDate: 1795788000, locationRestrictions: [{name: 'United States'}],
};

test('normalization keeps provider application URL and labeled career taxonomy', () => {
  const jobs = normalizeHimalayas({jobs:[base]}, now);
  assert.equal(jobs.length, 1);
  const job = jobs[0];
  assert.equal(job.workMode, 'remote');
  assert.equal(job.seniority, 'senior');
  assert.equal(job.domain, 'Business & Operations');
  assert.equal(job.occupation, 'Project & Program Management');
  assert.equal(job.pay?.min, 145000);
  assert.match(payLabel(job), /145,000–185,000/);
  assert.equal(candidateToApplication(job, '2026-10-28T12:00:00Z').url, base.applicationLink);
  assert.equal(candidateToApplication(job, '2026-10-28T12:00:00Z').status, 'saved');
});

test('unknown pay and role are not fabricated', () => {
  const [job] = normalizeHimalayas({jobs:[{...base,title:'Mystery Role',seniority:[],categories:[],parentCategories:[],minSalary:null,maxSalary:null}]},now);
  assert.equal(job.seniority, 'unknown');
  assert.equal(job.domain, 'Other');
  assert.equal(job.pay, null);
});

test('filters honor work modes, salary periods and currencies without false conversions', () => {
  const annual = normalizeHimalayas({jobs:[base]},now);
  const filters: DiscoveryFilters = {modes:['remote'],seniorities:['senior'],domain:'Business & Operations',usdAnnualFloor:175000,salaryOnly:true};
  assert.equal(applyDiscoveryFilters(annual,filters).length,1);
  assert.equal(applyDiscoveryFilters(annual,{...filters,modes:['hybrid','on_site']}).length,0);
  assert.equal(applyDiscoveryFilters(annual,{...filters,usdAnnualFloor:195000}).length,0);
  const monthly = normalizeHimalayas({jobs:[{...base,salaryPeriod:'monthly'}]},now);
  assert.equal(applyDiscoveryFilters(monthly,filters).length,0);
  const euro = normalizeHimalayas({jobs:[{...base,currency:'EUR'}]},now);
  assert.equal(applyDiscoveryFilters(euro,filters).length,0);
});

test('bad and expired jobs, duplicate IDs, credential URLs and inconsistent salary rejected safely', () => {
  const jobs = normalizeHimalayas({jobs:[
    base, base,
    {...base,guid:'expired',expiryDate:1},
    {...base,guid:'bad',applicationLink:'http://insecure.example.com/'},
    {...base,guid:'credentials',applicationLink:'https://secret@jobs.example.com/'},
  ]}, now);
  assert.equal(jobs.length,1);
  assert.equal(safePublicHttps('http://jobs.example.com'),null);
  assert.equal(safePublicHttps('https://127.0.0.1'),null);
  assert.equal(safePublicHttps('https://localhost'),null);
  assert.equal(safePublicHttps('https://jobs.example.com:8443'),null);
  assert.equal(safePublicHttps('https://jobs.example.com'), 'https://jobs.example.com');
  const inconsistent = normalizeHimalayas({jobs:[{...base,maxSalary:120000}]},now);
  assert.equal(inconsistent[0].pay,null);
});

test('domain and occupation are explicit rules rather than inferred seniority or employer claims', () => {
  assert.deepEqual(classifyOccupation('Nurse Practitioner'),{domain:'Healthcare',occupation:'Clinical & Healthcare'});
  assert.deepEqual(classifyOccupation('Financial Analyst'),{domain:'Finance',occupation:'Finance & Accounting'});
  assert.deepEqual(classifyOccupation('Software Engineer'),{domain:'Technology',occupation:'Software Engineering'});
});
