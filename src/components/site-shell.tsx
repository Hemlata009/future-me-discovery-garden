import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, LogIn, MessageCircle, Menu, Sparkles, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <Sparkles size={21} />
      </span>
      <span>
        FutureMe <span className="text-primary">Family</span>
      </span>
    </Link>
  );
}

export function SiteShell({
  children,
  variant = "student",
}: {
  children: ReactNode;
  /** "parent" shows a parent header with a counsellor jump; "parent-fallback" shows only the logo. */
  variant?: "student" | "parent" | "parent-fallback";
}) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <>
      {variant === "student" ? (
        <header className="site-header">
          <div className="page-width header-inner">
            <Brand />
            <nav className="desktop-nav" aria-label="Main navigation">
              <Link
                to="/"
                activeOptions={{ exact: true }}
                activeProps={{ className: "nav-active" }}
              >
                Discover
              </Link>
              <Link to="/projects" activeProps={{ className: "nav-active" }}>
                Explore projects
              </Link>
              <Link to="/how-it-works" activeProps={{ className: "nav-active" }}>
                How it works
              </Link>
              <Link to="/showcase" activeProps={{ className: "nav-active" }}>
                Student showcase
              </Link>
            </nav>
            <div className="header-actions">
              <Link to="/auth" className="header-signin" aria-label="Sign in">
                <LogIn size={16} aria-hidden="true" />
                <span>Sign in</span>
              </Link>
              <Button asChild variant="premium" className="header-cta">
                <Link to="/discover">
                  Start discovery <ArrowUpRight />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu"
                aria-label={open ? "Close menu" : "Open menu"}
                onClick={() => setOpen(!open)}
              >
                {open ? <X /> : <Menu />}
              </Button>
            </div>
          </div>
          {open && (
            <nav className="mobile-nav" aria-label="Mobile navigation" key={pathname}>
              <Link
                to="/"
                activeOptions={{ exact: true }}
                activeProps={{ className: "mobile-nav-active" }}
                onClick={() => setOpen(false)}
              >
                Discover
              </Link>
              <Link
                to="/projects"
                activeProps={{ className: "mobile-nav-active" }}
                onClick={() => setOpen(false)}
              >
                Explore projects
              </Link>
              <Link
                to="/how-it-works"
                activeProps={{ className: "mobile-nav-active" }}
                onClick={() => setOpen(false)}
              >
                How it works
              </Link>
              <Link
                to="/showcase"
                activeProps={{ className: "mobile-nav-active" }}
                onClick={() => setOpen(false)}
              >
                Student showcase
              </Link>
              <Link
                to="/auth"
                activeProps={{ className: "mobile-nav-active" }}
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
            </nav>
          )}
        </header>
      ) : (
        <header className="site-header">
          <div className="page-width header-inner">
            <Brand />
            {variant === "parent" && (
              <Button asChild variant="premium" className="parent-header-cta">
                <a href="#counsellor-request">
                  <MessageCircle aria-hidden="true" />
                  <span className="parent-cta-full">Talk to a counsellor</span>
                  <span className="parent-cta-short" aria-hidden="true">
                    Counsellor
                  </span>
                </a>
              </Button>
            )}
          </div>
        </header>
      )}
      <main>{children}</main>
      <footer className="site-footer page-width">
        <p className="engagement-privacy-note">
          Privacy: we measure the pages you visit, meaningful actions and active time only while
          this tab is visible and recently used. Before you create an account this stays anonymous;
          it is linked to you only if you sign up and agree. We never record keystroke contents,
          form values or pointer coordinates.
        </p>
        <Brand />
        <p>
          Explore first. Decide together. · AI-powered project discovery for students and families.
        </p>
        <div>
          <Link to="/admin">
            Demo dashboard <ArrowUpRight size={14} />
          </Link>
          <span>© 2026 FutureMe Family</span>
        </div>
      </footer>
    </>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  link = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  link?: boolean;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {link && (
        <Link className="text-link" to="/projects">
          Explore all projects <ArrowRight size={17} />
        </Link>
      )}
    </div>
  );
}
