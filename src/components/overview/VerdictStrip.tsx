import { useNavigate } from "@tanstack/react-router";
import type { SavedReport } from "@/lib/report/storage";
import { calendarStrip } from "@/lib/report/trends";
import { formatShort } from "@/lib/report/format";

export function VerdictStrip({ reports, days = 30 }: { reports: SavedReport[]; days?: number }) {
  const cells = calendarStrip(reports, days);
  const navigate = useNavigate();

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Last {days} nights
        </div>
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
          gaps = missed
        </div>
      </div>
      <div className="flex items-stretch gap-[2px]">
        {cells.map((c) => {
          const base = "flex-1 min-w-[16px] h-6 rounded-[2px] transition-opacity";
          if (!c.report) {
            return (
              <div
                key={c.date}
                title={`${formatShort(c.date)} · no report`}
                className="flex-1 min-w-[16px] h-6 border-b border-dotted border-muted-foreground/40"
              />
            );
          }
          const tone =
            c.status === "pass"
              ? "bg-[var(--color-pass)]"
              : c.status === "fail"
                ? "bg-[var(--color-fail)]"
                : c.status === "warn"
                  ? "bg-[var(--color-warn)]"
                  : "bg-muted";
          const headline = headlineMetric(c.report);
          return (
            <button
              key={c.date}
              title={`${formatShort(c.date)} · ${c.report.verdict?.label ?? "—"}${headline ? " · " + headline : ""}`}
              onClick={() => navigate({ to: "/report/$id", params: { id: c.report!.id } })}
              className={`${base} ${tone} cursor-pointer hover:opacity-80`}
            />
          );
        })}
      </div>
    </section>
  );
}

function headlineMetric(r: SavedReport): string | null {
  const m = r.metrics;
  if (!m) return null;
  if (m.mqtt_uptime_pct !== null) return `MQTT ${m.mqtt_uptime_pct.toFixed(0)}%`;
  if (m.crashes !== null) return `${m.crashes} crash${m.crashes === 1 ? "" : "es"}`;
  return null;
}
