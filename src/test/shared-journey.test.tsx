import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({
    to,
    search,
    children,
    ...props
  }: ComponentProps<"a"> & {
    to: string;
    search?: Record<string, string | undefined>;
  }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search ?? {})) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return (
      <a href={`${to}${query ? `?${query}` : ""}`} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/components/family-actions", () => ({
  CounsellorDialog: () => null,
  CounsellorForm: () => null,
  FamilyDialog: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
  ParentBriefLauncher: () => null,
}));
vi.mock("@/components/parent-brief-tools", () => ({
  ParentBriefShare: () => null,
  ParentQuestionBox: () => null,
}));
vi.mock("@/components/site-shell", () => ({
  SiteShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/sharing", () => ({
  getProjectReferral: vi.fn(() => new Promise(() => {})),
  recordShare: vi.fn(),
}));
vi.mock("@/lib/tracking", async (original) => ({
  ...(await original<typeof import("@/lib/tracking")>()),
  track: vi.fn(),
}));

import { ParentBriefPageView } from "@/components/parent-brief-page";
import { ProjectDecisionCard } from "@/components/project-decision-card";
import { ReferredDiscoveryAction } from "@/components/referred-discovery-action";
import { inviteMessage } from "@/lib/family-copy";
import { niatApplicationUrl } from "@/lib/niat-links";
import type { ParentBrief } from "@/lib/parent-briefs.functions";
import type { ParentLanguage } from "@/lib/parent-experience";

const projectId = "6f1c2c1e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
const brief: ParentBrief = {
  id: "2c9ff70e-6678-450d-8c46-26d8078ca361",
  project_id: projectId,
  project_title: "A helpful sensor",
  language: "english",
  created_at: "2026-11-17T00:00:00.000Z",
  content: {
    headline: "A practical start in technology",
    what_your_child_explored: "Your child explored how a sensor can help a plant.",
    project_summary: "They designed a small project that observes soil and suggests when to water.",
    why_this_fits: "It connects their interest in nature with a manageable first technology build.",
    what_niat_is_and_is_not:
      "NIAT is an upskilling initiative. The degree is awarded by the partner university.",
    questions_to_ask_a_counsellor: ["Which partner university applies here?"],
  },
};

function expectApplicationCampaign(link: HTMLElement, campaign: string) {
  const url = new URL(link.getAttribute("href") ?? "");
  expect(url.origin + url.pathname).toBe("https://apply.niatindia.com/");
  expect(url.searchParams.get("utm_source")).toBe("futureme");
  expect(url.searchParams.get("utm_medium")).toBe("explore");
  expect(url.searchParams.get("utm_campaign")).toBe(campaign);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
}

afterEach(cleanup);

describe("NIAT application attribution", () => {
  it("adds decision-card UTM parameters to the project application link", () => {
    render(<ProjectDecisionCard projectId={projectId} language="english" />);
    expectApplicationCampaign(
      screen.getByRole("link", { name: /Start my application/ }),
      "decision_card",
    );
  });

  it("adds parent-page UTM parameters to the parent application link", () => {
    render(<ParentBriefPageView brief={brief} />);
    expectApplicationCampaign(
      screen.getByRole("link", { name: /Start application/ }),
      "parent_page",
    );
  });

  it("preserves an existing query string and replaces stale UTM values", () => {
    const url = new URL(
      niatApplicationUrl("decisionCard", "https://apply.niatindia.com/?keep=this&utm_source=old"),
    );
    expect(url.searchParams.get("keep")).toBe("this");
    expect(url.searchParams.get("utm_source")).toBe("futureme");
    expect(url.searchParams.get("utm_medium")).toBe("explore");
    expect(url.searchParams.get("utm_campaign")).toBe("decision_card");
  });
});

describe("language-aware friend invitations", () => {
  it.each([
    ["english", "Explore tech with me - takes 5 minutes"],
    ["hindi", "मेरे साथ टेक एक्सप्लोर करो - सिर्फ़ 5 मिनट"],
    ["telugu", "నాతో కలిసి టెక్‌ని అన్వేషించు - కేవలం 5 నిమిషాలు"],
  ] as const)("uses the natural %s invitation", (language: ParentLanguage, message) => {
    expect(inviteMessage[language]).toBe(message);
  });
});

describe("referred visitor discovery action", () => {
  it("does not show the referral-only button without a ref parameter", () => {
    render(<ReferredDiscoveryAction />);
    expect(
      screen.queryByRole("link", { name: "Try it yourself - 5 minutes" }),
    ).not.toBeInTheDocument();
  });

  it("shows the button with ref and preserves referral and UTM attribution", () => {
    render(
      <ReferredDiscoveryAction
        referralCode="dvcFLjPfXGD2"
        utmSource="instagram"
        utmMedium="social"
        utmCampaign="friend_share"
      />,
    );
    const link = screen.getByRole("link", { name: "Try it yourself - 5 minutes" });
    const url = new URL(link.getAttribute("href") ?? "", "https://futureme.example");
    expect(url.pathname).toBe("/discover");
    expect(url.searchParams.get("ref")).toBe("dvcFLjPfXGD2");
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("friend_share");
  });
});
