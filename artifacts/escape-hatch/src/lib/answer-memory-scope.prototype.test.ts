import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyAnswerMemoryScope,
  sanitizeObservation,
} from './answer-memory-scope.prototype.ts';

describe('QMEM0 answer-memory scope prototype — success stacks', () => {
  it('sanitizes observations by dropping filled values', () => {
    const clean = sanitizeObservation({
      label: 'Scripting language',
      value: 'SECRET_ANSWER',
      selected: 'Python',
      control_type: 'select',
      options: ['Python', 'JavaScript'],
      name: 'scripting_lang',
      category_hint: 'capability',
    });
    assert.equal(clean.label, 'Scripting language');
    assert.deepEqual(clean.option_labels, ['Python', 'JavaScript']);
    assert.equal('value' in clean, false);
    assert.equal((clean as { selected?: unknown }).selected, undefined);
  });

  it('standard reusable questionnaire wording is eligible', () => {
    const decision = classifyAnswerMemoryScope(
      sanitizeObservation({
        label: 'Scripting language',
        control_type: 'select',
        options: ['Python', 'JavaScript'],
        category_hint: 'capability',
      }),
      'fill_if_explicit_preference',
    );
    assert.equal(decision.status, 'eligible');
    if (decision.status === 'eligible') {
      assert.equal(decision.scope, 'capability_tenure');
      assert.equal(decision.may_autofill_later, true);
    }
  });

  it('desired compensation maps to opportunity scope', () => {
    const decision = classifyAnswerMemoryScope(
      sanitizeObservation({
        label: 'Desired salary',
        control_type: 'text',
        category_hint: 'compensation',
      }),
    );
    assert.equal(decision.status, 'eligible');
    if (decision.status === 'eligible') {
      assert.equal(decision.scope, 'opportunity');
    }
  });
});

describe('QMEM0 answer-memory scope prototype — failure stacks', () => {
  it('EEO / protected-class wording is never inferred into memory', () => {
    const decision = classifyAnswerMemoryScope(
      sanitizeObservation({
        label: 'Race / Ethnicity',
        value: 'MUST_NOT_PERSIST',
        control_type: 'select',
        category_hint: 'eeo',
      }),
    );
    assert.equal(decision.status, 'reject');
    if (decision.status === 'reject') {
      assert.equal(decision.reason, 'protected_class_never_inferred');
      assert.equal(decision.scope, 'forbidden_infer');
    }
  });

  it('electronic signature / attestation stays a hard manual boundary', () => {
    const decision = classifyAnswerMemoryScope(
      sanitizeObservation({
        label: 'Electronic signature — I certify this application is truthful',
        control_type: 'text',
        category_hint: 'attestation',
      }),
    );
    assert.equal(decision.status, 'reject');
    if (decision.status === 'reject') {
      assert.equal(decision.reason, 'attestation_manual_boundary');
    }
  });
});
