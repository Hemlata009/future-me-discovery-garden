import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChartNoAxesCombined,
  Eye,
  LogOut,
  MousePointer2,
  Share2,
  ShieldAlert,
  Sparkles,
  Users,
  Compass,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/projects";
import { getGrowthReport, type ReportFilters } from "@/lib/growth-report.functions";
import { describeRate, isTestTraffic, ratio } from "@/lib/growth-journey";
import {
  deriveMetrics,
  referralJourneySteps,
  formatRate,
  isEmptyReport,
  presetRange,
  type GrowthReport,
  type Named,
} from "@/lib/growth-metrics";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () =>
    pageHead(
      "Growth dashboard",
      "Live visitor, discovery, generation, sharing and referral analytics for FutureMe Family.",
    ),
  component: Admin,
});

const PIE_COLORS = ["var(--mint)", "var(--primary)", "var(--electric)", "var(--muted-foreground)"];
const ANSWER_OPTIONS = {
  interest: ["farming", "gaming", "robotics", "creativity", "science", "community"],
  technology: ["ai", "web", "iot"],
  language: ["english", "hindi", "telugu"],
  class_status: ["class12", "completed", "other"],
} as const;

function Admin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchReport = useServerFn(getGrowthReport);
  const [preset, setPreset] = useState<"7" | "30" | "custom">("7");
  const [custom, setCustom] = useState(presetRange(30));
  const [utm, setUtm] = useState({ utm_source: "", utm_medium: "", utm_campaign: "" });
  const [answers, setAnswers] = useState<Record<keyof typeof ANSWER_OPTIONS, string>>({
    interest: "",
    technology: "",
    language: "",
    class_status: "",
  });

  const filters = useMemo<ReportFilters>(() => {
    const range = preset === "custom" ? custom : presetRange(Number(preset));
    const f: Record<string, string> = { ...range };
    for (const [k, v] of Object.entries(utm)) if (v) f[k] = v;
    for (const [k, v] of Object.entries(answers)) if (v) f[k] = v;
    return f as ReportFilters;
  }, [preset, custom, utm, answers]);

  const query = useQuery({
    queryKey: ["growth-report", filters],
    queryFn: () => fetchReport({ data: filters }),
    retry: false,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <aside className="admin-sidebar">
      <Brand />
      <nav>
        <span className="admin-nav-item">
          <ChartNoAxesCombined size={17} />
          Growth overview
        </span>
      </nav>
      <Button variant="ghost" onClick={() => void signOut()}>
        <LogOut size={15} />
        Sign out
      </Button>
      <Link className="admin-back" to="/">
        <ArrowLeft size={15} />
        Back to discovery
      </Link>
    </aside>
  );

  if (query.data?.access === "denied") {
    return (
      <div className="admin-layout">
        {sidebar}
        <main className="admin-main">
          <div className="chart-panel">
            <ShieldAlert className="text-primary" />
            <h1 className="mt-3 text-2xl font-semibold">This account isn't an administrator.</h1>
            <p className="mt-2">
              You're signed in, but dashboard access has to be granted by an existing administrator.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const report = query.data?.access === "ok" ? query.data.report : null;
  const t = report?.totals;
  const m = t ? deriveMetrics(t, report?.start_cohort) : null;
  const d = report?.journey_detail;
  const realCampaigns = report?.campaigns.filter((c) => !isTestTraffic(c.source)) ?? [];
  const testCampaigns = report?.campaigns.filter((c) => isTestTraffic(c.source)) ?? [];
  const testSources = [...new Set(testCampaigns.map((c) => c.source))].join(", ");

  return (
    <div className="admin-layout">
      {sidebar}
      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">FUTUREME FAMILY · GROWTH</p>
            <h1>A little spark. A growing impact.</h1>
            <p>
              Live data from {filters.from} to {filters.to} (UTC).
            </p>
          </div>
          <div className="filter-bar mb-0">
            {(
              [
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "custom", label: "Custom" },
              ] as const
            ).map((p) => (
              <Button
                variant="soft"
                key={p.value}
                className={preset === p.value ? "filter-active" : ""}
                aria-pressed={preset === p.value}
                onClick={() => setPreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="filter-bar flex-wrap gap-2">
          {preset === "custom" && (
            <>
              <label className="text-xs">
                From{" "}
                <input
                  type="date"
                  value={custom.from}
                  max={custom.to}
                  onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                />
              </label>
              <label className="text-xs">
                To{" "}
                <input
                  type="date"
                  value={custom.to}
                  min={custom.from}
                  onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                />
              </label>
            </>
          )}
          {(
            [
              { key: "utm_source", label: "Source", options: report?.source_options },
              { key: "utm_medium", label: "Medium", options: report?.medium_options },
              { key: "utm_campaign", label: "Campaign", options: report?.campaign_options },
            ] as const
          ).map(({ key, label, options }) => (
            <label className="text-xs" key={key}>
              {label}{" "}
              <select value={utm[key]} onChange={(e) => setUtm({ ...utm, [key]: e.target.value })}>
                <option value="">All</option>
                {(options ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {(Object.keys(ANSWER_OPTIONS) as (keyof typeof ANSWER_OPTIONS)[]).map((key) => (
            <label className="text-xs" key={key}>
              {key === "class_status" ? "Academic status" : key[0]!.toUpperCase() + key.slice(1)}{" "}
              <select
                value={answers[key]}
                onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })}
              >
                <option value="">All</option>
                {ANSWER_OPTIONS[key].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Source, medium and campaign filters use each visitor's first touch and apply to every
          number. Interest, technology, language and academic-status filters switch to one cohort:
          visitors who completed a matching discovery, counting only their matching generations and
          projects. Discovery starts carry no answers, so starts and completion rate aren't shown
          for a cohort.
        </p>

        {query.isLoading && <p role="status">Loading live data…</p>}
        {query.isError && (
          <div className="chart-panel" role="alert">
            <h2>The report couldn't be loaded.</h2>
            <p>{query.error instanceof Error ? query.error.message : "Please try again."}</p>
            <Button variant="soft" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {t && m && report && isEmptyReport(t) && (
          <div className="chart-panel">
            <Inbox className="text-primary" />
            <h2 className="mt-3">No activity in this period yet.</h2>
            <p>
              Numbers will appear here as soon as students visit, start the discovery or share a
              project. Try a wider date range or clear the filters.
            </p>
          </div>
        )}

        {t && m && report && !isEmptyReport(t) && (
          <>
            {t.segmented && (
              <p className="notice text-sm mb-4" role="note">
                Showing one cohort: {t.visitors.toLocaleString("en-US")} visitors who completed a
                matching discovery. Overall funnel numbers appear when answer filters are cleared.
              </p>
            )}
            {d && d.test_traffic_visitors > 0 && (
              <p className="notice text-sm mb-4" role="note">
                Includes {d.test_traffic_visitors.toLocaleString("en-US")} unique test-traffic
                visitor{d.test_traffic_visitors === 1 ? "" : "s"} (source {testSources || "qa/test"}
                ). Test rows are listed separately and kept out of campaign performance; pick a real
                Source in the filter to exclude them from every number.
              </p>
            )}
            <div className="metrics-grid">
              <Metric
                Icon={Eye}
                label={t.segmented ? "Visitors in this cohort" : "Unique visitors"}
                value={t.visitors}
              />
              <Metric
                Icon={Compass}
                label="Discovery starts"
                text={t.starts === null ? "—" : t.starts.toLocaleString("en-US")}
                {...(t.starts === null ? { note: "Not attributable to answers" } : {})}
              />
              <Metric
                Icon={CheckCircle2}
                label="Discovery completion rate"
                text={formatRate(m.completionRate)}
                note={completionNote(t.segmented, report.start_cohort, t.completions)}
              />
              <Metric
                Icon={Sparkles}
                label="Successful generations"
                value={t.gen_ok}
                note={
                  d
                    ? `Events · ${d.funnel.generated_projects} unique projects`
                    : "Generation events"
                }
              />
              <Metric
                Icon={Activity}
                label="Generation success rate"
                text={formatRate(m.generationSuccessRate)}
                note={`${t.gen_ok} successes ÷ ${t.gen_ok + t.gen_fail} generation events that reached the AI · ${t.gen_rejected} turned away before it`}
              />
              <Metric
                Icon={Share2}
                label="Share actions"
                value={t.shares}
                note={`copy ${report.shares_by_channel["copy"] ?? 0} · WhatsApp ${report.shares_by_channel["whatsapp"] ?? 0}`}
              />
              <Metric
                Icon={Share2}
                label="Projects with at least one share action"
                value={d ? d.funnel.shared_projects : t.shared_projects}
                note={
                  d
                    ? describeRate(
                        ratio(d.funnel.shared_projects, d.funnel.generated_projects),
                        "unique projects generated in this period",
                      )
                    : "Unique shared projects (any generation date)"
                }
              />
              <Metric
                Icon={Users}
                label="Referral visits"
                value={t.ref_visits}
                note={`${t.ref_visitors} unique referral visitors`}
              />
              <Metric
                Icon={MousePointer2}
                label="Application-link clicks (start_application)"
                value={t.application_clicks}
                note={`Events${d ? ` · ${d.niat.application_visitors} unique visitors` : ""} · not submitted applications`}
              />
              <Metric
                Icon={MousePointer2}
                label="NIAT website clicks (visit_niat)"
                value={t.niat_outbound}
                note={`Events · ${t.niat_outbound_visitors} unique visitors · ${t.ref_niat_outbound} from referrals`}
              />
              <Metric
                Icon={MousePointer2}
                label="NIAT info pop-up opens (explore_niat)"
                value={t.niat_modal_opens}
                note="Events on this site; no outbound visit"
              />
              <Metric
                Icon={MousePointer2}
                label="Generated project views"
                value={t.views}
                note="Project view events, not unique visitors"
              />
            </div>

            <div className="chart-grid">
              <section className="chart-panel">
                <h2>Daily visitors.</h2>
                <p>Unique visitors and successful generations per day</p>
                <div className="chart-size">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={report.daily}
                      margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        vertical={false}
                        strokeDasharray="3 4"
                      />
                      <XAxis
                        dataKey="day"
                        stroke="var(--muted-foreground)"
                        fontSize={10}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        stroke="var(--muted-foreground)"
                        fontSize={10}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip />
                      <Area
                        dataKey="visitors"
                        stroke="var(--primary)"
                        fill="var(--primary)"
                        fillOpacity={0.2}
                      />
                      <Area
                        dataKey="generations"
                        stroke="var(--mint)"
                        fill="var(--mint)"
                        fillOpacity={0.15}
                      />
                      <Area
                        dataKey="referral_visits"
                        stroke="var(--electric)"
                        fill="var(--electric)"
                        fillOpacity={0.1}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <Distribution
                title="Interests."
                subtitle="Successful generations by interest"
                items={report.interests}
              />
            </div>
            <div className="chart-grid">
              <Distribution
                title="Technologies."
                subtitle="Successful generations by technology"
                items={report.technologies}
              />
              <Distribution
                title="Languages."
                subtitle="Successful generations by language"
                items={report.languages}
              />
            </div>

            <section className="chart-panel funnel">
              <h2>
                <Activity size={17} className="inline mr-2 text-primary" />
                From discovery to possibility.
              </h2>
              {d ? (
                <>
                  <p>
                    Each row states its unit. Rates name their numerator and denominator and are not
                    chained, because these groups don't all nest inside each other.
                  </p>
                  <Table
                    head={["Step", "Count", "Unit", "Rate (numerator ÷ denominator)"]}
                    rows={[
                      ["Visitors", t.visitors, "unique visitors", "—"],
                      [
                        "Started discovery",
                        d.funnel.starters,
                        "unique visitors",
                        describeRate(ratio(d.funnel.starters, t.visitors), "unique visitors"),
                      ],
                      [
                        "Completed discovery",
                        d.funnel.completers,
                        "unique visitors",
                        describeRate(ratio(d.funnel.completers, t.visitors), "unique visitors"),
                      ],
                      ["Projects generated", d.funnel.generated_projects, "unique projects", "—"],
                      ["Successful generation events", d.funnel.generation_events, "events", "—"],
                      [
                        "Projects with a share action",
                        d.funnel.shared_projects,
                        "unique projects",
                        describeRate(
                          ratio(d.funnel.shared_projects, d.funnel.generated_projects),
                          "unique projects generated",
                        ),
                      ],
                      [
                        "Clicked the application link",
                        d.niat.application_visitors,
                        "unique visitors",
                        describeRate(
                          ratio(d.niat.application_visitors, t.visitors),
                          "unique visitors",
                        ),
                      ],
                    ]}
                  />
                  <p className="mt-4">
                    Completion among people who started in this period:{" "}
                    {completionNote(t.segmented, report.start_cohort, t.completions)}. An
                    application-link click is not a submitted application.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {t.segmented
                      ? "Cohort view: unique-visitor steps aren't available with answer filters."
                      : "The unique-visitor breakdown couldn't be loaded."}{" "}
                    Units are shown for each row.
                  </p>
                  <Table
                    head={["Step", "Count", "Unit"]}
                    rows={[
                      ["Visitors", t.visitors, "unique visitors"],
                      ...(t.starts === null ? [] : [["Discoveries started", t.starts, "events"]]),
                      ["Discoveries completed", t.completions, "events"],
                      ["Successful generations", t.gen_ok, "events"],
                      ["Projects with a share action", t.shared_projects, "unique projects"],
                      ["Application-link clicks", t.application_clicks, "events"],
                    ]}
                  />
                </>
              )}
            </section>

            <section className="chart-panel">
              <h2>Referral performance.</h2>
              <Table
                head={[
                  "Referral visits",
                  "Unique referral visitors",
                  "Referral discovery starts",
                  "Referral generations",
                  "Referral NIAT outbound clicks",
                  "Qualified referrals",
                  "Qualification rate",
                ]}
                rows={[
                  [
                    t.ref_visits,
                    t.ref_visitors,
                    t.starts === null ? "—" : t.ref_starts,
                    t.ref_gens,
                    t.ref_niat_outbound,
                    t.qualified_referrals,
                    formatRate(m.qualifiedReferralRate),
                  ],
                ]}
              />
              <p className="mt-4">
                Visits are referral_visit events; visitors are unique. Qualification rate ={" "}
                {describeRate(
                  ratio(t.qualified_referrals, t.ref_visitors),
                  "unique referral visitors",
                )}
                . Qualified referrals are first-touch referred visitors who completed a discovery;
                link clicks alone do not qualify.
              </p>
            </section>

            <section className="chart-panel funnel">
              <h2>Referred visitor journey.</h2>
              <p>
                Unique visitors who opened someone else's referral link, then what they did
                afterwards. Their earlier first touch, if any, stays their attribution. Each rate =
                visitors at that step ÷ referred visitors. Campaign filters apply; answer filters do
                not.
              </p>
              {report.referral_journey ? (
                <Table
                  head={["Step", "Unique visitors", "Rate (÷ referred visitors)"]}
                  rows={referralJourneySteps(report.referral_journey).map((step, index) => [
                    step.label,
                    step.value,
                    index === 0
                      ? "—"
                      : describeRate(
                          ratio(step.value, report.referral_journey!.referred_visitors),
                          "referred visitors",
                        ),
                  ])}
                />
              ) : (
                <p className="mt-4">This view couldn't be loaded just now.</p>
              )}
              {d && d.referral.matched_by_project > 0 && (
                <p className="mt-4 text-xs text-muted-foreground">
                  {d.referral.matched_by_project} referred visitor
                  {d.referral.matched_by_project === 1 ? " was" : "s were"} matched through the
                  linked project, because the visit was stored without its link code (the visitor
                  had an earlier first touch). See docs/growth-reporting.md.
                </p>
              )}
            </section>

            <section className="chart-panel funnel">
              <h2>Family engagement.</h2>
              {d ? (
                <>
                  <p>
                    Brief cohort: Parent Briefs generated in this period and what has happened to
                    those same briefs. Each rate = briefs with that signal ÷ briefs generated.
                  </p>
                  <Table
                    head={["Signal", "Unique briefs", "Rate (÷ briefs generated in period)"]}
                    rows={[
                      ["Generated in this period", d.family.cohort_briefs, "—"],
                      [
                        "Shared at least once",
                        d.family.cohort_shared,
                        describeRate(
                          ratio(d.family.cohort_shared, d.family.cohort_briefs),
                          "briefs generated",
                        ),
                      ],
                      [
                        "Opened at least once (opener not verified as a parent)",
                        d.family.cohort_opened,
                        describeRate(
                          ratio(d.family.cohort_opened, d.family.cohort_briefs),
                          "briefs generated",
                        ),
                      ],
                      [
                        "At least one parent question",
                        d.family.cohort_questioned,
                        describeRate(
                          ratio(d.family.cohort_questioned, d.family.cohort_briefs),
                          "briefs generated",
                        ),
                      ],
                    ]}
                  />
                </>
              ) : (
                <p>The brief cohort can't be calculated for this view.</p>
              )}
              <h3 className="mt-6 font-medium">All engagement in this period</h3>
              <p>
                Separate counts, not steps of one funnel: a brief can be opened without a recorded
                share, and activity can relate to briefs generated earlier.
              </p>
              <Table
                head={["Activity", "Count", "Unit"]}
                rows={[
                  [
                    "Parent Brief share actions",
                    d ? d.family.share_events : t.briefs_shared,
                    d ? "events (delivery not proven)" : "unique briefs",
                  ],
                  [
                    "Parent Briefs opened",
                    d ? d.family.briefs_opened_any : t.briefs_opened,
                    "unique briefs (any generation date)",
                  ],
                  ["Parent questions asked", t.parent_questions, "events"],
                  ["Counsellor requests", t.counsellor_requests, "consented requests"],
                  [
                    "Counsellor requests not delivered to webhook",
                    t.counsellor_undelivered,
                    "requests",
                  ],
                  ["Application-link clicks", t.application_clicks, "events (not applications)"],
                ]}
              />
            </section>

            <section className="chart-panel">
              <h2>NIAT links.</h2>
              <p>Three different actions. None of them is a submitted or completed application.</p>
              <Table
                head={["Action", "What it means", "Events", "Unique visitors"]}
                rows={[
                  [
                    "start_application",
                    "Clicked through to the official NIAT application page",
                    t.application_clicks,
                    d ? d.niat.application_visitors : "—",
                  ],
                  [
                    "visit_niat",
                    "Clicked through to the official NIAT website",
                    t.niat_outbound,
                    t.niat_outbound_visitors,
                  ],
                  [
                    "explore_niat",
                    "Opened the NIAT information pop-up on this site",
                    t.niat_modal_opens,
                    d ? d.niat.info_visitors : "—",
                  ],
                ]}
              />
            </section>

            <section className="chart-panel">
              <h2>Conversion by acquisition source.</h2>
              <p>
                First touch: referral link, campaign tags, or direct. Visitors are unique visitors;
                generations are events.
              </p>
              <Table
                head={[
                  "Source",
                  "Visitors",
                  "Generations",
                  "Unique visitors who clicked to the NIAT website",
                  "NIAT website click-through",
                ]}
                rows={report.acquisition.map((a) => [
                  a.name,
                  a.visitors,
                  a.generations,
                  a.outbound_visitors,
                  describeRate(ratio(a.outbound_visitors, a.visitors), "unique visitors"),
                ])}
              />
            </section>

            <section className="chart-panel">
              <h2>Campaign performance.</h2>
              <p>
                Real campaign traffic only. Visitors are unique; generations, shares and NIAT
                website clicks are events.
              </p>
              {realCampaigns.length === 0 ? (
                <p className="mt-4">No real campaign-tagged visits in this period.</p>
              ) : (
                <CampaignTable rows={realCampaigns} />
              )}
            </section>
            {testCampaigns.length > 0 && (
              <section className="chart-panel">
                <h2>Test / QA traffic.</h2>
                <p>
                  Visits tagged with a test source (qa, test, testing, internal). Kept for the
                  record and excluded from campaign performance above; attribution is unchanged.
                </p>
                <CampaignTable rows={testCampaigns} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function rate(n: number, d: number) {
  return d ? n / d : null;
}

/** Explains the start-cohort rate and why it is unavailable when it is. */
function completionNote(
  segmented: boolean,
  cohort: { started: number; completed: number } | undefined,
  completions: number,
): string {
  if (segmented) return `${completions} completed · rate not shown for a cohort`;
  if (!cohort) return `${completions} completed · rate unavailable right now`;
  if (cohort.started === 0) return `${completions} completed · no recorded starts in this period`;
  return `${cohort.completed} of ${cohort.started} visitors who started in this period completed by its end · completions without a recorded start aren't counted`;
}

function Metric({
  Icon,
  label,
  value,
  text,
  note,
}: {
  Icon: typeof Eye;
  label: string;
  value?: number;
  text?: string;
  note?: string;
}) {
  return (
    <div className="metric">
      <Icon />
      <p>{label}</p>
      <strong>{text ?? (value ?? 0).toLocaleString("en-US")}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function Distribution({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: Named[];
}) {
  return (
    <section className="chart-panel">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {items.length === 0 ? (
        <p className="mt-6">No generations in this period.</p>
      ) : (
        <>
          <div className="chart-size">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  innerRadius={65}
                  outerRadius={88}
                  paddingAngle={6}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {items.map((item, i) => (
                    <Cell key={item.name ?? i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            {items.map((item) => (
              <span key={item.name ?? "unknown"}>
                {item.name ?? "unknown"} · {item.value}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CampaignTable({ rows }: { rows: GrowthReport["campaigns"] }) {
  return (
    <Table
      head={[
        "Source",
        "Medium",
        "Campaign",
        "Unique visitors",
        "Generations (events)",
        "Share actions (events)",
        "NIAT website clicks (events)",
      ]}
      rows={rows.map((c) => [
        c.source,
        c.medium,
        c.campaign,
        c.visitors,
        c.generations,
        c.shares,
        c.niat_outbound,
      ])}
    />
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto mt-4">
      <table className="admin-table w-full text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="text-left font-medium text-muted-foreground pb-2 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4" data-label={head[j]}>
                  {typeof c === "number" ? c.toLocaleString("en-US") : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
