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

vi.mock("@/components/site-shell", () => ({
  SiteShell: ({ children }: { children: ReactNode }) => <>{children}</>,
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock("@/components/project-card", () => ({ ProjectCard: () => null }));
vi.mock("@/components/landing-sections", async (original) => ({
  ...(await original<typeof import("@/components/landing-sections")>()),
  HowItWorks: () => null,
  Showcase: () => null,
  Referral: () => null,
}));

import { HomePageContent } from "@/routes/index";
import { WARM_LEAD_CAMPAIGN } from "@/lib/journey-copy";

afterEach(cleanup);

describe("Track B warm-lead homepage", () => {
  it("carries the exact campaign attribution into the existing discovery route", () => {
    render(
      <HomePageContent
        search={{
          utm_source: "email",
          utm_medium: "warm_lead",
          utm_campaign: WARM_LEAD_CAMPAIGN,
        }}
      />,
    );

    const primary = screen.getByRole("link", { name: /Explore Before I Apply/ });
    const url = new URL(primary.getAttribute("href") ?? "", "https://futureme.example");
    expect(url.pathname).toBe("/discover");
    expect(url.searchParams.get("utm_source")).toBe("email");
    expect(url.searchParams.get("utm_medium")).toBe("warm_lead");
    expect(url.searchParams.get("utm_campaign")).toBe(WARM_LEAD_CAMPAIGN);
    expect(screen.getByRole("link", { name: "How This Helps Me Decide" })).toHaveAttribute(
      "href",
      "#track-b-journey",
    );
  });

  it.each([{}, { utm_campaign: "futureme_family_warmlead_test_extra" }])(
    "keeps the general discovery journey for non-matching search %j",
    (search) => {
      render(<HomePageContent search={search} />);

      expect(screen.getByRole("link", { name: /Start My 5-Minute Discovery/ })).toHaveAttribute(
        "href",
        "/discover",
      );
      expect(screen.getByRole("link", { name: "See How It Works" })).toHaveAttribute(
        "href",
        "/how-it-works",
      );
      expect(
        screen.queryByRole("link", { name: "How This Helps Me Decide" }),
      ).not.toBeInTheDocument();
    },
  );
});
