import type { SavedReport } from "@/lib/report/storage";
import { verdictStreak, homingSummary, isStale } from "@/lib/report/trends";
import { AlertTriangle } from "lucide-react";

export function Masthead({ reports }: { reports: SavedReport[] }) {
  const latest = reports[0];
  const streak = verdictStreak(reports);
  const homing = homingSummary(reports);
  const stale = isStale(reports);

  const latestLabel = latest?.verdict?.label ?? "—";
  const latestTone =
    latest?.verdict?.status === "fail"
      ? "text-[var(--color-fail)]"
      : latest?.verdict?.status === "warn"
        ? "text-[var(--color-warn)]"
        : latest?.verdict?.status === "pass"
          ? "text-[var(--color-pass)]"
          : "text-muted-foreground";

  return (
    <header className="mb-8 border-b border-rule pb-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Axum Tower · Nightly
        </div>
        {latest && (
          <div className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatLong(latest.date)}
          </div>
        )}
      </div>

      <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        {latest ? (
          <>
            Latest verdict: <span className={latestTone}>{latestLabel}</span>
            {streak && (
              <span className="ml-2 text-muted-foreground text-xl sm:text-2xl">
                · {ordinal(streak.length)} consecutive {streak.status}ing night
              </span>
            )}
          </>
        ) : (
          "Awaiting first report"
        )}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <HomingChip
          ok={homing.ok}
          failed={homing.failedNights}
          clean={homing.cleanStreak}
          window={homing.windowNights}
        />
        {stale.stale && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-warn)]">
            <AlertTriangle className="h-3 w-3" />
            No report since {formatShort(stale.latest!)} ({Math.round(stale.hours!)}h)
          </span>
        )}
      </div>
    </header>
  );
}

function HomingChip({
  ok,
  failed,
  clean,
  window,
}: {
  ok: boolean;
  failed: number;
  clean: number;
  window: number;
}) {
  if (window === 0) {
    return (
      <span className="text-muted-foreground">
        Homing: <span className="font-mono">—</span>
      </span>
    );
  }
  if (ok) {
    return (
      <span className="text-muted-foreground">
        Homing:{" "}
        <span className="text-[var(--color-pass)] font-medium">
          ✓ clean for {clean} night{clean === 1 ? "" : "s"}
        </span>
      </span>
    );
  }
  return (
    <span className="text-muted-foreground">
      Homing:{" "}
      <span className="text-[var(--color-fail)] font-medium">
        ✗ failed {failed} of last {window} nights
      </span>
    </span>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
