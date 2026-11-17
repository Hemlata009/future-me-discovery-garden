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
import {
  deriveMetrics,
  familyFunnel,
  referralJourneySteps,
  formatRate,
  isEmptyReport,
  presetRange,
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
  const m = t ? deriveMetrics(t) : null;

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
                note={`${t.completions} completed`}
              />
              <Metric Icon={Sparkles} label="Successful generations" value={t.gen_ok} />
              <Metric
                Icon={Activity}
                label="Generation success rate"
                text={formatRate(m.generationSuccessRate)}
                note={`${t.gen_fail} failed after reaching the AI · ${t.gen_rejected} turned away before it`}
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
                value={t.shared_projects}
                note={`${formatRate(m.shareRate)} of successful generations`}
              />
              <Metric
                Icon={Users}
                label="Referral visits"
                value={t.ref_visits}
                note={`${t.ref_visitors} unique referral visitors`}
              />
              <Metric Icon={MousePointer2} label="NIAT pop-up opens" value={t.niat_modal_opens} />
              <Metric
                Icon={MousePointer2}
                label="NIAT outbound clicks"
                value={t.niat_outbound}
                note={`${t.niat_outbound_visitors} unique visitors · ${t.ref_niat_outbound} from referrals`}
              />
              <Metric Icon={Inbox} label="Inquiry submissions" text="Not collected yet" />
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
              <p>
                {t.segmented
                  ? "Cohort funnel · share of visitors in this cohort"
                  : "Overall funnel · share of unique visitors"}
              </p>
              {[
                { name: "Visitors", value: t.visitors },
                ...(t.starts === null ? [] : [{ name: "Discoveries started", value: t.starts }]),
                { name: "Discoveries completed", value: t.completions },
                { name: "Projects generated", value: t.gen_ok },
                { name: "Projects with a share action", value: t.shared_projects },
                { name: "Visitors who clicked out to NIAT", value: t.niat_outbound_visitors },
              ].map((item) => {
                const percent = Math.min(
                  100,
                  Math.round((rate(item.value, t.visitors) ?? 0) * 100),
                );
                return (
                  <div className="funnel-row" key={item.name}>
                    <span>{item.name}</span>
                    <div className="funnel-bar">
                      {Array.from({ length: 100 }, (_, i) => (
                        <span key={i} className={i < percent ? "funnel-segment" : ""} />
                      ))}
                    </div>
                    <strong>{item.value.toLocaleString("en-US")}</strong>
                  </div>
                );
              })}
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
                Qualified referrals are distinct first-touch referred visitors who completed a
                discovery. Link clicks alone do not qualify.
              </p>
            </section>

            <section className="chart-panel funnel">
              <h2>Referred visitor journey.</h2>
              <p>
                Distinct visitors who opened someone else's referral link, then what they did
                afterwards. Rates are a share of referred visitors; campaign filters apply, answer
                filters do not.
              </p>
              {report.referral_journey ? (
                <Table
                  head={["Step", "Visitors", "Of referred visitors"]}
                  rows={referralJourneySteps(report.referral_journey).map((step, index) => [
                    step.label,
                    step.value,
                    index === 0 ? "—" : formatRate(step.rate),
                  ])}
                />
              ) : (
                <p className="mt-4">This view couldn't be loaded just now.</p>
              )}
            </section>

            <section className="chart-panel funnel">
              <h2>Family funnel.</h2>
              <p>
                Live brief, question, counsellor-request and application-click activity. Rates use
                the preceding step; a zero denominator shows “—”.
              </p>
              <Table
                head={["Step", "Count", "Previous-step conversion"]}
                rows={[
                  ...familyFunnel(t).map((step, index) => [
                    [
                      "Parent briefs generated",
                      "Briefs shared",
                      "Briefs opened",
                      "Parent questions asked",
                      "Counsellor requests",
                      "Start application clicks",
                    ][index]!,
                    step.value,
                    index === 0 ? "—" : formatRate(step.conversion),
                  ]),
                  ["Counsellor requests not delivered to webhook", t.counsellor_undelivered, "—"],
                ]}
              />
            </section>

            <section className="chart-panel">
              <h2>Conversion by acquisition source.</h2>
              <p>First touch: referral link, campaign tags, or direct</p>
              <Table
                head={[
                  "Source",
                  "Visitors",
                  "Generations",
                  "Visitors who clicked out to NIAT",
                  "Click-through",
                ]}
                rows={report.acquisition.map((a) => [
                  a.name,
                  a.visitors,
                  a.generations,
                  a.outbound_visitors,
                  formatRate(rate(a.outbound_visitors, a.visitors)),
                ])}
              />
            </section>

            <section className="chart-panel">
              <h2>Campaign performance.</h2>
              {report.campaigns.length === 0 ? (
                <p>No visits with campaign tags in this period.</p>
              ) : (
                <Table
                  head={[
                    "Source",
                    "Medium",
                    "Campaign",
                    "Visitors",
                    "Generations",
                    "Share actions",
                    "NIAT outbound clicks",
                  ]}
                  rows={report.campaigns.map((c) => [
                    c.source,
                    c.medium,
                    c.campaign,
                    c.visitors,
                    c.generations,
                    c.shares,
                    c.niat_outbound,
                  ])}
                />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function rate(n: number, d: number) {
  return d ? n / d : null;
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
