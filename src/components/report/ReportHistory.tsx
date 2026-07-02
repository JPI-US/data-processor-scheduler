import { useEffect, useState } from "react";
import {
  fetchRunLog,
  fetchSupersededReport,
  type RunLogEntry,
  type SavedReport,
} from "@/lib/report/storage";
import type { Status } from "@/lib/report/parse";
import { formatDateTime } from "@/lib/report/format";
import { StatusPill } from "./StatusPill";

/** Map a run-log verdict string ("PASS"/"WARN"/"FAIL") to a pill Status. */
function toStatus(verdict: string | null): Status {
  const v = (verdict ?? "").toLowerCase();
  return v === "pass" || v === "warn" || v === "fail" ? (v as Status) : null;
}

/** The pipeline's run history for one report date: when it was generated, from
 *  which raw slice, and — when a run replaced an earlier report — a way to view
 *  the superseded version inline. Driven entirely by reports/run-log.jsonl. */
export function ReportHistory({ date }: { date: string }) {
  const [runs, setRuns] = useState<RunLogEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchRunLog().then((all) => {
      if (!active) return;
      const forDate = all.filter((r) => r.date === date).sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first
      setRuns(forDate);
    });
    return () => {
      active = false;
    };
  }, [date]);

  // Quiet until loaded; nothing to show if the log has no record for this date.
  if (!runs || runs.length === 0) return null;

  return (
    <div>
      <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Run history
        <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/70">
          {runs.length} {runs.length === 1 ? "run" : "runs"}
        </span>
      </div>
      <ul className="divide-y divide-rule rounded-lg border border-rule">
        {runs.map((run, i) => (
          <RunRow key={`${run.at}-${i}`} run={run} current={i === 0} />
        ))}
      </ul>
    </div>
  );
}

function RunRow({ run, current }: { run: RunLogEntry; current: boolean }) {
  const [prev, setPrev] = useState<SavedReport | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!run.superseded) return;
    if (!open && !prev) {
      setLoading(true);
      setPrev(await fetchSupersededReport(run.superseded));
      setLoading(false);
    }
    setOpen((o) => !o);
  };

  return (
    <li className="px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusPill status={toStatus(run.verdict)} />
          <span className="tabular-nums text-foreground">{formatDateTime(run.at) ?? run.at}</span>
          {current && (
            <span className="rounded bg-muted px-1 py-0.5 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              current
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="font-mono">{run.source_log}</span>
          {run.superseded && (
            <button
              onClick={toggle}
              className="rounded-md px-1.5 py-0.5 text-foreground underline-offset-2 hover:bg-muted hover:underline"
            >
              {loading ? "loading…" : open ? "hide previous" : "view previous"}
            </button>
          )}
        </div>
      </div>

      {open && prev && (
        <div className="mt-2 rounded-md border border-rule bg-surface px-3 py-2">
          <div className="flex items-center gap-2">
            <StatusPill status={prev.verdict?.status ?? null} label={prev.verdict?.label} />
            <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              superseded version
            </span>
          </div>
          {prev.verdict?.summary && (
            <p className="mt-1.5 leading-relaxed text-foreground">
              {prev.verdict.summary.replace(/\n/g, " ")}
            </p>
          )}
        </div>
      )}
      {open && !prev && !loading && (
        <div className="mt-2 text-muted-foreground">Previous version unavailable.</div>
      )}
    </li>
  );
}
