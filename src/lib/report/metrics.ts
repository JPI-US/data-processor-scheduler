// metrics.ts — read the deterministic <!--axum-metrics--> block that
// process_log.py emits at the top of each report.
//
// Contract (Phase 0): Python counts the hard numbers from the log; the UI
// trends THESE, never the model's prose. This reader extracts the block,
// parses it defensively (never throws), and returns typed metrics — or null
// for older reports that predate the block, so the list still renders.

export interface AxumMetrics {
  schema: number;
  session_date: string;
  firmware: string | null;
  session_minutes: number;
  boots: number;
  crashes: number;
  crash_kinds: string[];
  /** Wi-Fi reconnect ESP_ERR_TIMEOUTs — the firmware's #1 bug. Tracked for
   *  history even though it isn't a default card yet. */
  wifi_reconnect_failures: number;
  movements_started: number;
  movements_completed: number;
  /** null when movements_started < 5 (too few to be meaningful). */
  motion_completion_pct: number | null;
  flagged_movements: number;
  mqtt_connects: number;
  mqtt_disconnects: number;
  /** null when session_minutes < 30 or no MQTT connect happened. */
  mqtt_uptime_pct: number | null;
  dns_failures: number;
  /** null when session_minutes < 15 (rate not meaningful on a short session). */
  dns_failures_per_hour: number | null;
  mqtt_publishes_confirmed: number;
  encoder_mode: string | null;
  nvs_ok: boolean;
  /** true = homed OK, false = attempted but not confirmed, null = not attempted. */
  homing_startup_ok: boolean | null;
  homing_sleep_ok: boolean | null;
}

/** Highest metrics-block schema this reader understands. */
const KNOWN_SCHEMA = 1;
let warnedSchema = false;

const BLOCK_RE = /<!--axum-metrics\s*([\s\S]*?)-->/;

/**
 * Extract and parse the metrics block from a raw report's markdown.
 * Returns null if the block is absent or unparseable — callers should treat
 * that as "no metrics for this night" and render the report without a data point.
 */
export function extractMetrics(source: string): AxumMetrics | null {
  const m = source.match(BLOCK_RE);
  if (!m) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(m[1].trim());
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;

  const o = raw as Record<string, unknown>;

  // Forward-compat: parse known fields, ignore unknown, never throw. A newer
  // schema is logged once, not surfaced to the user.
  const schema = num(o.schema, 0);
  if (schema > KNOWN_SCHEMA && !warnedSchema) {
    warnedSchema = true;
    console.warn(
      `axum-metrics schema ${schema} is newer than supported (${KNOWN_SCHEMA}); reading known fields only.`,
    );
  }

  return {
    schema,
    session_date: str(o.session_date) ?? "",
    firmware: str(o.firmware),
    session_minutes: num(o.session_minutes, 0),
    boots: num(o.boots, 0),
    crashes: num(o.crashes, 0),
    crash_kinds: strArray(o.crash_kinds),
    wifi_reconnect_failures: num(o.wifi_reconnect_failures, 0),
    movements_started: num(o.movements_started, 0),
    movements_completed: num(o.movements_completed, 0),
    motion_completion_pct: numOrNull(o.motion_completion_pct),
    flagged_movements: num(o.flagged_movements, 0),
    mqtt_connects: num(o.mqtt_connects, 0),
    mqtt_disconnects: num(o.mqtt_disconnects, 0),
    mqtt_uptime_pct: numOrNull(o.mqtt_uptime_pct),
    dns_failures: num(o.dns_failures, 0),
    dns_failures_per_hour: numOrNull(o.dns_failures_per_hour),
    mqtt_publishes_confirmed: num(o.mqtt_publishes_confirmed, 0),
    encoder_mode: str(o.encoder_mode),
    nvs_ok: o.nvs_ok !== false, // default true unless explicitly false
    homing_startup_ok: boolOrNull(o.homing_startup_ok),
    homing_sleep_ok: boolOrNull(o.homing_sleep_ok),
  };
}

// ---------- card contract (consumed by the overview / trends) ----------

export interface MetricCardConfig {
  key: keyof AxumMetrics;
  label: string;
  unit: "pct" | "count" | "rate";
  /** Which direction is a regression, for badge color + threshold sign. */
  worseDirection: "up" | "down";
}

/**
 * The four headline cards on the overview. The 4th slot is intentionally
 * swappable — change this one line to trade DNS/hr for flagged movements,
 * wifi_reconnect_failures, etc., without touching components.
 */
export const DEFAULT_CARDS: MetricCardConfig[] = [
  { key: "mqtt_uptime_pct", label: "MQTT uptime", unit: "pct", worseDirection: "down" },
  { key: "motion_completion_pct", label: "Motion completion", unit: "pct", worseDirection: "down" },
  { key: "dns_failures_per_hour", label: "DNS / hr", unit: "rate", worseDirection: "up" },
  { key: "crashes", label: "Crashes", unit: "count", worseDirection: "up" },
];

// ---------- defensive coercion helpers ----------

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
