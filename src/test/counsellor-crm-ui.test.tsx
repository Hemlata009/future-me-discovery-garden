import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  CampaignsSection,
  FollowUpsSection,
  LeadsSection,
  PipelineSection,
  TeamSection,
} from "@/components/counsellor-sections";
import { WARM_LEAD_CAMPAIGN } from "@/lib/counsellor-crm";
import type { CounsellorViewer, LeadView } from "@/lib/counsellor-metrics";

const ME = "33333333-3333-4333-8333-333333333333";
const viewer: CounsellorViewer = { user_id: ME, email: "me@example.com", role: "admin" };
const labelFor = (id: string | null) =>
  id ? (id === ME ? "me@example.com" : "other") : "Unassigned";

function lead(id: string, overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: `${id}0000000-0000-4000-8000-000000000000`,
    contact_name: `Lead ${id}`,
    phone_masked: "••••••3210",
    visitor_hash: null,
    generated_project_id: "22222222-2222-4222-8222-222222222222",
    parent_brief_id: null,
    language: "english",
    who: "student",
    interest: "farming",
    technology: "ai",
    class_status: "class12",
    project_title: "EcoBuddy",
    referral_code: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    status: "assigned",
    assigned_to: ME,
    next_follow_up_at: null,
    last_contacted_at: "2026-11-17T09:00:00.000Z",
    call_outcome: "reached",
    internal_notes: "",
    delivered: true,
    created_at: "2026-11-15T09:00:00.000Z",
    updated_at: "2026-11-15T09:00:00.000Z",
    active_seconds: 0,
    meaningful_actions: 0,
    family_signals: [],
    referral_count: 0,
    last_activity: "2026-11-15T09:00:00.000Z",
    engagement_tier: "low",
    tier_reasons: [],
    application_clicks: 0,
    decision_steps: [],
    ...overrides,
  };
}

const past = new Date(Date.now() - 3_600_000).toISOString();
const leads = [
  lead("a", { status: "new", assigned_to: null, last_contacted_at: null, call_outcome: null }),
  lead("b", { next_follow_up_at: past, engagement_tier: "high" }),
  lead("c", { utm_source: "email", utm_medium: "crm", utm_campaign: WARM_LEAD_CAMPAIGN }),
  lead("d", { status: "closed", next_follow_up_at: past }),
];

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

describe("All leads table", () => {
  const props = {
    leads,
    role: "admin" as const,
    viewer,
    assignees: [{ user_id: ME, role: "admin" as const, email: "me@example.com" }],
    labelFor,
    onOpen: vi.fn(),
    rangeLabel: "2026-11-01_to_2026-11-18",
  };

  it("filters to leads not yet contacted and opens a lead", () => {
    render(<LeadsSection {...props} initialQueue="not_contacted" />);
    expect(screen.getByText("1 of 4 leads")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lead a" }));
    expect(props.onOpen).toHaveBeenCalledWith(leads[0]!.id);
  });

  it("combines search and campaign filters", () => {
    render(<LeadsSection {...props} initialQueue="all" />);
    fireEvent.change(screen.getByLabelText("Campaign"), { target: { value: WARM_LEAD_CAMPAIGN } });
    expect(screen.getByText("1 of 4 leads")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search name/), { target: { value: "nobody" } });
    expect(screen.getByText("No leads match these filters.")).toBeInTheDocument();
  });

  it("exports the filtered leads as a CSV download", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<LeadsSection {...props} initialQueue="all" />);
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});

describe("Follow-up queue", () => {
  it("groups overdue items and never lists closed leads", () => {
    render(
      <FollowUpsSection
        leads={leads}
        role="admin"
        viewer={viewer}
        labelFor={labelFor}
        onOpen={vi.fn()}
        initialFilter="all"
      />,
    );
    expect(screen.getByRole("heading", { name: /Overdue · 1/ })).toBeInTheDocument();
    expect(screen.queryByText("Lead d")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
    expect(screen.getByText("Lead a")).toBeInTheDocument();
    expect(screen.queryByText("Lead b")).not.toBeInTheDocument();
  });

  it("hides admin-only filters from counsellors", () => {
    render(
      <FollowUpsSection
        leads={leads}
        role="counsellor"
        viewer={{ ...viewer, role: "counsellor" }}
        labelFor={labelFor}
        onOpen={vi.fn()}
        initialFilter="mine"
      />,
    );
    expect(screen.queryByRole("button", { name: "All follow-ups" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unassigned" })).not.toBeInTheDocument();
  });
});

describe("Pipeline, campaigns and team", () => {
  it("shows every status column with counts", () => {
    render(<PipelineSection leads={leads} onOpen={vi.fn()} />);
    const column = screen.getByRole("heading", { name: /New/ }).closest("section")!;
    expect(within(column).getByText("Lead a")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Closed/ })).toHaveTextContent("1");
  });

  it("highlights the Track B warm-lead campaign", () => {
    render(<CampaignsSection leads={leads} growth={null} role="counsellor" />);
    expect(screen.getByText("Track B warm-lead test")).toBeInTheDocument();
    expect(screen.getByText(/Site traffic is visible to admins/)).toBeInTheDocument();
  });

  it("lists the unassigned pool in the team table", () => {
    render(
      <TeamSection
        leads={leads}
        assignees={[{ user_id: ME, role: "admin", email: "me@example.com" }]}
        labelFor={labelFor}
      />,
    );
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });
});
