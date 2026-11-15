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
  formatRate,
  isEmptyReport,
  presetRange,
  type Named,
} from "@/lib/growth-metrics";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () =>
    pageHead(
      "Growth dashboard",
      "Live visitor, discovery, generation, sharing and referral analytics for FutureMe AI.",
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
  const [campaign, setCampaign] = useState("");
  const [answers, setAnswers] = useState<Record<keyof typeof ANSWER_OPTIONS, string>>({
    interest: "",
    technology: "",
    language: "",
    class_status: "",
  });

  const filters = useMemo<ReportFilters>(() => {
    const range = preset === "custom" ? custom : presetRange(Number(preset));
    const f: Record<string, string> = { ...range };
    if (campaign) f["campaign"] = campaign;
    for (const [k, v] of Object.entries(answers)) if (v) f[k] = v;
    return f as ReportFilters;
  }, [preset, custom, campaign, answers]);

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
            <p className="eyebrow">FUTUREME AI · GROWTH</p>
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
          <label className="text-xs">
            Campaign{" "}
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value="">All</option>
              {(report?.campaign_options ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
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
          Interest, technology, language and academic-status filters narrow discovery completions
          and generations; the campaign filter applies to every metric.
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
            <div className="metrics-grid">
              <Metric Icon={Eye} label="Unique visitors" value={t.visitors} />
              <Metric Icon={Compass} label="Discovery starts" value={t.starts} />
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
                note={`${t.gen_fail} failed`}
              />
              <Metric
                Icon={Share2}
                label="Project share rate"
                text={formatRate(m.shareRate)}
                note={`${t.shares} shares · copy ${report.shares_by_channel["copy"] ?? 0} · WhatsApp ${report.shares_by_channel["whatsapp"] ?? 0}`}
              />
              <Metric
                Icon={Users}
                label="Referral visits"
                value={t.ref_visits}
                note={`${t.ref_visitors} unique visitors`}
              />
              <Metric Icon={MousePointer2} label="NIAT button clicks" value={t.cta} />
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
              <p>Conversion funnel · share of unique visitors</p>
              {[
                { name: "Visitors", value: t.visitors },
                { name: "Discoveries started", value: t.starts },
                { name: "Discoveries completed", value: t.completions },
                { name: "Projects generated", value: t.gen_ok },
                { name: "Projects shared", value: t.shared_projects },
                { name: "NIAT button clicks", value: t.cta },
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
                  "Unique referred visitors",
                  "Referred discovery starts",
                  "Referred generations",
                  "Referred NIAT clicks",
                ]}
                rows={[[t.ref_visits, t.ref_visitors, t.ref_starts, t.ref_gens, t.ref_cta]]}
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
                  "Visitors who clicked NIAT",
                  "Click-through",
                ]}
                rows={report.acquisition.map((a) => [
                  a.name,
                  a.visitors,
                  a.generations,
                  a.cta_visitors,
                  formatRate(rate(a.cta_visitors, a.visitors)),
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
                    "Shares",
                    "NIAT clicks",
                  ]}
                  rows={report.campaigns.map((c) => [
                    c.source,
                    c.medium,
                    c.campaign,
                    c.visitors,
                    c.generations,
                    c.shares,
                    c.cta,
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
      <table className="w-full text-sm">
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
                <td key={j} className="py-2 pr-4">
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
