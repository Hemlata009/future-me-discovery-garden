import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
const adminFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: adminFrom } }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://x.test/"),
}));

import { StudentHomeView } from "@/components/student-home";
import { destinationFor, homeFor, primaryRole } from "@/lib/roles";
import { runStudentHome, type StudentHome } from "@/lib/student-home.server";

describe("single sign-in routing", () => {
  it("picks the highest role", () => {
    expect(primaryRole(["student", "counsellor"])).toBe("counsellor");
    expect(primaryRole(["counsellor", "admin"])).toBe("admin");
    expect(primaryRole([])).toBeNull();
  });

  it("sends each role home", () => {
    expect(homeFor("admin")).toBe("/admin");
    expect(homeFor("counsellor")).toBe("/counsellor");
    expect(homeFor("student")).toBe("/me");
  });

  it("only honours a requested page the role may open", () => {
    expect(destinationFor("admin", "/counsellor")).toBe("/counsellor");
    expect(destinationFor("counsellor", "/admin")).toBe("/counsellor");
    expect(destinationFor("student", "/admin")).toBe("/me");
    expect(destinationFor("student", "/counsellor")).toBe("/me");
    expect(destinationFor("student", "/project?id=1")).toBe("/project?id=1");
    expect(destinationFor("counsellor", "//evil.example")).toBe("/counsellor");
    expect(destinationFor("student", "/auth")).toBe("/me");
  });
});

describe("My FutureMe access", () => {
  it("denies anyone without the student role before reading data", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    await expect(runStudentHome({ supabase: { rpc }, userId: "u1" })).resolves.toEqual({
      access: "denied",
    });
    expect(adminFrom).not.toHaveBeenCalled();
  });
});

const home: Extract<StudentHome, { access: "ok" }> = {
  access: "ok",
  linked: true,
  projects: [
    {
      id: "p1",
      title: "Smart Line-Following Robot",
      tagline: "A beginner AI project",
      interest: "robotics",
      technology: "ai",
      language: "english",
      created_at: "2026-11-15T10:00:00Z",
    },
  ],
  briefs: [{ id: "b1", project_id: "p1", language: "english", created_at: "2026-11-15T10:10:00Z" }],
  profile: {
    student_name: "Riya Sharma",
    city: "Hyderabad",
    state: "Telangana",
    qualification: "class12_studying",
    intended_course: "btech_partner_university",
    updated_at: "2026-11-15T10:40:00Z",
  },
  requests: [
    {
      status: "follow_up",
      created_at: "2026-11-15T10:25:00Z",
      has_counsellor: true,
      next_follow_up_at: "2026-11-19T10:00:00Z",
      last_contacted_at: "2026-11-16T10:00:00Z",
    },
  ],
  steps: {
    discovery: true,
    project: true,
    demo: true,
    brief: true,
    brief_shared: false,
    counsellor: true,
    application: false,
  },
  active_seconds: 1260,
  account: {
    full_name: "Riya Sharma",
    invite_code: "RIYAABC123",
    logins: 3,
    last_login: "2026-11-17T10:00:00Z",
    parent_visits: 1,
    friend_visits: 2,
    invite_signups: 1,
  },
};

describe("My FutureMe page", () => {
  it("shows the student's projects, brief, journey and counsellor status", () => {
    render(<StudentHomeView data={home} email="student@futureme.in" />);
    expect(screen.getByText("Smart Line-Following Robot")).toBeInTheDocument();
    expect(screen.getByText("Parent Brief")).toBeInTheDocument();
    expect(screen.getByText("5 of 7")).toBeInTheDocument();
    expect(screen.getByText("A follow-up call is planned.")).toBeInTheDocument();
    expect(screen.getByText("Currently in Class 12")).toBeInTheDocument();
    expect(screen.getByText(/Pre-application details only/)).toBeInTheDocument();
  });

  it("offers personal invite links for parents and friends and shows who opened them", () => {
    const onInvite = vi.fn();
    render(<StudentHomeView data={home} email="student@futureme.in" onInvite={onInvite} />);
    expect(screen.getByText("Invite your family & friends")).toBeInTheDocument();
    const whatsapp = screen.getAllByRole("link", { name: /WhatsApp/ });
    expect(whatsapp[0]!.getAttribute("href")).toContain(encodeURIComponent("invite=RIYAABC123"));
    expect(whatsapp[0]!.getAttribute("href")).toContain(encodeURIComponent("for=parent"));
    whatsapp[0]!.click();
    expect(onInvite).toHaveBeenCalledWith("parent");
    expect(
      screen.getByText("1 parent visit · 2 friend visits · 1 friend joined"),
    ).toBeInTheDocument();
  });

  it("invites a student with no activity to start", () => {
    render(<StudentHomeView data={{ ...home, linked: false, projects: [] }} email={null} />);
    expect(screen.getByText("Your journey starts here")).toBeInTheDocument();
  });

  it("explains a non-student account", () => {
    render(<StudentHomeView data={{ access: "denied" }} email={null} />);
    expect(screen.getByText("This page is for students")).toBeInTheDocument();
  });
});

describe("My FutureMe empty states", () => {
  it("never shows the projects area to a student without projects, even without an invite code", () => {
    render(
      <StudentHomeView
        data={{
          ...home,
          linked: false,
          projects: [],
          account: { ...home.account, invite_code: null },
        }}
        email={null}
      />,
    );
    expect(screen.getByText("Your journey starts here")).toBeInTheDocument();
    expect(screen.queryByText("My projects")).not.toBeInTheDocument();
  });
});
