// Browser-safe, transparent behaviour score for counsellors. It summarises what a
// student actually did (time, visits, exploration, family and friend involvement,
// application intent). It is NOT a prediction of admission or a measure of quality.

export type ActivityRow = {
  kind:
    | "page_view"
    | "signup"
    | "login"
    | "logout"
    | "return_visit"
    | "signup_prompt_shown"
    | "invite_created"
    | "invite_visit"
    | "invite_signup";
  path: string | null;
  seconds: number | null;
  detail: string | null;
  created_at: string;
};

export type BehaviourSummary = {
  page_views: number;
  pages_explored: number;
  page_seconds: number;
  top_pages: { path: string; views: number; seconds: number }[];
  logins: number;
  logouts: number;
  return_visits: number;
  last_login: string | null;
  signed_up_at: string | null;
  signup_prompts: number;
  parent_invites: number;
  parent_visits: number;
  friend_invites: number;
  friend_visits: number;
  invite_signups: number;
};

export function summariseActivity(rows: ActivityRow[]): BehaviourSummary {
  const views = rows.filter((row) => row.kind === "page_view" && row.path);
  const pages = new Map<string, { views: number; seconds: number }>();
  for (const view of views) {
    const entry = pages.get(view.path!) ?? { views: 0, seconds: 0 };
    entry.views += 1;
    entry.seconds += Math.max(0, Math.min(3600, view.seconds ?? 0));
    pages.set(view.path!, entry);
  }
  const of = (kind: ActivityRow["kind"], detail?: string) =>
    rows.filter((row) => row.kind === kind && (detail === undefined || row.detail === detail));
  const latest = (list: ActivityRow[]) =>
    list
      .map((row) => row.created_at)
      .sort()
      .at(-1) ?? null;
  return {
    page_views: views.length,
    pages_explored: pages.size,
    page_seconds: [...pages.values()].reduce((sum, page) => sum + page.seconds, 0),
    top_pages: [...pages]
      .map(([path, page]) => ({ path, ...page }))
      .sort((a, b) => b.seconds - a.seconds || b.views - a.views)
      .slice(0, 6),
    logins: of("login").length,
    logouts: of("logout").length,
    return_visits: of("return_visit").length,
    last_login: latest(of("login")),
    signed_up_at: latest(of("signup")),
    signup_prompts: of("signup_prompt_shown").length,
    parent_invites: of("invite_created", "parent").length,
    parent_visits: of("invite_visit", "parent").length,
    friend_invites: of("invite_created", "friend").length,
    friend_visits: of("invite_visit", "friend").length,
    invite_signups: of("invite_signup").length,
  };
}

export type ScoreInputs = {
  active_seconds: number;
  behaviour: BehaviourSummary;
  has_project: boolean;
  used_demo: boolean;
  brief_generated: boolean;
  brief_shared: boolean;
  parent_question: boolean;
  application_clicked: boolean;
  last_activity: string;
};

export type ScorePart = { key: string; label: string; points: number; max: number; detail: string };

/** Each part is capped, so no single behaviour can dominate. Maximum 100. */
export function behaviourScore(input: ScoreInputs, now = new Date()) {
  const b = input.behaviour;
  const seconds = Math.max(input.active_seconds, b.page_seconds);
  const minutes = Math.floor(seconds / 60);
  const visits = b.logins + b.return_visits;
  const ageDays = (now.getTime() - Date.parse(input.last_activity)) / 86_400_000;
  const parts: ScorePart[] = [
    {
      key: "time",
      label: "Time exploring",
      max: 20,
      points: Math.min(20, minutes),
      detail: `${minutes} active minute${minutes === 1 ? "" : "s"}`,
    },
    {
      key: "returns",
      label: "Came back",
      max: 15,
      points: Math.min(15, visits * 3),
      detail: `${b.logins} login${b.logins === 1 ? "" : "s"} · ${b.return_visits} return visit${b.return_visits === 1 ? "" : "s"}`,
    },
    {
      key: "breadth",
      label: "Pages explored",
      max: 10,
      points: Math.min(10, b.pages_explored * 2),
      detail: `${b.pages_explored} different pages · ${b.page_views} views`,
    },
    {
      key: "project",
      label: "Project & demo",
      max: 15,
      points: (input.has_project ? 9 : 0) + (input.used_demo ? 6 : 0),
      detail: [
        input.has_project ? "AI project" : "no project yet",
        input.used_demo ? "tried demo" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      key: "family",
      label: "Family involved",
      max: 20,
      points: Math.min(
        20,
        (input.brief_generated ? 5 : 0) +
          (input.brief_shared ? 4 : 0) +
          (b.parent_invites > 0 ? 3 : 0) +
          (b.parent_visits > 0 ? 5 : 0) +
          (input.parent_question ? 3 : 0),
      ),
      detail: `${b.parent_visits} parent visit${b.parent_visits === 1 ? "" : "s"} via invite${input.brief_generated ? " · Parent Brief" : ""}${input.parent_question ? " · parent question" : ""}`,
    },
    {
      key: "friends",
      label: "Invited friends",
      max: 8,
      points: Math.min(
        8,
        (b.friend_invites > 0 ? 2 : 0) + b.friend_visits * 2 + b.invite_signups * 3,
      ),
      detail: `${b.friend_visits} friend visit${b.friend_visits === 1 ? "" : "s"} · ${b.invite_signups} sign-up${b.invite_signups === 1 ? "" : "s"}`,
    },
    {
      key: "intent",
      label: "Application intent",
      max: 7,
      points: input.application_clicked ? 7 : 0,
      detail: input.application_clicked ? "opened the NIAT application" : "not yet",
    },
    {
      key: "recency",
      label: "Recent activity",
      max: 5,
      points: ageDays <= 2 ? 5 : ageDays <= 7 ? 2 : 0,
      detail:
        ageDays <= 2
          ? "active in the last 2 days"
          : ageDays <= 7
            ? "active this week"
            : "quiet for over a week",
    },
  ];
  const score = Math.min(
    100,
    parts.reduce((sum, part) => sum + part.points, 0),
  );
  return { score, band: scoreBand(score), parts };
}

export type ScoreBand = "very_active" | "active" | "getting_started";
export const BAND_LABELS: Record<ScoreBand, string> = {
  very_active: "Very active",
  active: "Active",
  getting_started: "Getting started",
};
export function scoreBand(score: number): ScoreBand {
  return score >= 70 ? "very_active" : score >= 40 ? "active" : "getting_started";
}
