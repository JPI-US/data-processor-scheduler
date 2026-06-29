// Deterministic trend math. No model in the loop. Series come from the
// metrics block (extractMetrics); judgments are σ + domain floor for
// continuous metrics, and any-failure-in-window for discrete statuses.

import type { SavedReport } from "./storage";
import type { CardSpec, AxumMetrics } from "./metrics";

export type Severity = "ok" | "warn" | "fail";

export interface NumericPoint {
  date: string;
  value: number | null;
}

export interface NumericRegression {
  kind: "numeric";
  metric: keyof AxumMetrics;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  severity: Severity;
  reason: string | null;
}

/**
 * Build a chronological (oldest → newest) series for one metric across the
 * given reports, deduped by session date (most recently uploaded wins).
 */
export function numericSeries(reports: SavedReport[], key: keyof AxumMetrics): NumericPoint[] {
  const byDate = new Map<string, SavedReport>();
  for (const r of reports) {
    const prev = byDate.get(r.date);
    if (!prev || r.uploadedAt > prev.uploadedAt) byDate.set(r.date, r);
  }
  const sorted = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.map((r) => {
    const v = r.metrics ? (r.metrics[key] as number | null | undefined) : null;
    return { date: r.date, value: typeof v === "number" ? v : null };
  });
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/**
 * Regression: flag iff (current is >1σ worse than trailing-7 baseline) AND
 * (delta exceeds the metric's domain floor / ratio). Both conditions
 * required — keeps noise out and respects "don't trend tiny absolute moves".
 */
export function regressionFor(series: NumericPoint[], card: CardSpec): NumericRegression {
  const valued = series.filter((p): p is NumericPoint & { value: number } => p.value !== null);
  const current = valued.length ? valued[valued.length - 1].value : null;
  const history = valued
    .slice(0, -1)
    .slice(-7)
    .map((p) => p.value);
  if (history.length < 3 || current === null) {
    return {
      kind: "numeric",
      metric: card.key,
      current,
      baseline: history.length ? mean(history) : null,
      delta: null,
      severity: "ok",
      reason: null,
    };
  }
  const baseline = mean(history);
  const sigma = stddev(history);
  const rawDelta = current - baseline;
  const worse = card.direction === "higher-better" ? rawDelta < 0 : rawDelta > 0;
  const sigmaWorse = sigma === 0 ? Math.abs(rawDelta) > 0 : Math.abs(rawDelta) > sigma;

  let floorCrossed = false;
  let reason: string | null = null;
  if (worse) {
    if (card.ratio && baseline > 0) {
      const ratio = current / baseline;
      if (card.direction === "lower-better" && ratio >= card.ratio && current >= card.floor) {
        floorCrossed = true;
        reason = `${ratio.toFixed(1)}× 7-night baseline`;
      }
    }
    if (!floorCrossed && Math.abs(rawDelta) >= card.floor) {
      floorCrossed = true;
      const sign = rawDelta < 0 ? "▼" : "▲";
      reason = `${sign} ${Math.abs(rawDelta).toFixed(1)} vs 7d`;
    }
  }

  const severity: Severity = worse && sigmaWorse && floorCrossed ? "warn" : "ok";
  return {
    kind: "numeric",
    metric: card.key,
    current,
    baseline,
    delta: rawDelta,
    severity,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Calendar-indexed verdict strip. Build a 30-day date axis ending today and
// slot reports into it by session_date. Empty slots are gaps — the missing
// pipeline night IS the signal.
// ---------------------------------------------------------------------------

export type VerdictCell =
  | { date: string; report: SavedReport; status: "pass" | "fail" | "warn" | null }
  | { date: string; report: null; status: null };

export function calendarStrip(
  reports: SavedReport[],
  days = 30,
  end: Date = new Date(),
): VerdictCell[] {
  const byDate = new Map<string, SavedReport>();
  for (const r of reports) {
    const prev = byDate.get(r.date);
    if (!prev || r.uploadedAt > prev.uploadedAt) byDate.set(r.date, r);
  }
  const out: VerdictCell[] = [];
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const r = byDate.get(iso);
    if (r) out.push({ date: iso, report: r, status: r.verdict?.status ?? null });
    else out.push({ date: iso, report: null, status: null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Streak callout. Tiebreaker: verdict streak (length ≥ 2) wins; else nothing.
// ---------------------------------------------------------------------------

export interface Streak {
  kind: "verdict";
  status: "pass" | "fail" | "warn";
  length: number;
}

export function verdictStreak(reports: SavedReport[]): Streak | null {
  if (reports.length === 0) return null;
  const sorted = [...reports].sort((a, b) => (a.date < b.date ? 1 : -1));
  const head = sorted[0].verdict?.status;
  if (!head) return null;
  let n = 0;
  for (const r of sorted) {
    if (r.verdict?.status === head) n++;
    else break;
  }
  if (n < 2) return null;
  return { kind: "verdict", status: head, length: n };
}

// ---------------------------------------------------------------------------
// Homing summary (status, not trend). Reads two booleans per night across the
// trailing-N window; flag = any failure.
// ---------------------------------------------------------------------------

export interface HomingSummary {
  windowNights: number;
  failedNights: number;
  cleanStreak: number;
  ok: boolean;
}

export function homingSummary(reports: SavedReport[], window = 7): HomingSummary {
  const sorted = [...reports].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, window);
  let failedNights = 0;
  let cleanStreak = 0;
  let streakBroken = false;
  for (const r of sorted) {
    const m = r.metrics;
    if (!m) continue;
    const startup = m.homing_startup_ok;
    const sleep = m.homing_sleep_ok;
    const known = startup !== null || sleep !== null;
    if (!known) continue;
    const failed = startup === false || sleep === false;
    if (failed) {
      failedNights++;
      streakBroken = true;
    } else if (!streakBroken) {
      cleanStreak++;
    }
  }
  return {
    windowNights: sorted.length,
    failedNights,
    cleanStreak,
    ok: failedNights === 0,
  };
}

// ---------------------------------------------------------------------------
// Stale-data guard. Amber chip when no report has landed in > maxHours.
// ---------------------------------------------------------------------------

export function isStale(
  reports: SavedReport[],
  maxHours = 36,
): { stale: boolean; hours: number | null; latest: string | null } {
  if (reports.length === 0) return { stale: false, hours: null, latest: null };
  const latest = reports[0]; // already sorted desc by date in storage
  const latestDate = new Date(latest.date + "T00:00:00");
  const hours = (Date.now() - latestDate.getTime()) / 36e5;
  return { stale: hours > maxHours, hours, latest: latest.date };
}
