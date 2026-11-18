import {
  behaviourScore,
  summariseActivity,
  type ActivityRow,
  type BehaviourSummary,
  type ScoreBand,
  type ScorePart,
} from "@/lib/behaviour-score";

// Browser-safe, deterministic lead metrics. These are engagement indicators,
// never predictions of admission probability or student quality.

export const LEAD_STATUSES = [
  "new",
  "assigned",
  "contacted",
  "follow_up",
  "qualified",
  "not_interested",
  "closed",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type EngagementTier = "high" | "medium" | "low";

export type LeadSource = {
  id: string;
  contact_name: string;
  phone: string;
  visitor_hash: string | null;
  /** Null for a student who signed up before generating a project. */
  generated_project_id: string | null;
  parent_brief_id: string | null;
  /** "callback_request" (counsellor form) or "student_signup" (free account). */
  lead_source: string;
  student_user_id: string | null;
  language: string;
  who: string;
  interest: string;
  technology: string;
  class_status: string;
  project_title: string;
  referral_code: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  call_outcome: string | null;
  internal_notes: string;
  delivered: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadEvent = {
  id: string;
  event_name: string;
  visitor_hash: string;
  generated_project_id: string | null;
  parent_brief_id: string | null;
  referral_code: string | null;
  channel: string | null;
  cta: string | null;
  failure_kind: string | null;
  created_at: string;
};

export type Heartbeat = {
  visitor_hash: string;
  active_seconds: number;
  created_at: string;
};
export type ReferralOwner = {
  code: string;
  owner_visitor_hash: string;
  /** Project the link points to; referral_visit events always carry it. */
  generated_project_id?: string;
};
export type FamilyEvidence = { key: string; label: string; at: string; note: string };
export type NamedMetric = { name: string; value: number };

export type LeadView = Omit<LeadSource, "phone"> & {
  phone_masked: string;
  behaviour: BehaviourSummary;
  score: number;
  score_band: ScoreBand;
  score_parts: ScorePart[];
  active_seconds: number;
  meaningful_actions: number;
  family_signals: FamilyEvidence[];
  referral_count: number;
  last_activity: string;
  engagement_tier: EngagementTier;
  tier_reasons: string[];
  application_clicks: number;
  decision_steps: string[];
};

export type CounsellorRole = "admin" | "counsellor";
export type CounsellorAssignee = {
  user_id: string;
  role: "admin" | "counsellor" | "student";
  /** Team member's sign-in email; only returned to admins. */
  email?: string | null;
};
export type CounsellorViewer = { user_id: string; email: string | null; role: CounsellorRole };
export type CounsellorWorkspaceResult =
  | { access: "denied" }
  | {
      access: "ok";
      role: CounsellorRole;
      viewer: CounsellorViewer;
      leads: LeadView[];
      assignees: CounsellorAssignee[];
      report: ReturnType<typeof buildCounsellorReport>;
    };
export type CounsellorLeadResult =
  | { access: "denied" | "not_found" }
  | {
      access: "ok";
      role: CounsellorRole;
      lead: LeadView;
      assignees: CounsellorAssignee[];
      timeline: {
        id: string;
        event_name: string;
        cta: string | null;
        channel: string | null;
        created_at: string;
        source: string;
        path?: string | null;
        seconds?: number | null;
      }[];
    };

const MEANINGFUL_EVENTS = new Set([
  "project_viewed",
  "project_shared",
  "demo_interacted",
  "parent_brief_generated",
  "parent_brief_shared",
  "parent_brief_opened",
  "parent_question_asked",
  "counsellor_requested",
]);
const DECISION_EVENTS: Record<string, string> = {
  demo_interacted: "Interactive demo used",
  parent_brief_generated: "Parent Brief generated",
  parent_question_asked: "Parent question submitted",
  counsellor_requested: "Counsellor requested",
};
const FAMILY_EVENTS: Record<string, { label: string; note: string }> = {
  parent_brief_generated: {
    label: "Parent Brief generated",
    note: "A brief was created for this project.",
  },
  parent_brief_shared: {
    label: "Parent Brief shared",
    note: "A share action was recorded; delivery is not proven.",
  },
  parent_brief_opened: {
    label: "Parent Brief opened",
    note: "The brief was opened; the opener is not assumed to be a parent.",
  },
  parent_question_asked: {
    label: "Parent question submitted",
    note: "A grounded Parent Brief question was submitted.",
  },
};

export function maskPhone(phone: string): string {
  const lastFour = phone.replace(/\D/g, "").slice(-4).padStart(4, "•");
  return `${phone.trim().startsWith("+91") ? "+91 " : ""}••••••${lastFour}`;
}

function isMeaningful(event: LeadEvent): boolean {
  if (event.event_name === "cta_clicked") {
    return event.cta === "start_application" || event.cta === "visit_niat";
  }
  if (event.event_name === "counsellor_requested") {
    return !["visitor_limit", "global_limit"].includes(event.failure_kind ?? "");
  }
  return MEANINGFUL_EVENTS.has(event.event_name);
}

export function leadEvents(
  lead: Pick<LeadSource, "visitor_hash" | "generated_project_id">,
  events: LeadEvent[],
): LeadEvent[] {
  return events.filter(
    (event) =>
      (lead.visitor_hash !== null && event.visitor_hash === lead.visitor_hash) ||
      (lead.generated_project_id !== null &&
        event.generated_project_id === lead.generated_project_id),
  );
}

/** Behaviour rows that belong to a lead: their account or their browser. */
export function leadActivity(
  lead: Pick<LeadSource, "visitor_hash" | "student_user_id">,
  rows: (ActivityRow & { user_id: string | null; visitor_hash: string | null })[],
) {
  return rows.filter(
    (row) =>
      (lead.student_user_id !== null && row.user_id === lead.student_user_id) ||
      (lead.visitor_hash !== null &&
        row.user_id === null &&
        row.visitor_hash === lead.visitor_hash),
  );
}

export function familyEvidence(lead: LeadSource, events: LeadEvent[]): FamilyEvidence[] {
  const related = leadEvents(lead, events).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const evidence: FamilyEvidence[] = [];
  for (const [eventName, copy] of Object.entries(FAMILY_EVENTS)) {
    const event = related.find((item) => item.event_name === eventName);
    if (event) evidence.push({ key: eventName, ...copy, at: event.created_at });
  }
  if (lead.who === "parent") {
    evidence.push({
      key: "parent_identified",
      label: "Parent/guardian identified",
      at: lead.created_at,
      note: "The consented counsellor request identifies the contact as a parent/guardian.",
    });
  }
  return evidence;
}

function applicationClicks(events: LeadEvent[]): LeadEvent[] {
  return events.filter(
    (event) => event.event_name === "cta_clicked" && event.cta === "start_application",
  );
}

/** High: recent + 4 actions + 2 decision steps. Medium: recent + some activity. Low: limited/stale. */
export function engagementTier(
  actions: number,
  decisionSteps: number,
  lastActivity: string,
  rangeEnd: string,
): {
  tier: EngagementTier;
  reasons: string[];
} {
  const end = Date.parse(`${rangeEnd}T23:59:59.999Z`);
  const recent = Date.parse(lastActivity) >= end - 7 * 86_400_000;
  const reasons = [
    `${actions} meaningful action${actions === 1 ? "" : "s"} in the selected period`,
    `${decisionSteps} important decision step${decisionSteps === 1 ? "" : "s"} completed`,
    recent
      ? "Activity within seven days of the range end"
      : "No recent activity within seven days of the range end",
  ];
  if (!recent) return { tier: "low", reasons };
  if (actions >= 4 && decisionSteps >= 2) return { tier: "high", reasons };
  if (actions >= 2 || decisionSteps >= 1) return { tier: "medium", reasons };
  return { tier: "low", reasons };
}

export function buildLeadView(
  lead: LeadSource,
  events: LeadEvent[],
  heartbeats: Heartbeat[],
  referralOwners: ReferralOwner[],
  rangeEnd: string,
  activity: (ActivityRow & { user_id: string | null; visitor_hash: string | null })[] = [],
  now = new Date(),
): LeadView {
  const related = leadEvents(lead, events);
  const relatedBeats = heartbeats.filter(
    (beat) => lead.visitor_hash !== null && beat.visitor_hash === lead.visitor_hash,
  );
  const owned = referralOwners.filter((link) => link.owner_visitor_hash === lead.visitor_hash);
  const ownedCodes = new Set(owned.map((link) => link.code));
  const ownedProjects = new Set(owned.map((link) => link.generated_project_id).filter(Boolean));
  const knownCodes = new Set(referralOwners.map((link) => link.code));
  // referral_code on an event is the visitor's first touch. A visitor whose first touch
  // was direct has no code on the referral_visit row, so fall back to the linked project.
  const referralCount = events.filter(
    (event) =>
      event.event_name === "referral_visit" &&
      lead.visitor_hash !== null &&
      event.visitor_hash !== lead.visitor_hash &&
      (event.referral_code && knownCodes.has(event.referral_code)
        ? ownedCodes.has(event.referral_code)
        : !!event.generated_project_id && ownedProjects.has(event.generated_project_id)),
  ).length;
  const meaningful = related.filter(isMeaningful);
  const decisions = new Set<string>();
  for (const event of meaningful) {
    if (DECISION_EVENTS[event.event_name]) decisions.add(DECISION_EVENTS[event.event_name]!);
  }
  if (applicationClicks(meaningful).length > 0) decisions.add("NIAT application link clicked");
  const lastActivity = [
    lead.created_at,
    ...related.map((event) => event.created_at),
    ...relatedBeats.map((beat) => beat.created_at),
  ]
    .sort()
    .at(-1)!;
  const tier = engagementTier(meaningful.length, decisions.size, lastActivity, rangeEnd);
  const mine = leadActivity(lead, activity);
  const behaviour = summariseActivity(mine);
  const activeSeconds = relatedBeats.reduce((sum, beat) => sum + beat.active_seconds, 0);
  const family = familyEvidence(lead, related);
  const latestActivity = [lastActivity, ...mine.map((row) => row.created_at)].sort().at(-1)!;
  const scored = behaviourScore(
    {
      active_seconds: activeSeconds,
      behaviour,
      has_project:
        lead.generated_project_id !== null ||
        related.some((event) => event.event_name === "generation_succeeded"),
      used_demo: related.some((event) => event.event_name === "demo_interacted"),
      brief_generated: family.some((signal) => signal.key === "parent_brief_generated"),
      brief_shared: family.some((signal) => signal.key === "parent_brief_shared"),
      parent_question: family.some((signal) => signal.key === "parent_question_asked"),
      application_clicked: applicationClicks(related).length > 0,
      last_activity: latestActivity,
    },
    now,
  );
  const { phone, ...withoutPhone } = lead;
  return {
    ...withoutPhone,
    phone_masked: maskPhone(phone),
    behaviour,
    score: scored.score,
    score_band: scored.band,
    score_parts: scored.parts,
    active_seconds: activeSeconds,
    meaningful_actions: meaningful.length,
    family_signals: family,
    referral_count: referralCount,
    last_activity: latestActivity,
    engagement_tier: tier.tier,
    tier_reasons: tier.reasons,
    application_clicks: applicationClicks(related).length,
    decision_steps: [...decisions],
  };
}

function named(values: string[]): NamedMetric[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function utcDay(value: string): string {
  return value.slice(0, 10);
}

function days(from: string, to: string): string[] {
  const result: string[] = [];
  for (
    let time = Date.parse(`${from}T00:00:00Z`);
    time <= Date.parse(`${to}T00:00:00Z`);
    time += 86_400_000
  ) {
    result.push(new Date(time).toISOString().slice(0, 10));
  }
  return result;
}

export function buildCounsellorReport(
  leads: LeadView[],
  events: LeadEvent[],
  heartbeats: Heartbeat[],
  range: { from: string; to: string },
  now = new Date(),
) {
  const leadIds = new Set(leads.map((lead) => lead.id));
  const visitors = new Set(leads.map((lead) => lead.visitor_hash).filter(Boolean));
  const projects = new Set(
    leads.map((lead) => lead.generated_project_id).filter((id): id is string => id !== null),
  );
  const relatedEvents = events.filter(
    (event) =>
      (visitors.has(event.visitor_hash) && event.visitor_hash !== null) ||
      (event.generated_project_id !== null && projects.has(event.generated_project_id)),
  );
  const relatedBeats = heartbeats.filter((beat) => visitors.has(beat.visitor_hash));
  const daily = days(range.from, range.to).map((day) => ({
    day,
    leads: leads.filter((lead) => utcDay(lead.created_at) === day).length,
    active_seconds: relatedBeats
      .filter((beat) => utcDay(beat.created_at) === day)
      .reduce((sum, beat) => sum + beat.active_seconds, 0),
    meaningful_actions: relatedEvents.filter(
      (event) => utcDay(event.created_at) === day && isMeaningful(event),
    ).length,
  }));
  const activeStatuses = new Set<LeadStatus>([
    "new",
    "assigned",
    "contacted",
    "follow_up",
    "qualified",
  ]);
  const endOfToday = Date.parse(`${now.toISOString().slice(0, 10)}T23:59:59.999Z`);
  const family = leads.filter((lead) => lead.family_signals.length > 0);
  return {
    kpis: {
      identified_leads: leads.length,
      new_leads: leads.filter((lead) => lead.status === "new").length,
      highly_engaged: leads.filter((lead) => lead.engagement_tier === "high").length,
      follow_ups_due: leads.filter(
        (lead) =>
          activeStatuses.has(lead.status) &&
          lead.next_follow_up_at &&
          Date.parse(lead.next_follow_up_at) > now.getTime() &&
          Date.parse(lead.next_follow_up_at) <= endOfToday,
      ).length,
      overdue_follow_ups: leads.filter(
        (lead) =>
          activeStatuses.has(lead.status) &&
          lead.next_follow_up_at &&
          Date.parse(lead.next_follow_up_at) <= now.getTime(),
      ).length,
      family_engagement: family.length,
      application_clicks: leads.reduce((sum, lead) => sum + lead.application_clicks, 0),
      undelivered: leads.filter((lead) => !lead.delivered).length,
    },
    daily,
    pipeline: LEAD_STATUSES.map((status) => ({
      name: status,
      value: leads.filter((lead) => lead.status === status).length,
    })),
    languages: named(leads.map((lead) => lead.language)),
    interests: named(leads.map((lead) => lead.interest)),
    referral: {
      visits: leads.reduce((sum, lead) => sum + lead.referral_count, 0),
      leads_with_referrals: leads.filter((lead) => lead.referral_count > 0).length,
    },
    family_stages: Object.entries(FAMILY_EVENTS).map(([key, copy]) => ({
      name: copy.label,
      value: leads.filter((lead) => lead.family_signals.some((signal) => signal.key === key))
        .length,
    })),
    readiness: {
      application_clicked: leads.filter((lead) => lead.application_clicks > 0).length,
      brief_and_application: leads.filter(
        (lead) =>
          lead.application_clicks > 0 &&
          lead.family_signals.some((signal) => signal.key === "parent_brief_generated"),
      ).length,
      high_without_application: leads.filter(
        (lead) => lead.engagement_tier === "high" && lead.application_clicks === 0,
      ).length,
    },
    lead_count_check: leadIds.size,
  };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
