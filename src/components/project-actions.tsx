import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProjectActions({ title }: { title: string }) {
  const [dialog, setDialog] = useState<"share" | "niat" | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dialog) return;
    closeRef.current?.focus();
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setDialog(null);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [dialog]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }
  return (
    <>
      <Button
        variant="soft"
        onClick={() => {
          setCopied(false);
          setDialog("share");
        }}
      >
        <Share2 />
        Share Project
      </Button>
      <Button variant="premium" onClick={() => setDialog("niat")}>
        Explore NIAT <ArrowUpRight />
      </Button>
      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                const controls = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>("button, a[href]"),
                );
                const first = controls[0];
                const last = controls.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <Button
              ref={closeRef}
              className="modal-close"
              variant="ghost"
              size="icon"
              aria-label="Close dialog"
              onClick={() => setDialog(null)}
            >
              <X />
            </Button>
            {dialog === "share" ? (
              <>
                <Share2 className="text-primary" />
                <h2 id="dialog-title">Good ideas deserve company.</h2>
                <p>Share your sample {title} project with someone who might love it.</p>
                <div className="modal-actions">
                  <Button variant="premium" onClick={copy}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Link copied" : "Copy project link"}
                  </Button>
                  <Button variant="soft" asChild>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`${title} — my sample FutureMe AI project: ${typeof window !== "undefined" ? window.location.href : ""}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp <ArrowUpRight />
                    </a>
                  </Button>
                </div>
                {copied && (
                  <p className="notice" role="status">
                    Your project link is ready to share.
                  </p>
                )}
                {copyFailed && <p role="alert">Copy this link: {window.location.href}</p>}
              </>
            ) : (
              <>
                <span className="eyebrow">YOUR NEXT CHAPTER</span>
                <h2 id="dialog-title">Keep your curiosity moving.</h2>
                <p>
                  Explore NIAT and discover opportunities to learn technology and build real-world
                  projects.
                </p>
                <p>
                  This preview doesn't collect or submit your interest. You can explore NIAT’s
                  website directly.
                </p>
                <div className="modal-actions">
                  <Button asChild variant="premium">
                    <a href="https://www.niatindia.com/" target="_blank" rel="noreferrer">
                      Visit NIAT <ArrowUpRight />
                    </a>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
