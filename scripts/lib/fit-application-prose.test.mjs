import assert from 'node:assert/strict';
import test from 'node:test';
import { fitApplicationProse } from './fit-application-prose.mjs';

const BROADCASTWELL_WHY = [
  "I'm interested in Broadcastwell's focus on repeatable automation, traceable evidence, and troubleshooting from logs and data.",
  'I build software and automation with Python, JavaScript/TypeScript, APIs, and AI coding agents, using tests and review gates to validate the result.',
  'My independent work includes a deployed full-stack task-management product, a retrieval-augmented classification API, and an ETL pipeline for reconciling service records.',
  'Healthcare IT delivery has also taught me to turn changing operational requirements into clear ownership, usable documentation, and verifiable outcomes.',
].join(' ');

test('fits unchanged prose under the budget', () => {
  const result = fitApplicationProse('One complete sentence.', 500);
  assert.equal(result.text, 'One complete sentence.');
  assert.equal(result.truncated, false);
});

test('never mid-word truncates Broadcastwell-style why-this-role prose at 500', () => {
  assert.equal(BROADCASTWELL_WHY.length > 500, true);
  const naive = BROADCASTWELL_WHY.slice(0, 500);
  assert.match(naive, /turn chan$/);

  const result = fitApplicationProse(BROADCASTWELL_WHY, 500);
  assert.equal(result.truncated, true);
  assert.equal(result.reason, 'sentence_boundary');
  assert.ok(result.text.length <= 500);
  assert.match(result.text, /\.$/);
  assert.doesNotMatch(result.text, /turn chan$/);
  assert.match(result.text, /reconciling service records\.$/);
  assert.doesNotMatch(result.text, /verifiable outcomes/);
});

test('fails closed when no complete sentence fits the budget', () => {
  assert.throws(
    () => fitApplicationProse('This single sentence is deliberately longer than the tiny budget allowed here.', 20),
    /fit_application_prose_cannot_fit_complete_sentence/,
  );
});
