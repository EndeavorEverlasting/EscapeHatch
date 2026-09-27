import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyCompensationFamily,
  resolveCompensationFill,
  type OpportunityCompensationProvenance,
  type PreferenceStoreLike,
} from './compensation-resolution.prototype.ts';

const NOW = Date.parse('2026-09-27T18:00:00.000Z');

function freshAnnualMax(max = 120000): OpportunityCompensationProvenance {
  return {
    minimum: 90000,
    maximum: max,
    currency: 'USD',
    period: 'annual',
    source_artifact_id: 'synthetic-posting-1',
    verified_at: '2026-09-27T12:00:00.000Z',
    freshness_ttl_hours: 72,
  };
}

describe('COMP0/1 compensation resolution prototype — success stacks', () => {
  it('desired annual + verified annual range -> posted maximum', () => {
    const result = resolveCompensationFill({
      field: {
        question_id: 'compensation.desired_annual_salary',
        family: 'desired',
        destination_period: 'annual',
      },
      provenance: freshAnnualMax(145000),
      preferenceStore: null,
      nowMs: NOW,
    });
    assert.equal(result.status, 'fill');
    if (result.status === 'fill') {
      assert.equal(result.source, 'verified_posted_maximum');
      assert.equal(result.value, '145000');
      assert.equal(result.period, 'annual');
    }
  });

  it('desired hourly + hourly-only range -> compatible hourly max', () => {
    const result = resolveCompensationFill({
      field: {
        question_id: 'compensation.desired_hourly_rate',
        family: 'desired',
        destination_period: 'hourly',
      },
      provenance: {
        ...freshAnnualMax(),
        minimum: 45,
        maximum: 62,
        period: 'hourly',
      },
      preferenceStore: null,
      nowMs: NOW,
    });
    assert.equal(result.status, 'fill');
    if (result.status === 'fill') {
      assert.equal(result.source, 'verified_posted_maximum');
      assert.equal(result.value, '62');
      assert.equal(result.period, 'hourly');
    }
  });

  it('explicit opportunity override wins over posted maximum', () => {
    const prefs: PreferenceStoreLike = {
      preferences: {
        'compensation.desired_annual_salary': {
          scope: 'opportunity_override',
          value: '130000',
        },
      },
    };
    const result = resolveCompensationFill({
      field: {
        question_id: 'compensation.desired_annual_salary',
        family: 'desired',
        destination_period: 'annual',
      },
      provenance: freshAnnualMax(145000),
      preferenceStore: prefs,
      nowMs: NOW,
    });
    assert.equal(result.status, 'fill');
    if (result.status === 'fill') {
      assert.equal(result.source, 'opportunity_override');
      assert.equal(result.value, '130000');
    }
  });
});

describe('COMP0/1 compensation resolution prototype — failure stacks', () => {
  it('current salary never receives posted maximum', () => {
    assert.equal(classifyCompensationFamily('compensation.current_salary'), 'current');
    const result = resolveCompensationFill({
      field: {
        question_id: 'compensation.current_salary',
        family: 'current',
        destination_period: 'annual',
      },
      provenance: freshAnnualMax(),
      preferenceStore: null,
      nowMs: NOW,
    });
    assert.equal(result.status, 'leave_blank');
    if (result.status === 'leave_blank') {
      assert.equal(result.reason, 'posted_max_forbidden_for_current');
    }
  });

  it('minimum acceptable never inherits desired-max policy', () => {
    const result = resolveCompensationFill({
      field: {
        question_id: 'compensation.minimum_acceptable',
        family: 'minimum_acceptable',
        destination_period: 'annual',
      },
      provenance: freshAnnualMax(),
      preferenceStore: null,
      nowMs: NOW,
    });
    assert.equal(result.status, 'leave_blank');
    if (result.status === 'leave_blank') {
      assert.equal(result.reason, 'posted_max_forbidden_for_minimum_acceptable');
    }
  });

  it('stale compensation source -> review', () => {
    const stale = {
      ...freshAnnualMax(),
      verified_at: '2026-01-01T00:00:00.000Z',
      freshness_ttl_hours: 24,
    };
    const result = resolveCompensationFill({
      field: {
        question_id: 'compensation.desired_annual_salary',
        family: 'desired',
        destination_period: 'annual',
      },
      provenance: stale,
      preferenceStore: null,
      nowMs: NOW,
    });
    assert.equal(result.status, 'review');
    if (result.status === 'review') {
      assert.equal(result.reason, 'stale_compensation_source');
    }
  });

  it('annual posting into hourly field fails closed without conversion', () => {
    const result = resolveCompensationFill({
      field: {
        question_id: 'compensation.desired_hourly_rate',
        family: 'desired',
        destination_period: 'hourly',
      },
      provenance: freshAnnualMax(),
      preferenceStore: null,
      nowMs: NOW,
    });
    assert.equal(result.status, 'review');
    if (result.status === 'review') {
      assert.equal(result.reason, 'period_mismatch_no_conversion');
    }
  });
});
