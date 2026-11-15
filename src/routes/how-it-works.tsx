import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { HowItWorks, Referral } from "@/components/landing-sections";
import { pageHead } from "@/lib/projects";
export const Route = createFileRoute("/how-it-works")({
  head: () =>
    pageHead(
      "Discover, build, share",
      "Start with curiosity. Discover a project, follow a roadmap, and share your idea.",
    ),
  component: HowPage,
});
function HowPage() {
  return (
    <SiteShell>
      <HowItWorks />
      <Referral />
    </SiteShell>
  );
}
