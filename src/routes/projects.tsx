import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { pageHead, projects } from "@/lib/projects";

export const Route = createFileRoute("/projects")({
  head: () =>
    pageHead(
      "Explore projects",
      "Find a sample technology project inspired by nature, gaming, or robotics.",
    ),
  component: Projects,
});
function Projects() {
  const [filter, setFilter] = useState("all");
  return (
    <SiteShell>
      <div className="page-width">
        <div className="page-intro">
          <p className="eyebrow">A LITTLE INSPIRATION GOES A LONG WAY</p>
          <h1>Find your next “what if.”</h1>
          <p>
            Explore beginner-friendly sample projects. Pick a world you love, and see what you could
            create.
          </p>
        </div>
        <div className="filter-bar">
          {[
            { id: "all", name: "All projects" },
            { id: "farming", name: "Nature" },
            { id: "gaming", name: "Gaming" },
            { id: "robotics", name: "Robotics" },
          ].map((item) => (
            <Button
              key={item.id}
              variant="soft"
              aria-pressed={filter === item.id}
              className={filter === item.id ? "filter-active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.id === "all" && <Search />}
              {item.name}
            </Button>
          ))}
        </div>
        <div className="projects-grid section-space pt-0">
          {projects
            .filter((p) => filter === "all" || p.id === filter)
            .map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
        </div>
      </div>
    </SiteShell>
  );
}
