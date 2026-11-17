export const NIAT_APPLICATION = {
  baseUrl: "https://apply.niatindia.com/",
  utmSource: "futureme",
  utmMedium: "explore",
  campaigns: {
    decisionCard: "decision_card",
    parentPage: "parent_page",
  },
} as const;

export type NiatApplicationPlacement = keyof typeof NIAT_APPLICATION.campaigns;

/** Preserves existing query parameters while applying the shared campaign attribution. */
export function niatApplicationUrl(
  placement: NiatApplicationPlacement,
  baseUrl: string = NIAT_APPLICATION.baseUrl,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", NIAT_APPLICATION.utmSource);
  url.searchParams.set("utm_medium", NIAT_APPLICATION.utmMedium);
  url.searchParams.set("utm_campaign", NIAT_APPLICATION.campaigns[placement]);
  return url.toString();
}
