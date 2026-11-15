import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  Eye,
  Info,
  MousePointer2,
  Share2,
  Sparkles,
  Users,
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
import { Brand } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/projects";

export const Route = createFileRoute("/admin")({
  head: () =>
    pageHead(
      "Demo growth dashboard",
      "Preview sample visitor, project, referral, and conversion analytics for FutureMe AI.",
    ),
  component: Admin,
});
const referralData = [
  { day: "Mon", visits: 72 },
  { day: "Tue", visits: 95 },
  { day: "Wed", visits: 83 },
  { day: "Thu", visits: 142 },
  { day: "Fri", visits: 128 },
  { day: "Sat", visits: 180 },
  { day: "Sun", visits: 216 },
];
const themes = [
  { name: "Nature", value: 38, color: "var(--mint)" },
  { name: "Gaming", value: 35, color: "var(--primary)" },
  { name: "Robotics", value: 27, color: "var(--electric)" },
];
const metrics = [
  { label: "Total visitors", value: 12840, Icon: Eye, growth: 18.6 },
  { label: "Project generations", value: 4328, Icon: Sparkles, growth: 24.2 },
  { label: "Project shares", value: 1567, Icon: Share2, growth: 12.8 },
  { label: "Referral visits", value: 916, Icon: Users, growth: 31.4 },
  { label: "NIAT interest submissions", value: 284, Icon: MousePointer2, growth: 16.3 },
];
function Admin() {
  const [period, setPeriod] = useState("7");
  const multiplier = period === "30" ? 3.6 : 1;
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Brand />
        <nav>
          <span className="admin-nav-item">
            <ChartNoAxesCombined size={17} />
            Growth overview
          </span>
        </nav>
        <Link className="admin-back" to="/">
          <ArrowLeft size={15} />
          Back to discovery
        </Link>
      </aside>
      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">FUTUREME AI · GROWTH</p>
            <h1>A little spark. A growing impact.</h1>
            <p>A snapshot of the discovery journey.</p>
          </div>
          <div className="filter-bar mb-0">
            {[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
            ].map((p) => (
              <Button
                variant="soft"
                key={p.value}
                className={period === p.value ? "filter-active" : ""}
                aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="demo-banner">
          <Info size={17} />
          <span>
            <strong>Demo dashboard.</strong> All metrics and charts are illustrative sample data. No
            real visitors, shares, or submissions are tracked.
          </span>
        </div>
        <div className="metrics-grid">
          {metrics.map(({ label, value, Icon, growth }) => (
            <div className="metric" key={label}>
              <Icon />
              <p>{label}</p>
              <strong>{Math.round(value * multiplier).toLocaleString("en-US")}</strong>
              <small>
                <ArrowUpRight size={11} className="inline" />
                {growth}% sample change
              </small>
            </div>
          ))}
        </div>
        <div className="chart-grid">
          <section className="chart-panel">
            <h2>Curiosity travels.</h2>
            <p>Referral visits · Sample {period}-day performance</p>
            <div className="chart-size">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={referralData.map((d, i) => ({
                    ...d,
                    day: period === "30" ? `Day ${Math.round((i * 29) / 6) + 1}` : d.day,
                    visits: Math.round(d.visits * multiplier),
                  }))}
                  margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
                >
                  <defs>
                    <linearGradient id="referral-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 4" />
                  <XAxis
                    dataKey="day"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<SampleTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="visits"
                    stroke="var(--primary)"
                    fill="url(#referral-fill)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="chart-panel">
            <h2>A world of interests.</h2>
            <p>Project theme distribution · Sample data</p>
            <div className="chart-size">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={themes}
                    innerRadius={65}
                    outerRadius={88}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                  >
                    {themes.map((theme) => (
                      <Cell key={theme.name} fill={theme.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<SampleTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-dot mint" />
                Nature 38%
              </span>
              <span>
                <i className="legend-dot" />
                Gaming 35%
              </span>
              <span>
                <i className="legend-dot blue" />
                Robotics 27%
              </span>
            </div>
          </section>
        </div>
        <section className="chart-panel funnel">
          <h2>
            <Activity size={17} className="inline mr-2 text-primary" />
            From discovery to possibility.
          </h2>
          <p>Conversion funnel · Illustrative sample counts</p>
          {[
            { name: "Visitors", value: 12840, percent: 100 },
            { name: "Discoveries started", value: 6850, percent: 53 },
            { name: "Projects generated", value: 4328, percent: 34 },
            { name: "Projects shared", value: 1567, percent: 12 },
            { name: "NIAT interest", value: 284, percent: 2 },
          ].map((item) => (
            <div className="funnel-row" key={item.name}>
              <span>{item.name}</span>
              <div className="funnel-bar">
                {Array.from({ length: 100 }, (_, i) => (
                  <span key={i} className={i < item.percent ? "funnel-segment" : ""} />
                ))}
              </div>
              <strong>{Math.round(item.value * multiplier).toLocaleString("en-US")}</strong>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
function SampleTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { name?: string; value?: string | number }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="demo-panel p-3 text-xs">
      <span>{label ?? payload[0]?.name}</span>
      <p className="mt-1">{payload[0]?.value} · Sample</p>
    </div>
  );
}
