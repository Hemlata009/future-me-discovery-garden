import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver; Recharts' ResponsiveContainer needs one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Any database access from the dashboard would go through these clients; demo mode must not.
const adminFrom = vi.fn();
const browserFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: adminFrom, rpc: adminFrom },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: browserFrom, rpc: browserFrom, auth: { signOut: vi.fn() } },
}));

import { GrowthAdminShell, GrowthDashboard } from "@/components/admin-growth";
import { buildDemoReport, DEMO_LABEL, DEMO_TOTALS, spread } from "@/lib/admin-demo-data";
import type { GrowthReport } from "@/lib/growth-metrics";
import type { ReportResult } from "@/lib/growth-report.functions";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function liveReport(): GrowthReport {
  const {
    journey_detail: _detail,
    referral_journey: _journey,
    ...demo
  } = buildDemoReport(new Date("2026-11-18T00:00:00Z"));
  return {
    ...demo,
    totals: { ...demo.totals, visitors: 37, counsellor_requests: 2 },
    campaigns: [],
    acquisition: [{ name: "direct", visitors: 37, generations: 5, outbound_visitors: 1 }],
  };
}

function renderShell(fetchReport: ReturnType<typeof vi.fn>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GrowthAdminShell fetchReport={fetchReport as never} />
    </QueryClientProvider>,
  );
}

describe("Live Data / Demo Preview switching", () => {
  it("starts in Live Data, shows only the real report, and never shows the demo banner", async () => {
    const fetchReport = vi.fn(async (): Promise<ReportResult> => ({
      access: "ok",
      report: liveReport(),
    }));
    renderShell(fetchReport);
    expect((await screen.findAllByText("37")).length).toBeGreaterThan(0);
    expect(fetchReport).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(DEMO_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText("2,480")).not.toBeInTheDocument();
  });

  it("Demo Preview shows the banner and sample data without calling the report or the database", async () => {
    const fetchReport = vi.fn(async (): Promise<ReportResult> => ({
      access: "ok",
      report: liveReport(),
    }));
    renderShell(fetchReport);
    await screen.findAllByText("37");
    fireEvent.click(screen.getByRole("button", { name: "Demo Preview" }));

    expect(screen.getByText(DEMO_LABEL)).toBeInTheDocument();
    expect(screen.getAllByText("2,480").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("37")).toHaveLength(0);
    expect(fetchReport).toHaveBeenCalledTimes(1);
    expect(adminFrom).not.toHaveBeenCalled();
    expect(browserFrom).not.toHaveBeenCalled();
    // Live-only controls (date range, filters) are hidden so demo and live never mix.
    expect(screen.queryByRole("button", { name: /Filters/ })).not.toBeInTheDocument();
  });

  it("switching back to Live Data re-reads the real report and removes the banner", async () => {
    const fetchReport = vi.fn(async (): Promise<ReportResult> => ({
      access: "ok",
      report: liveReport(),
    }));
    renderShell(fetchReport);
    await screen.findAllByText("37");
    fireEvent.click(screen.getByRole("button", { name: "Demo Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Live Data" }));
    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(2));
    expect((await screen.findAllByText("37")).length).toBeGreaterThan(0);
    expect(screen.queryByText(DEMO_LABEL)).not.toBeInTheDocument();
  });

  it("keeps the access check: a non-admin sees no data", async () => {
    renderShell(vi.fn(async (): Promise<ReportResult> => ({ access: "denied" })));
    expect(await screen.findByText("This account isn't an administrator")).toBeInTheDocument();
  });

  it("collapses filters behind a button, counts active filters and clears them", async () => {
    const fetchReport = vi.fn(async (): Promise<ReportResult> => ({
      access: "ok",
      report: liveReport(),
    }));
    renderShell(fetchReport);
    await screen.findAllByText("37");
    expect(screen.queryByLabelText("Report filters")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "hindi" } });
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("1");
    await waitFor(() =>
      expect(fetchReport).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ language: "hindi" }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("button", { name: /Filters/ })).not.toHaveTextContent("1");
  });
});

describe("demo dataset is illustrative, consistent and isolated", () => {
  const report = buildDemoReport(new Date("2026-11-18T00:00:00Z"));

  it("has 30 varying days whose sums match the displayed totals", () => {
    expect(report.daily).toHaveLength(30);
    expect(sum(report.daily.map((d) => d.visitors))).toBe(DEMO_TOTALS.visitors);
    expect(sum(report.daily.map((d) => d.generations))).toBe(DEMO_TOTALS.gen_ok);
    expect(sum(report.daily.map((d) => d.referral_visits))).toBe(DEMO_TOTALS.ref_visits);
    const daily = report.journey_detail!.daily;
    expect(sum(daily.map((d) => d.starters))).toBe(report.journey_detail!.funnel.starters);
    expect(sum(daily.map((d) => d.completers))).toBe(report.journey_detail!.funnel.completers);
    expect(new Set(report.daily.map((d) => d.visitors)).size).toBeGreaterThan(10);
    expect(report.daily.at(-1)!.day).toBe("2026-11-18");
  });

  it("keeps audience, acquisition and campaign totals internally consistent", () => {
    for (const items of [report.interests, report.technologies, report.languages])
      expect(sum(items.map((i) => i.value))).toBe(806);
    expect(sum(report.acquisition.map((a) => a.visitors))).toBe(2480);
    expect(sum(report.acquisition.map((a) => a.generations))).toBe(806);
    expect(sum(report.acquisition.map((a) => a.outbound_visitors))).toBe(119);
    const campaign = report.acquisition.find((a) => a.name === "campaign")!;
    expect(sum(report.campaigns.map((c) => c.visitors))).toBe(campaign.visitors);
    expect(sum(report.campaigns.map((c) => c.generations))).toBe(campaign.generations);
    expect(
      report.campaigns.find((c) => c.campaign === "futureme_family_warmlead_test"),
    ).toMatchObject({ source: "email", medium: "crm", visitors: 200, generations: 70 });
    const family = report.journey_detail!.family;
    expect(family.cohort_shared).toBeLessThanOrEqual(family.cohort_briefs);
    expect(family.cohort_opened).toBeLessThanOrEqual(family.cohort_briefs);
  });

  it("is deterministic and contains no personal data", () => {
    expect(buildDemoReport(new Date("2026-11-18T00:00:00Z"))).toEqual(report);
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/@|\b[6-9]\d{9}\b|visitor_hash|phone|contact_name/);
  });

  it("cannot reach the database: the demo module imports no Supabase or server code", () => {
    const source = readFileSync(path.resolve(__dirname, "../lib/admin-demo-data.ts"), "utf8");
    expect(source).not.toMatch(/supabase|\.server|growth-report\.functions|fetch\(/);
  });

  it("splits totals exactly", () => {
    expect(sum(spread(101, [1, 1, 1]))).toBe(101);
  });

  it("never renders a brief-engagement rate above 100%", () => {
    render(<GrowthDashboard report={report} mode="demo" />);
    const percents = screen
      .getAllByText(/^\d+(\.\d+)?%$/)
      .map((el) => Number(el.textContent!.replace("%", "")));
    expect(percents.length).toBeGreaterThan(0);
    for (const value of percents) expect(value).toBeLessThanOrEqual(100);
  });
});
