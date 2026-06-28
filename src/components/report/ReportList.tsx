import { useState } from "react";
import type { SavedReport } from "@/lib/report/storage";
import { StatusPill } from "./StatusPill";
import { ReportSummaryDialog } from "./ReportSummaryDialog";

export function ReportList({ reports }: { reports: SavedReport[] }) {
  const [selected, setSelected] = useState<SavedReport | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-rule bg-surface">
        <div className="grid grid-cols-[8rem_1fr_auto] items-center gap-4 border-b border-rule bg-surface-2 px-5 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <div>Date</div>
          <div>Report</div>
          <div className="text-right">Verdict</div>
        </div>
        <ul className="divide-y divide-rule">
          {reports.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelected(r)}
                className="grid w-full grid-cols-[8rem_1fr_auto] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2"
              >
                <div className="font-mono text-sm tabular-nums text-muted-foreground">
                  {formatShort(r.date)}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-serif text-lg font-medium text-foreground">
                    {r.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {r.subsystems.slice(0, 6).map((s) => (
                      <span
                        key={s.name}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-medium ${
                          s.status === "pass"
                            ? "bg-[var(--color-pass-soft)] text-[var(--color-pass)]"
                            : s.status === "fail"
                              ? "bg-[var(--color-fail-soft)] text-[var(--color-fail)]"
                              : s.status === "warn"
                                ? "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span className="h-1 w-1 rounded-full bg-current" />
                        {s.name}
                      </span>
                    ))}
                  </div>
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

function formatShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
