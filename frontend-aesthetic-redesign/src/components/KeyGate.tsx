import { useState, type FormEvent } from "react";
import { EyeIcon, LockIcon } from "./Icons";
import { MagneticButton } from "./MagneticButton";

/** Shown when the page is opened without ?key=… — keeps the original message, adds a way in. */
export function KeyGate() {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const k = value.trim();
    if (!k) return;
    const url = new URL(window.location.href);
    url.searchParams.set("key", k);
    window.location.assign(url.toString());
  };

  return (
    <div
      id="no-key"
      role="alert"
      className="relative rounded-[2rem] border-2 border-pink bg-pink/[0.07] p-6 sm:p-8"
    >
      <span className="absolute -top-3.5 left-6 flex items-center gap-1.5 rounded-full bg-pink px-3.5 py-1 font-mono text-[11px] font-bold tracking-[0.2em] text-ink uppercase">
        <LockIcon className="size-3" />
        Access locked
      </span>

      <p className="font-display text-[clamp(1.15rem,2.4vw,1.6rem)] leading-tight font-semibold tracking-tight">
        Open this page with your key in the URL:
      </p>
      <code className="mt-4 block overflow-x-auto rounded-2xl bg-ink px-4 py-3.5 font-mono text-[clamp(0.8rem,2.2vw,1.05rem)] font-bold whitespace-nowrap text-lime ring-1 ring-white/10">
        professor.html?key=<span className="text-pink">YOUR_KEY</span>
      </code>

      <form onSubmit={submit} className="mt-8">
        <label
          htmlFor="key-input"
          className="font-mono text-xs font-bold tracking-[0.2em] text-pink uppercase"
        >
          Or paste your key here
        </label>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <input
              id="key-input"
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="YOUR_KEY"
              className="w-full rounded-none border-0 border-b-[3px] border-white/25 bg-transparent py-3 pr-12 font-display text-xl font-bold tracking-tight text-cream transition-[border-color] duration-200 outline-none placeholder:text-cream/25 focus:border-lime"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide key" : "Show key"}
              aria-pressed={show}
              className="absolute top-1/2 right-0 grid size-9 -translate-y-1/2 place-items-center rounded-full text-cream/70 transition-colors hover:bg-white/10 hover:text-lime"
            >
              <EyeIcon off={show} className="size-5" />
            </button>
          </div>

          <MagneticButton
            type="submit"
            disabled={!value.trim()}
            wrapperClassName="w-full sm:w-auto"
            className="group relative isolate flex items-center justify-center gap-3 overflow-hidden rounded-full bg-lime px-8 py-4 font-display text-base font-extrabold tracking-wide text-ink uppercase disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-cream/45 disabled:hatch"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-[-10%] top-full -z-10 h-[190%] rounded-[50%] bg-pink transition-[top] duration-500 ease-snap group-hover:top-[-45%] group-disabled:hidden"
            />
            Unlock
            <LockIcon className="size-4" />
          </MagneticButton>
        </div>
      </form>
    </div>
  );
}
