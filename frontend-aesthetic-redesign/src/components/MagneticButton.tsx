import { useRef, type ButtonHTMLAttributes, type PointerEvent } from "react";
import { cn } from "../utils/cn";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  strength?: number;
  wrapperClassName?: string;
}

/**
 * A button whose whole body leans toward the cursor.
 * Mouse only — touch and reduced-motion users get the plain button.
 */
export function MagneticButton({
  children,
  className,
  wrapperClassName,
  strength = 0.3,
  disabled,
  type = "button",
  ...rest
}: Props) {
  const wrap = useRef<HTMLSpanElement>(null);
  const offset = useRef({ x: 0, y: 0 });

  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    const el = wrap.current;
    if (!el || disabled || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 - offset.current.x;
    const cy = r.top + r.height / 2 - offset.current.y;
    const x = (e.clientX - cx) * strength;
    const y = (e.clientY - cy) * strength;
    offset.current = { x, y };
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  const onLeave = () => {
    offset.current = { x: 0, y: 0 };
    if (wrap.current) wrap.current.style.transform = "";
  };

  return (
    <span
      ref={wrap}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn(
        "inline-block transition-transform duration-300 ease-snap will-change-transform",
        wrapperClassName
      )}
    >
      <button
        type={type}
        disabled={disabled}
        className={cn(
          "w-full select-none transition-[transform,background-color,color,border-color] duration-200 active:scale-[0.96] disabled:active:scale-100",
          className
        )}
        {...rest}
      >
        {children}
      </button>
    </span>
  );
}
