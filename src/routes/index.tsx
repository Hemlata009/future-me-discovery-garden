import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Play, Sparkles, Zap } from "lucide-react";
import heroImage from "@/assets/future-world.jpg";
import { Button } from "@/components/ui/button";
import { SiteShell, SectionHeading } from "@/components/site-shell";
import { ProjectCard } from "@/components/project-card";
import { HowItWorks, Showcase, Referral } from "@/components/landing-sections";
import { pageHead, projects } from "@/lib/projects";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Your interests. Your future.",
      "Discover what you could build with technology. Turn your curiosity into your first AI-powered project.",
    ),
  component: Index,
});

function Index() {
  return (
    <SiteShell>
      <section className="hero">
        <img
          className="hero-art"
          src={heroImage}
          width={1536}
          height={1024}
          alt="An astronaut and a friendly robot exploring a vibrant world of possibilities"
        />
        <div className="page-width hero-inner">
          <div className="hero-copy">
            <div className="hero-pill">
              <Sparkles size={13} /> YOUR NEXT CHAPTER STARTS HERE <ArrowRight size={12} />
            </div>
            <h1>FutureMe AI</h1>
            <p className="hero-headline">
              Your interests.
              <br />
              Your future.
              <br />
              <span className="gradient-text">Your first AI project.</span>
            </p>
            <p className="hero-subtitle">
              Discover what you could build with technology.
              <br />
              Turn your curiosity into your first AI-powered project.
            </p>
            <div className="hero-buttons">
              <Button asChild variant="premium">
                <Link to="/discover">
                  <Sparkles /> Discover My Future <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="soft">
                <Link to="/projects">
                  <Play size={15} /> Explore Projects
                </Link>
              </Button>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack">
                <span className="avatar">AK</span>
                <span className="avatar">DS</span>
                <span className="avatar">RP</span>
                <span className="avatar">SM</span>
              </div>
              <div>
                For the curious. The creative. The future you.
                <span className="proof-note">No experience needed. Just a spark of curiosity.</span>
              </div>
            </div>
          </div>
        </div>
        <span className="hero-footnote">
          <Zap size={12} className="text-primary" /> Big futures start with small ideas.
        </span>
      </section>
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
