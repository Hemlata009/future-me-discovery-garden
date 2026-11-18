// Browser-safe, pure journey calculations for the admin growth dashboard.
// Every figure states its unit: unique visitors, unique projects, unique briefs
// or raw events. Rates always name numerator, denominator and cohort, and a
// zero denominator yields null (shown as "—"). Nothing here predicts admissions.

/** UTM sources that mark internal QA or test traffic. Matching is case-insensitive. */
export const TEST_TRAFFIC_SOURCES = ["qa", "test", "testing", "internal"] as const;

export function isTestTraffic(source: string | null | undefined): boolean {
  return !!source && (TEST_TRAFFIC_SOURCES as readonly string[]).includes(source.toLowerCase());
}

export type JourneyEvent = {
  visitor_hash: string;
  event_name: string;
  generated_project_id: string | null;
  parent_brief_id: string | null;
  cta: string | null;
  /** First-touch referral code copied from visitor attribution. */
  referral_code: string | null;
  /** Exact referral link used on a referral_visit, once the database stores it. */
  referral_link_code?: string | null;
  failure_kind: string | null;
  utm_source: string | null;
  created_at: string;
};

export type ReferralLinkRow = {
  code: string;
  owner_visitor_hash: string;
  generated_project_id: string;
};

export type RateValue = { numerator: number; denominator: number; value: number | null };

export function ratio(numerator: number, denominator: number): RateValue {
  return { numerator, denominator, value: denominator ? numerator / denominator : null };
}

/** "12.5% (10 ÷ 80 unique visitors)" or "— (0 ÷ 0 unique visitors)". */
export function describeRate(r: RateValue, denominatorUnit: string): string {
  const pct = r.value === null ? "—" : `${(r.value * 100).toFixed(1)}%`;
  return `${pct} (${r.numerator.toLocaleString("en-US")} ÷ ${r.denominator.toLocaleString(
    "en-US",
  )} ${denominatorUnit})`;
}

const distinct = (values: (string | null | undefined)[]) =>
  new Set(values.filter((value): value is string => !!value)).size;

export type JourneyDetail = ReturnType<typeof buildJourneyDetail>;

export function buildJourneyDetail(events: JourneyEvent[], links: ReferralLinkRow[]) {
  const of = (name: string) => events.filter((event) => event.event_name === name);
  const cta = (name: string) => of("cta_clicked").filter((event) => event.cta === name);

  const generated = of("generation_succeeded");
  const generatedProjects = new Set(
    generated.map((event) => event.generated_project_id).filter(Boolean) as string[],
  );
  const sharedProjects = new Set(
    of("project_shared")
      .map((event) => event.generated_project_id)
      .filter((id): id is string => !!id && generatedProjects.has(id)),
  );

  // Parent Brief cohort: briefs generated in the period, and what happened to those briefs.
  const cohortBriefs = new Set(
    of("parent_brief_generated")
      .map((e) => e.parent_brief_id)
      .filter(Boolean) as string[],
  );
  const briefsWith = (name: string) =>
    new Set(
      of(name)
        .map((event) => event.parent_brief_id)
        .filter((id): id is string => !!id && cohortBriefs.has(id)),
    ).size;

  return {
    funnel: {
      /** Unique visitors with at least one discovery_started event. */
      starters: distinct(of("discovery_started").map((e) => e.visitor_hash)),
      /** Unique visitors with at least one discovery_completed event. */
      completers: distinct(of("discovery_completed").map((e) => e.visitor_hash)),
      /** Unique projects with a successful generation event. */
      generated_projects: generatedProjects.size,
      /** Raw successful generation events. */
      generation_events: generated.length,
      /** Unique generated projects (in this period) with at least one share action. */
      shared_projects: sharedProjects.size,
    },
    niat: {
      application_visitors: distinct(cta("start_application").map((e) => e.visitor_hash)),
      application_events: cta("start_application").length,
      website_visitors: distinct(cta("visit_niat").map((e) => e.visitor_hash)),
      website_events: cta("visit_niat").length,
      info_visitors: distinct(cta("explore_niat").map((e) => e.visitor_hash)),
      info_events: cta("explore_niat").length,
    },
    family: {
      cohort_briefs: cohortBriefs.size,
      cohort_shared: briefsWith("parent_brief_shared"),
      cohort_opened: briefsWith("parent_brief_opened"),
      cohort_questioned: briefsWith("parent_question_asked"),
      /** Event counts in the period for any brief, including older ones. */
      share_events: of("parent_brief_shared").length,
      briefs_opened_any: distinct(of("parent_brief_opened").map((e) => e.parent_brief_id)),
      question_events: of("parent_question_asked").length,
    },
    referral: referredJourney(events, links),
    test_traffic_visitors: distinct(
      events.filter((event) => isTestTraffic(event.utm_source)).map((e) => e.visitor_hash),
    ),
  };
}

/**
 * Identifies referred visitors from referral_visit events. The exact link code is
 * used when stored; otherwise the first-touch code; otherwise the link pointing at
 * the visited project (referral_visit events always carry the link's project).
 * The visitor must not own the matching link.
 */
export function referredJourney(events: JourneyEvent[], links: ReferralLinkRow[]) {
  const byCode = new Map(links.map((link) => [link.code, link]));
  const firstReferral = new Map<string, number>();
  let matchedByProject = 0;
  for (const event of events) {
    if (event.event_name !== "referral_visit") continue;
    const codeLink =
      byCode.get(event.referral_link_code ?? "") ?? byCode.get(event.referral_code ?? "");
    let referred = !!codeLink && codeLink.owner_visitor_hash !== event.visitor_hash;
    if (!referred && event.generated_project_id) {
      referred = links.some(
        (link) =>
          link.generated_project_id === event.generated_project_id &&
          link.owner_visitor_hash !== event.visitor_hash,
      );
      if (referred && !firstReferral.has(event.visitor_hash)) matchedByProject += 1;
    }
    if (!referred) continue;
    const at = Date.parse(event.created_at);
    const previous = firstReferral.get(event.visitor_hash);
    if (previous === undefined || at < previous) firstReferral.set(event.visitor_hash, at);
  }
  let started = 0;
  let completed = 0;
  let application = 0;
  for (const [visitor, firstAt] of firstReferral) {
    const after = events.filter(
      (event) => event.visitor_hash === visitor && Date.parse(event.created_at) >= firstAt,
    );
    const didStart = after.some((event) => event.event_name === "discovery_started");
    if (didStart) started += 1;
    if (didStart && after.some((event) => event.event_name === "discovery_completed"))
      completed += 1;
    if (
      didStart &&
      after.some((event) => event.event_name === "cta_clicked" && event.cta === "start_application")
    )
      application += 1;
  }
  return {
    referred_visitors: firstReferral.size,
    started_discovery: started,
    completed_discovery: completed,
    application_clicks: application,
    /** Referred visitors identified only through the visited project (no stored link code). */
    matched_by_project: matchedByProject,
  };
}
