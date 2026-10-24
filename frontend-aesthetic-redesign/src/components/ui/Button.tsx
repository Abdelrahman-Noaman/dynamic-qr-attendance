import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  // The one action that matters on this page: start the session.
  primary:
    "bg-lime text-ink border-transparent hover:bg-lime-deep active:translate-y-px disabled:bg-white/10 disabled:text-fg-subtle disabled:hatch",
  secondary:
    "bg-transparent text-fg border-line-strong hover:border-lime hover:text-lime active:translate-y-px disabled:text-fg-subtle disabled:border-line",
  ghost:
    "bg-transparent text-fg-muted border-transparent hover:bg-white/[0.06] hover:text-fg disabled:text-fg-subtle",
  // Ends a live session — never the default focus of the eye.
  danger:
    "bg-transparent text-pink border-pink/60 hover:bg-pink hover:text-ink active:translate-y-px disabled:text-fg-subtle disabled:border-line",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-2xs tracking-[0.12em]",
  md: "h-10 px-4 text-xs tracking-[0.1em]",
  lg: "h-12 px-6 text-sm tracking-[0.08em]",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  /** Optional leading icon; hidden from assistive tech. */
  icon?: ReactNode;
  fullWidth?: boolean;
  /** React 19 passes refs as props; forwarded to the native button. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * One button component for the whole product: real `disabled` semantics,
 * a busy state that keeps the label stable for screen readers, and a single
 * focus treatment inherited from `index.css`.
 */
export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  ref,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-mono font-bold uppercase transition-colors duration-150 ease-out",
        "disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {icon && <span className="grid size-4 shrink-0 place-items-center">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
