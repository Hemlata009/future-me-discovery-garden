import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { Showcase, Referral } from "@/components/landing-sections";
import { pageHead } from "@/lib/projects";
export const Route = createFileRoute("/showcase")({
  head: () =>
    pageHead(
      "Student showcase",
      "Explore sample student project concepts in sustainable farming, gaming, and robotics.",
    ),
  component: ShowcasePage,
});
function ShowcasePage() {
  return (
    <SiteShell>
      <Showcase />
      <Referral />
    </SiteShell>
  );
}
