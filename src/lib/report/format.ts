// Shared date/time formatting. Report dates are date-only ("2026-06-28"); we
// pin them to local midnight so the label never shifts across timezones. Capture
// heartbeat timestamps are full ISO and handled by ago() / clockTime().

function atLocalMidnight(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** "Jun 28" */
export function formatShort(iso: string): string {
  const d = atLocalMidnight(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Jun 28, 2026" */
export function formatLong(iso: string): string {
  const d = atLocalMidnight(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** "Sunday, June 28, 2026" */
export function formatFull(iso: string): string {
  const d = atLocalMidnight(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Human "3s ago" / "4m ago" from a full ISO timestamp, plus the raw age in
 *  seconds so callers can threshold on it. Returns null for missing/bad input. */
export function ago(iso?: string | null): { text: string; secs: number } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const secs = Math.max(0, (Date.now() - t) / 1000);
  if (secs < 90) return { text: `${Math.round(secs)}s ago`, secs };
  if (secs < 3600) return { text: `${Math.round(secs / 60)}m ago`, secs };
  if (secs < 86400) return { text: `${Math.round(secs / 3600)}h ago`, secs };
  return { text: `${Math.round(secs / 86400)}d ago`, secs };
}

/** "23:00" from a full ISO timestamp. */
export function clockTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
