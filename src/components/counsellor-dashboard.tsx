import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  CalendarClock,
  Columns3,
  LayoutDashboard,
  ListChecks,
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
import { TeamShell } from "@/components/team-shell";
import { Button } from "@/components/ui/button";
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

  function goTo(target: string, queueValue?: string) {
    if (target === "leads" && queueValue) setQueue((q) => ({ ...q, leads: queueValue }));
    if (target === "followups" && queueValue) setQueue((q) => ({ ...q, followups: queueValue }));
    setSection(target as Section);
    window.scrollTo({ top: 0 });
  }

  const visibleSections = SECTIONS.filter((item) => !item.adminOnly || isAdmin);

  if (query.data?.access === "denied") {
    return (
      <TeamShell>
        <div className="gd-empty">
          <ShieldAlert />
          <h1>This account isn't authorised for lead access</h1>
          <p>An administrator grants the counsellor role. Roles can't be chosen in the app.</p>
        </div>
      </TeamShell>
    );
  }

  const refreshed = query.dataUpdatedAt
    ? new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(query.dataUpdatedAt)
    : null;

  return (
    <TeamShell>
      <div className="gd crm">
        <header className="gd-header">
          <div>
            <h1>{data && !isAdmin ? "My leads" : "Counsellor CRM"}</h1>
            <p>Understand every prospect's journey. Follow up with the right context.</p>
          </div>
          <span className="gd-toolbar-end">
            {refreshed && <small>Updated {refreshed}</small>}
            <Button
              variant="soft"
              size="sm"
              onClick={() => void Promise.all([query.refetch(), growthQuery.refetch()])}
              disabled={query.isFetching || !validRange}
            >
              <RefreshCw size={15} className={query.isFetching ? "spin" : ""} /> Refresh
            </Button>
          </span>
        </header>

        <div className="gd-toolbar">
          <span className="gd-period">
            {range.from} – {range.to} <small>UTC</small>
          </span>
          <div className="gd-seg" role="group" aria-label="Reporting range">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={preset === item.id ? "is-active" : ""}
                aria-pressed={preset === item.id}
                onClick={() => setPreset(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {preset === "custom" && (
          <div className="gd-custom-range">
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

        {data && (
          <nav aria-label="CRM sections" className="crm-tabs">
            {visibleSections.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "is-active" : ""}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => setSection(item.id)}
              >
                <item.icon size={15} /> {item.label}
              </button>
            ))}
          </nav>
        )}

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
      </div>
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
    </TeamShell>
  );
}
