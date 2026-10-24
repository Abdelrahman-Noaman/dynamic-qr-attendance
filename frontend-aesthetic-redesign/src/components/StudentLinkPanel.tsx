import { useEffect, useRef, useState } from "react";
import { STUDENT_URL } from "../config";
import { CheckIcon, CopyIcon, ExternalIcon } from "./Icons";
import { Button } from "./ui/Button";
import { Panel } from "./ui/Panel";

/**
 * The student page URL, for pasting into a slide deck or the course group.
 * Tokens rotate every few seconds, so only the stable page URL is shared.
 */
export function StudentLinkPanel({ className }: { className?: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(STUDENT_URL);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied("idle"), 3_000);
  };

  return (
    <Panel
      className={className}
      kicker="Student side"
      title="Sign-in page"
      compact
      description="Students open this and scan the rotating code. The code itself carries the session and a single-use ticket."
    >
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={STUDENT_URL}
          aria-label="Student attendance page URL"
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-ink px-2.5 font-mono text-[11px] text-fg-muted"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={copy}
          icon={copied === "copied" ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          aria-live="polite"
        >
          {copied === "copied" ? "Copied" : "Copy"}
        </Button>
        <a
          href={STUDENT_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 font-mono text-2xs font-bold tracking-[0.12em] text-fg-muted uppercase transition-colors hover:border-line-strong hover:text-fg"
        >
          Open <ExternalIcon className="size-3" />
        </a>
      </div>
      <p role="status" className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
        {copied === "failed"
          ? "Your browser blocked clipboard access — select the URL above and copy it manually."
          : copied === "copied"
            ? "Student page URL copied."
            : "This is the page URL only; live tickets are never shared outside the QR code."}
      </p>
    </Panel>
  );
}
