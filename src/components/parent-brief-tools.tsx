import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  MessageCircleQuestion,
  PhoneCall,
  Share2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { parentShareMessage } from "@/lib/family-copy";
import { isCounsellorFallback } from "@/lib/journey-copy";
import type { ParentLanguage } from "@/lib/parent-experience";
import { parentBriefUrl } from "@/lib/sharing";
import { ensureVisitor, track } from "@/lib/tracking";

export function ParentBriefShare({
  briefId,
  language,
  referralCode,
}: {
  briefId: string;
  language: ParentLanguage;
  referralCode?: string | null | undefined;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    setUrl(parentBriefUrl(window.location.origin, briefId, referralCode));
  }, [briefId, referralCode]);

  function shared(channel: "copy" | "whatsapp") {
    void track({ event: "parent_brief_shared", brief_id: briefId, channel });
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
      shared("copy");
    } catch {
      setCopyFailed(true);
    }
  }
  return (
    <div className="parent-share-tools">
      {url && <code className="share-link">{url}</code>}
      <div className="parent-share-buttons">
        <Button variant="soft" disabled={!url} onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />} {copied ? "Brief link copied" : "Copy brief link"}
        </Button>
        <Button variant="soft" asChild disabled={!url}>
          <a
            href={
              url
                ? `https://wa.me/?text=${encodeURIComponent(parentShareMessage(language, url))}`
                : undefined
            }
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => shared("whatsapp")}
          >
            <Share2 /> WhatsApp <ArrowUpRight />
          </a>
        </Button>
      </div>
      {copyFailed && <p role="alert">Copy this link: {url}</p>}
    </div>
  );
}

function CallButton() {
  return (
    <Button asChild variant="soft">
      <a href="#counsellor-request">
        <PhoneCall /> Request a call
      </a>
    </Button>
  );
}

export function ParentQuestionBox({ briefId }: { briefId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(3);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await ensureVisitor();
      const response = await fetch("/api/parent-question", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ brief_id: briefId, question }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        answer?: string;
        remaining?: number;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok || !data.answer) {
        if (response.status === 429) setRemaining(0);
        throw new Error(data?.message || "The answer couldn't be prepared. Please try again.");
      }
      setAnswer(data.answer);
      setRemaining(data.remaining ?? 0);
      setQuestion("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The answer couldn't be prepared. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="demo-panel parent-question-box">
      <div className="demo-top">
        <h2>Ask a grounded question.</h2>
        <span className="demo-badge">{remaining} of 3 left</span>
      </div>
      <p>
        Answers use only this brief and the verified NIAT fact sheet. Anything outside them is
        referred to a counsellor.
      </p>
      {remaining === 0 ? (
        <div className="qa-card qa-limit" role="status">
          <strong>You've asked all three questions for this brief.</strong>
          <p>A NIAT counsellor can answer anything else. There is no rush.</p>
          <CallButton />
        </div>
      ) : (
        <form onSubmit={(event) => void ask(event)}>
          <label className="family-field">
            Your question
            <textarea
              aria-describedby={error ? "parent-question-error" : undefined}
              className="form-field mt-2"
              value={question}
              maxLength={300}
              minLength={2}
              disabled={pending || remaining === 0}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What would you like to understand?"
              required
            />
          </label>
          <div className="modal-actions">
            <Button
              variant="premium"
              type="submit"
              disabled={pending || remaining === 0 || question.trim().length < 2}
            >
              <MessageCircleQuestion /> {pending ? "Checking the facts…" : "Ask question"}
            </Button>
          </div>
        </form>
      )}
      {pending && (
        <p className="form-status" role="status">
          Checking the brief and the NIAT facts…
        </p>
      )}
      {error && remaining > 0 && (
        <p id="parent-question-error" className="form-error" role="alert">
          {error}
        </p>
      )}
      {answer &&
        (isCounsellorFallback(answer) ? (
          <div className="qa-card qa-fallback" aria-live="polite">
            <strong>We can't answer that from the verified facts.</strong>
            <p>Please ask a NIAT counsellor.</p>
            <CallButton />
          </div>
        ) : (
          <div className="parent-answer qa-card" aria-live="polite">
            <strong>
              <ShieldCheck size={13} aria-hidden="true" /> From verified NIAT facts
            </strong>
            <p>{answer}</p>
          </div>
        ))}
    </section>
  );
}
