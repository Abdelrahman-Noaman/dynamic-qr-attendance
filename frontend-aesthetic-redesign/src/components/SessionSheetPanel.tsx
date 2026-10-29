import type { SessionSheet, SheetDownloadNotice } from "../utils/sessionSheet";
import { cn } from "../utils/cn";
import { AlertIcon, DownloadIcon, SheetIcon } from "./Icons";
import { MagneticButton } from "./MagneticButton";

interface Props {
  /** The workbook the workflow created for this session, if there is one. */
  sheet: SessionSheet | null;
  /** True while the session is live: students are still being written. */
  live: boolean;
  notice: SheetDownloadNotice;
  onDownload: () => void;
}

/**
 * The session's own Google Sheet.
 *
 * The workflow creates a fresh workbook on Start, so this panel appears as soon
 * as the session exists and stays after Stop — that is where the professor
 * opens the sheet and downloads it as Excel.
 */
export function SessionSheetPanel({ sheet, live, notice, onDownload }: Props) {
  if (!sheet) return null;

  const busy = notice.state === "busy";

  return (
    <section
      aria-labelledby="session-sheet-title"
      className={cn(
        "mt-6 rounded-[1.5rem] border p-5",
        live ? "border-lime/40 bg-lime/[0.07]" : "border-amber/45 bg-amber/[0.07]",
      )}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full bg-ink",
            live ? "text-lime" : "text-amber",
          )}
        >
          <SheetIcon className="size-5" />
        </span>

        <div className="min-w-0">
          <h2
            id="session-sheet-title"
            className={cn(
              "font-mono text-[11px] font-bold tracking-[0.2em] uppercase",
              live ? "text-lime" : "text-amber",
            )}
          >
            {live ? "Live attendance sheet" : "Session attendance sheet"}
          </h2>
          <p className="mt-1 break-all font-mono text-[12px] leading-relaxed text-cream/85">
            {sheet.title}
          </p>
        </div>
      </header>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-cream/60">
        {live
          ? "A new sheet was created for this session. Students are written to it as they check in."
          : "Attendance is closed. Everything recorded in this session is in this sheet."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={sheet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2.5 font-mono text-[12px] font-bold tracking-[0.12em] text-cream/85 uppercase transition-colors duration-200 hover:border-lime hover:text-lime"
        >
          <SheetIcon className="size-4" />
          Open sheet
        </a>

        <MagneticButton
          id="btnDownloadSheet"
          onClick={onDownload}
          disabled={busy}
          wrapperClassName="w-full sm:w-auto"
          className={cn(
            "group inline-flex items-center gap-2.5 rounded-full bg-lime px-5 py-2.5 font-display text-[13px] font-extrabold tracking-[0.08em] text-ink uppercase",
            "disabled:cursor-wait disabled:bg-white/[0.07] disabled:text-cream/45",
          )}
        >
          <DownloadIcon className="size-4" />
          {busy ? "Preparing…" : "Download .xlsx"}
        </MagneticButton>
      </div>

      {notice.message && (
        <p
          role={notice.state === "error" ? "alert" : "status"}
          aria-live={notice.state === "error" ? "assertive" : "polite"}
          className={cn(
            "mt-3 flex items-start gap-2 font-mono text-[11px] leading-relaxed",
            notice.state === "error" ? "text-pink" : "text-cream/65",
          )}
        >
          {notice.state === "error" && <AlertIcon className="mt-0.5 size-3.5 shrink-0" />}
          <span>{notice.message}</span>
        </p>
      )}
    </section>
  );
}
