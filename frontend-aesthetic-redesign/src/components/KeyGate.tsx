import { useState, type FormEvent } from "react";
import { checkKey } from "../api/attendanceApi";
import { Button } from "./ui/Button";
import { TextField } from "./ui/Field";
import { AlertIcon, EyeIcon, LockIcon } from "./Icons";

interface Props {
  /** Explains why the gate is on screen again (rejected key, sign-out). */
  notice?: string | null;
  onUnlock: (key: string) => void;
}

/**
 * Entry point when the page has no usable key. The key is checked against the
 * workflow before the console opens, so a typo is a clear rejection rather
 * than a dashboard that silently fails to poll.
 */
export function KeyGate({ notice, onUnlock }: Props) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = value.trim();
    if (!candidate || checking) return;

    setChecking(true);
    setError(null);
    const result = await checkKey(candidate);
    setChecking(false);

    if (result.ok) {
      onUnlock(candidate);
      return;
    }
    setError(
      result.reason === "unauthorized"
        ? "That key was rejected by the attendance service. Check it and try again."
        : `${result.detail} Nothing was unlocked.`,
    );
  };

  const commandExample = `${window.location.pathname.split("/").pop() || "index.html"}?key=YOUR_KEY`;

  return (
    <section
      aria-labelledby="gate-title"
      className="rounded-xl border border-line bg-ink-2 p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <LockIcon className="size-4 text-lime" />
        <p className="label-micro text-fg-subtle">Access</p>
      </div>
      <h1 id="gate-title" className="mt-1.5 font-display text-[26px] leading-tight">
        This console needs your professor key
      </h1>
      <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">
        The key authorises session control and is checked against the attendance service before anything
        unlocks. It is never stored on the server by this page.
      </p>

      {notice && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-pink/50 bg-pink/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-pink">
          <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
          {notice}
        </p>
      )}

      <code className="mt-4 block overflow-x-auto rounded-lg border border-line bg-ink px-3 py-2.5 font-mono text-[13px] text-lime">
        {commandExample.replace("YOUR_KEY", "")}
        <span className="text-fg-muted">YOUR_KEY</span>
      </code>

      <form onSubmit={submit} className="mt-5" noValidate>
        <TextField
          label="Professor key"
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Paste your key"
          error={error}
          hint="Open the page with ?key=… in the URL, or paste the key here."
          trailing={
            <button
              type="button"
              onClick={() => setShow((current) => !current)}
              aria-pressed={show}
              aria-label={show ? "Hide key" : "Show key"}
              className="grid size-8 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-white/[0.06] hover:text-fg"
            >
              <EyeIcon off={show} className="size-4" />
            </button>
          }
        />

        <Button
          type="submit"
          variant="primary"
          size="md"
          className="mt-4"
          busy={checking}
          disabled={!value.trim()}
          icon={<LockIcon className="size-3.5" />}
        >
          {checking ? "Checking key…" : "Unlock console"}
        </Button>
      </form>

      {error && (
        <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[12px] leading-relaxed text-fg-subtle">
          <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
          If the service is unreachable the key cannot be verified — try again once the connection is back. The
          key still lives in the URL you were given, so nothing is lost.
        </p>
      )}
    </section>
  );
}
