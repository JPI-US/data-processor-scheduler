import { useEffect, useState } from "react";

/** Capture health published by capture_daemon.py to reports/capture-status.json.
 *  Read over the same /reports passthrough as the reports themselves. */
export interface CaptureStatus {
  state?: "capturing" | "reattaching" | "starting" | "stopped";
  heartbeat_at?: string;
  last_line_at?: string | null;
  current_slice?: string;
  next_rollover?: string;
  lines_today?: number;
  started_at?: string;
  pid?: number;
}

/** Poll the capture heartbeat. Returns null when the daemon has never written a
 *  status file (older capture, or not running). Refreshes on a short timer and
 *  on tab focus so "capture live" feels live without a manual refresh. */
export function useCaptureStatus(pollMs = 30000): CaptureStatus | null {
  const [status, setStatus] = useState<CaptureStatus | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/reports/capture-status.json", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<CaptureStatus>) : null))
        .then((d) => active && setStatus(d))
        .catch(() => active && setStatus(null));

    load();
    const timer = setInterval(load, pollMs);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [pollMs]);

  return status;
}
