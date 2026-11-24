import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indeedPostingKey, directIndeedPostingUrl, lockedIndeedPostingKeys, isLockedIndeedPosting } from './indeed-posting-identity.ts';

const key = '0123456789abcdef';
const other = 'abcdef0123456789';
const posting = `https://www.indeed.com/viewjob?jk=${key}`;

test('tracking parameters and bare hostname do not change a known job identity', () => {
  assert.equal(indeedPostingKey(posting + '&from=app-tracker'), key);
  assert.equal(indeedPostingKey(`https://indeed.com/viewjob?from=search&jk=${key}`), key);
  assert.equal(directIndeedPostingUrl(posting + '&from=app-tracker&tk=synthetic'), posting);
});

test('untrusted, missing and ambiguous job identities cannot become a direct posting link', () => {
  for (const url of [
    `https://indeed.com.evil.example/viewjob?jk=${key}`,
    `https://user@www.indeed.com/viewjob?jk=${key}`,
    `http://www.indeed.com/viewjob?jk=${key}`,
    `https://www.indeed.com:1234/viewjob?jk=${key}`,
    `https://www.indeed.com/viewjob?jk=${key}&jk=${other}`,
    `https://www.indeed.com/viewjob?jk=${key}&jk=${key}`,
    'https://www.indeed.com/viewjob', 'https://www.indeed.com/viewjob?jk=invalid',
    `https://www.indeed.com/jobs?jk=${key}`, 'not a URL',
  ]) assert.equal(directIndeedPostingUrl(url), null, url);
});

test('locked identities exclude tracking aliases but not another posting or another ATS', () => {
  const locked = lockedIndeedPostingKeys([posting, 'https://example.test/job']);
  assert.equal(isLockedIndeedPosting(posting + '&from=search', locked), true);
  assert.equal(isLockedIndeedPosting(`https://www.indeed.com/viewjob?jk=${other}`, locked), false);
  assert.equal(isLockedIndeedPosting(`https://example.test/viewjob?jk=${key}`, locked), false);
});
