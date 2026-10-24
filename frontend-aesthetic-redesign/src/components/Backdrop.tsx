/** Fixed background: colour fields, grid, cursor spotlight and film grain. */
export function Backdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink"
      >
        <div className="absolute -top-[30%] -right-[18%] size-[80vmax] animate-drift bg-[radial-gradient(closest-side,rgba(123,44,255,0.5),transparent)]" />
        <div className="absolute -bottom-[35%] -left-[20%] size-[70vmax] animate-drift bg-[radial-gradient(closest-side,rgba(61,92,255,0.34),transparent)] [animation-direction:alternate-reverse]" />
        <div className="absolute top-[38%] left-[30%] size-[40vmax] bg-[radial-gradient(closest-side,rgba(255,62,165,0.16),transparent)]" />
        <div className="grid-lines absolute inset-0" />
        {/* cursor spotlight */}
        <div
          className="absolute top-0 left-0 size-[700px] will-change-transform"
          style={{
            transform: "translate3d(calc(var(--mx) - 350px), calc(var(--my) - 350px), 0)",
            transition: "transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)",
            background: "radial-gradient(closest-side, rgba(200,255,46,0.13), transparent)",
          }}
        />
      </div>
      <div aria-hidden="true" className="grain pointer-events-none fixed inset-0 z-50" />
    </>
  );
}
