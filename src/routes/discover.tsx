import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ensureVisitor, track } from "@/lib/tracking";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Code,
  Cpu,
  Gamepad2,
  Globe,
  Leaf,
  Palette,
  Rocket,
  Sparkles,
} from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { pageHead, projects } from "@/lib/projects";

export const Route = createFileRoute("/discover")({
  head: () =>
    pageHead(
      "Discover your future",
      "Answer five quick questions and get an AI-generated beginner project you can start building.",
    ),
  component: Discover,
});

const steps = [
  {
    title: "What sparks your curiosity?",
    description: "Pick an interest that feels like you. There are no wrong answers.",
  },
  {
    title: "What would you love to explore?",
    description: "Choose a technology you're curious about. No experience needed.",
  },
  {
    title: "What do you want to build?",
    description: "Choose your starting point, or add your own twist.",
  },
  {
    title: "Where are you in your journey?",
    description: "A little about you, so your next step feels right.",
  },
  {
    title: "Which language feels like home?",
    description: "Your project will be written in the language you pick.",
  },
];

const loadingMessages = [
  "Understanding your interests...",
  "Finding a real-world problem...",
  "Designing your technology project...",
  "Creating your personal roadmap...",
];

export default function Discover() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(["", "", "", "", ""]);
  const [idea, setIdea] = useState("");
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const options =
    step === 0
      ? [
          { id: "farming", name: "Nature & sustainability", Icon: Leaf, image: projects[0].image },
          {
            id: "gaming",
            name: "Gaming & entertainment",
            Icon: Gamepad2,
            image: projects[1].image,
          },
          { id: "robotics", name: "Robotics & innovation", Icon: Bot, image: projects[2].image },
          { id: "creativity", name: "Art & creativity", Icon: Palette },
          { id: "science", name: "Science & discovery", Icon: Rocket },
          { id: "community", name: "People & community", Icon: Globe },
        ]
      : step === 1
        ? [
            { id: "ai", name: "Artificial intelligence", Icon: Sparkles },
            { id: "web", name: "Web development", Icon: Code },
            { id: "iot", name: "Smart devices & IoT", Icon: Cpu },
          ]
        : step === 2
          ? [
              { id: "assistant", name: "A helpful assistant", Icon: Sparkles },
              { id: "experience", name: "An interactive experience", Icon: Gamepad2 },
              { id: "solution", name: "A real-world solution", Icon: Globe },
            ]
          : step === 3
            ? [
                { id: "class12", name: "I'm in Class 12", Icon: Rocket },
                { id: "completed", name: "I've completed Class 12", Icon: Check },
                { id: "other", name: "I'm exploring early", Icon: CompassIcon },
              ]
            : [
                { id: "english", name: "English", Icon: Globe },
                { id: "hindi", name: "हिन्दी · Hindi", Icon: Globe },
                { id: "telugu", name: "తెలుగు · Telugu", Icon: Globe },
              ];
  function select(value: string) {
    if (!started.current) {
      started.current = true;
      void track({ event: "discovery_started" });
    }
    setAnswers((prev) => prev.map((answer, index) => (index === step ? value : answer)));
  }
  async function generate() {
    setPending(true);
    setStage(0);
    setError(null);
    try {
      await ensureVisitor();
      const response = await fetch("/api/generate-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest: answers[0] || "farming",
          technology: answers[1] || "ai",
          project_type: idea.trim() ? "custom" : answers[2] || "solution",
          class_status: answers[3] || "class12",
          language: answers[4] || "english",
          custom_idea: idea.trim() || undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        id?: string;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok || !data.id) {
        throw new Error(
          data?.message || "We couldn't generate your project just now. Please try again.",
        );
      }
      navigate({
        to: "/project",
        search: {
          id: data.id,
          theme: answers[0],
          tech: answers[1],
          idea: idea.trim() || answers[2],
          status: answers[3],
          language: answers[4],
          source: "discovery",
        },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't generate your project just now. Please try again.",
      );
      setPending(false);
    }
  }
  function next() {
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    void generate();
  }
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(
      () => setStage((current) => Math.min(current + 1, loadingMessages.length - 1)),
      2600,
    );
    return () => clearInterval(timer);
  }, [pending]);
  return (
    <SiteShell>
      <div className="page-width wizard-width">
        <div className="wizard-topline">
          <span>
            <Sparkles size={14} className="inline mr-2 text-primary" />
            Your discovery journey
          </span>
          <span>Step {step + 1} of 5</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={(step + 1) * 20}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Discovery progress"
        >
          {steps.map((_, i) => (
            <span key={i} className={i <= step ? "progress-fill" : ""} />
          ))}
        </div>
        <div className="wizard-content" key={step}>
          <p className="eyebrow">
            {
              [
                "FOLLOW YOUR INTERESTS",
                "MEET YOUR TOOLS",
                "DREAM A LITTLE",
                "YOUR NEXT CHAPTER",
                "MAKE IT YOURS",
              ][step]
            }
          </p>
          <h1>{steps[step]?.title}</h1>
          <p>{steps[step]?.description}</p>
          <div className="choice-grid">
            {options.map(({ id, name, Icon, ...option }) => (
              <Button
                variant="ghost"
                key={id}
                aria-pressed={answers[step] === id}
                className={`choice-button ${answers[step] === id ? "choice-selected" : ""}`}
                onClick={() => select(id)}
              >
                {"image" in option && option.image ? (
                  <img src={option.image} alt="" width={100} height={65} />
                ) : (
                  <Icon />
                )}
                <strong>{name}</strong>
                {answers[step] === id && <Check className="choice-check" />}
              </Button>
            ))}
          </div>
          {step === 2 && (
            <label className="block mt-6 text-sm text-muted-foreground">
              Your own idea (optional)
              <textarea
                className="form-field mt-3"
                placeholder="I'd love to build something that…"
                maxLength={300}
                value={idea}
                onChange={(e) => {
                  setIdea(e.target.value);
                  if (e.target.value.trim()) select("custom");
                }}
              />
            </label>
          )}
          {step === 4 && (
            <p className="wizard-note">
              Your project will be written in the language you pick here.
            </p>
          )}
          {error && (
            <div className="demo-panel mt-6" role="alert">
              <div className="demo-top">
                <h2>That didn't work.</h2>
                <span className="demo-badge">Try again</span>
              </div>
              <p>{error}</p>
              <div className="modal-actions">
                <Button variant="premium" onClick={() => void generate()}>
                  <Sparkles />
                  Generate my project again
                </Button>
                <Button variant="soft" onClick={() => setError(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="wizard-footer">
          <Button
            variant="ghost"
            disabled={step === 0 || pending}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft />
            Back
          </Button>
          <Button variant="premium" disabled={!answers[step] || pending} onClick={next}>
            {step === 4 ? "Discover my project" : "Continue"}
            {step === 4 ? <Sparkles /> : <ArrowRight />}
          </Button>
        </div>
        <p className="wizard-note">
          Your five answers power a real AI generation · Nothing personal is stored
        </p>
      </div>
      {pending && (
        <div className="gen-overlay" role="status" aria-live="polite">
          <div className="gen-card">
            <Sparkles className="gen-spark" size={26} />
            <p className="eyebrow">MAKING SOMETHING JUST FOR YOU</p>
            <strong className="gen-message">{loadingMessages[stage]}</strong>
            <div className="gen-progress">
              <span style={{ width: `${((stage + 1) / loadingMessages.length) * 100}%` }} />
            </div>
            <p className="gen-hint">This usually takes a few seconds.</p>
          </div>
        </div>
      )}
    </SiteShell>
  );
}
function CompassIcon() {
  return <Rocket />;
}
