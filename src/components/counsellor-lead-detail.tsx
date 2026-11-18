import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, CheckCircle2, CircleAlert, Copy, Eye, RefreshCw, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import { Button } from "@/components/ui/button";
import { BAND_LABELS } from "@/lib/behaviour-score";
import {
  CALL_OUTCOMES,
  OUTCOME_LABELS,
  STATUS_LABELS,
  dateTime,
  FOLLOW_UP_LABELS,
  PRIORITY_LABELS,
  SOURCE_LABELS,
  followUpBucket,
  fromLocalInput,
  leadPriority,
  leadSourceType,
  toLocalInput,
} from "@/lib/counsellor-crm";
import {
  formatDuration,
  LEAD_STATUSES,
  type CounsellorLeadResult,
  type LeadView,
} from "@/lib/counsellor-metrics";
import {
  getCounsellorLead,
  revealCounsellorPhone,
  updateCounsellorLead,
} from "@/lib/counsellor-workspace.functions";

const EVENT_LABELS: Record<string, string> = {
  landing_visit: "Page visited",
  discovery_started: "Discovery started",
  discovery_completed: "Discovery completed",
  generation_succeeded: "Project generated",
  generation_failed: "Project generation failed",
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
  "activity:page_view": "Viewed a page",
  "activity:signup": "Created a free account",
  "activity:login": "Logged in",
  "activity:logout": "Logged out",
  "activity:return_visit": "Came back",
  "activity:signup_prompt_shown": "Saw the free-account prompt",
  "activity:invite_created": "Shared an invite link",
  "activity:invite_visit": "Invite link opened",
  "activity:invite_signup": "Invited friend created an account",
};
const CTA_LABELS: Record<string, string> = {
  start_application: "Official NIAT application link",
  visit_niat: "Official NIAT website",
  explore_niat: "NIAT information opened",
  talk_to_counsellor: "Counsellor form opened",
};

function isLeadOk(
  value: CounsellorLeadResult | undefined,
): value is Extract<CounsellorLeadResult, { access: "ok" }> {
  return value?.access === "ok";
}

export function LeadDetail({
  id,
  labelFor,
  onClose,
  onUpdated,
}: {
  id: string;
  labelFor: (userId: string | null) => string;
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
  const [phoneMessage, setPhoneMessage] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
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
    setFollowUp(toLocalInput(lead.next_follow_up_at));
    setOutcome("");
    setNotes(lead.internal_notes);
  }, [lead]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  async function revealPhone() {
    setPhoneMessage("");
    try {
      const result = await reveal({ data: { id } });
      if (result.access === "ok") setPhone(result.phone);
      else setPhoneMessage("This number isn't available to your account.");
    } catch {
      setPhoneMessage("The number couldn't be revealed. Please try again.");
    }
  }

  async function copyPhone() {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setPhoneMessage("Number copied.");
    } catch {
      setPhoneMessage("Copy didn't work in this browser; select the number instead.");
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    setSaving(true);
    setMessage(null);
    const nextFollowUp = fromLocalInput(followUp);
    try {
      const result = await update({
        data: {
          id,
          ...(status !== lead.status ? { status } : {}),
          ...(role === "admin" && assignedTo !== lead.assigned_to
            ? { assigned_to: assignedTo }
            : {}),
          ...(nextFollowUp !== lead.next_follow_up_at ? { next_follow_up_at: nextFollowUp } : {}),
          // Only a newly recorded outcome counts as contact and stamps last-contacted.
          ...(outcome ? { call_outcome: outcome as (typeof CALL_OUTCOMES)[number] } : {}),
          ...(notes !== lead.internal_notes ? { internal_notes: notes } : {}),
        },
      });
      if (result.access !== "ok") {
        setMessage({
          kind: "error",
          text:
            result.access === "invalid_assignee"
              ? "Choose an authorised admin or counsellor."
              : "This update wasn't saved. Please try again.",
        });
        return;
      }
      setMessage({
        kind: "ok",
        text: outcome
          ? "Saved. The call outcome was recorded and the last-contacted time updated."
          : "Saved. No contact was recorded because no new call outcome was chosen.",
      });
      await Promise.all([query.refetch(), onUpdated()]);
    } catch {
      setMessage({ kind: "error", text: "This update wasn't saved. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const priority = lead ? leadPriority(lead) : null;
  const bucket = lead ? followUpBucket(lead) : null;
  const assignees = isLeadOk(leadResult)
    ? [...new Map(leadResult.assignees.map((person) => [person.user_id, person])).values()]
    : [];

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
          <div className="lead-detail-tools">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh lead activity"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className={query.isFetching ? "spin" : ""} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close lead detail" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        {query.isLoading && <p role="status">Loading lead detail…</p>}
        {query.isError && (
          <p role="alert">
            The lead couldn't be loaded.{" "}
            <Button variant="soft" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </p>
        )}
        {query.data && query.data.access !== "ok" && (
          <p role="alert">This lead isn't available to your account.</p>
        )}
        {lead && priority && (
          <>
            <div className={`priority-banner priority-${priority.level}`}>
              <strong>{PRIORITY_LABELS[priority.level]}</strong>
              <ul>
                {priority.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <p className={lead.delivered ? "delivery-ok" : "delivery-warning"}>
              {lead.delivered ? (
                <>
                  <CheckCircle2 size={16} /> Request saved · webhook delivered
                </>
              ) : (
                <>
                  <CircleAlert size={16} /> Request saved · not delivered to the optional webhook.
                  Manual follow-up required.
                </>
              )}
            </p>
            <section className="lead-detail-section">
              <h3>Contact & student profile</h3>
              <dl className="lead-facts">
                <div>
                  <dt>Mobile</dt>
                  <dd>
                    <span className="lead-phone">{phone ?? lead.phone_masked}</span>{" "}
                    {phone ? (
                      <Button variant="ghost" className="reveal-button" onClick={copyPhone}>
                        <Copy size={14} /> Copy number
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="reveal-button"
                        onClick={() => void revealPhone()}
                      >
                        <Eye size={14} /> Reveal for follow-up
                      </Button>
                    )}
                    {phoneMessage && (
                      <small role="status" className="block">
                        {phoneMessage}
                      </small>
                    )}
                  </dd>
                </div>
                <Fact
                  label="Contact role"
                  value={lead.who === "parent" ? "Parent / guardian" : "Student"}
                />
                <Fact label="Preferred language" value={lead.language} />
                <Fact label="Enquiry received" value={dateTime(lead.created_at)} />
                <Fact label="Status" value={STATUS_LABELS[lead.status] ?? lead.status} />
                <Fact label="Assigned counsellor" value={labelFor(lead.assigned_to)} />
                <Fact label="Project" value={lead.project_title} />
                <Fact
                  label="Interest / technology"
                  value={`${lead.interest} / ${lead.technology}`}
                />
                <Fact label="Academic status" value={lead.class_status} />
              </dl>
              <div className="lead-links">
                {lead.generated_project_id && (
                  <a
                    className="text-link"
                    href={`/project?id=${lead.generated_project_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open project <ArrowUpRight size={14} />
                  </a>
                )}
                {lead.parent_brief_id && (
                  <a
                    className="text-link"
                    href={`/parent?id=${lead.parent_brief_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Parent Brief <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            </section>
            <section className="lead-detail-section behaviour-section">
              <div className="behaviour-head">
                <span className={`score-big score-${lead.score_band}`}>{lead.score}</span>
                <div>
                  <h3>Behaviour score · {BAND_LABELS[lead.score_band]}</h3>
                  <p className="privacy-note">
                    What this student actually did. Not an admission prediction.
                  </p>
                </div>
              </div>
              <div className="score-radar" role="img" aria-label="Behaviour score shape">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={lead.score_parts.map((part) => ({
                      part: part.label,
                      value: Math.round((part.points / part.max) * 100),
                    }))}
                    outerRadius="72%"
                  >
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis
                      dataKey="part"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar
                      dataKey="value"
                      name="Earned"
                      stroke="var(--gd-teal)"
                      fill="var(--gd-teal)"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <ul className="score-parts">
                {lead.score_parts.map((part) => (
                  <li key={part.key}>
                    <span>{part.label}</span>
                    <span className="score-bar" aria-hidden="true">
                      <i style={{ width: `${(part.points / part.max) * 100}%` }} />
                    </span>
                    <strong>
                      {part.points}/{part.max}
                    </strong>
                    <small>{part.detail}</small>
                  </li>
                ))}
              </ul>
              <dl className="behaviour-facts">
                <Fact
                  label="Account"
                  value={
                    lead.lead_source === "student_signup"
                      ? `Free sign-up${lead.behaviour.signed_up_at ? ` · ${dateTime(lead.behaviour.signed_up_at)}` : ""}`
                      : "Callback request (no account)"
                  }
                />
                <Fact
                  label="Logins / logouts"
                  value={`${lead.behaviour.logins} / ${lead.behaviour.logouts}`}
                />
                <Fact label="Last login" value={dateTime(lead.behaviour.last_login)} />
                <Fact label="Return visits" value={String(lead.behaviour.return_visits)} />
                <Fact
                  label="Pages explored"
                  value={`${lead.behaviour.pages_explored} pages · ${lead.behaviour.page_views} views`}
                />
                <Fact
                  label="Invites"
                  value={`${lead.behaviour.parent_visits} parent · ${lead.behaviour.friend_visits} friend visits · ${lead.behaviour.invite_signups} joined`}
                />
              </dl>
              {lead.behaviour.top_pages.length > 0 && (
                <ul className="top-pages">
                  {lead.behaviour.top_pages.map((page) => (
                    <li key={page.path}>
                      <code>{page.path}</code>
                      <span>
                        {page.views} view{page.views === 1 ? "" : "s"} ·{" "}
                        {formatDuration(page.seconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="lead-detail-section">
              <h3>Engagement: {lead.engagement_tier}</h3>
              <p>
                {formatDuration(lead.active_seconds)} active · {lead.meaningful_actions} meaningful
                actions · {lead.decision_steps.length} decision steps · {lead.referral_count}{" "}
                referral visits generated · last activity {dateTime(lead.last_activity)}
              </p>
              <ul className="tier-reasons">
                {lead.tier_reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {lead.decision_steps.length > 0 && (
                <p>Decision steps: {lead.decision_steps.join(" · ")}</p>
              )}
              <p className="privacy-note">
                An engagement indicator only, not an admission prediction or a measure of student
                quality.
              </p>
            </section>
            <section className="lead-detail-section">
              <h3>Family engagement evidence</h3>
              {lead.family_signals.length === 0 ? (
                <p>No family activity observed.</p>
              ) : (
                <ul className="evidence-list">
                  {lead.family_signals.map((signal) => (
                    <li key={signal.key}>
                      <strong>{signal.label}</strong>
                      <span>{dateTime(signal.at)}</span>
                      <p>{signal.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="lead-detail-section">
              <h3>Attribution & application activity</h3>
              <p>
                First-touch source: <strong>{SOURCE_LABELS[leadSourceType(lead)]}</strong>
                {lead.referral_code ? ` · referral ${lead.referral_code}` : ""}
              </p>
              <p>
                {lead.utm_source ?? "No source"} · {lead.utm_medium ?? "No medium"} ·{" "}
                {lead.utm_campaign ?? "No campaign"}
              </p>
              <p>
                <strong>{lead.application_clicks}</strong> official application-link clicks. A click
                does not confirm that an application was submitted.
              </p>
            </section>
            <section className="lead-detail-section">
              <h3>Journey timeline</h3>
              {isLeadOk(leadResult) && leadResult.timeline.length === 0 && (
                <p>No recorded activity yet.</p>
              )}
              <ol className="lead-timeline">
                {isLeadOk(leadResult) &&
                  leadResult.timeline.map((event) => (
                    <li key={event.id}>
                      <span />
                      <div>
                        <strong>
                          {EVENT_LABELS[event.event_name] ?? event.event_name}
                          {event.cta ? ` · ${CTA_LABELS[event.cta] ?? event.cta}` : ""}
                          {event.channel ? ` · ${event.channel}` : ""}
                          {event.path ? ` · ${event.path}` : ""}
                          {event.seconds ? ` · ${formatDuration(event.seconds)}` : ""}
                        </strong>
                        <p>
                          {event.event_name === "referral_visit"
                            ? "Referral outcome (a visit by someone else)"
                            : event.source}{" "}
                          · {dateTime(event.created_at)}
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
                Last contacted: <strong>{dateTime(lead.last_contacted_at)}</strong>
                {lead.call_outcome
                  ? ` · last outcome: ${OUTCOME_LABELS[lead.call_outcome] ?? lead.call_outcome}`
                  : ""}
                <br />
                Next follow-up: <strong>{dateTime(lead.next_follow_up_at)}</strong>
                {bucket && bucket !== "none" && (
                  <span className={`follow-tag follow-${bucket}`}>{FOLLOW_UP_LABELS[bucket]}</span>
                )}
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
                  Next follow-up (your local time)
                  <input
                    type="datetime-local"
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value)}
                  />
                </label>
                <label>
                  Record a call outcome
                  <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                    <option value="">No new call to record</option>
                    {CALL_OUTCOMES.map((value) => (
                      <option key={value} value={value}>
                        {OUTCOME_LABELS[value]}
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
                      {assignees.map((person) => (
                        <option key={person.user_id} value={person.user_id}>
                          {labelFor(person.user_id)} · {person.role}
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
                  placeholder="Concise follow-up context only. No sensitive personal information."
                />
              </label>
              <p className="privacy-note">
                No call, message or email is sent automatically. Opening this lead does not mark it
                contacted.
              </p>
              {message && (
                <p role={message.kind === "ok" ? "status" : "alert"} className="notice">
                  {message.text}
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
