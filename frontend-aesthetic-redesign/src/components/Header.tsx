import { Badge, type BadgeTone } from "./ui/Badge";
import { Button } from "./ui/Button";
import { ExpandIcon, LockIcon, ScanGlyph } from "./Icons";

export type Phase = "Locked" | "Idle" | "Starting" | "Live" | "Stopping" | "Error";

const PHASE_TONE: Record<Phase, BadgeTone> = {
  Locked: "neutral",
  Idle: "neutral",
  Starting: "attention",
  Live: "live",
  Stopping: "attention",
  Error: "danger",
};

interface Props {
  phase: Phase;
  /** Masked key, e.g. `••••Ab3`. Null when locked. */
  keyHint: string | null;
  onProject: () => void;
  onForgetKey: () => void;
}

/** Product header: identity, connection state, and the two ways out. */
export function Header({ phase, keyHint, onProject, onForgetKey }: Props) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-lime text-ink">
            <ScanGlyph className="size-4" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[19px] leading-none">QR Attendance</span>
            <span className="label-micro mt-1 text-fg-subtle">Professor console</span>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {keyHint ? (
            <>
              <button
                type="button"
                onClick={onForgetKey}
                title="Forget this key in this tab"
                className="hidden items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 font-mono text-2xs font-bold tracking-[0.12em] text-fg-muted uppercase transition-colors hover:border-line-strong hover:text-fg sm:inline-flex"
              >
                <LockIcon className="size-3 text-lime" />
                Key {keyHint}
                <span className="text-fg-subtle">· forget</span>
              </button>
              <button
                type="button"
                onClick={onForgetKey}
                aria-label="Forget this key in this tab"
                className="grid size-8 place-items-center rounded-md border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg sm:hidden"
              >
                <LockIcon className="size-3.5 text-lime" />
              </button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 font-mono text-2xs font-bold tracking-[0.12em] text-fg-subtle uppercase">
              <LockIcon className="size-3" /> Locked
            </span>
          )}

          <span role="status" aria-live="polite">
            <Badge tone={PHASE_TONE[phase]}>{phase}</Badge>
          </span>

          <Button
            size="sm"
            variant="secondary"
            icon={<ExpandIcon className="size-3.5" />}
            onClick={onProject}
            disabled={!keyHint}
            aria-label="Open projector view"
          >
            Project
          </Button>
        </div>
      </div>
    </header>
  );
}
