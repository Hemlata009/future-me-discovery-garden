import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  FileText,
  Inbox,
  Languages,
  LogOut,
  MousePointer2,
  Phone,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import { supabase } from "@/integrations/supabase/client";
import {
  getCounsellorLead,
  getCounsellorWorkspace,
  revealCounsellorPhone,
  updateCounsellorLead,
} from "@/lib/counsellor-workspace.functions";
import {
  formatDuration,
  LEAD_STATUSES,
  type CounsellorLeadResult,
  type CounsellorWorkspaceResult,
  type LeadView,
} from "@/lib/counsellor-metrics";
import { presetRange } from "@/lib/growth-metrics";

const CHART_COLORS = [
  "var(--primary)",
  "var(--electric)",
  "var(--mint)",
  "var(--muted-foreground)",
  "var(--accent)",
];
function isWorkspaceOk(
  value: CounsellorWorkspaceResult | undefined,
): value is Extract<CounsellorWorkspaceResult, { access: "ok" }> {
  return value?.access === "ok";
}
function isLeadOk(
  value: CounsellorLeadResult | undefined,
): value is Extract<CounsellorLeadResult, { access: "ok" }> {
  return value?.access === "ok";
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  contacted: "Contacted",
  follow_up: "Follow up",
  qualified: "Qualified",
  not_interested: "Not interested",
  closed: "Closed",
};
const EVENT_LABELS: Record<string, string> = {
  landing_visit: "Page visited",
  discovery_started: "Discovery started",
  discovery_completed: "Discovery completed",
  generation_succeeded: "Project generated",
  project_viewed: "Project viewed",
  project_shared: "Project shared",
  demo_interacted: "Demo interacted with",
  referral_visit: "Referral visit generated",
  parent_brief_generated: "Parent Brief generated",
  parent_brief_shared: "Parent Brief shared",
  parent_brief_opened: "Parent Brief opened",
  parent_question_asked: "Parent question submitted",
  counsellor_requested: "Counsellor request submitted",
  cta_clicked: "Decision link clicked",
};

function dateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))
    : "—";
}

function shortId(value: string | null): string {
  return value ? `${value.slice(0, 8)}…` : "Unassigned";
}

export function CounsellorDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getCounsellorWorkspace);
  const [preset, setPreset] = useState<"7" | "30" | "custom">("30");
  const [custom, setCustom] = useState(presetRange(30));
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState("all");
  const [language, setLanguage] = useState("");
  const [referral, setReferral] = useState("all");
  const [family, setFamily] = useState("all");
  const range = preset === "custom" ? custom : presetRange(Number(preset));
  const query = useQuery({
    queryKey: ["counsellor-workspace", range],
    queryFn: () => fetchWorkspace({ data: range }),
    retry: false,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const workspace = query.data;
  const data = isWorkspaceOk(workspace) ? workspace : null;
  const filteredLeads = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const now = Date.now();
    const endToday = Date.parse(`${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`);
    return data.leads.filter((lead) => {
      if (
        term &&
        ![lead.id, lead.contact_name, lead.project_title, lead.technology, lead.interest].some(
          (value) => value.toLowerCase().includes(term),
        )
      )
        return false;
      if (language && lead.language !== language) return false;
      if (quick === "new" && lead.status !== "new") return false;
      if (quick === "high" && lead.engagement_tier !== "high") return false;
      if (quick === "undelivered" && lead.delivered) return false;
      if (
        quick === "due" &&
        !(
          lead.next_follow_up_at &&
          Date.parse(lead.next_follow_up_at) > now &&
          Date.parse(lead.next_follow_up_at) <= endToday
        )
      )
        return false;
      if (
        quick === "overdue" &&
        !(lead.next_follow_up_at && Date.parse(lead.next_follow_up_at) <= now)
      )
        return false;
      if (referral === "referral" && !lead.referral_code) return false;
      if (referral === "campaign" && !lead.utm_source && !lead.utm_campaign) return false;
      if (referral === "direct" && (lead.referral_code || lead.utm_source || lead.utm_campaign))
        return false;
      if (family === "yes" && lead.family_signals.length === 0) return false;
      if (family === "no" && lead.family_signals.length > 0) return false;
      return true;
    });
  }, [data, search, language, quick, referral, family]);

  const sidebar = (
    <aside className="counsellor-sidebar">
      <Brand />
      <p className="counsellor-product">Lead intelligence</p>
      <nav aria-label="Team workspace">
        <span className="counsellor-nav-active">
          <BarChart3 size={17} /> Counsellor workspace
        </span>
        {data?.role === "admin" && (
          <Link to="/admin">
            <Activity size={17} /> Growth overview
          </Link>
        )}
      </nav>
      <div className="counsellor-sidebar-actions">
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut size={15} /> Sign out
        </Button>
        <Link className="admin-back" to="/">
          <ArrowLeft size={15} /> Back to discovery
        </Link>
      </div>
    </aside>
  );

  if (query.data?.access === "denied") {
    return (
      <div className="counsellor-layout">
        {sidebar}
        <main className="counsellor-main">
          <section className="chart-panel access-panel">
            <ShieldAlert />
            <h1>This account isn't authorised for lead access.</h1>
            <p>
              An administrator must assign the counsellor role and assign leads before they appear
              here.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="counsellor-layout">
      {sidebar}
      <main className="counsellor-main">
        <header className="counsellor-heading">
          <div>
            <p className="eyebrow">FUTUREME FAMILY · COUNSELLOR CRM</p>
            <h1>Know the journey. Follow up with context.</h1>
            <p>
              Identified consented enquiries from {range.from} to {range.to} (UTC). Activity metrics
              use the same date boundaries.
            </p>
          </div>
          <div className="filter-bar mb-0">
            {(["7", "30", "custom"] as const).map((value) => (
              <Button
                key={value}
                variant="soft"
                className={preset === value ? "filter-active" : ""}
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
              >
                {value === "custom" ? "Custom" : `${value} days`}
              </Button>
            ))}
          </div>
        </header>
        {preset === "custom" && (
          <div className="filter-bar counsellor-date-filter">
            <label>
              From{" "}
              <input
                type="date"
                value={custom.from}
                max={custom.to}
                onChange={(event) => setCustom({ ...custom, from: event.target.value })}
              />
            </label>
            <label>
              To{" "}
              <input
                type="date"
                value={custom.to}
                min={custom.from}
                onChange={(event) => setCustom({ ...custom, to: event.target.value })}
              />
            </label>
          </div>
        )}
        {query.isLoading && (
          <div className="chart-panel" role="status">
            Loading authorised lead data…
          </div>
        )}
        {query.isError && (
          <div className="chart-panel" role="alert">
            <h2>The workspace couldn't be loaded.</h2>
            <p>{query.error instanceof Error ? query.error.message : "Please try again."}</p>
            <Button variant="soft" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {data && data.leads.length === 0 && (
          <section className="chart-panel empty-workspace">
            <Inbox />
            <h2>No identified leads in this period.</h2>
            <p>
              Only consented counsellor enquiries become leads. Anonymous visitors are never added.
              Try a wider date range.
            </p>
          </section>
        )}
        {data && data.leads.length > 0 && (
          <>
            <section className="counsellor-kpis" aria-label="Lead summary">
              <Kpi
                icon={Users}
                label="Identified leads"
                value={data.report.kpis.identified_leads}
                note="Consented enquiries only"
              />
              <Kpi
                icon={Inbox}
                label="New leads"
                value={data.report.kpis.new_leads}
                note="Status: new"
              />
              <Kpi
                icon={Activity}
                label="Highly engaged"
                value={data.report.kpis.highly_engaged}
                note="Rule-based, not a prediction"
              />
              <Kpi
                icon={CalendarClock}
                label="Follow-ups due"
                value={data.report.kpis.follow_ups_due}
                note="Later today, active leads"
              />
              <Kpi
                icon={Clock3}
                label="Overdue follow-ups"
                value={data.report.kpis.overdue_follow_ups}
                note="Active leads past due"
              />
              <Kpi
                icon={FileText}
                label="Family engagement signals"
                value={data.report.kpis.family_engagement}
                note="Leads with evidence"
              />
              <Kpi
                icon={MousePointer2}
                label="Application-link clicks"
                value={data.report.kpis.application_clicks}
                note="Clicks, not applications"
              />
              <Kpi
                icon={CircleAlert}
                label="Undelivered requests"
                value={data.report.kpis.undelivered}
                note="Saved; webhook not delivered"
              />
            </section>
            <div className="counsellor-chart-grid">
              <section className="chart-panel">
                <h2>Daily identified leads</h2>
                <p>Consented requests by request-creation day</p>
                <div className="chart-size">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.report.daily}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="day" fontSize={10} tickLine={false} />
                      <YAxis allowDecimals={false} fontSize={10} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="leads" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="chart-panel">
                <h2>Active engagement & meaningful actions</h2>
                <p>Server-timed visible activity in minutes; deduplicated stored actions</p>
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
                        stroke="var(--electric)"
                        fill="var(--electric)"
                        fillOpacity={0.12}
                      />
                      <Area
                        dataKey="meaningful_actions"
                        stroke="var(--primary)"
                        fill="var(--primary)"
                        fillOpacity={0.08}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
            <div className="counsellor-chart-grid three-panels">
              <section className="chart-panel">
                <h2>Lead pipeline</h2>
                <p>Current operational status of this lead cohort</p>
                <div className="mini-bars">
                  {data.report.pipeline.map((item) => (
                    <div key={item.name}>
                      <span>{STATUS_LABELS[item.name]}</span>
                      <div>
                        <i
                          style={{
                            width: `${data.leads.length ? (item.value / data.leads.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="chart-panel">
                <h2>Language distribution</h2>
                <p>Preferred language on the consented request</p>
                <div className="chart-size compact">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.report.languages}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={75}
                        stroke="none"
                      >
                        {data.report.languages.map((item, index) => (
                          <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-legend">
                  {data.report.languages.map((item) => (
                    <span key={item.name}>
                      {item.name} · {item.value}
                    </span>
                  ))}
                </div>
              </section>
              <section className="chart-panel">
                <h2>Student interests</h2>
                <p>Interest from each lead's generated project</p>
                <div className="mini-bars">
                  {data.report.interests.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span>
                      <div>
                        <i
                          style={{
                            width: `${data.leads.length ? (item.value / data.leads.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="counsellor-chart-grid">
              <section className="chart-panel">
                <h2>Family engagement stages</h2>
                <p>Leads with each evidence signal; opens do not prove parent identity</p>
                <div className="mini-bars">
                  {data.report.family_stages.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span>
                      <div>
                        <i
                          style={{
                            width: `${data.leads.length ? (item.value / data.leads.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="chart-panel">
                <h2>Referral & application readiness</h2>
                <p>Observable actions only; no admission inference</p>
                <div className="readiness-grid">
                  <Readiness
                    label="Referral visits generated"
                    value={data.report.referral.visits}
                  />
                  <Readiness
                    label="Leads generating referrals"
                    value={data.report.referral.leads_with_referrals}
                  />
                  <Readiness
                    label="Clicked application link"
                    value={data.report.readiness.application_clicked}
                  />
                  <Readiness
                    label="Brief + application click"
                    value={data.report.readiness.brief_and_application}
                  />
                  <Readiness
                    label="High engagement, no app click"
                    value={data.report.readiness.high_without_application}
                  />
                </div>
              </section>
            </div>
            <section className="chart-panel lead-workspace">
              <div className="lead-section-heading">
                <div>
                  <h2>Lead follow-up queue</h2>
                  <p>
                    Numbers are masked until an authorised counsellor reveals one in lead detail.
                  </p>
                </div>
                <span>
                  {filteredLeads.length} of {data.leads.length} leads
                </span>
              </div>
              <div className="lead-filters">
                <label className="lead-search">
                  <Search size={16} />
                  <span className="sr-only">Search leads</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, ID, project or technology"
                  />
                </label>
                <label>
                  Queue{" "}
                  <select value={quick} onChange={(event) => setQuick(event.target.value)}>
                    <option value="all">All leads</option>
                    <option value="new">New leads</option>
                    <option value="high">High engagement</option>
                    <option value="due">Follow-up due today</option>
                    <option value="overdue">Overdue</option>
                    <option value="undelivered">Undelivered requests</option>
                  </select>
                </label>
                <label>
                  Language{" "}
                  <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                    <option value="">All</option>
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="telugu">Telugu</option>
                  </select>
                </label>
                <label>
                  Source{" "}
                  <select value={referral} onChange={(event) => setReferral(event.target.value)}>
                    <option value="all">All sources</option>
                    <option value="referral">Referral</option>
                    <option value="campaign">Campaign</option>
                    <option value="direct">Direct</option>
                  </select>
                </label>
                <label>
                  Family{" "}
                  <select value={family} onChange={(event) => setFamily(event.target.value)}>
                    <option value="all">All activity</option>
                    <option value="yes">Has family signals</option>
                    <option value="no">No family activity</option>
                  </select>
                </label>
              </div>
              <div className="lead-table-scroll">
                <table className="lead-table">
                  <thead>
                    <tr>
                      {[
                        "Lead ID",
                        "Contact",
                        "Mobile",
                        "Language",
                        "Interest",
                        "Technology",
                        "Tier",
                        "Active time",
                        "Actions",
                        "Family signals",
                        "Referrals",
                        "Last activity",
                        "Status",
                        "Assigned",
                        "Next follow-up",
                        "",
                      ].map((heading) => (
                        <th key={heading}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          <code>{lead.id.slice(0, 8)}</code>
                        </td>
                        <td>
                          <button className="lead-name" onClick={() => setSelectedLead(lead.id)}>
                            {lead.contact_name}
                          </button>
                          <small>{lead.project_title}</small>
                        </td>
                        <td>{lead.phone_masked}</td>
                        <td>{lead.language}</td>
                        <td>{lead.interest}</td>
                        <td>{lead.technology}</td>
                        <td>
                          <span className={`tier tier-${lead.engagement_tier}`}>
                            {lead.engagement_tier}
                          </span>
                        </td>
                        <td>{formatDuration(lead.active_seconds)}</td>
                        <td>{lead.meaningful_actions}</td>
                        <td>{lead.family_signals.length || "None"}</td>
                        <td>{lead.referral_count}</td>
                        <td>{dateTime(lead.last_activity)}</td>
                        <td>
                          <span className="status-pill">{STATUS_LABELS[lead.status]}</span>
                        </td>
                        <td title={lead.assigned_to ?? undefined}>{shortId(lead.assigned_to)}</td>
                        <td>{dateTime(lead.next_follow_up_at)}</td>
                        <td>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Open lead ${lead.contact_name}`}
                            onClick={() => setSelectedLead(lead.id)}
                          >
                            <ChevronRight />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLeads.length === 0 && (
                  <p className="empty-filter">No leads match these filters.</p>
                )}
              </div>
            </section>
            <p className="metric-definitions">
              <strong>Metric definitions:</strong> Meaningful actions are stored, deduplicated
              project, demo, share, family, counsellor and NIAT decision events—not raw clicks. High
              engagement means activity within seven days of the range end, at least four meaningful
              actions and two decision steps. Medium means recent activity with at least two actions
              or one decision step. Low means limited or stale activity. These rules do not predict
              admission probability or student quality.
            </p>
          </>
        )}
      </main>
      {selectedLead && (
        <LeadDetail
          key={selectedLead}
          id={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdated={async () => {
            await queryClient.invalidateQueries({ queryKey: ["counsellor-workspace"] });
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <article className="counsellor-kpi">
      <Icon />
      <p>{label}</p>
      <strong>{value.toLocaleString("en-IN")}</strong>
      <small>{note}</small>
    </article>
  );
}
function Readiness({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function LeadDetail({
  id,
  onClose,
  onUpdated,
}: {
  id: string;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const fetchLead = useServerFn(getCounsellorLead);
  const reveal = useServerFn(revealCounsellorPhone);
  const update = useServerFn(updateCounsellorLead);
  const query = useQuery({
    queryKey: ["counsellor-lead", id],
    queryFn: () => fetchLead({ data: { id } }),
    retry: false,
  });
  const [phone, setPhone] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const leadResult = query.data;
  const lead = isLeadOk(leadResult) ? leadResult.lead : null;
  const role = isLeadOk(leadResult) ? leadResult.role : null;
  const [status, setStatus] = useState<LeadView["status"]>("new");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!lead) return;
    setStatus(lead.status);
    setAssignedTo(lead.assigned_to);
    setFollowUp(lead.next_follow_up_at?.slice(0, 16) ?? "");
    setOutcome(lead.call_outcome ?? "");
    setNotes(lead.internal_notes);
  }, [lead]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const result = await update({
      data: {
        id,
        status,
        ...(role === "admin" ? { assigned_to: assignedTo } : {}),
        next_follow_up_at: followUp ? new Date(followUp).toISOString() : null,
        call_outcome: outcome ? (outcome as "reached") : null,
        internal_notes: notes,
      },
    });
    setSaving(false);
    if (result.access !== "ok") {
      setMessage(
        result.access === "invalid_assignee"
          ? "Choose an authorised admin or counsellor."
          : "This update wasn't saved. Please try again.",
      );
      return;
    }
    setMessage("Lead updated. The last-contacted time is set only when an outcome is recorded.");
    await Promise.all([query.refetch(), onUpdated()]);
  }

  return (
    <div className="lead-detail-backdrop" onMouseDown={onClose}>
      <aside
        className="lead-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="lead-detail-top">
          <div>
            <p className="eyebrow">LEAD · {id.slice(0, 8)}</p>
            <h2 id="lead-detail-title">{lead?.contact_name ?? "Lead detail"}</h2>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close lead detail" onClick={onClose}>
            <X />
          </Button>
        </div>
        {query.isLoading && <p>Loading lead detail…</p>}
        {query.data?.access !== "ok" && !query.isLoading && (
          <p role="alert">This lead isn't available to your account.</p>
        )}
        {lead && (
          <>
            {!lead.delivered && (
              <p className="delivery-warning">
                <CircleAlert size={16} /> This request is saved but wasn't delivered to the optional
                webhook. Contact details remain available here for authorised follow-up.
              </p>
            )}
            <section className="lead-detail-section">
              <h3>Contact & student profile</h3>
              <dl className="lead-facts">
                <div>
                  <dt>Mobile</dt>
                  <dd>
                    {phone ?? lead.phone_masked}{" "}
                    <Button
                      variant="ghost"
                      className="reveal-button"
                      onClick={async () => {
                        const result = await reveal({ data: { id } });
                        if (result.access === "ok") setPhone(result.phone);
                      }}
                    >
                      <Eye size={14} /> Reveal for follow-up
                    </Button>
                  </dd>
                </div>
                <div>
                  <dt>Who requested</dt>
                  <dd>{lead.who}</dd>
                </div>
                <div>
                  <dt>Preferred language</dt>
                  <dd>{lead.language}</dd>
                </div>
                <div>
                  <dt>Project</dt>
                  <dd>{lead.project_title}</dd>
                </div>
                <div>
                  <dt>Interest / technology</dt>
                  <dd>
                    {lead.interest} / {lead.technology}
                  </dd>
                </div>
                <div>
                  <dt>Academic status</dt>
                  <dd>{lead.class_status}</dd>
                </div>
              </dl>
            </section>
            <section className="lead-detail-section">
              <h3>Engagement: {lead.engagement_tier}</h3>
              <p>
                {formatDuration(lead.active_seconds)} active · {lead.meaningful_actions} meaningful
                actions · {lead.referral_count} referral visits generated
              </p>
              <ul className="tier-reasons">
                {lead.tier_reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="privacy-note">
                An engagement indicator only—not an admission prediction or measure of student
                quality.
              </p>
            </section>
            <section className="lead-detail-section">
              <h3>Family engagement signals</h3>
              {lead.family_signals.length === 0 ? (
                <p>No family activity observed.</p>
              ) : (
                <ul className="evidence-list">
                  {lead.family_signals.map((signal) => (
                    <li key={signal.key}>
                      <strong>{signal.label}</strong>
                      <span>{dateTime(signal.at)} UTC</span>
                      <p>{signal.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="lead-detail-section">
              <h3>Attribution & application activity</h3>
              <p>
                First touch:{" "}
                {lead.referral_code
                  ? `Referral ${lead.referral_code}`
                  : (lead.utm_source ?? lead.utm_campaign ?? "Direct / unattributed")}
              </p>
              <p>
                {lead.utm_source ?? "No source"} · {lead.utm_medium ?? "No medium"} ·{" "}
                {lead.utm_campaign ?? "No campaign"}
              </p>
              <p>
                <strong>{lead.application_clicks}</strong> NIAT application-link clicks. This does
                not confirm an application was submitted.
              </p>
            </section>
            <section className="lead-detail-section">
              <h3>Activity timeline</h3>
              <ol className="lead-timeline">
                {leadResult?.access === "ok" &&
                  leadResult.timeline.map((event) => (
                    <li key={event.id}>
                      <span />
                      <div>
                        <strong>
                          {EVENT_LABELS[event.event_name] ?? event.event_name}
                          {event.cta ? ` · ${event.cta}` : ""}
                        </strong>
                        <p>
                          {event.source} · {dateTime(event.created_at)} UTC
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
            <form
              className="lead-detail-section lead-update-form"
              onSubmit={(event) => void save(event)}
            >
              <h3>Follow-up actions</h3>
              <p>
                Record operational notes only. Do not add sensitive personal information. No call,
                message or email is sent automatically.
              </p>
              <div className="lead-form-grid">
                <label>
                  Lead status
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as LeadView["status"])}
                  >
                    {LEAD_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Next follow-up
                  <input
                    type="datetime-local"
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value)}
                  />
                </label>
                <label>
                  Call outcome
                  <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                    <option value="">No outcome recorded</option>
                    {[
                      "reached",
                      "no_answer",
                      "busy",
                      "wrong_number",
                      "callback_requested",
                      "not_interested",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                {role === "admin" && (
                  <label>
                    Assigned counsellor
                    <select
                      value={assignedTo ?? ""}
                      onChange={(event) => setAssignedTo(event.target.value || null)}
                    >
                      <option value="">Unassigned</option>
                      {query.data?.access === "ok" &&
                        [
                          ...new Map(
                            query.data.assignees.map((assignee) => [assignee.user_id, assignee]),
                          ).values(),
                        ].map((assignee) => (
                          <option key={assignee.user_id} value={assignee.user_id}>
                            {assignee.role} · {shortId(assignee.user_id)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
              <label>
                Internal operational notes
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Concise follow-up context only"
                />
              </label>
              <p>Last contacted: {dateTime(lead.last_contacted_at)} UTC</p>
              {message && (
                <p role="status" className="notice">
                  {message}
                </p>
              )}
              <Button type="submit" variant="premium" disabled={saving}>
                {saving ? "Saving…" : "Save follow-up"}
                <CheckCircle2 />
              </Button>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
