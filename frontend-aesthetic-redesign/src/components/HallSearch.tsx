import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../utils/cn";
import { searchPlaces, type PlaceResult } from "../utils/lectureLocation";

const DEBOUNCE_MS = 450;
const MIN_QUERY = 3;

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; places: PlaceResult[] }
  | { kind: "empty"; query: string }
  | { kind: "failed" };

interface Props {
  onPick: (place: PlaceResult) => void;
}

/**
 * Place search built on Nominatim. Debounced to respect the 1 req/s policy,
 * aborts superseded requests, and reports failures separately from "no match".
 */
export function HallSearch({ onPick }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const listId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      abortRef.current?.abort();
      setState({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setState({ kind: "searching" });

    const timer = window.setTimeout(async () => {
      const outcome = await searchPlaces(trimmed, { signal: controller.signal, limit: 5 });
      if (controller.signal.aborted) return;
      if (outcome.failed) setState({ kind: "failed" });
      else if (outcome.places.length === 0) setState({ kind: "empty", query: trimmed });
      else setState({ kind: "results", places: outcome.places });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = useCallback(
    (place: PlaceResult) => {
      onPick(place);
      setQuery("");
      setState({ kind: "idle" });
      inputRef.current?.blur();
    },
    [onPick],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setQuery("");
      setState({ kind: "idle" });
      return;
    }
    // The search sits inside the hall panel, not a <form>, but Enter should
    // still never do something surprising: take the first hit.
    if (event.key === "Enter") {
      event.preventDefault();
      if (state.kind === "results" && state.places[0]) choose(state.places[0]);
    }
  };

  const open = state.kind === "results";

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="label-micro text-fg-muted">
        Find the hall
      </label>
      <div className="relative mt-1.5">
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={`${listId}-hint`}
          autoComplete="off"
          placeholder="Building, campus or address…"
          className="h-10 w-full rounded-lg border border-line bg-ink px-3 pr-9 text-sm text-fg placeholder:text-fg-subtle transition-colors hover:border-line-strong focus:border-lime focus:outline-none"
        />
        {state.kind === "searching" && (
          <span className="absolute top-1/2 right-3 -translate-y-1/2 font-mono text-2xs tracking-[0.12em] text-fg-subtle uppercase">
            …
          </span>
        )}
      </div>
      <p id={`${listId}-hint`} className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
        {MIN_QUERY}+ characters. Enter takes the first result. Search needs a connection; place results come
        from OpenStreetMap.
      </p>

      {state.kind === "results" && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Place results"
          className="mt-1.5 max-h-52 divide-y divide-line/70 overflow-auto rounded-lg border border-line bg-ink-3"
        >
          {state.places.map((place, index) => (
            <li key={`${place.latitude},${place.longitude},${place.label}`} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => choose(place)}
                className={cn(
                  "block w-full px-3 py-2 text-left text-[12px] leading-relaxed text-fg-muted transition-colors",
                  "hover:bg-lime/[0.08] hover:text-fg focus-visible:bg-lime/[0.08]",
                )}
              >
                <span className="mr-2 font-mono text-2xs text-fg-subtle">{index + 1}</span>
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.kind === "empty" && (
        <p role="status" className="mt-1.5 text-[12px] text-amber">
          No place matched “{state.query}”. Try a shorter name or drop the building number.
        </p>
      )}
      {state.kind === "failed" && (
        <p role="status" className="mt-1.5 text-[12px] text-pink">
          Search is unavailable right now — check the connection, or place the pin on the map by hand.
        </p>
      )}
    </div>
  );
}
