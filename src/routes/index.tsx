import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import heroImage from "@/assets/student-project-lab.jpg";
import { Button } from "@/components/ui/button";
import { SiteShell, SectionHeading } from "@/components/site-shell";
import { ProjectCard } from "@/components/project-card";
import { HowItWorks, NextSteps, Showcase, Referral } from "@/components/landing-sections";
import { homePromise } from "@/lib/journey-copy";
import { pageHead, projects } from "@/lib/projects";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Before you choose your future, experience what you could build",
      "Explore a technology idea shaped around your interests. Share it with your family, ask questions and discover your next step.",
    ),
  component: Index,
});

function Index() {
  return (
    <SiteShell>
      <section className="hero">
        <div className="page-width hero-layout">
          <div className="hero-copy">
            <div className="hero-pill">
              <Sparkles size={13} /> FUTUREME FAMILY <ArrowRight size={12} />
            </div>
            <h1 className="hero-headline">
              Before you choose your future,
              <span>experience what you could build.</span>
            </h1>
            <p className="hero-subtitle">
              Explore a technology idea shaped around your interests.
              <br />
              Share it with your family, ask questions and discover your next step.
            </p>
            <p className="hero-promise">{homePromise}</p>
            <div className="hero-buttons">
              <Button asChild variant="premium">
                <Link to="/discover">
                  <Sparkles /> Start My 5-Minute Discovery <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="soft">
                <Link to="/how-it-works">See How It Works</Link>
              </Button>
            </div>
            <div className="hero-proof">
              <span className="proof-check" aria-hidden="true">
                <Check size={16} />
              </span>
              <div>
                Explore first. Decide together.
                <span className="proof-note">No experience needed. No pressure to apply.</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <img
              className="hero-art"
              src={heroImage}
              width={1536}
              height={1024}
              alt="Two students collaborating on a small robot and laptop in a technology project lab"
            />
            <div className="hero-visual-caption">
              <span>HANDS-ON PROJECT EXPLORATION</span>
              <strong>From curiosity to something you can try.</strong>
            </div>
          </div>
        </div>
      </section>
      <NextSteps />
      <section className="page-width section-space featured-section">
        <SectionHeading
          eyebrow="BUILT AROUND WHAT YOU LOVE"
          title="Your curiosity. A project waiting to happen."
          description="A gamer, a nature lover, a future innovator? There’s a starting point for everyone."
          link
        />
        <div className="projects-grid">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
      <HowItWorks />
      <Showcase />
      <Referral />
    </SiteShell>
  );
}
