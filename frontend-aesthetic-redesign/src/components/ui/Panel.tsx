import { useId, type ReactNode } from "react";
import { cn } from "../../utils/cn";

interface PanelProps {
  /** Section heading, rendered as the panel's h2. */
  title: string;
  /** Small uppercase label above the title (e.g. a step or category). */
  kicker?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Tighter padding for dense panels (attendance figures). */
  compact?: boolean;
}

/**
 * The single container style in the product: flat surface, hairline border,
 * 12px radius. No shadows, no glass — density and borders carry structure.
 */
export function Panel({ title, kicker, description, actions, children, className, id, compact }: PanelProps) {
  const reactId = useId();
  const headingId = `${id ?? reactId}-title`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "rounded-xl border border-line bg-ink-2",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-6",
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {kicker && <p className="label-micro text-fg-subtle">{kicker}</p>}
          <h2 id={headingId} className={cn("font-display leading-tight", compact ? "text-xl" : "text-2xl")}>
            {title}
          </h2>
          {description && <div className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-muted">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
