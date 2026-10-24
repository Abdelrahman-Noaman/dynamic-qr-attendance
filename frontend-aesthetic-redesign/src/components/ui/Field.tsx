import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../utils/cn";

const CONTROL =
  "w-full rounded-lg border bg-ink px-3 text-fg placeholder:text-fg-subtle transition-colors duration-150 " +
  "hover:border-line-strong disabled:cursor-not-allowed disabled:bg-white/[0.03] disabled:text-fg-subtle";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  label: string;
  /** Shown under the control when there is no error. */
  hint?: ReactNode;
  error?: string | null;
  /** Rendered inside the field's right edge (e.g. a reveal toggle). */
  trailing?: ReactNode;
  labelAction?: ReactNode;
  className?: string;
}

/**
 * Labelled text input with error text wired through `aria-describedby` and
 * `aria-invalid`, so validation is announced rather than merely red.
 */
export function TextField({
  label,
  hint,
  error,
  trailing,
  labelAction,
  className,
  ...rest
}: TextFieldProps) {
  const reactId = useId();
  const inputId = `${reactId}-input`;
  const hintId = `${reactId}-hint`;
  const errorId = `${reactId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="label-micro text-fg-muted">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL,
            "h-10 pr-3 text-sm",
            trailing && "pr-10",
            error ? "border-pink" : "border-line",
            "focus:border-lime focus:outline-none",
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[12px] leading-relaxed text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-[12px] leading-relaxed text-pink">
          {error}
        </p>
      )}
    </div>
  );
}

/** Read-only key/value rows used for coordinates and timestamps. */
export function DataList({ rows }: { rows: Array<{ label: string; value: ReactNode; mono?: boolean }> }) {
  return (
    <dl className="divide-y divide-line/70 border-t border-line">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="label-micro shrink-0 text-fg-subtle">{row.label}</dt>
          <dd className={cn("min-w-0 truncate text-right text-[12px] text-fg", row.mono && "tabular")}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
