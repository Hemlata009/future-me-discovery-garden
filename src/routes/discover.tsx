import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
      "Explore your interests and find a beginner-friendly sample project that feels like you.",
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
    description: "Choose your preferred language for a future guided experience.",
  },
];
function Discover() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(["", "", "", "", ""]);
  const [idea, setIdea] = useState("");
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
    setAnswers((prev) => prev.map((answer, index) => (index === step ? value : answer)));
  }
  function next() {
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    const interest = answers[0] ?? "farming";
    const theme = ["farming", "gaming", "robotics"].includes(interest)
      ? interest
      : interest === "creativity"
        ? "gaming"
        : interest === "science"
          ? "robotics"
          : "farming";
    navigate({
      to: "/project",
      search: {
        theme,
        tech: answers[1],
        idea: idea.trim() || answers[2],
        status: answers[3],
        language: answers[4],
        source: "discovery",
      },
    });
  }
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
              Sample projects are currently in English. Your language preference stays with this
              discovery.
            </p>
          )}
        </div>
        <div className="wizard-footer">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ArrowLeft />
            Back
          </Button>
          <Button variant="premium" disabled={!answers[step]} onClick={next}>
            {step === 4 ? "Discover my project" : "Continue"}
            {step === 4 ? <Sparkles /> : <ArrowRight />}
          </Button>
        </div>
        <p className="wizard-note">
          A sample discovery experience · No AI calls or personal data storage
        </p>
      </div>
    </SiteShell>
  );
}
function CompassIcon() {
  return <Rocket />;
}
