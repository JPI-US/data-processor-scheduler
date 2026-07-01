import { useCaptureStatus } from "@/lib/report/useCaptureStatus";
import { ago, clockTime } from "@/lib/report/format";

type Health = { tone: "pass" | "warn" | "fail" | "muted"; label: string };

/** Derive a single health verdict from the heartbeat + last-line ages:
 *  - offline (red)  : no status file, an old heartbeat, or an explicit stop.
 *  - no data (amber): daemon alive but no serial line recently (device silent /
 *    mid-reboot) — exactly the reboot-loop case we still want capturing.
 *  - live (green)   : heartbeat fresh and lines arriving. */
function health(hb: ReturnType<typeof ago>, line: ReturnType<typeof ago>, state?: string): Health {
  if (state === "stopped" || !hb || hb.secs > 150)
    return { tone: "fail", label: "Capture offline" };
  if (state === "reattaching") return { tone: "warn", label: "Reattaching to device" };
  if (!line || line.secs > 300) return { tone: "warn", label: "Capture up · no data" };
  return { tone: "pass", label: "Capture live" };
}

const TONE: Record<Health["tone"], string> = {
  pass: "var(--color-pass)",
  warn: "var(--color-warn)",
  fail: "var(--color-fail)",
  muted: "var(--color-muted-foreground)",
};

export function CaptureStatusBar() {
  const status = useCaptureStatus();

  // No daemon has ever published — say so plainly rather than implying health.
  if (!status) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-rule bg-surface px-3 py-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
        Capture status unavailable
      </div>
    );
  }

  const hb = ago(status.heartbeat_at);
  const line = ago(status.last_line_at);
  const h = health(hb, line, status.state);
  const rollAt = clockTime(status.next_rollover);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-rule bg-surface px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-2 font-medium" style={{ color: TONE[h.tone] }}>
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: TONE[h.tone] }}
          aria-hidden
        />
        {h.label}
      </span>
      {line && (
        <span className="text-muted-foreground">
          last line <span className="tabular-nums text-foreground">{line.text}</span>
        </span>
      )}
      {typeof status.lines_today === "number" && (
        <span className="text-muted-foreground">
          <span className="tabular-nums text-foreground">
            {status.lines_today.toLocaleString()}
          </span>{" "}
          lines today
        </span>
      )}
      {rollAt && (
        <span className="text-muted-foreground">
          next rollover <span className="tabular-nums text-foreground">{rollAt}</span>
        </span>
      )}
    </div>
  );
}
