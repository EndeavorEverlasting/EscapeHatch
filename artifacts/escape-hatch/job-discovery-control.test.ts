import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IncomingMessage } from 'node:http';
import { discoveryRequestAllowed, queryPublicJobs, validateDiscoveryQuery } from './job-discovery-control.ts';

test('only reasonable title queries and bounded pages are admitted', () => {
  assert.deepEqual(validateDiscoveryQuery(' Project Manager ',null),{q:'Project Manager',page:1});
  for (const q of [null,'x','x'.repeat(81),'title\nMore text']) assert.equal(validateDiscoveryQuery(q,null),null);
  for (const page of ['0','-1','NaN','6','1.2']) assert.equal(validateDiscoveryQuery('Designer',page),null);
});

test('only loopback same-origin GET may access discovery route', () => {
  const req = {method:'GET',headers:{host:'127.0.0.1:5173','sec-fetch-site':'same-origin'},socket:{remoteAddress:'127.0.0.1'}} as unknown as IncomingMessage;
  assert.equal(discoveryRequestAllowed(req,5173),true);
  assert.equal(discoveryRequestAllowed({...req,headers:{...req.headers,host:'other.example'}} as IncomingMessage,5173),false);
  assert.equal(discoveryRequestAllowed({...req,method:'POST'} as IncomingMessage,5173),false);
  assert.equal(discoveryRequestAllowed({...req,socket:{remoteAddress:'10.1.2.3'}} as IncomingMessage,5173),false);
  assert.equal(discoveryRequestAllowed({...req,headers:{...req.headers,origin:'https://other.example'}} as IncomingMessage,5173),false);
});

test('public provider response excludes descriptions and fixed origin cannot be redirected', async () => {
  let observed = '';
  const fetcher: typeof fetch = async (input, init) => {
    observed = String(input);
    assert.equal(init?.method,'GET');
    assert.equal(init?.redirect,'error');
    return new Response(JSON.stringify({jobs:[{
      guid:'https://himalayas.app/companies/example/jobs/123',
      title:'Project Manager',companyName:'Example',
      applicationLink:'https://himalayas.app/companies/example/jobs/123/apply',
      description:'This field should not reach clients.',
      salaryPeriod:'annual',minSalary:120000,maxSalary:170000,currency:'USD'
    }]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const reply=await queryPublicJobs('project manager',1,fetcher);
  assert.equal(reply.ok,true);
  assert.match(observed,/^https:\/\/himalayas.app\/jobs\/api\/search\?/);
  assert.match(observed,/q=project\+manager/);
  assert.equal((reply.jobs?.[0] as Record<string,unknown>).description,undefined);
});

test('429 and inconsistent response are explicit failures',async () => {
  assert.deepEqual(await queryPublicJobs('designer',1,async () => new Response('',{status:429})),{ok:false,error:'SOURCE_RATE_LIMITED'});
  assert.deepEqual(await queryPublicJobs('designer',1,async () => new Response('{}',{status:200})),{ok:false,error:'SOURCE_SCHEMA_CHANGED'});
});
