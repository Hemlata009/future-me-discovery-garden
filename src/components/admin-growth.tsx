import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Eye,
  FlaskConical,
  Inbox,
  Info,
  MessageCircleQuestion,
  PhoneCall,
  RefreshCw,
  Share2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { buildDemoReport, DEMO_LABEL } from "@/lib/admin-demo-data";
import { isTestTraffic, ratio, type RateValue } from "@/lib/growth-journey";
import { deriveMetrics, presetRange, type GrowthReport, type Named } from "@/lib/growth-metrics";
import type { ReportFilters, ReportResult } from "@/lib/growth-report.functions";

export const WARM_LEAD_CAMPAIGN = "futureme_family_warmlead_test";
const ANSWER_OPTIONS = {
  interest: ["farming", "gaming", "robotics", "creativity", "science", "community"],
  technology: ["ai", "web", "iot"],
  language: ["english", "hindi", "telugu"],
  class_status: ["class12", "completed", "other"],
} as const;
type AnswerKey = keyof typeof ANSWER_OPTIONS;
type Mode = "live" | "demo";
type Preset = "7" | "30" | "90" | "custom";

const n = (value: number) => value.toLocaleString("en-US");
const pct = (r: RateValue) => (r.value === null ? "—" : `${(r.value * 100).toFixed(1)}%`);
const title = (value: string | null) =>
  !value
    ? "Unknown"
    : value.length <= 3
      ? value.toUpperCase()
      : value[0]!.toUpperCase() + value.slice(1);

/* ------------------------------------------------------------------ */
/* Shell: toolbar, filters, Live/Demo switch, data loading             */
/* ------------------------------------------------------------------ */

export function GrowthAdminShell({
  fetchReport,
}: {
  fetchReport: (args: { data: ReportFilters }) => Promise<ReportResult>;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("live");
  const [preset, setPreset] = useState<Preset>("7");
  const [custom, setCustom] = useState(presetRange(30));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [utm, setUtm] = useState({ utm_source: "", utm_medium: "", utm_campaign: "" });
  const [answers, setAnswers] = useState<Record<AnswerKey, string>>({
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
  const validRange = filters.from <= filters.to;

  const query = useQuery({
    queryKey: ["growth-report", filters],
    queryFn: () => fetchReport({ data: filters }),
    retry: false,
    enabled: mode === "live" && validRange,
  });
  const demoReport = useMemo(() => (mode === "demo" ? buildDemoReport() : null), [mode]);
  const liveReport = query.data?.access === "ok" ? query.data.report : null;
  const report = mode === "demo" ? demoReport : liveReport;
  const activeFilters =
    Object.values(utm).filter(Boolean).length + Object.values(answers).filter(Boolean).length;

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setFiltersOpen(false);
    // Returning to live always re-reads the database report.
    if (next === "live") void queryClient.invalidateQueries({ queryKey: ["growth-report"] });
  }
  function clearAll() {
    setUtm({ utm_source: "", utm_medium: "", utm_campaign: "" });
    setAnswers({ interest: "", technology: "", language: "", class_status: "" });
  }

  if (mode === "live" && query.data?.access === "denied") {
    return (
      <div className="gd-empty">
        <ShieldAlert />
        <h1>This account isn't an administrator</h1>
        <p>Dashboard access is granted by an existing administrator.</p>
      </div>
    );
  }

  const refreshed =
    mode === "live" && query.dataUpdatedAt
      ? new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(query.dataUpdatedAt)
      : null;
  const period =
    mode === "demo" && report?.daily.length
      ? `${report.daily[0]!.day} – ${report.daily.at(-1)!.day}`
      : `${filters.from} – ${filters.to}`;

  return (
    <div className="gd">
      <header className="gd-header">
        <div>
          <h1>Growth Overview</h1>
          <p>Track acquisition, engagement and application intent.</p>
        </div>
        <div className="gd-mode" role="group" aria-label="Data source">
          {(["live", "demo"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className={mode === value ? "is-active" : ""}
              onClick={() => switchMode(value)}
            >
              {value === "live" ? "Live Data" : "Demo Preview"}
            </button>
          ))}
        </div>
      </header>

      {mode === "demo" && (
        <div className="gd-demo-banner" role="status">
          <FlaskConical size={16} /> <strong>{DEMO_LABEL}</strong>
        </div>
      )}

      <div className="gd-toolbar">
        <span className="gd-period">
          {period} <small>UTC</small>
        </span>
        {mode === "live" && (
          <>
            <div className="gd-seg" role="group" aria-label="Reporting range">
              {(["7", "30", "90", "custom"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preset === value}
                  className={preset === value ? "is-active" : ""}
                  onClick={() => setPreset(value)}
                >
                  {value === "custom" ? "Custom" : `${value}d`}
                </button>
              ))}
            </div>
            <Button
              variant="soft"
              size="sm"
              aria-expanded={filtersOpen}
              aria-controls="gd-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={15} /> Filters
              {activeFilters > 0 && <span className="gd-count">{activeFilters}</span>}
            </Button>
          </>
        )}
        <span className="gd-toolbar-end">
          {refreshed && <small>Updated {refreshed}</small>}
          {mode === "live" && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Refresh live data"
              disabled={query.isFetching || !validRange}
              onClick={() => void query.refetch()}
            >
              <RefreshCw size={15} className={query.isFetching ? "spin" : ""} />
            </Button>
          )}
        </span>
      </div>

      {mode === "live" && preset === "custom" && (
        <div className="gd-custom-range">
          <label>
            From
            <input
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </label>
        </div>
      )}

      {mode === "live" && filtersOpen && (
        <section id="gd-filters" className="gd-filters" aria-label="Report filters">
          <div className="gd-filters-head">
            <strong>Filters</strong>
            <InfoTip text="Source, medium and campaign use each visitor's first touch and apply to every number. Interest, technology, language and academic status switch to a cohort: visitors who completed a matching discovery, counting only their matching generations and projects. Discovery starts carry no answers, so they aren't shown for a cohort." />
            <span className="gd-filters-actions">
              <Button variant="ghost" size="sm" onClick={clearAll} disabled={!activeFilters}>
                Clear all
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close filters"
                onClick={() => setFiltersOpen(false)}
              >
                <X size={16} />
              </Button>
            </span>
          </div>
          <div className="gd-filters-grid">
            {(
              [
                { key: "utm_source", label: "Source", options: liveReport?.source_options },
                { key: "utm_medium", label: "Medium", options: liveReport?.medium_options },
                { key: "utm_campaign", label: "Campaign", options: liveReport?.campaign_options },
              ] as const
            ).map(({ key, label, options }) => (
              <label key={key}>
                {label}
                <select
                  value={utm[key]}
                  onChange={(e) => setUtm({ ...utm, [key]: e.target.value })}
                >
                  <option value="">All</option>
                  {(options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {(Object.keys(ANSWER_OPTIONS) as AnswerKey[]).map((key) => (
              <label key={key}>
                {key === "class_status" ? "Academic status" : title(key)}
                <select
                  value={answers[key]}
                  onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })}
                >
                  <option value="">All</option>
                  {ANSWER_OPTIONS[key].map((option) => (
                    <option key={option} value={option}>
                      {title(option)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {mode === "live" && !validRange && (
        <p className="gd-alert" role="alert">
          The start date must be on or before the end date.
        </p>
      )}
      {mode === "live" && query.isLoading && <DashboardSkeleton />}
      {mode === "live" && query.isError && (
        <div className="gd-empty" role="alert">
          <ShieldAlert />
          <h2>The report couldn't be loaded</h2>
          <p>{query.error instanceof Error ? query.error.message : "Please try again."}</p>
          <Button variant="soft" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {report && report.totals.visitors === 0 && (
        <div className="gd-empty">
          <Inbox />
          <h2>No activity in this period</h2>
          <p>Try a wider date range or clear the filters.</p>
        </div>
      )}
      {report && report.totals.visitors > 0 && <GrowthDashboard report={report} mode={mode} />}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="gd-skeleton" role="status" aria-label="Loading live data">
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} />
      ))}
      <span className="wide" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational dashboard                                            */
/* ------------------------------------------------------------------ */

export function GrowthDashboard({ report, mode }: { report: GrowthReport; mode: Mode }) {
  const t = report.totals;
  const d = report.journey_detail;
  const m = deriveMetrics(t, report.start_cohort);
  const completion = report.start_cohort
    ? ratio(report.start_cohort.completed, report.start_cohort.started)
    : null;

  return (
    <div className="gd-body">
      {t.segmented && (
        <p className="gd-note" role="note">
          Cohort view: {n(t.visitors)} visitors who completed a matching discovery.
        </p>
      )}
      {mode === "live" && d && d.test_traffic_visitors > 0 && (
        <p className="gd-note" role="note">
          Includes {n(d.test_traffic_visitors)} test-traffic visitor
          {d.test_traffic_visitors === 1 ? "" : "s"} (qa/test sources), listed apart from campaigns.
        </p>
      )}

      <section className="gd-kpis" aria-label="Headline metrics">
        <Kpi
          icon={Eye}
          label="Unique visitors"
          value={n(t.visitors)}
          sub={`${n(t.views)} project views`}
          info="Distinct anonymous visitors with any recorded event in the period."
        />
        <Kpi
          icon={CheckCircle2}
          label="Discovery completion"
          value={completion && !t.segmented ? pct(completion) : "—"}
          sub={
            completion && !t.segmented
              ? `${n(completion.numerator)} of ${n(completion.denominator)} starters`
              : "Not shown for a cohort"
          }
          info="Visitors who started discovery in the period and completed it by the end ÷ visitors who started."
        />
        <Kpi
          icon={Sparkles}
          label="Projects generated"
          value={n(d ? d.funnel.generated_projects : t.gen_ok)}
          sub={`${pct(ratio(t.gen_ok, t.gen_ok + t.gen_fail))} AI success`}
          info="Unique projects with a successful AI generation. Success = successes ÷ generations that reached the AI."
        />
        <Kpi
          icon={PhoneCall}
          label="Counsellor requests"
          value={n(t.counsellor_requests)}
          sub={
            t.counsellor_undelivered
              ? `${n(t.counsellor_undelivered)} awaiting manual follow-up`
              : "All delivered"
          }
          info="Consented callback requests. Each becomes an identified lead in the counsellor CRM."
        />
      </section>

      <section className="gd-strip" aria-label="Secondary metrics">
        <Mini
          label="Discovery starters"
          value={d ? n(d.funnel.starters) : t.starts === null ? "—" : n(t.starts)}
          info={d ? "Unique visitors who started discovery." : "Discovery start events."}
        />
        <Mini
          label="Project share rate"
          value={d ? pct(ratio(d.funnel.shared_projects, d.funnel.generated_projects)) : "—"}
          info="Projects generated in the period with at least one share action ÷ projects generated. A share isn't proof of delivery."
        />
        <Mini
          label="Referral visitors"
          value={n(t.ref_visitors)}
          info="Unique visitors who opened someone else's referral link."
        />
        <Mini label="Parent Briefs" value={n(t.briefs_generated)} info="Unique briefs generated." />
        <Mini
          label="Parent questions"
          value={n(t.parent_questions)}
          info="Grounded questions asked (events)."
        />
        <Mini
          label="Application-link clicks"
          value={n(t.application_clicks)}
          info="Clicks to the official NIAT application page. Not submitted applications."
        />
        <Mini
          label="Generation success"
          value={
            m.generationSuccessRate === null
              ? "—"
              : `${(m.generationSuccessRate * 100).toFixed(1)}%`
          }
          info={`${n(t.gen_ok)} successes ÷ ${n(t.gen_ok + t.gen_fail)} generations that reached the AI; ${n(t.gen_rejected)} turned away before it.`}
        />
      </section>

      <ActivityChart report={report} />

      <div className="gd-grid-2">
        <Funnel report={report} />
        <Acquisition report={report} />
      </div>

      <Campaigns report={report} mode={mode} />

      <section className="gd-grid-3" aria-label="Audience insights">
        <Audience title="Interests" items={report.interests} />
        <Audience title="Technology" items={report.technologies} />
        <Audience title="Language" items={report.languages} />
      </section>

      <div className="gd-grid-2">
        <Family report={report} />
        <Referrals report={report} />
      </div>

      <details className="gd-definitions">
        <summary>Metric definitions</summary>
        <ul>
          <li>
            Dates are UTC calendar days. Source, medium and campaign use first-touch attribution.
          </li>
          <li>
            Unique visitors are distinct anonymous visitors; events count every recorded action
            after server deduplication.
          </li>
          <li>
            Rates show only where numerator and denominator share a meaningful unit; a zero
            denominator shows —.
          </li>
          <li>
            Parent Brief signals are separate counts. A share isn't proof of delivery; an opening
            isn't proof a parent opened it.
          </li>
          <li>
            Application-link clicks are clicks to NIAT's application page, not submitted
            applications or admissions.
          </li>
          <li>
            Qualified referrals are first-touch referred visitors who completed a discovery; opening
            a link alone doesn't qualify.
          </li>
          <li>Test sources (qa, test, testing, internal) are kept out of campaign performance.</li>
        </ul>
      </details>
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="gd-info" tabIndex={0} role="img" aria-label={text}>
      <Info size={13} aria-hidden="true" />
      <span className="gd-info-pop" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  info,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  sub: string;
  info: string;
}) {
  return (
    <article className="gd-kpi">
      <div className="gd-kpi-top">
        <span className="gd-kpi-icon">
          <Icon size={16} />
        </span>
        <span>{label}</span>
        <InfoTip text={info} />
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function Mini({ label, value, info }: { label: string; value: string; info: string }) {
  return (
    <div className="gd-mini">
      <span>
        {label} <InfoTip text={info} />
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function Card({
  title: heading,
  info,
  action,
  children,
  className = "",
}: {
  title: string;
  info?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`gd-card ${className}`}>
      <div className="gd-card-head">
        <h2>
          {heading} {info && <InfoTip text={info} />}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const axis = { fontSize: 11, tickLine: false, axisLine: false, stroke: "var(--muted-foreground)" };
const tooltipStyle = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)",
    fontSize: 12,
  },
};

function ActivityChart({ report }: { report: GrowthReport }) {
  const [view, setView] = useState<"visitors" | "discovery" | "generations">("visitors");
  const discovery = new Map((report.journey_detail?.daily ?? []).map((row) => [row.day, row]));
  const data = report.daily.map((row) => ({
    day: row.day.slice(5),
    Visitors: row.visitors,
    Generations: row.generations,
    "Referral visits": row.referral_visits,
    Starters: discovery.get(row.day)?.starters ?? 0,
    Completers: discovery.get(row.day)?.completers ?? 0,
  }));
  const series =
    view === "visitors"
      ? [
          { key: "Visitors", color: "var(--gd-navy)" },
          { key: "Referral visits", color: "var(--gd-teal)" },
        ]
      : view === "discovery"
        ? [
            { key: "Starters", color: "var(--gd-indigo)" },
            { key: "Completers", color: "var(--gd-teal)" },
          ]
        : [{ key: "Generations", color: "var(--gd-mint)" }];
  const discoveryMissing = view === "discovery" && !report.journey_detail;

  return (
    <Card
      title="Daily activity"
      className="gd-activity"
      info="Visitors and starters/completers are unique per day; generations and referral visits are events."
      action={
        <div className="gd-seg small" role="group" aria-label="Chart view">
          {(["visitors", "discovery", "generations"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              className={view === value ? "is-active" : ""}
              onClick={() => setView(value)}
            >
              {title(value)}
            </button>
          ))}
        </div>
      }
    >
      {discoveryMissing ? (
        <p className="gd-muted">Daily discovery isn't available for a cohort view.</p>
      ) : (
        <div className="gd-chart" role="img" aria-label={`Daily ${view} chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`gd-fill-${s.key.replace(/\s/g, "")}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" {...axis} minTickGap={18} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip {...tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2.2}
                  fill={`url(#gd-fill-${s.key.replace(/\s/g, "")})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function Funnel({ report }: { report: GrowthReport }) {
  const t = report.totals;
  const d = report.journey_detail;
  const visitors = t.visitors;
  const stages: { label: string; value: number; unit: string; rate: string | null }[] = d
    ? [
        { label: "Visitors", value: visitors, unit: "visitors", rate: null },
        {
          label: "Started discovery",
          value: d.funnel.starters,
          unit: "visitors",
          rate: `${pct(ratio(d.funnel.starters, visitors))} of visitors`,
        },
        {
          label: "Completed discovery",
          value: d.funnel.completers,
          unit: "visitors",
          rate: `${pct(ratio(d.funnel.completers, visitors))} of visitors`,
        },
        {
          label: "Projects generated",
          value: d.funnel.generated_projects,
          unit: "projects",
          rate: null,
        },
        {
          label: "Projects shared",
          value: d.funnel.shared_projects,
          unit: "projects",
          rate: `${pct(ratio(d.funnel.shared_projects, d.funnel.generated_projects))} of projects`,
        },
        {
          label: "Clicked application link",
          value: d.niat.application_visitors,
          unit: "visitors",
          rate: `${pct(ratio(d.niat.application_visitors, visitors))} of visitors`,
        },
        {
          label: "Counsellor requests",
          value: t.counsellor_requests,
          unit: "requests",
          rate: null,
        },
      ]
    : [
        { label: "Visitors", value: visitors, unit: "visitors", rate: null },
        { label: "Discovery completions", value: t.completions, unit: "events", rate: null },
        { label: "Generations", value: t.gen_ok, unit: "events", rate: null },
        { label: "Projects shared", value: t.shared_projects, unit: "projects", rate: null },
        {
          label: "Application-link clicks",
          value: t.application_clicks,
          unit: "events",
          rate: null,
        },
        {
          label: "Counsellor requests",
          value: t.counsellor_requests,
          unit: "requests",
          rate: null,
        },
      ];
  return (
    <Card
      title="Conversion funnel"
      info="Bars are scaled to unique visitors for comparison. Rates are shown only where the units match; stages in different units (projects, requests) are not chained."
    >
      <ol className="gd-funnel">
        {stages.map((stage) => {
          const width = visitors ? Math.max(2, Math.min(100, (stage.value / visitors) * 100)) : 0;
          return (
            <li key={stage.label}>
              <div className="gd-funnel-label">
                <span>{stage.label}</span>
                <em>{stage.unit}</em>
              </div>
              <div className="gd-funnel-bar" aria-hidden="true">
                <i style={{ width: `${width}%` }} />
              </div>
              <div className="gd-funnel-value">
                <strong>{n(stage.value)}</strong>
                {stage.rate && <small>{stage.rate}</small>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="gd-foot">An application-link click is not a submitted application.</p>
    </Card>
  );
}

function Acquisition({ report }: { report: GrowthReport }) {
  const total = report.acquisition.reduce((sum, row) => sum + row.visitors, 0);
  const apps = new Map<string, number>(
    (report.journey_detail?.application_visitors_by_source ?? []).map((row) => [
      row.name,
      row.visitors,
    ]),
  );
  const order = ["direct", "campaign", "referral"];
  const rows = [...report.acquisition].sort(
    (a, b) => order.indexOf(a.name) - order.indexOf(b.name),
  );
  return (
    <Card
      title="Acquisition sources"
      info="First touch: referral link, campaign tags or direct. Visitors are unique; generations are events, shown per 100 visitors."
    >
      <div className="gd-chart small" role="img" aria-label="Visitors and generations by source">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows.map((row) => ({
              name: title(row.name),
              Visitors: row.visitors,
              Generations: row.generations,
            }))}
            layout="vertical"
            margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
            barGap={3}
          >
            <CartesianGrid stroke="var(--border)" horizontal={false} />
            <XAxis type="number" {...axis} allowDecimals={false} />
            <YAxis type="category" dataKey="name" {...axis} width={72} />
            <Tooltip {...tooltipStyle} cursor={{ fill: "var(--secondary)" }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Visitors" fill="var(--gd-navy)" radius={[0, 6, 6, 0]} barSize={12} />
            <Bar dataKey="Generations" fill="var(--gd-mint)" radius={[0, 6, 6, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="gd-table-wrap">
        <table className="gd-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Visitors</th>
              <th>Share</th>
              <th>Gen. / 100 visitors</th>
              <th>App-link visitors</th>
              <th>NIAT site CTR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>{title(row.name)}</td>
                <td>{n(row.visitors)}</td>
                <td>{pct(ratio(row.visitors, total))}</td>
                <td>{row.visitors ? ((row.generations / row.visitors) * 100).toFixed(1) : "—"}</td>
                <td>{apps.has(row.name) ? n(apps.get(row.name)!) : "—"}</td>
                <td title={`${row.outbound_visitors} ÷ ${row.visitors} visitors`}>
                  {pct(ratio(row.outbound_visitors, row.visitors))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Campaigns({ report, mode }: { report: GrowthReport; mode: Mode }) {
  const engagement = new Map(
    (report.journey_detail?.campaigns ?? []).map((row) => [
      `${row.source}|${row.medium}|${row.campaign}`,
      row,
    ]),
  );
  const rows = report.campaigns
    .map((row) => ({
      ...row,
      extra: engagement.get(`${row.source}|${row.medium}|${row.campaign}`),
    }))
    .sort(
      (a, b) =>
        Number(b.campaign === WARM_LEAD_CAMPAIGN && !isTestTraffic(b.source)) -
          Number(a.campaign === WARM_LEAD_CAMPAIGN && !isTestTraffic(a.source)) ||
        b.visitors - a.visitors,
    );
  const real = rows.filter((row) => !isTestTraffic(row.source));
  const test = rows.filter((row) => isTestTraffic(row.source));
  const max = Math.max(1, ...real.map((row) => row.visitors));

  const table = (list: typeof rows, highlight: boolean) => (
    <div className="gd-table-wrap">
      <table className="gd-table gd-leaderboard">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Visitors</th>
            <th>Generations</th>
            <th>Shares</th>
            <th>Parent Briefs</th>
            <th>Counsellor req.</th>
            <th>App-link visitors</th>
            <th>App-click rate</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => {
            const warm = highlight && row.campaign === WARM_LEAD_CAMPAIGN;
            const appRate = row.extra ? ratio(row.extra.application_visitors, row.visitors) : null;
            return (
              <tr
                key={`${row.source}|${row.medium}|${row.campaign}`}
                className={warm ? "is-warm" : ""}
              >
                <td>
                  <span className="gd-camp">
                    {row.campaign}
                    {warm && <span className="gd-tag">Track B test</span>}
                  </span>
                  <small>
                    {row.source} · {row.medium}
                  </small>
                  {highlight && (
                    <span className="gd-camp-bar" aria-hidden="true">
                      <i style={{ width: `${(row.visitors / max) * 100}%` }} />
                    </span>
                  )}
                </td>
                <td>{n(row.visitors)}</td>
                <td>{n(row.generations)}</td>
                <td>{n(row.shares)}</td>
                <td>{row.extra ? n(row.extra.briefs) : "—"}</td>
                <td>{row.extra ? n(row.extra.counsellor_requests) : "—"}</td>
                <td>{row.extra ? n(row.extra.application_visitors) : "—"}</td>
                <td
                  title={
                    appRate ? `${appRate.numerator} ÷ ${appRate.denominator} visitors` : undefined
                  }
                >
                  {appRate ? pct(appRate) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <Card
      title="Campaign performance"
      info="First-touch UTM tags. Visitors are unique; generations, shares, briefs and requests are counts. App-click rate = unique application-link visitors ÷ campaign visitors. The Track B row is highlighted for reference, not as a verdict."
    >
      {real.length === 0 ? (
        <p className="gd-muted">No campaign-tagged visits in this period.</p>
      ) : (
        table(real, true)
      )}
      {mode === "live" && test.length > 0 && (
        <details className="gd-test">
          <summary>
            Test / QA traffic ({test.length} row{test.length === 1 ? "" : "s"}, excluded above)
          </summary>
          {table(test, false)}
        </details>
      )}
    </Card>
  );
}

function Audience({ title: heading, items }: { title: string; items: Named[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const colors = [
    "var(--gd-navy)",
    "var(--gd-teal)",
    "var(--gd-indigo)",
    "var(--gd-mint)",
    "var(--muted-foreground)",
  ];
  return (
    <Card title={heading} info="Share of successful generations in the period.">
      {items.length === 0 ? (
        <p className="gd-muted">No generations yet.</p>
      ) : (
        <ul className="gd-bars">
          {items.map((item, index) => (
            <li key={item.name ?? index}>
              <span>{title(item.name)}</span>
              <span className="gd-bar" aria-hidden="true">
                <i
                  style={{
                    width: `${total ? (item.value / total) * 100 : 0}%`,
                    background: colors[index % colors.length],
                  }}
                />
              </span>
              <strong>{n(item.value)}</strong>
              <small>{pct(ratio(item.value, total))}</small>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Family({ report }: { report: GrowthReport }) {
  const t = report.totals;
  const f = report.journey_detail?.family;
  const tiles = [
    { icon: BookOpen, label: "Briefs generated", value: t.briefs_generated },
    { icon: Share2, label: "Briefs shared", value: t.briefs_shared },
    { icon: Eye, label: "Briefs opened", value: t.briefs_opened },
    { icon: MessageCircleQuestion, label: "Parent questions", value: t.parent_questions },
    { icon: PhoneCall, label: "Counsellor requests", value: t.counsellor_requests },
  ];
  return (
    <Card
      title="Family Engagement"
      info="Separate counts, not a sequence: a brief can be opened without a recorded share. Briefs are unique briefs; questions and requests are events. Cohort rates use briefs generated in this period as the denominator."
    >
      <div className="gd-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="gd-tile">
            <tile.icon size={16} />
            <strong>{n(tile.value)}</strong>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
      {f && f.cohort_briefs > 0 && (
        <div className="gd-cohort">
          <p>Of {n(f.cohort_briefs)} briefs generated this period</p>
          <ul className="gd-bars">
            {[
              { label: "Shared", value: f.cohort_shared },
              { label: "Opened", value: f.cohort_opened },
              { label: "Got a parent question", value: f.cohort_questioned },
            ].map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <span className="gd-bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${(row.value / f.cohort_briefs) * 100}%`,
                      background: "var(--gd-teal)",
                    }}
                  />
                </span>
                <strong>{n(row.value)}</strong>
                <small>{pct(ratio(row.value, f.cohort_briefs))}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Referrals({ report }: { report: GrowthReport }) {
  const t = report.totals;
  const j = report.referral_journey;
  const mismatch = j && j.referred_visitors !== t.ref_visitors;
  const tiles = [
    { label: "Referral visits", value: n(t.ref_visits) },
    { label: "Referred visitors", value: n(t.ref_visitors) },
    { label: "Started discovery", value: j ? n(j.started_discovery) : "—" },
    { label: "Completed discovery", value: j ? n(j.completed_discovery) : "—" },
    { label: "Qualified referrals", value: n(t.qualified_referrals) },
    { label: "Application-link clicks", value: j ? n(j.application_clicks) : "—" },
  ];
  return (
    <Card
      title="Referral performance"
      info="Referral visits are events; the rest are unique visitors. Journey steps count referred visitors after their first referral visit. A qualified referral is a first-touch referred visitor who completed a discovery; opening a link alone doesn't qualify."
    >
      <div className="gd-tiles six">
        {tiles.map((tile) => (
          <div key={tile.label} className="gd-tile">
            <strong>{tile.value}</strong>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
      {j ? (
        <ol className="gd-steps" aria-label="Referred visitor journey">
          {[
            { label: "Referred", value: j.referred_visitors },
            { label: "Started", value: j.started_discovery },
            { label: "Completed", value: j.completed_discovery },
            { label: "App link", value: j.application_clicks },
          ].map((step) => (
            <li key={step.label}>
              <strong>{n(step.value)}</strong>
              <span>{step.label}</span>
              <small>
                {step.label === "Referred" ? "" : pct(ratio(step.value, j.referred_visitors))}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="gd-muted">Referred-visitor journey is unavailable right now.</p>
      )}
      {mismatch && (
        <p className="gd-warn" role="note">
          <Activity size={14} /> Journey shows {n(j.referred_visitors)} referred visitors vs{" "}
          {n(t.ref_visitors)} in referral visits. See docs/growth-reporting.md.
        </p>
      )}
    </Card>
  );
}
