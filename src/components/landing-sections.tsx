import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Compass,
  Copy,
  Gift,
  Hammer,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { projects } from "@/lib/projects";
import { ProjectCard } from "./project-card";
import { SectionHeading } from "./site-shell";

export function NextSteps({ variant = "general" }: { variant?: "general" | "warm-lead" }) {
  const warmLead = variant === "warm-lead";
  const steps = warmLead
    ? [
        {
          Icon: Compass,
          title: "EXPLORE YOUR PROJECT",
          text: "Discover a technology project connected to your interests.",
        },
        {
          Icon: Users,
          title: "DECIDE WITH YOUR FAMILY",
          text: "Generate a Parent Brief, review verified NIAT information and ask grounded questions.",
        },
        {
          Icon: Send,
          title: "TAKE YOUR NEXT STEP",
          text: "Request a counsellor conversation or continue to the official NIAT application.",
        },
      ]
    : [
        { Icon: Compass, title: "Discover", text: "Answer five quick questions." },
        { Icon: Sparkles, title: "Get your project", text: "AI builds one around you." },
        {
          Icon: Users,
          title: "Decide with your family",
          text: "Share a clear brief, no pressure.",
        },
      ];

  return (
    <section
      id={warmLead ? "track-b-journey" : undefined}
      className="page-width next-steps"
      aria-labelledby="next-steps-title"
    >
      <h2 id="next-steps-title" className="eyebrow">
        WHAT HAPPENS NEXT
      </h2>
      <ol className="next-steps-list">
        {steps.map(({ Icon, title, text }, index) => (
          <li key={title}>
            <span className="step-icon">
              <Icon size={20} />
            </span>
            <div>
              <strong>
                {warmLead ? `STEP ${index + 1} — ${title}` : `${index + 1}. ${title}`}
              </strong>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="page-width section-space">
      <SectionHeading
        eyebrow="THE NEXT CHAPTER STARTS WITH YOU"
        title="From “what if” to “I built this.”"
        description="You don't need to have it all figured out. Just bring your curiosity."
      />
      <div className="steps-grid">
        {[
          {
            Icon: Compass,
            title: "Discover",
            text: "Follow your interests. Find a project that feels like you.",
            number: "01",
          },
          {
            Icon: Hammer,
            title: "Build",
            text: "Start small, explore new technologies, and make your idea happen.",
            number: "02",
          },
          {
            Icon: Send,
            title: "Share",
            text: "Show the world what you made. Inspire someone's next idea.",
            number: "03",
          },
        ].map(({ Icon, title, text, number }) => (
          <div className="how-step" key={title}>
            <span className="step-icon">
              <Icon size={23} />
            </span>
            <span className="step-number" aria-hidden="true">
              {number}
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <div className="center-action">
        <Button asChild variant="soft">
          <Link to="/discover">
            Let’s find your starting point <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function Showcase() {
  return (
    <section className="showcase-band">
      <div className="page-width section-space">
        <SectionHeading
          eyebrow="SMALL STARTS. BIG POSSIBILITIES."
          title="A new generation of builders."
          description="A glimpse of what student curiosity can become. Sample project concepts."
        />
        <div className="projects-grid">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} showcase />
          ))}
        </div>
      </div>
    </section>
  );
}

export function Referral() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?ref=friend`);
      setCopied(true);
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <section className="referral-section page-width">
      <div className="referral-symbol">
        <Gift size={42} />
        <Sparkles className="gift-spark" size={19} />
      </div>
      <div>
        <p className="eyebrow">GOOD IDEAS ARE BETTER TOGETHER</p>
        <h2>Your future looks better with friends.</h2>
        <p>Know someone with a little curiosity? Invite them to discover their next big idea.</p>
      </div>
      <div className="referral-action">
        <Button variant="premium" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Invitation link copied" : "Invite a friend"}
          <ArrowRight />
        </Button>
        {error && <p role="alert">Copy this link: {window.location.origin}/?ref=friend</p>}
      </div>
    </section>
  );
}
