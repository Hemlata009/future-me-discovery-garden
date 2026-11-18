import {
  Activity,
  CalendarClock,
  CircleAlert,
  Clock3,
  Download,
  Inbox,
  MousePointer2,
  PhoneOff,
  Search,
  Users,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  campaignPerformance,
  crmKpis,
  dateTime,
  FOLLOW_UP_LABELS,
  STATUS_LABELS,
  followUpBucket,
  isNotContacted,
  journeyFunnel,
  leadPriority,
  leadSourceType,
  leadsToCsv,
  PRIORITY_LABELS,
  SOURCE_LABELS,
  sortLeads,
  teamPerformance,
  WARM_LEAD_CAMPAIGN,
  whoAsked,
  type FollowUpBucket,
  type LeadSort,
} from "@/lib/counsellor-crm";
import {
  formatDuration,
  LEAD_STATUSES,
  type CounsellorAssignee,
  type CounsellorViewer,
  type CounsellorWorkspaceResult,
  type LeadView,
} from "@/lib/counsellor-metrics";
import { DonutChart, HeatmapChart } from "@/components/charts";
import { BAND_LABELS } from "@/lib/behaviour-score";
import { formatRate, type GrowthReport } from "@/lib/growth-metrics";

type Workspace = Extract<CounsellorWorkspaceResult, { access: "ok" }>;
type Kpis = ReturnType<typeof crmKpis>;
type OpenLead = (id: string) => void;
type LabelFor = (userId: string | null) => string;

function Kpi({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  note: string;
  tone?: "alert" | undefined;
}) {
  return (
    <article className={`counsellor-kpi${tone === "alert" ? " kpi-alert" : ""}`}>
      <Icon />
      <p>{label}</p>
      <strong>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div title={note}>
      <strong>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="chart-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Bars({ items, total }: { items: { name: string; value: number }[]; total: number }) {
  return (
    <div className="mini-bars">
      {items.map((item) => (
        <div key={item.name}>
          <span>{item.name}</span>
          <div>
            <i style={{ width: `${total ? (item.value / total) * 100 : 0}%` }} />
          </div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function ScorePill({ lead }: { lead: LeadView }) {
  return (
    <span
      className={`score-pill score-${lead.score_band}`}
      title={`${BAND_LABELS[lead.score_band]} · behaviour score, not an admission prediction`}
    >
      {lead.score}
    </span>
  );
}

function PriorityPill({ lead }: { lead: LeadView }) {
  const priority = leadPriority(lead);
  return (
    <span
      className={`priority-pill priority-${priority.level}`}
      title={priority.reasons.join("; ")}
    >
      {PRIORITY_LABELS[priority.level]}
    </span>
  );
}

export function EmptyLeads() {
  return (
    <section className="chart-panel empty-workspace">
      <Inbox />
      <h2>No identified leads in this period.</h2>
      <p>
        Only consented counsellor enquiries become leads; anonymous visitors are never added. Try a
        wider date range, or check that requests are assigned to you.
      </p>
    </section>
  );
}

/* ------------------------------ Overview ------------------------------ */

export function OverviewSection({
  data,
  kpis,
  growth,
  growthState,
  goTo,
  onOpen,
}: {
  onOpen: OpenLead;
  data: Workspace;
  kpis: Kpis;
  growth: GrowthReport | null;
  growthState: "admin-only" | "loading" | "error" | "ok";
  goTo: (section: string, queue?: string) => void;
}) {
  const leadsTotal = data.leads.length;
  return (
    <>
      <section className="counsellor-kpis" aria-label="Priority summary">
        <Kpi
          icon={Users}
          label="Identified leads"
          value={kpis.identified}
          note="Consented requests"
        />
        <Kpi
          icon={Inbox}
          label="Free sign-ups"
          value={kpis.signups}
          note={`${kpis.by_status.new} leads still new`}
        />
        <Kpi
          icon={PhoneOff}
          label="Not yet contacted"
          value={kpis.not_contacted}
          note="Active, no call outcome recorded"
          tone={kpis.not_contacted ? "alert" : undefined}
        />
        <Kpi
          icon={Clock3}
          label="Overdue follow-ups"
          value={kpis.overdue}
          note="Active leads past their time"
          tone={kpis.overdue ? "alert" : undefined}
        />
        <Kpi
          icon={CalendarClock}
          label="Follow-ups due today"
          value={kpis.due_today}
          note="Later today (UTC)"
        />
        <Kpi
          icon={Activity}
          label="Highly engaged"
          value={kpis.high}
          note="Rule-based, not a prediction"
        />
        <Kpi
          icon={MousePointer2}
          label="Clicked application link"
          value={kpis.application_click_leads}
          note="Leads with a click, not applications"
        />
        <Kpi
          icon={CircleAlert}
          label="Undelivered requests"
          value={kpis.undelivered}
          note="Saved; manual follow-up"
          tone={kpis.undelivered ? "alert" : undefined}
        />
      </section>

      <div className="quick-actions">
        <Button variant="soft" onClick={() => goTo("followups", "overdue")}>
          Open overdue queue
        </Button>
        <Button variant="soft" onClick={() => goTo("leads", "not_contacted")}>
          Leads not contacted
        </Button>
        {data.role === "admin" && (
          <Button variant="soft" onClick={() => goTo("followups", "unassigned")}>
            Unassigned leads ({kpis.unassigned})
          </Button>
        )}
      </div>

      <CrmCharts leads={data.leads} kpis={kpis} />
      <TopStudents leads={data.leads} kpis={kpis} onOpen={onOpen} />

      <Panel
        title="Best time to reach your students"
        subtitle="When these leads were active, by day and hour (IST). Each person counts once per hour."
      >
        <HeatmapChart map={data.report.heatmap} unit="student-hours" />
      </Panel>

      <LeadMix data={data} />

      <div className="counsellor-chart-grid">
        <Panel title="Engagement" subtitle="Observable behaviour in the selected period">
          <div className="readiness-grid">
            <Stat label="High" value={kpis.high} />
            <Stat label="Medium" value={kpis.medium} />
            <Stat label="Low" value={kpis.low} />
            <Stat
              label="Avg active time per lead"
              value={
                kpis.avg_active_seconds === null ? "—" : formatDuration(kpis.avg_active_seconds)
              }
              note="Server-timed seconds ÷ all identified leads"
            />
            <Stat label="Meaningful actions" value={kpis.total_actions} />
            <Stat label="Active in last 24 h" value={kpis.active_last_24h} />
          </div>
        </Panel>
        <Panel title="Family & application intent" subtitle="Evidence only; no admission inference">
          <div className="readiness-grid">
            <Stat label="With family signal" value={kpis.family} />
            <Stat label="Parent/guardian callbacks" value={kpis.parent_callbacks} />
            <Stat label="Brief + application click" value={kpis.brief_and_click} />
            <Stat label="High engagement, no click" value={kpis.high_without_click} />
            <Stat label="Referral visits generated" value={kpis.referral_visits} />
            <Stat label="Leads via referral" value={kpis.referral_leads} />
          </div>
        </Panel>
      </div>

      <div className="counsellor-chart-grid">
        <Panel title="Daily identified leads" subtitle="Consented requests by creation day (UTC)">
          <div className="chart-size">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.report.daily}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" fontSize={10} tickLine={false} />
                <YAxis allowDecimals={false} fontSize={10} tickLine={false} />
                <Tooltip />
                <Bar dataKey="leads" name="Leads" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="Active time & meaningful actions"
          subtitle="Server-timed minutes; stored, deduplicated actions"
        >
          <div className="chart-size">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.report.daily.map((day) => ({
                  ...day,
                  active_minutes: Math.round(day.active_seconds / 60),
                }))}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" fontSize={10} tickLine={false} />
                <YAxis allowDecimals={false} fontSize={10} tickLine={false} />
                <Tooltip />
                <Area
                  dataKey="active_minutes"
                  name="Active minutes"
                  stroke="var(--electric)"
                  fill="var(--electric)"
                  fillOpacity={0.12}
                />
                <Area
                  dataKey="meaningful_actions"
                  name="Meaningful actions"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.08}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="counsellor-chart-grid">
        <Panel
          title="Family engagement stages"
          subtitle="Leads with each signal; opens don't prove a parent"
        >
          <Bars items={data.report.family_stages} total={leadsTotal} />
        </Panel>
        <Panel title="Interests" subtitle="From each lead's generated project">
          <DonutChart
            label="Interests"
            unit="leads"
            size={150}
            items={data.report.interests
              .filter((item) => item.name !== "—")
              .map((item) => ({ name: cap(item.name), value: item.value }))}
          />
        </Panel>
      </div>

      <FunnelPanel growth={growth} state={growthState} />
    </>
  );
}

function FunnelPanel({
  growth,
  state,
}: {
  growth: GrowthReport | null;
  state: "admin-only" | "loading" | "error" | "ok";
}) {
  if (state === "admin-only") return null;
  return (
    <Panel
      title="FutureMe Family journey funnel"
      subtitle="Site-wide aggregate counts for the same dates. Anonymous stages are never leads."
    >
      {state === "loading" && <p role="status">Loading journey totals…</p>}
      {state === "error" && <p role="alert">Journey totals couldn't be loaded.</p>}
      {growth && (
        <div className="lead-table-scroll">
          <table className="lead-table funnel-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Count</th>
                <th>From previous stage</th>
                <th>Unit / note</th>
              </tr>
            </thead>
            <tbody>
              {journeyFunnel(growth.totals).map((stage) => (
                <tr key={stage.name}>
                  <td>{stage.name}</td>
                  <td>
                    <strong>{stage.value === null ? "Unavailable" : stage.value}</strong>
                  </td>
                  <td>{stage.value === null ? "—" : formatRate(stage.from_previous)}</td>
                  <td>{stage.note ?? stage.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="privacy-note">
        Stages use different units (visitors, events), so a step can exceed 100% of the previous
        one. An application-link click is not a submitted application.
      </p>
    </Panel>
  );
}

/* ------------------------------ Pipeline ------------------------------ */

export function PipelineSection({ leads, onOpen }: { leads: LeadView[]; onOpen: OpenLead }) {
  return (
    <div className="pipeline-board" aria-label="Lead pipeline by status">
      {LEAD_STATUSES.map((status) => {
        const column = sortLeads(
          leads.filter((lead) => lead.status === status),
          "newest",
        );
        return (
          <section key={status} className="pipeline-column">
            <h2>
              {STATUS_LABELS[status]} <span>{column.length}</span>
            </h2>
            {column.length === 0 && <p className="empty-filter">No leads</p>}
            {column.slice(0, 25).map((lead) => (
              <button key={lead.id} className="pipeline-card" onClick={() => onOpen(lead.id)}>
                <strong>{lead.contact_name}</strong>
                <span>
                  {lead.phone_masked} · {lead.who === "parent" ? "Parent" : "Student"}
                </span>
                <span className={`tier tier-${lead.engagement_tier}`}>{lead.engagement_tier}</span>
                <PriorityPill lead={lead} />
              </button>
            ))}
            {column.length > 25 && (
              <p className="empty-filter">+{column.length - 25} more in All leads</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------ All leads ------------------------------ */

const PAGE_SIZE = 25;

export function LeadsSection({
  leads,
  role,
  viewer,
  assignees,
  labelFor,
  onOpen,
  initialQueue,
  rangeLabel,
}: {
  leads: LeadView[];
  role: Workspace["role"];
  viewer: CounsellorViewer;
  assignees: CounsellorAssignee[];
  labelFor: LabelFor;
  onOpen: OpenLead;
  initialQueue: string;
  rangeLabel: string;
}) {
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState(initialQueue);
  const [status, setStatus] = useState("");
  const [tier, setTier] = useState("");
  const [assignee, setAssignee] = useState("");
  const [language, setLanguage] = useState("");
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [family, setFamily] = useState("");
  const [sort, setSort] = useState<LeadSort>("newest");
  const [page, setPage] = useState(0);

  const campaigns = useMemo(
    () => [...new Set(leads.map((lead) => lead.utm_campaign).filter(Boolean))] as string[],
    [leads],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result = leads.filter((lead) => {
      if (
        term &&
        ![
          lead.id,
          lead.contact_name,
          lead.project_title,
          lead.technology,
          lead.interest,
          lead.referral_code ?? "",
          lead.utm_campaign ?? "",
        ].some((value) => value.toLowerCase().includes(term))
      )
        return false;
      const bucket = followUpBucket(lead);
      if (queue === "not_contacted" && !isNotContacted(lead)) return false;
      if (queue === "due" && bucket !== "today") return false;
      if (queue === "overdue" && bucket !== "overdue") return false;
      if (queue === "undelivered" && lead.delivered) return false;
      if (queue === "app_click" && lead.application_clicks === 0) return false;
      if (queue === "priority_now" && leadPriority(lead).level !== "now") return false;
      if (queue === "signups" && lead.lead_source !== "student_signup") return false;
      if (queue === "very_active" && lead.score_band !== "very_active") return false;
      if (status && lead.status !== status) return false;
      if (tier && lead.engagement_tier !== tier) return false;
      if (assignee === "unassigned" && lead.assigned_to) return false;
      if (assignee && assignee !== "unassigned" && lead.assigned_to !== assignee) return false;
      if (language && lead.language !== language) return false;
      if (source && leadSourceType(lead) !== source) return false;
      if (campaign && lead.utm_campaign !== campaign) return false;
      if (family === "yes" && lead.family_signals.length === 0) return false;
      if (family === "no" && lead.family_signals.length > 0) return false;
      if (family === "parent" && lead.who !== "parent") return false;
      return true;
    });
    return sortLeads(result, sort);
  }, [leads, search, queue, status, tier, assignee, language, source, campaign, family, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const people = [...new Map(assignees.map((person) => [person.user_id, person])).values()];

  function exportCsv() {
    const csv = leadsToCsv(filtered, labelFor);
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `futureme-leads-${rangeLabel}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  return (
    <section className="chart-panel lead-workspace">
      <div className="lead-section-heading">
        <div>
          <h2>All leads</h2>
          <p>
            Mobile numbers stay masked; reveal one inside a lead. Export includes masked numbers
            only, never notes.
          </p>
        </div>
        <div className="lead-heading-actions">
          <span>
            {filtered.length} of {leads.length} leads
          </span>
          <Button variant="soft" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={15} /> Export CSV
          </Button>
        </div>
      </div>
      <div className="lead-filters lead-filters-wide">
        <label className="lead-search">
          <Search size={16} />
          <span className="sr-only">Search leads</span>
          <input
            value={search}
            onChange={(event) => resetPage(setSearch)(event.target.value)}
            placeholder="Search name, lead ID, project, campaign or referral code"
          />
        </label>
        <Select label="Queue" value={queue} onChange={resetPage(setQueue)}>
          <option value="all">All leads</option>
          <option value="priority_now">Follow up now</option>
          <option value="signups">Free sign-ups</option>
          <option value="very_active">Very active (score 70+)</option>
          <option value="not_contacted">Not yet contacted</option>
          <option value="due">Follow-up due today</option>
          <option value="overdue">Overdue</option>
          <option value="app_click">Clicked application link</option>
          <option value="undelivered">Undelivered requests</option>
        </Select>
        <Select label="Status" value={status} onChange={resetPage(setStatus)}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select label="Engagement" value={tier} onChange={resetPage(setTier)}>
          <option value="">All tiers</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        {role === "admin" && (
          <Select label="Counsellor" value={assignee} onChange={resetPage(setAssignee)}>
            <option value="">Everyone</option>
            <option value="unassigned">Unassigned</option>
            {people.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {labelFor(person.user_id)}
              </option>
            ))}
          </Select>
        )}
        <Select label="Language" value={language} onChange={resetPage(setLanguage)}>
          <option value="">All</option>
          <option value="english">English</option>
          <option value="hindi">Hindi</option>
          <option value="telugu">Telugu</option>
        </Select>
        <Select label="Source" value={source} onChange={resetPage(setSource)}>
          <option value="">All sources</option>
          <option value="campaign">Campaign</option>
          <option value="referral">Referral</option>
          <option value="direct">Direct / unattributed</option>
        </Select>
        <Select label="Campaign" value={campaign} onChange={resetPage(setCampaign)}>
          <option value="">All campaigns</option>
          {campaigns.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select label="Family" value={family} onChange={resetPage(setFamily)}>
          <option value="">All</option>
          <option value="yes">Has family signals</option>
          <option value="no">No family activity</option>
          <option value="parent">Parent/guardian request</option>
        </Select>
        <Select label="Sort by" value={sort} onChange={(value) => setSort(value as LeadSort)}>
          <option value="score">Highest behaviour score</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="most_engaged">Most engaged</option>
          <option value="least_engaged">Least engaged</option>
          <option value="active_time">Most active time</option>
          <option value="actions">Most meaningful actions</option>
          <option value="follow_up">Next follow-up</option>
          <option value="last_activity">Latest activity</option>
          <option value="application_clicks">Application-link clicks</option>
        </Select>
      </div>
      <div className="lead-table-scroll">
        <table className="lead-table">
          <thead>
            <tr>
              {[
                "Lead",
                "Score",
                "Mobile",
                "Role",
                "Priority",
                "Status",
                "Tier",
                "Active time",
                "Actions",
                "Family",
                "Referrals",
                "App clicks",
                "Source / campaign",
                "Language",
                "Interest / tech",
                "Academic",
                "Last activity",
                "Assigned",
                "Next follow-up",
                "Created",
              ].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <button className="lead-name" onClick={() => onOpen(lead.id)}>
                    {lead.contact_name}
                  </button>
                  <small>
                    <code>{lead.id.slice(0, 8)}</code> · {lead.project_title}
                  </small>
                </td>
                <td>
                  <ScorePill lead={lead} />
                </td>
                <td>{lead.phone_masked}</td>
                <td>
                  {lead.who === "parent" ? "Parent" : "Student"}
                  {lead.lead_source === "student_signup" && <small>Free sign-up</small>}
                </td>
                <td>
                  <PriorityPill lead={lead} />
                </td>
                <td>
                  <span className="status-pill">{STATUS_LABELS[lead.status]}</span>
                </td>
                <td>
                  <span className={`tier tier-${lead.engagement_tier}`}>
                    {lead.engagement_tier}
                  </span>
                </td>
                <td>{formatDuration(lead.active_seconds)}</td>
                <td>{lead.meaningful_actions}</td>
                <td>{lead.family_signals.length || "None"}</td>
                <td>{lead.referral_count}</td>
                <td>{lead.application_clicks}</td>
                <td>
                  {SOURCE_LABELS[leadSourceType(lead)]}
                  <small>{lead.utm_campaign ?? lead.referral_code ?? "—"}</small>
                </td>
                <td>{lead.language}</td>
                <td>
                  {lead.interest}
                  <small>{lead.technology}</small>
                </td>
                <td>{lead.class_status}</td>
                <td>{dateTime(lead.last_activity)}</td>
                <td>{lead.assigned_to === viewer.user_id ? "You" : labelFor(lead.assigned_to)}</td>
                <td>{dateTime(lead.next_follow_up_at)}</td>
                <td>{dateTime(lead.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="empty-filter">No leads match these filters.</p>}
      </div>
      {pages > 1 && (
        <div className="pager">
          <Button variant="soft" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <Button
            variant="soft"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

/* ------------------------------ Follow-ups ------------------------------ */

const BUCKET_ORDER: FollowUpBucket[] = ["overdue", "today", "tomorrow", "upcoming", "none"];

export function FollowUpsSection({
  leads,
  role,
  viewer,
  labelFor,
  onOpen,
  initialFilter,
}: {
  leads: LeadView[];
  role: Workspace["role"];
  viewer: CounsellorViewer;
  labelFor: LabelFor;
  onOpen: OpenLead;
  initialFilter: string;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const filters = [
    ["mine", "My follow-ups"],
    ...(role === "admin" ? [["all", "All follow-ups"]] : []),
    ["overdue", "Overdue"],
    ["today", "Due today"],
    ...(role === "admin" ? [["unassigned", "Unassigned"]] : []),
    ["new_uncontacted", "New, not contacted"],
    ["undelivered", "Undelivered requests"],
  ] as const;
  const scoped = leads.filter((lead) => {
    const bucket = followUpBucket(lead);
    if (bucket === null) return false;
    if (filter === "mine") return lead.assigned_to === viewer.user_id;
    if (filter === "overdue") return bucket === "overdue";
    if (filter === "today") return bucket === "today";
    if (filter === "unassigned") return !lead.assigned_to;
    if (filter === "new_uncontacted") return lead.status === "new" && isNotContacted(lead);
    if (filter === "undelivered") return !lead.delivered;
    return true;
  });
  const groups = BUCKET_ORDER.map((bucket) => ({
    bucket,
    leads: sortLeads(
      scoped.filter((lead) => followUpBucket(lead) === bucket),
      bucket === "none" ? "newest" : "follow_up",
    ),
  }));

  return (
    <>
      <div className="filter-bar" role="group" aria-label="Follow-up filters">
        {filters.map(([value, label]) => (
          <Button
            key={value}
            variant="soft"
            className={filter === value ? "filter-active" : ""}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {scoped.length === 0 && (
        <section className="chart-panel empty-workspace">
          <CalendarClock />
          <h2>Nothing in this queue.</h2>
          <p>Closed and not-interested leads never appear in follow-up queues.</p>
        </section>
      )}
      {groups
        .filter((group) => group.leads.length > 0)
        .map((group) => (
          <section key={group.bucket} className="chart-panel followup-group">
            <h2 className={`follow-tag follow-${group.bucket}`}>
              {FOLLOW_UP_LABELS[group.bucket]} · {group.leads.length}
            </h2>
            <ul className="followup-list">
              {group.leads.map((lead) => {
                const priority = leadPriority(lead);
                return (
                  <li key={lead.id}>
                    <button className="followup-item" onClick={() => onOpen(lead.id)}>
                      <span>
                        <strong>{lead.contact_name}</strong>
                        <small>
                          {lead.phone_masked} · {STATUS_LABELS[lead.status]} ·{" "}
                          <span className={`tier tier-${lead.engagement_tier}`}>
                            {lead.engagement_tier}
                          </span>
                          {!lead.delivered && " · not delivered"}
                        </small>
                      </span>
                      <span className="followup-reason">{priority.reasons[0]}</span>
                      <span className="followup-meta">
                        {lead.next_follow_up_at
                          ? dateTime(lead.next_follow_up_at)
                          : "No time scheduled"}
                        <small>
                          {lead.assigned_to === viewer.user_id ? "You" : labelFor(lead.assigned_to)}
                        </small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </>
  );
}

/* ------------------------------ Campaigns ------------------------------ */

export function CampaignsSection({
  leads,
  growth,
  role,
}: {
  leads: LeadView[];
  growth: GrowthReport | null;
  role: Workspace["role"];
}) {
  const [language, setLanguage] = useState("");
  const [campaign, setCampaign] = useState("");
  const scoped = leads.filter(
    (lead) =>
      (!language || lead.language === language) && (!campaign || lead.utm_campaign === campaign),
  );
  // Traffic is site-wide, so it is only joined when no lead-only filter is applied.
  const rows = campaignPerformance(scoped, language ? undefined : growth?.campaigns).filter(
    (row) => !campaign || row.campaign === campaign,
  );
  const options = [
    ...new Set([
      ...leads.map((lead) => lead.utm_campaign),
      ...(growth?.campaigns ?? []).map((row) => row.campaign),
    ]),
  ].filter(Boolean) as string[];
  const kpis = crmKpis(scoped);

  return (
    <>
      <div className="lead-filters campaign-filters">
        <Select label="Campaign" value={campaign} onChange={setCampaign}>
          <option value="">All campaigns</option>
          {options.map((value) => (
            <option key={value} value={value}>
              {value}
              {value === WARM_LEAD_CAMPAIGN ? " (Track B test)" : ""}
            </option>
          ))}
        </Select>
        <Select label="Language" value={language} onChange={setLanguage}>
          <option value="">All languages</option>
          <option value="english">English</option>
          <option value="hindi">Hindi</option>
          <option value="telugu">Telugu</option>
        </Select>
      </div>
      <Panel
        title="Source & campaign performance"
        subtitle={
          role === "admin"
            ? "Traffic columns are site-wide aggregates; lead columns are consented enquiries."
            : "Your assigned leads only. Site traffic is visible to admins."
        }
      >
        <div className="lead-table-scroll">
          <table className="lead-table campaign-table">
            <thead>
              <tr>
                {[
                  "Source",
                  "Medium",
                  "Campaign",
                  "Visitors",
                  "Projects generated",
                  "Enquiries (leads)",
                  "High / Med / Low",
                  "Family signal",
                  "App-click leads",
                  "Lead → app click",
                ].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.source}|${row.medium}|${row.campaign}`}
                  className={row.highlighted ? "row-highlight" : ""}
                >
                  <td>{row.source}</td>
                  <td>{row.medium}</td>
                  <td>
                    {row.campaign}
                    {row.highlighted && <small>Track B warm-lead test</small>}
                    {row.test && <small>QA / test traffic, not campaign results</small>}
                  </td>
                  <td>{row.visitors ?? "—"}</td>
                  <td>{row.generations ?? "—"}</td>
                  <td>
                    <strong>{row.leads}</strong>
                  </td>
                  <td>
                    {row.high} / {row.medium_tier} / {row.low}
                  </td>
                  <td>{row.family}</td>
                  <td>{row.application_click_leads}</td>
                  <td>{formatRate(row.click_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty-filter">No campaign data for these filters.</p>}
        </div>
        <p className="privacy-note">
          "Lead → app click" = leads with at least one application-link click ÷ leads from that row.
          Clicks are not applications or admissions.
        </p>
      </Panel>
      <div className="counsellor-chart-grid">
        <Panel title="Lead sources" subtitle="First-touch attribution on each consented request">
          <Bars
            items={(["campaign", "referral", "direct"] as const).map((type) => ({
              name: SOURCE_LABELS[type],
              value: scoped.filter((lead) => leadSourceType(lead) === type).length,
            }))}
            total={scoped.length}
          />
        </Panel>
        <Panel title="Referral performance" subtitle="Links owned by these leads' visitor IDs">
          <div className="readiness-grid">
            <Stat label="Leads arriving via referral" value={kpis.referral_leads} />
            <Stat label="Leads generating referrals" value={kpis.leads_generating_referrals} />
            <Stat label="Referral visits generated" value={kpis.referral_visits} />
            {growth && (
              <Stat
                label="Qualified referrals (site-wide)"
                value={growth.totals.qualified_referrals}
                note="Referred visitors who completed a discovery"
              />
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------ Team ------------------------------ */

export function TeamSection({
  leads,
  assignees,
  labelFor,
}: {
  leads: LeadView[];
  assignees: CounsellorAssignee[];
  labelFor: LabelFor;
}) {
  const rows = teamPerformance(leads, assignees, labelFor);
  return (
    <Panel
      title="Team follow-up overview"
      subtitle="Assigned leads in the selected range. Not a ranking: volumes and lead mix differ."
    >
      <div className="lead-table-scroll">
        <table className="lead-table team-table">
          <thead>
            <tr>
              {[
                "Counsellor",
                "Assigned",
                "Still new",
                "Contacted",
                "Qualified",
                "Pending follow-ups",
                "Overdue",
                "App-click leads",
              ].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user_id ?? "unassigned"}>
                <td>{row.label}</td>
                <td>{row.assigned}</td>
                <td>{row.new_leads}</td>
                <td>{row.contacted}</td>
                <td>{row.qualified}</td>
                <td>{row.pending_follow_ups}</td>
                <td className={row.overdue ? "text-destructive" : ""}>{row.overdue}</td>
                <td>{row.application_click_leads}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="privacy-note">
        Contacted = a call outcome has been recorded. Average time to first contact and follow-up
        completion rate are not shown: only the latest contact time is stored, so they can't be
        calculated reliably yet.
      </p>
    </Panel>
  );
}

/* ------------------------------ Overview charts ------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  new: "var(--gd-indigo)",
  assigned: "var(--gd-navy)",
  contacted: "var(--gd-teal)",
  follow_up: "oklch(0.7 0.13 75)",
  qualified: "var(--gd-mint)",
  not_interested: "var(--muted-foreground)",
  closed: "oklch(0.75 0.01 260)",
};
const chartTooltip = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)",
    fontSize: 12,
  },
};
const chartAxis = {
  fontSize: 11,
  tickLine: false,
  axisLine: false,
  stroke: "var(--muted-foreground)",
};

function CrmCharts({ leads, kpis }: { leads: LeadView[]; kpis: Kpis }) {
  const buckets = leads.map((lead) => followUpBucket(lead));
  const workload = (["overdue", "today", "tomorrow", "upcoming", "none"] as const).map(
    (bucket) => ({
      name: FOLLOW_UP_LABELS[bucket],
      value: buckets.filter((b) => b === bucket).length,
      fill:
        bucket === "overdue"
          ? "var(--destructive)"
          : bucket === "today"
            ? "oklch(0.7 0.13 75)"
            : bucket === "none"
              ? "var(--muted-foreground)"
              : "var(--gd-teal)",
    }),
  );
  const pipeline = LEAD_STATUSES.map((status) => ({
    name: STATUS_LABELS[status]!,
    value: kpis.by_status[status],
    fill: STATUS_COLORS[status]!,
  }));
  return (
    <div className="crm-chart-grid">
      <Panel title="Pipeline" subtitle="Leads at each stage">
        <div className="crm-chart" role="img" aria-label="Leads by status">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={pipeline}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
            >
              <CartesianGrid stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...chartAxis} />
              <YAxis type="category" dataKey="name" width={96} {...chartAxis} />
              <Tooltip {...chartTooltip} cursor={{ fill: "var(--secondary)" }} />
              <Bar dataKey="value" name="Leads" radius={[0, 6, 6, 0]} barSize={14}>
                {pipeline.map((item) => (
                  <Cell key={item.name} fill={item.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Engagement mix" subtitle="Rule-based tiers, not predictions">
        <DonutChart
          unit="leads"
          label="Engagement tiers"
          items={[
            { name: "High", value: kpis.high, color: "var(--gd-mint)" },
            { name: "Medium", value: kpis.medium, color: "var(--gd-teal)" },
            { name: "Low", value: kpis.low, color: "var(--gd-navy)" },
          ]}
        />
      </Panel>
      <Panel title="Follow-up workload" subtitle="Active leads by next follow-up (UTC)">
        <div className="crm-chart" role="img" aria-label="Follow-up workload">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workload} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" {...chartAxis} interval={0} tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} {...chartAxis} />
              <Tooltip {...chartTooltip} cursor={{ fill: "var(--secondary)" }} />
              <Bar dataKey="value" name="Leads" radius={[6, 6, 0, 0]} barSize={28}>
                {workload.map((item) => (
                  <Cell key={item.name} fill={item.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Lead sources" subtitle="First touch on each consented request">
        <DonutChart
          unit="leads"
          label="Lead sources"
          items={(["campaign", "referral", "direct"] as const).map((type, index) => ({
            name: SOURCE_LABELS[type],
            value: leads.filter((lead) => leadSourceType(lead) === type).length,
            color: ["var(--gd-navy)", "var(--gd-mint)", "var(--gd-indigo)"][index]!,
          }))}
        />
      </Panel>
    </div>
  );
}

/* ------------------------------ Behaviour score ------------------------------ */

function TopStudents({ leads, kpis, onOpen }: { leads: LeadView[]; kpis: Kpis; onOpen: OpenLead }) {
  const top = sortLeads(leads, "score").slice(0, 6);
  const bands = (["very_active", "active", "getting_started"] as const).map((band) => ({
    name: BAND_LABELS[band],
    value: leads.filter((lead) => lead.score_band === band).length,
    fill:
      band === "very_active"
        ? "var(--gd-mint)"
        : band === "active"
          ? "var(--gd-teal)"
          : "var(--gd-navy)",
  }));
  return (
    <div className="crm-chart-grid">
      <Panel
        title="Most engaged students"
        subtitle="Behaviour score: time, return visits, exploration, family, friends, intent. Not an admission prediction."
      >
        <ul className="top-students">
          {top.map((lead) => (
            <li key={lead.id}>
              <button type="button" onClick={() => onOpen(lead.id)}>
                <ScorePill lead={lead} />
                <span>
                  <strong>{lead.contact_name}</strong>
                  <small>
                    {lead.behaviour.logins + lead.behaviour.return_visits} visits ·{" "}
                    {formatDuration(Math.max(lead.active_seconds, lead.behaviour.page_seconds))} ·{" "}
                    {lead.behaviour.parent_visits + lead.behaviour.friend_visits} invite visits
                  </small>
                </span>
                <span className="top-bar" aria-hidden="true">
                  <i style={{ width: `${lead.score}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        title="Score distribution"
        subtitle={`Average ${kpis.avg_score ?? "—"} · 70+ very active, 40–69 active`}
      >
        <div className="crm-chart" role="img" aria-label="Leads by behaviour score band">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bands} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" {...chartAxis} />
              <YAxis allowDecimals={false} {...chartAxis} />
              <Tooltip {...chartTooltip} cursor={{ fill: "var(--secondary)" }} />
              <Bar dataKey="value" name="Students" radius={[6, 6, 0, 0]} barSize={44}>
                {bands.map((band) => (
                  <Cell key={band.name} fill={band.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

const cap = (value: string | null) =>
  !value
    ? "Unknown"
    : value.length <= 3
      ? value.toUpperCase()
      : value[0]!.toUpperCase() + value.slice(1);

/* ------------------------------ Lead mix ------------------------------ */

function LeadMix({ data }: { data: Workspace }) {
  const leads = data.leads;
  const perDay = data.report.daily.map((day) => {
    const today = leads.filter((lead) => lead.created_at.slice(0, 10) === day.day);
    return {
      day: day.day.slice(5),
      Campaign: today.filter((lead) => leadSourceType(lead) === "campaign").length,
      Referral: today.filter((lead) => leadSourceType(lead) === "referral").length,
      Direct: today.filter((lead) => leadSourceType(lead) === "direct").length,
    };
  });
  const drivers = (leads[0]?.score_parts ?? []).map((part) => {
    const avg = leads.length
      ? leads.reduce(
          (sum, lead) => sum + (lead.score_parts.find((p) => p.key === part.key)?.points ?? 0),
          0,
        ) / leads.length
      : 0;
    return { name: part.label, value: Math.round((avg / part.max) * 100) };
  });
  return (
    <>
      <div className="crm-chart-grid wide-left">
        <Panel
          title="New leads by day and source"
          subtitle="Consented requests and free sign-ups (UTC days)"
        >
          <div className="crm-chart" role="img" aria-label="New leads per day split by source">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perDay} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" {...chartAxis} minTickGap={14} />
                <YAxis allowDecimals={false} {...chartAxis} />
                <Tooltip {...chartTooltip} cursor={{ fill: "var(--secondary)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Campaign" stackId="leads" fill="var(--gd-navy)" />
                <Bar dataKey="Referral" stackId="leads" fill="var(--gd-mint)" />
                <Bar
                  dataKey="Direct"
                  stackId="leads"
                  fill="var(--gd-indigo)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Who asked" subtitle="Contact on the consented request">
          <DonutChart label="Who asked" unit="leads" size={150} items={whoAsked(leads)} />
        </Panel>
      </div>
      <div className="crm-chart-grid wide-left">
        <Panel
          title="What drives engagement"
          subtitle="Average share of each score part earned across these leads"
        >
          <div className="crm-chart" role="img" aria-label="Average score part completion">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={drivers}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
              >
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" {...chartAxis} />
                <YAxis type="category" dataKey="name" width={118} {...chartAxis} />
                <Tooltip
                  {...chartTooltip}
                  cursor={{ fill: "var(--secondary)" }}
                  formatter={(v) => `${v}%`}
                />
                <Bar
                  dataKey="value"
                  name="Average earned"
                  fill="var(--gd-teal)"
                  radius={[0, 6, 6, 0]}
                  barSize={12}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Languages" subtitle="Preferred language on the request">
          <DonutChart
            label="Languages"
            unit="leads"
            size={150}
            items={data.report.languages.map((item) => ({
              name: cap(item.name),
              value: item.value,
            }))}
          />
        </Panel>
      </div>
    </>
  );
}
