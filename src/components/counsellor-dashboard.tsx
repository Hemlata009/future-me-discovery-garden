import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Columns3,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { LeadDetail } from "@/components/counsellor-lead-detail";
import {
  CampaignsSection,
  EmptyLeads,
  FollowUpsSection,
  LeadsSection,
  OverviewSection,
  PipelineSection,
  TeamSection,
} from "@/components/counsellor-sections";
import { Brand } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { crmKpis, rangeForPreset } from "@/lib/counsellor-crm";
import type { CounsellorWorkspaceResult } from "@/lib/counsellor-metrics";
import { getCounsellorWorkspace } from "@/lib/counsellor-workspace.functions";
import { getGrowthReport } from "@/lib/growth-report.functions";

type Preset = "today" | "7" | "30" | "month" | "custom";
type Section = "overview" | "pipeline" | "leads" | "followups" | "campaigns" | "team";

const SECTIONS: { id: Section; label: string; icon: typeof Activity; adminOnly?: boolean }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "pipeline", label: "Lead pipeline", icon: Columns3 },
  { id: "leads", label: "All leads", icon: ListChecks },
  { id: "followups", label: "Follow-ups", icon: CalendarClock },
  { id: "campaigns", label: "Campaign performance", icon: Megaphone },
  { id: "team", label: "Team performance", icon: UsersRound, adminOnly: true },
];
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

function isWorkspaceOk(
  value: CounsellorWorkspaceResult | undefined,
): value is Extract<CounsellorWorkspaceResult, { access: "ok" }> {
  return value?.access === "ok";
}

export function CounsellorDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getCounsellorWorkspace);
  const fetchGrowth = useServerFn(getGrowthReport);
  const [preset, setPreset] = useState<Preset>("30");
  const [custom, setCustom] = useState(rangeForPreset("30"));
  const [section, setSection] = useState<Section>("overview");
  const [queue, setQueue] = useState({ leads: "all", followups: "mine" });
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const range = preset === "custom" ? custom : rangeForPreset(preset);
  const validRange = range.from <= range.to;

  const query = useQuery({
    queryKey: ["counsellor-workspace", range],
    queryFn: () => fetchWorkspace({ data: range }),
    retry: false,
    enabled: validRange,
  });
  const data = isWorkspaceOk(query.data) ? query.data : null;
  const isAdmin = data?.role === "admin";
  const growthQuery = useQuery({
    queryKey: ["counsellor-growth", range],
    queryFn: () => fetchGrowth({ data: range }),
    retry: false,
    enabled: validRange && isAdmin,
  });
  const growth = growthQuery.data?.access === "ok" ? growthQuery.data.report : null;
  const growthState = !isAdmin
    ? "admin-only"
    : growthQuery.isError || growthQuery.data?.access === "denied"
      ? "error"
      : growth
        ? "ok"
        : "loading";

  const labelFor = useCallback(
    (userId: string | null) => {
      if (!userId) return "Unassigned";
      if (data && userId === data.viewer.user_id) return data.viewer.email ?? "You";
      const person = data?.assignees.find((item) => item.user_id === userId);
      return person?.email ?? `${person?.role ?? "Team member"} · ${userId.slice(0, 8)}`;
    },
    [data],
  );
  const kpis = useMemo(() => (data ? crmKpis(data.leads) : null), [data]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function goTo(target: string, queueValue?: string) {
    if (target === "leads" && queueValue) setQueue((q) => ({ ...q, leads: queueValue }));
    if (target === "followups" && queueValue) setQueue((q) => ({ ...q, followups: queueValue }));
    setSection(target as Section);
    window.scrollTo({ top: 0 });
  }

  const visibleSections = SECTIONS.filter((item) => !item.adminOnly || isAdmin);
  const nav = (
    <nav aria-label="CRM sections" className="crm-nav">
      {visibleSections.map((item) => (
        <button
          key={item.id}
          className={section === item.id ? "counsellor-nav-active" : ""}
          aria-current={section === item.id ? "page" : undefined}
          onClick={() => setSection(item.id)}
        >
          <item.icon size={17} /> {item.label}
        </button>
      ))}
      {isAdmin && (
        <Link to="/admin">
          <BarChart3 size={17} /> Growth dashboard
        </Link>
      )}
    </nav>
  );

  const sidebar = (
    <aside className="counsellor-sidebar">
      <Brand />
      <p className="counsellor-product">Counsellor CRM</p>
      {data && nav}
      <div className="counsellor-sidebar-actions">
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut size={15} /> Sign out
        </Button>
        <Link className="admin-back" to="/">
          <ArrowLeft size={15} /> Back to FutureMe Family
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
              An administrator must grant the counsellor role through trusted SQL before leads
              appear here. Roles can't be chosen in the app.
            </p>
          </section>
        </main>
      </div>
    );
  }

  const refreshed = query.dataUpdatedAt
    ? new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(query.dataUpdatedAt)
    : null;
  const title = SECTIONS.find((item) => item.id === section)?.label ?? "Overview";

  return (
    <div className="counsellor-layout">
      {sidebar}
      <main className="counsellor-main">
        <header className="counsellor-heading crm-heading">
          <div>
            <p className="eyebrow">FUTUREME FAMILY · COUNSELLOR CRM</p>
            <h1>{title}</h1>
            <p>Understand every prospect's journey. Follow up with the right context.</p>
          </div>
          <div className="crm-identity">
            {data && (
              <span>
                {data.viewer.email ?? "Signed in"}
                <strong className="role-pill">{data.role}</strong>
              </span>
            )}
            <Button
              variant="soft"
              onClick={() => void Promise.all([query.refetch(), growthQuery.refetch()])}
              disabled={query.isFetching || !validRange}
            >
              <RefreshCw size={15} className={query.isFetching ? "spin" : ""} /> Refresh
            </Button>
            {refreshed && <small>Last refreshed {refreshed}</small>}
          </div>
        </header>

        <div className="crm-range">
          <div className="filter-bar mb-0" role="group" aria-label="Reporting range">
            {PRESETS.map((item) => (
              <Button
                key={item.id}
                variant="soft"
                className={preset === item.id ? "filter-active" : ""}
                aria-pressed={preset === item.id}
                onClick={() => setPreset(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="filter-bar counsellor-date-filter mb-0">
              <label>
                From
                <input
                  type="date"
                  value={custom.from}
                  max={custom.to}
                  onChange={(event) => setCustom({ ...custom, from: event.target.value })}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={custom.to}
                  min={custom.from}
                  onChange={(event) => setCustom({ ...custom, to: event.target.value })}
                />
              </label>
            </div>
          )}
          <p>
            Leads created {range.from} to {range.to}. Timezone: UTC. Activity uses the same dates.
          </p>
        </div>

        {data && <div className="crm-nav-mobile">{nav}</div>}

        {!validRange && (
          <div className="chart-panel" role="alert">
            The start date must be on or before the end date.
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

        {data && kpis && data.leads.length === 0 && section !== "campaigns" && <EmptyLeads />}
        {data && kpis && (data.leads.length > 0 || section === "campaigns") && (
          <>
            {section === "overview" && (
              <OverviewSection
                data={data}
                kpis={kpis}
                growth={growth}
                growthState={growthState}
                goTo={goTo}
              />
            )}
            {section === "pipeline" && (
              <PipelineSection leads={data.leads} onOpen={setSelectedLead} />
            )}
            {section === "leads" && (
              <LeadsSection
                key={queue.leads}
                leads={data.leads}
                role={data.role}
                viewer={data.viewer}
                assignees={data.assignees}
                labelFor={labelFor}
                onOpen={setSelectedLead}
                initialQueue={queue.leads}
                rangeLabel={`${range.from}_to_${range.to}`}
              />
            )}
            {section === "followups" && (
              <FollowUpsSection
                key={queue.followups}
                leads={data.leads}
                role={data.role}
                viewer={data.viewer}
                labelFor={labelFor}
                onOpen={setSelectedLead}
                initialFilter={
                  !isAdmin && ["all", "unassigned"].includes(queue.followups)
                    ? "mine"
                    : queue.followups
                }
              />
            )}
            {section === "campaigns" && (
              <CampaignsSection leads={data.leads} growth={growth} role={data.role} />
            )}
            {section === "team" && isAdmin && (
              <TeamSection leads={data.leads} assignees={data.assignees} labelFor={labelFor} />
            )}
            <details className="metric-definitions">
              <summary>Metric definitions</summary>
              <ul>
                <li>
                  <strong>Identified lead:</strong> a saved, consented counsellor request. Anonymous
                  visitors are never leads.
                </li>
                <li>
                  <strong>Contacted:</strong> a call outcome has been recorded. Opening a lead never
                  counts.
                </li>
                <li>
                  <strong>Active time:</strong> sum of accepted server-timed heartbeat increments
                  while the tab was visible and recently used.
                </li>
                <li>
                  <strong>Meaningful actions:</strong> stored, deduplicated project, demo, share,
                  family, counsellor and NIAT decision events, not raw clicks.
                </li>
                <li>
                  <strong>Engagement tiers:</strong> High = activity within 7 days of the range end,
                  4+ actions and 2+ decision steps. Medium = recent with 2+ actions or 1 decision
                  step. Low = otherwise. Not an admission prediction.
                </li>
                <li>
                  <strong>Family engagement:</strong> recorded Parent Brief and parent-question
                  events. A share doesn't prove delivery; an opening doesn't prove a parent.
                </li>
                <li>
                  <strong>Application click:</strong> a stored click on the official NIAT
                  application link. It is not a submitted application or admission.
                </li>
                <li>
                  <strong>Overdue:</strong> an active lead whose follow-up time has passed. Due
                  today and tomorrow use UTC calendar days.
                </li>
              </ul>
            </details>
          </>
        )}
      </main>
      {selectedLead && data && (
        <LeadDetail
          key={selectedLead}
          id={selectedLead}
          labelFor={labelFor}
          onClose={() => setSelectedLead(null)}
          onUpdated={async () => {
            await queryClient.invalidateQueries({ queryKey: ["counsellor-workspace"] });
          }}
        />
      )}
    </div>
  );
}
