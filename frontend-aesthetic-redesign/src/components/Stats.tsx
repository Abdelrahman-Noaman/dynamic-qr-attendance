interface Item {
  label: string;
  value: string;
}

/** Editorial data strip — every value is read from the live session. */
export function Stats({ items }: { items: Item[] }) {
  return (
    <section
      aria-label="Session details"
      className="mx-auto max-w-[1500px] animate-fade-up px-5 [animation-delay:1100ms] sm:px-10"
    >
      <dl className="grid grid-cols-2 border-t border-l border-white/15 md:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.label}
            className="group relative isolate overflow-hidden border-r border-b border-white/15 p-4 sm:p-6"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 -z-10 translate-y-full bg-lime transition-transform duration-500 ease-snap group-hover:translate-y-0"
            />
            <dt className="font-mono text-[11px] font-bold tracking-[0.2em] text-pink uppercase transition-colors duration-300 group-hover:text-ink">
              {it.label}
            </dt>
            <dd
              className="mt-2 truncate font-display text-xl font-bold tracking-tight transition-colors duration-300 group-hover:text-ink sm:text-3xl"
              title={it.value}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
