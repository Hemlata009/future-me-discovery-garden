// Browser-safe CRM helpers built only from data the signed-in role may already
// see. Priorities and queues come from observable operational facts, never
// from predictions of admission, conversion or student quality.
import type { CounsellorAssignee, LeadStatus, LeadView } from "@/lib/counsellor-metrics";
import { isTestTraffic } from "@/lib/growth-journey";
import { rate, type GrowthReport, type GrowthTotals } from "@/lib/growth-metrics";

export const WARM_LEAD_CAMPAIGN = "futureme_family_warmlead_test";
export const ACTIVE_STATUSES: ReadonlySet<LeadStatus> = new Set([
  "new",
  "assigned",
  "contacted",
  "follow_up",
  "qualified",
]);
export const CALL_OUTCOMES = [
  "reached",
  "no_answer",
  "busy",
  "wrong_number",
  "callback_requested",
  "not_interested",
] as const;

const DAY = 86_400_000;
const endOfUtcDay = (now: Date, offsetDays = 0) =>
  Date.parse(`${now.toISOString().slice(0, 10)}T23:59:59.999Z`) + offsetDays * DAY;

export function isActive(lead: Pick<LeadView, "status">): boolean {
  return ACTIVE_STATUSES.has(lead.status);
}

/** Active lead with no recorded call outcome yet. Opening a lead never counts as contact. */
export function isNotContacted(lead: Pick<LeadView, "status" | "last_contacted_at">): boolean {
  return isActive(lead) && !lead.last_contacted_at;
}

export function hasParentQuestion(lead: Pick<LeadView, "family_signals">): boolean {
  return lead.family_signals.some((signal) => signal.key === "parent_question_asked");
}

export type FollowUpBucket = "overdue" | "today" | "tomorrow" | "upcoming" | "none";

/** UTC calendar days, matching the documented reporting timezone. Inactive leads have no bucket. */
export function followUpBucket(
  lead: Pick<LeadView, "status" | "next_follow_up_at">,
  now = new Date(),
): FollowUpBucket | null {
  if (!isActive(lead)) return null;
  if (!lead.next_follow_up_at) return "none";
  const at = Date.parse(lead.next_follow_up_at);
  if (at <= now.getTime()) return "overdue";
  if (at <= endOfUtcDay(now)) return "today";
  if (at <= endOfUtcDay(now, 1)) return "tomorrow";
  return "upcoming";
}

export const FOLLOW_UP_LABELS: Record<FollowUpBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
  upcoming: "Upcoming",
  none: "No follow-up scheduled",
};

export type PriorityLevel = "now" | "today" | "later" | "none";
export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  now: "Follow up now",
  today: "Follow up today",
  later: "Follow up later",
  none: "No immediate action",
};

/** Rule-based queue placement with the reasons shown to the counsellor. */
export function leadPriority(
  lead: Pick<
    LeadView,
    | "status"
    | "assigned_to"
    | "last_contacted_at"
    | "next_follow_up_at"
    | "engagement_tier"
    | "family_signals"
    | "application_clicks"
  >,
  now = new Date(),
): { level: PriorityLevel; reasons: string[] } {
  if (!isActive(lead)) {
    return { level: "none", reasons: ["Lead is closed or marked not interested"] };
  }
  const now_: string[] = [];
  const today: string[] = [];
  const later: string[] = [];
  const notContacted = !lead.last_contacted_at;
  const bucket = followUpBucket(lead, now);

  if (lead.status === "new" && !lead.assigned_to) now_.push("New request not yet assigned");
  if (bucket === "overdue") now_.push("Scheduled follow-up is overdue");
  if (notContacted && lead.engagement_tier === "high")
    now_.push("High engagement with no recorded contact");
  if (notContacted && hasParentQuestion(lead))
    now_.push("Parent question submitted with no recorded contact");
  if (notContacted && lead.application_clicks > 0)
    now_.push("Application link clicked with no recorded contact");

  if (bucket === "today") today.push("Follow-up scheduled for later today");
  if (notContacted && now_.length === 0) today.push("Consented request not yet contacted");

  if (bucket === "tomorrow") later.push("Follow-up scheduled for tomorrow");
  if (bucket === "upcoming") later.push("Follow-up scheduled");
  if (bucket === "none" && !notContacted) later.push("No next follow-up scheduled yet");

  if (now_.length) return { level: "now", reasons: [...now_, ...today] };
  if (today.length) return { level: "today", reasons: today };
  if (later.length) return { level: "later", reasons: later };
  return { level: "none", reasons: ["No open follow-up action"] };
}

export type SourceType = "referral" | "campaign" | "direct";
export const SOURCE_LABELS: Record<SourceType, string> = {
  referral: "Referral",
  campaign: "Campaign",
  direct: "Direct / unattributed",
};

/** First-touch attribution stored on the consented request; never rewritten. */
export function leadSourceType(
  lead: Pick<LeadView, "referral_code" | "utm_source" | "utm_medium" | "utm_campaign">,
): SourceType {
  if (lead.referral_code) return "referral";
  if (lead.utm_source || lead.utm_medium || lead.utm_campaign) return "campaign";
  return "direct";
}

const NONE = "(none)";
const campaignKey = (source: string, medium: string, campaign: string) =>
  `${source}\u0000${medium}\u0000${campaign}`;

export type CampaignRow = {
  source: string;
  medium: string;
  campaign: string;
  /** Aggregate site traffic; null when the admin growth report isn't available. */
  visitors: number | null;
  generations: number | null;
  leads: number;
  high: number;
  medium_tier: number;
  low: number;
  family: number;
  application_click_leads: number;
  /** Leads with an application-link click ÷ leads from this source. */
  click_rate: number | null;
  highlighted: boolean;
  /** Tagged with a QA/test source; kept visible but never treated as real campaign results. */
  test: boolean;
};

export function campaignPerformance(
  leads: LeadView[],
  growthCampaigns?: GrowthReport["campaigns"],
): CampaignRow[] {
  const rows = new Map<string, CampaignRow>();
  const row = (source: string, medium: string, campaign: string) => {
    const key = campaignKey(source, medium, campaign);
    let existing = rows.get(key);
    if (!existing) {
      existing = {
        source,
        medium,
        campaign,
        visitors: growthCampaigns ? 0 : null,
        generations: growthCampaigns ? 0 : null,
        leads: 0,
        high: 0,
        medium_tier: 0,
        low: 0,
        family: 0,
        application_click_leads: 0,
        click_rate: null,
        highlighted: campaign === WARM_LEAD_CAMPAIGN && !isTestTraffic(source),
        test: isTestTraffic(source),
      };
      rows.set(key, existing);
    }
    return existing;
  };
  for (const item of growthCampaigns ?? []) {
    const target = row(item.source || NONE, item.medium || NONE, item.campaign || NONE);
    target.visitors = (target.visitors ?? 0) + item.visitors;
    target.generations = (target.generations ?? 0) + item.generations;
  }
  for (const lead of leads) {
    const target = row(lead.utm_source ?? NONE, lead.utm_medium ?? NONE, lead.utm_campaign ?? NONE);
    target.leads += 1;
    if (lead.engagement_tier === "high") target.high += 1;
    else if (lead.engagement_tier === "medium") target.medium_tier += 1;
    else target.low += 1;
    if (lead.family_signals.length > 0) target.family += 1;
    if (lead.application_clicks > 0) target.application_click_leads += 1;
  }
  return [...rows.values()]
    .map((item) => ({ ...item, click_rate: rate(item.application_click_leads, item.leads) }))
    .sort(
      (a, b) =>
        Number(a.test) - Number(b.test) ||
        Number(b.highlighted) - Number(a.highlighted) ||
        b.leads - a.leads ||
        (b.visitors ?? 0) - (a.visitors ?? 0),
    );
}

export type TeamRow = {
  user_id: string | null;
  label: string;
  assigned: number;
  new_leads: number;
  contacted: number;
  qualified: number;
  pending_follow_ups: number;
  overdue: number;
  application_click_leads: number;
};

export function teamPerformance(
  leads: LeadView[],
  assignees: CounsellorAssignee[],
  labelFor: (userId: string | null) => string,
  now = new Date(),
): TeamRow[] {
  const ids = new Set<string | null>([
    ...assignees.filter((person) => person.role !== "student").map((person) => person.user_id),
    ...leads.map((lead) => lead.assigned_to),
  ]);
  return [...ids]
    .map((userId) => {
      const mine = leads.filter((lead) => lead.assigned_to === userId);
      const buckets = mine.map((lead) => followUpBucket(lead, now));
      return {
        user_id: userId,
        label: labelFor(userId),
        assigned: mine.length,
        new_leads: mine.filter((lead) => lead.status === "new").length,
        contacted: mine.filter((lead) => lead.last_contacted_at).length,
        qualified: mine.filter((lead) => lead.status === "qualified").length,
        pending_follow_ups: buckets.filter(
          (b) => b === "today" || b === "tomorrow" || b === "upcoming",
        ).length,
        overdue: buckets.filter((b) => b === "overdue").length,
        application_click_leads: mine.filter((lead) => lead.application_clicks > 0).length,
      };
    })
    .sort(
      (a, b) => Number(a.user_id === null) - Number(b.user_id === null) || b.assigned - a.assigned,
    );
}

export type FunnelStage = {
  name: string;
  value: number | null;
  unit: string;
  /** This stage ÷ the previous available stage. */
  from_previous: number | null;
  note?: string;
};

/** Aggregate journey stages from the existing growth report. Unavailable stages stay null. */
export function journeyFunnel(totals: GrowthTotals): FunnelStage[] {
  const raw: Omit<FunnelStage, "from_previous">[] = [
    { name: "Landing-page visitors", value: totals.visitors, unit: "unique visitors" },
    { name: "Discovery started", value: totals.starts, unit: "starts" },
    { name: "Discovery completed", value: totals.completions, unit: "completions" },
    { name: "AI project generated", value: totals.gen_ok, unit: "successful generations" },
    {
      name: "Interactive demo used",
      value: null,
      unit: "",
      note: "Not in the aggregate growth report; see each lead's timeline.",
    },
    { name: "Parent Brief generated", value: totals.briefs_generated, unit: "briefs" },
    {
      name: "Parent Brief opened",
      value: totals.briefs_opened,
      unit: "opens (opener not verified)",
    },
    { name: "Parent question submitted", value: totals.parent_questions, unit: "questions" },
    { name: "Counsellor request submitted", value: totals.counsellor_requests, unit: "requests" },
    {
      name: "NIAT application link clicked",
      value: totals.application_clicks,
      unit: "clicks (not applications)",
    },
    {
      name: "Completed NIAT application",
      value: null,
      unit: "",
      note: "Needs NIAT admissions records; not connected.",
    },
  ];
  let previous: number | null = null;
  return raw.map((stage) => {
    const fromPrevious =
      stage.value !== null && previous !== null ? rate(stage.value, previous) : null;
    if (stage.value !== null) previous = stage.value;
    return { ...stage, from_previous: fromPrevious };
  });
}

export type LeadSort =
  | "score"
  | "newest"
  | "oldest"
  | "most_engaged"
  | "least_engaged"
  | "active_time"
  | "actions"
  | "follow_up"
  | "last_activity"
  | "application_clicks";

const TIER_RANK = { high: 3, medium: 2, low: 1 } as const;

export function sortLeads(leads: LeadView[], sort: LeadSort): LeadView[] {
  const copy = [...leads];
  const time = (value: string | null) => (value ? Date.parse(value) : Number.POSITIVE_INFINITY);
  const compare: Record<LeadSort, (a: LeadView, b: LeadView) => number> = {
    score: (a, b) => b.score - a.score,
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    oldest: (a, b) => a.created_at.localeCompare(b.created_at),
    most_engaged: (a, b) =>
      TIER_RANK[b.engagement_tier] - TIER_RANK[a.engagement_tier] ||
      b.meaningful_actions - a.meaningful_actions,
    least_engaged: (a, b) =>
      TIER_RANK[a.engagement_tier] - TIER_RANK[b.engagement_tier] ||
      a.meaningful_actions - b.meaningful_actions,
    active_time: (a, b) => b.active_seconds - a.active_seconds,
    actions: (a, b) => b.meaningful_actions - a.meaningful_actions,
    follow_up: (a, b) => time(a.next_follow_up_at) - time(b.next_follow_up_at),
    last_activity: (a, b) => b.last_activity.localeCompare(a.last_activity),
    application_clicks: (a, b) => b.application_clicks - a.application_clicks,
  };
  return copy.sort((a, b) => compare[sort](a, b) || b.created_at.localeCompare(a.created_at));
}

/** Neutralises spreadsheet formulas and quotes every cell. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Permitted lead report: masked phone only, no notes, no visitor hash. */
export function leadsToCsv(leads: LeadView[], labelFor: (userId: string | null) => string): string {
  const header = [
    "Lead ID",
    "Behaviour score",
    "Lead source",
    "Contact name",
    "Masked mobile",
    "Contact role",
    "Language",
    "Source type",
    "UTM source",
    "UTM medium",
    "UTM campaign",
    "Referral code",
    "Interest",
    "Technology",
    "Academic status",
    "Status",
    "Assigned counsellor",
    "Engagement tier",
    "Active seconds",
    "Meaningful actions",
    "Last activity (UTC)",
    "Next follow-up (UTC)",
    "Application-link clicks",
    "Created (UTC)",
  ];
  const rows = leads.map((lead) => [
    lead.id,
    lead.score,
    lead.lead_source === "student_signup" ? "Free sign-up" : "Callback request",
    lead.contact_name,
    lead.phone_masked,
    lead.who,
    lead.language,
    SOURCE_LABELS[leadSourceType(lead)],
    lead.utm_source,
    lead.utm_medium,
    lead.utm_campaign,
    lead.referral_code,
    lead.interest,
    lead.technology,
    lead.class_status,
    lead.status,
    labelFor(lead.assigned_to),
    lead.engagement_tier,
    lead.active_seconds,
    lead.meaningful_actions,
    lead.last_activity,
    lead.next_follow_up_at,
    lead.application_clicks,
    lead.created_at,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** ISO timestamp → value for <input type="datetime-local"> in the browser's own timezone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value (browser local time) → ISO timestamp. */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Reporting presets in UTC calendar days. */
export function rangeForPreset(
  preset: "today" | "7" | "30" | "month",
  now = new Date(),
): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  if (preset === "month") return { from: `${to.slice(0, 8)}01`, to };
  const days = preset === "today" ? 1 : Number(preset);
  const start = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY);
  return { from: start.toISOString().slice(0, 10), to };
}

export function crmKpis(leads: LeadView[], now = new Date()) {
  const count = (test: (lead: LeadView) => boolean) => leads.filter(test).length;
  const buckets = leads.map((lead) => followUpBucket(lead, now));
  const activeSeconds = leads.reduce((sum, lead) => sum + lead.active_seconds, 0);
  return {
    identified: leads.length,
    by_status: Object.fromEntries(
      (
        [
          "new",
          "assigned",
          "contacted",
          "follow_up",
          "qualified",
          "not_interested",
          "closed",
        ] as const
      ).map((status) => [status, count((lead) => lead.status === status)]),
    ) as Record<LeadStatus, number>,
    high: count((lead) => lead.engagement_tier === "high"),
    medium: count((lead) => lead.engagement_tier === "medium"),
    low: count((lead) => lead.engagement_tier === "low"),
    /** Total server-timed active seconds ÷ identified leads (leads with zero time included). */
    avg_active_seconds: leads.length ? Math.round(activeSeconds / leads.length) : null,
    total_actions: leads.reduce((sum, lead) => sum + lead.meaningful_actions, 0),
    active_last_24h: count((lead) => Date.parse(lead.last_activity) >= now.getTime() - DAY),
    due_today: buckets.filter((bucket) => bucket === "today").length,
    overdue: buckets.filter((bucket) => bucket === "overdue").length,
    not_contacted: count(isNotContacted),
    unassigned: count((lead) => isActive(lead) && !lead.assigned_to),
    undelivered: count((lead) => !lead.delivered),
    application_click_leads: count((lead) => lead.application_clicks > 0),
    brief_and_click: count(
      (lead) =>
        lead.application_clicks > 0 &&
        lead.family_signals.some((signal) => signal.key === "parent_brief_generated"),
    ),
    high_without_click: count(
      (lead) => lead.engagement_tier === "high" && lead.application_clicks === 0,
    ),
    family: count((lead) => lead.family_signals.length > 0),
    parent_callbacks: count((lead) => lead.who === "parent"),
    referral_leads: count((lead) => Boolean(lead.referral_code)),
    signups: count((lead) => lead.lead_source === "student_signup"),
    avg_score: leads.length
      ? Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length)
      : null,
    very_active: count((lead) => lead.score_band === "very_active"),
    referral_visits: leads.reduce((sum, lead) => sum + lead.referral_count, 0),
    leads_generating_referrals: count((lead) => lead.referral_count > 0),
  };
}

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  contacted: "Contacted",
  follow_up: "Follow up",
  qualified: "Qualified",
  not_interested: "Not interested",
  closed: "Closed",
};
export const OUTCOME_LABELS: Record<string, string> = {
  reached: "Reached",
  no_answer: "No answer",
  busy: "Busy",
  wrong_number: "Wrong number",
  callback_requested: "Callback requested",
  not_interested: "Not interested",
};

/** Timestamps are shown in UTC, the documented reporting timezone. */
export function dateTime(value: string | null): string {
  return value
    ? `${new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))} UTC`
    : "—";
}
