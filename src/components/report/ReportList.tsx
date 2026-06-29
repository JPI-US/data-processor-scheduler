import { useState } from "react";
import type { SavedReport } from "@/lib/report/storage";
import type { Status } from "@/lib/report/parse";
import { subsystemsFromMetrics } from "@/lib/report/subsystems";
import { StatusPill } from "./StatusPill";
import { ReportSummaryDialog } from "./ReportSummaryDialog";

export function ReportList({ reports }: { reports: SavedReport[] }) {
  const [selected, setSelected] = useState<SavedReport | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-rule bg-surface">
        <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-4 border-b border-rule bg-surface-2 px-5 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <div>Date</div>
          <div>Subsystems</div>
          <div className="text-right">Verdict</div>
        </div>
        <ul className="divide-y divide-rule">
          {reports.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelected(r)}
                className="grid w-full grid-cols-[7rem_1fr_auto] items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <div className="font-mono text-sm tabular-nums text-muted-foreground">
                  {formatShort(r.date)}
                </div>
                <div className="min-w-0">
                  <SubsystemStrip report={r} />
                </div>
                <div className="justify-self-end">
                  {r.verdict && <StatusPill status={r.verdict.status} label={r.verdict.label} />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ReportSummaryDialog
        report={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </>
  );
}

function pillClass(status: Status): string {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-medium";
  if (status === "pass") return `${base} bg-[var(--color-pass-soft)] text-[var(--color-pass)]`;
  if (status === "warn") return `${base} bg-[var(--color-warn-soft)] text-[var(--color-warn)]`;
  if (status === "fail") return `${base} bg-[var(--color-fail-soft)] text-[var(--color-fail)]`;
  return `${base} bg-muted text-muted-foreground`;
}

function SubsystemStrip({ report }: { report: SavedReport }) {
  const subs = subsystemsFromMetrics(report.metrics);
  if (subs.length === 0) {
    return (
      <div className="truncate font-serif text-base font-medium text-foreground">
        {report.title}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {subs.map((s) => (
        <span key={s.name} className={pillClass(s.status)}>
          <span className="h-1 w-1 rounded-full bg-current opacity-70" />
          {s.name}
          <span className="font-semibold tabular-nums">{s.value}</span>
        </span>
      ))}
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
