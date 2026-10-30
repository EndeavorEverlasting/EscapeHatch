/** Deterministic materials-review readiness for one opportunity package. Never claims employer acceptance. */
export type MaterialsSlot = {
  kind: 'resume' | 'cover';
  present: boolean;
  reviewed: boolean;
  name?: string;
  reviewedAt?: string;
};

export type MaterialsReviewStatus = {
  opportunityId: string;
  applicationUrl: string;
  requireReview: boolean;
  slots: MaterialsSlot[];
  readyForUploadPolicy: boolean;
  missingKinds: Array<'resume' | 'cover'>;
  unreviewedKinds: Array<'resume' | 'cover'>;
  summary: string;
};

export function projectMaterialsReviewStatus(input: {
  opportunityId: string;
  applicationUrl: string;
  requireReview: boolean;
  documents: Partial<Record<'resume' | 'cover', { name?: string; reviewedAt?: string } | undefined>>;
  requireCover?: boolean;
}): MaterialsReviewStatus {
  const requireCover = input.requireCover === true;
  const kinds = (['resume', 'cover'] as const).filter(kind => kind === 'resume' || requireCover || input.documents.cover);
  const slots: MaterialsSlot[] = (['resume', 'cover'] as const).map(kind => {
    const item = input.documents[kind];
    return {
      kind,
      present: Boolean(item),
      reviewed: Boolean(item?.reviewedAt),
      name: item?.name,
      reviewedAt: item?.reviewedAt,
    };
  });
  const missingKinds = kinds.filter(kind => !input.documents[kind]);
  const unreviewedKinds = kinds.filter(kind => input.documents[kind] && !input.documents[kind]?.reviewedAt);
  const readyForUploadPolicy = Boolean(input.documents.resume) && (
    !input.requireReview || Object.values(input.documents).every(item => !item || item.reviewedAt)
  ) && (!requireCover || Boolean(input.documents.cover && (!input.requireReview || input.documents.cover.reviewedAt)));
  let summary = 'Choose an opportunity to review its résumé and cover letter.';
  if (input.opportunityId && input.applicationUrl) {
    if (!input.documents.resume) summary = 'Save a résumé PDF for this opportunity, then confirm you reviewed it.';
    else if (input.requireReview && unreviewedKinds.length) {
      summary = `Confirm review for: ${unreviewedKinds.map(kind => kind === 'resume' ? 'résumé' : 'cover letter').join(' and ')}.`;
    } else if (readyForUploadPolicy) summary = 'Materials meet your current review setting for upload preparation.';
    else summary = 'Materials are saved. Complete required review before upload preparation.';
  }
  return {
    opportunityId: input.opportunityId,
    applicationUrl: input.applicationUrl,
    requireReview: input.requireReview,
    slots,
    readyForUploadPolicy,
    missingKinds,
    unreviewedKinds,
    summary,
  };
}
