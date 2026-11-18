import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { recordStudentActivity } from "@/lib/student-activity.functions";
import {
  addExploreSeconds,
  captureInvite,
  clearJourney,
  markPrompted,
  readJourney,
  recordPageView,
  shouldPrompt,
} from "@/lib/student-journey";
import { INVITE_VISIT_ENDPOINT } from "@/lib/student-signup";
import { ensureVisitor } from "@/lib/tracking";
import { useIdentity } from "@/lib/use-identity";

const TICK_SECONDS = 5;
const RECENT_INTERACTION_MS = 60_000;
const TEAM_PATHS = ["/admin", "/counsellor"];
const NO_PROMPT_PATHS = ["/auth", "/signup", "/me", ...TEAM_PATHS];

/**
 * Remembers which pages a visitor explores and for how long (visible, recently
 * used time only), invites them to save their progress after 5 minutes, records
 * invite-link visits, and — once signed in as a student — sends the journey,
 * return visits and new page views to their account.
 */
export function JourneyTracker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const identity = useIdentity();
  const record = useServerFn(recordStudentActivity);
  const isStudent = identity.data?.role === "student";
  const signedIn = !!identity.data?.role;
  const [prompt, setPrompt] = useState(false);
  const page = useRef({ path: pathname, seconds: 0 });
  const lastInteraction = useRef(Date.now());

  // Page timing: close the previous page when the route changes.
  useEffect(() => {
    if (page.current.path !== pathname) {
      if (!TEAM_PATHS.some((p) => page.current.path.startsWith(p)))
        recordPageView(page.current.path, page.current.seconds);
      page.current = { path: pathname, seconds: 0 };
    }
  }, [pathname]);

  useEffect(() => {
    const touch = () => {
      lastInteraction.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteraction.current > RECENT_INTERACTION_MS) return;
      page.current.seconds += TICK_SECONDS;
      if (!TEAM_PATHS.some((p) => page.current.path.startsWith(p))) addExploreSeconds(TICK_SECONDS);
    }, TICK_SECONDS * 1000);
    const leave = () => {
      if (!TEAM_PATHS.some((p) => page.current.path.startsWith(p)))
        recordPageView(page.current.path, page.current.seconds);
      page.current.seconds = 0;
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      for (const e of events) window.removeEventListener(e, touch);
    };
  }, []);

  // Invite links: remember who invited this visitor and tell the inviter's record.
  useEffect(() => {
    const invite = captureInvite(window.location.search);
    if (!invite) return;
    void ensureVisitor().then(() =>
      fetch(INVITE_VISIT_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(invite),
      }).catch(() => undefined),
    );
  }, []);

  // Signed-in students: one return visit per browser session, then flush page views.
  useEffect(() => {
    if (!isStudent) return;
    try {
      if (!sessionStorage.getItem("fm_student_session")) {
        sessionStorage.setItem("fm_student_session", "1");
        void record({ data: { events: [{ kind: "return_visit" }] } }).catch(() => undefined);
      }
    } catch {
      // Session storage unavailable: skip return-visit marking.
    }
    const flush = () => {
      const journey = readJourney();
      if (!journey.length) return;
      clearJourney();
      void record({
        data: {
          events: journey.slice(-100).map((entry) => ({
            kind: "page_view" as const,
            path: entry.path,
            seconds: entry.seconds,
            at: entry.at,
          })),
        },
      }).catch(() => undefined);
    };
    flush();
    const timer = window.setInterval(flush, 30_000);
    return () => window.clearInterval(timer);
  }, [isStudent, record]);

  // Gentle sign-up prompt for visitors who keep exploring.
  useEffect(() => {
    if (signedIn || identity.isLoading) return;
    const check = () => {
      if (NO_PROMPT_PATHS.some((p) => window.location.pathname.startsWith(p))) return;
      if (shouldPrompt()) {
        markPrompted();
        setPrompt(true);
      }
    };
    check();
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
  }, [signedIn, identity.isLoading]);

  if (!prompt || signedIn) return null;
  return <SignupPrompt onClose={() => setPrompt(false)} next={pathname} />;
}

export function SignupPrompt({ onClose, next }: { onClose: () => void; next: string }) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal family-modal signup-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-prompt-title"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          className="modal-close"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
        <span className="auth-icon">
          <Sparkles size={20} />
        </span>
        <h2 id="signup-prompt-title">Enjoying the exploration? Save it for free</h2>
        <p>Create a free account with a few basic details and keep going.</p>
        <ul className="signup-prompt-list">
          <li>
            <CheckCircle2 size={16} /> Everything you've explored so far is kept
          </li>
          <li>
            <CheckCircle2 size={16} /> Come back to your projects any time
          </li>
          <li>
            <CheckCircle2 size={16} /> Invite your parents and friends to explore with you
          </li>
          <li>
            <CheckCircle2 size={16} /> A NIAT counsellor can answer your questions
          </li>
        </ul>
        <div className="modal-actions">
          <Button asChild variant="premium" size="lg">
            <Link to="/signup" search={{ next }} onClick={onClose}>
              Create my free account
            </Link>
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Keep exploring
          </Button>
        </div>
      </div>
    </div>
  );
}
