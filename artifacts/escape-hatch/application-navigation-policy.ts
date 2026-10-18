export const NAVIGATION_AUTHORITY_SCHEMA = 'escapehatch/application-navigation-authority/v1';
export const ADAPTER_EVIDENCE_SCHEMA = 'escapehatch/application-navigation-adapter-evidence/v1';

export const EFFECT_CLASSES = [
  'LOCAL_STEP_ONLY',
  'DRAFT_WRITE_AND_ADVANCE',
  'TERMINAL_APPLICATION_COMMIT',
  'UNKNOWN_OR_COMPOSITE',
] as const;
export type EffectClass = (typeof EFFECT_CLASSES)[number];

export type GrantableEffectClass = Extract<EffectClass, 'LOCAL_STEP_ONLY' | 'DRAFT_WRITE_AND_ADVANCE'>;

export type ControlObservation = {
  accessibleName: string;
  htmlType: string | null;
  tag: string;
  pageUrl: string;
  pageOrigin: string;
  pageFingerprint: string;
  controlId: string;
  controlFingerprint: string;
  enclosingFormAction: string | null;
  enclosingFormMethod: string | null;
};

export type AdapterEvidence = {
  schema: string;
  adapterId: string;
  atsProvider: string;
  origin: string;
  pageFingerprint: string;
  controlId: string;
  controlFingerprint: string;
  enclosingFormAction: string | null;
  enclosingFormMethod: string | null;
  verifiedEffectClass: GrantableEffectClass | 'TERMINAL_APPLICATION_COMMIT';
  evidenceRefs: string[];
  verifiedAtUtc: string;
  expiresAtUtc: string;
};

export type NavigationAuthorization = {
  sessionId: string;
  opportunityId: string;
  origin: string;
  navigationEnabled: boolean;
  allowedEffectClasses: GrantableEffectClass[];
  allowedDataCategories: string[];
  expiresAtUtc: string;
};

export type ClassificationVerdict = {
  effectClass: EffectClass;
  evidenceRefs: string[];
  confidence: 'verified' | 'insufficient';
  blockers: string[];
  automationPermitted: boolean;
  requiresOperatorAction: boolean;
};

function parseUtc(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function terminalVerdict(evidenceRefs: string[]): ClassificationVerdict {
  return {
    effectClass: 'TERMINAL_APPLICATION_COMMIT',
    evidenceRefs,
    confidence: 'verified',
    blockers: ['terminal_application_commit_is_operator_only'],
    automationPermitted: false,
    requiresOperatorAction: true,
  };
}

function unknownVerdict(blockers: string[], evidenceRefs: string[] = []): ClassificationVerdict {
  return {
    effectClass: 'UNKNOWN_OR_COMPOSITE',
    evidenceRefs,
    confidence: 'insufficient',
    blockers,
    automationPermitted: false,
    requiresOperatorAction: true,
  };
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function classifyNavigationAction(
  observation: ControlObservation,
  adapterEvidence: AdapterEvidence | null,
  authorization: NavigationAuthorization | null,
  nowUtc: Date,
): ClassificationVerdict {
  if (
    !observation ||
    !hasText(observation.pageOrigin) ||
    !hasText(observation.pageFingerprint) ||
    !hasText(observation.controlId) ||
    !hasText(observation.controlFingerprint)
  ) {
    return unknownVerdict(['malformed_control_observation']);
  }

  if (!adapterEvidence) {
    return unknownVerdict(['no_trusted_adapter_evidence']);
  }

  if (adapterEvidence.schema !== ADAPTER_EVIDENCE_SCHEMA) {
    return unknownVerdict(['unsupported_adapter_evidence_schema']);
  }

  if (
    adapterEvidence.origin !== observation.pageOrigin ||
    adapterEvidence.pageFingerprint !== observation.pageFingerprint ||
    adapterEvidence.controlId !== observation.controlId ||
    adapterEvidence.controlFingerprint !== observation.controlFingerprint ||
    adapterEvidence.enclosingFormAction !== observation.enclosingFormAction ||
    adapterEvidence.enclosingFormMethod !== observation.enclosingFormMethod
  ) {
    return unknownVerdict(['adapter_evidence_context_mismatch'], [adapterEvidence.adapterId]);
  }

  const verifiedAt = parseUtc(adapterEvidence.verifiedAtUtc);
  const expiresAt = parseUtc(adapterEvidence.expiresAtUtc);
  if (!verifiedAt || !expiresAt || expiresAt.getTime() <= verifiedAt.getTime()) {
    return unknownVerdict(['adapter_evidence_timestamps_invalid'], [adapterEvidence.adapterId]);
  }
  if (nowUtc.getTime() > expiresAt.getTime()) {
    return unknownVerdict(['adapter_evidence_expired'], [adapterEvidence.adapterId]);
  }
  if (nowUtc.getTime() < verifiedAt.getTime()) {
    return unknownVerdict(['adapter_evidence_from_future'], [adapterEvidence.adapterId]);
  }

  const evidenceRefs = [adapterEvidence.adapterId, ...adapterEvidence.evidenceRefs];

  if (adapterEvidence.verifiedEffectClass === 'TERMINAL_APPLICATION_COMMIT') {
    return terminalVerdict(evidenceRefs);
  }

  const effectClass = adapterEvidence.verifiedEffectClass;
  const blockers: string[] = [];

  if (!authorization) {
    blockers.push('missing_navigation_authorization');
  } else {
    if (!authorization.navigationEnabled) {
      blockers.push('navigation_not_enabled');
    }
    if (authorization.origin !== observation.pageOrigin) {
      blockers.push('authorization_origin_mismatch');
    }
    if (!hasText(authorization.sessionId) || !hasText(authorization.opportunityId)) {
      blockers.push('authorization_missing_session_binding');
    }
    const authExpires = parseUtc(authorization.expiresAtUtc);
    if (!authExpires) {
      blockers.push('authorization_expiry_invalid');
    } else if (nowUtc.getTime() > authExpires.getTime()) {
      blockers.push('authorization_expired');
    }

    const granted: readonly string[] = authorization.allowedEffectClasses ?? [];
    if (granted.includes('TERMINAL_APPLICATION_COMMIT')) {
      blockers.push('terminal_effect_class_not_grantable');
    }
    if (!granted.includes(effectClass)) {
      blockers.push('effect_class_not_authorized');
    }

    if (effectClass === 'DRAFT_WRITE_AND_ADVANCE') {
      const categories = authorization.allowedDataCategories ?? [];
      if (categories.length === 0) {
        blockers.push('draft_disclosure_data_categories_not_authorized');
      }
    }
  }

  const automationPermitted = blockers.length === 0;
  return {
    effectClass,
    evidenceRefs,
    confidence: 'verified',
    blockers,
    automationPermitted,
    requiresOperatorAction: !automationPermitted,
  };
}
