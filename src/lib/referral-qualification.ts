/** Canonical rule mirrored by the growth report's first-touch referral aggregate. */
export function isQualifiedReferral(input: {
  firstTouchReferralCode: string | null;
  visitorHash: string;
  linkOwnerVisitorHash: string | null;
  completedDiscoveries: number;
}): boolean {
  return Boolean(
    input.firstTouchReferralCode &&
    input.linkOwnerVisitorHash &&
    input.visitorHash !== input.linkOwnerVisitorHash &&
    input.completedDiscoveries > 0,
  );
}
