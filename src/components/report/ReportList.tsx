import { useState } from "react";
import type { SavedReport } from "@/lib/report/storage";
import { StatusPill } from "./StatusPill";
import { ReportSummaryDialog } from "./ReportSummaryDialog";

export function ReportList({ reports }: { reports: SavedReport[] }) {
  const [selected, setSelected] = useState<SavedReport | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-rule bg-surface">
        <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-4 border-b border-rule bg-surface-2 px-5 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <div>Date</div>
          <div>Metrics</div>
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
                  <MetricStrip report={r} />
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

function MetricStrip({ report }: { report: SavedReport }) {
  const m = report.metrics;
  if (!m) {
    return (
      <div className="truncate font-serif text-base font-medium text-foreground">
        {report.title}
      </div>
    );
  }
  const parts: { label: string; value: string }[] = [];
  if (m.mqtt_uptime_pct !== null)
    parts.push({ label: "MQTT", value: `${m.mqtt_uptime_pct.toFixed(0)}%` });
  if (m.motion_completion_pct !== null)
    parts.push({ label: "Motion", value: `${m.motion_completion_pct.toFixed(0)}%` });
  if (m.dns_failures_per_hour !== null)
    parts.push({ label: "DNS", value: m.dns_failures_per_hour.toFixed(0) });
  if (m.flagged_movements !== null)
    parts.push({ label: "Flag", value: m.flagged_movements.toString() });
  if (m.crashes !== null && m.crashes > 0)
    parts.push({ label: "Crash", value: m.crashes.toString() });

  return (
    <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-foreground">
      {parts.map((p) => (
        <span key={p.label} className="inline-flex items-baseline gap-1">
          <span className="text-muted-foreground">{p.label}</span>
          <span className="font-medium">{p.value}</span>
        </span>
      ))}
      {parts.length === 0 && (
        <span className="truncate font-serif text-base font-medium not-italic text-foreground">
          {report.title}
        </span>
      )}
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
