// Deterministic metrics contract emitted by process_log.py at the top of each
// report as a <!--axum-metrics ... --> JSON block. The reader is forward-
// compatible: unknown fields are ignored, missing fields become null, parse
// errors return null. Older reports without the block simply have no metrics.

export const METRICS_SCHEMA = 1;

export interface AxumMetrics {
  schema: number;
  session_date: string | null;
  firmware: string | null;
  session_minutes: number | null;
  boots: number | null;
  crashes: number | null;
  crash_kinds: string[];
  /** Wi-Fi reconnect ESP_ERR_TIMEOUTs — the firmware's #1 bug. Tracked for
   *  history even though it isn't a default card yet. */
  wifi_reconnect_failures: number | null;
  movements_started: number | null;
  movements_completed: number | null;
  motion_completion_pct: number | null;
  flagged_movements: number | null;
  mqtt_connects: number | null;
  mqtt_disconnects: number | null;
  mqtt_uptime_pct: number | null;
  /** Publish attempts vs. confirmed sends, and the reconnect-cascade count — the
   *  decisive MQTT health signals for carried-over sessions with no connect event. */
  mqtt_publish_attempts: number | null;
  mqtt_reconnect_failures: number | null;
  dns_failures: number | null;
  dns_failures_per_hour: number | null;
  mqtt_publishes_confirmed: number | null;
  encoder_mode: string | null;
  nvs_ok: boolean | null;
  homing_startup_ok: boolean | null;
  homing_sleep_ok: boolean | null;
  /** True when the day ran continuously with no reboot (a healthy, not abnormal, state). */
  session_continuous: boolean | null;
}

const NUM_KEYS: (keyof AxumMetrics)[] = [
  "session_minutes",
  "boots",
  "crashes",
  "wifi_reconnect_failures",
  "movements_started",
  "movements_completed",
  "motion_completion_pct",
  "flagged_movements",
  "mqtt_connects",
  "mqtt_disconnects",
  "mqtt_uptime_pct",
  "mqtt_publish_attempts",
  "mqtt_reconnect_failures",
  "dns_failures",
  "dns_failures_per_hour",
  "mqtt_publishes_confirmed",
];

const STR_KEYS: (keyof AxumMetrics)[] = ["session_date", "firmware", "encoder_mode"];
const BOOL_KEYS: (keyof AxumMetrics)[] = [
  "nvs_ok",
  "homing_startup_ok",
  "homing_sleep_ok",
  "session_continuous",
];

let warnedNewerSchema = false;

export function extractMetrics(markdown: string): AxumMetrics | null {
  // Match the first HTML comment that starts with `axum-metrics`.
  const m = markdown.match(/<!--\s*axum-metrics\s*([\s\S]*?)-->/);
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;

  const out: AxumMetrics = {
    schema: typeof src.schema === "number" ? src.schema : 1,
    session_date: null,
    firmware: null,
    session_minutes: null,
    boots: null,
    crashes: null,
    crash_kinds: [],
    wifi_reconnect_failures: null,
    movements_started: null,
    movements_completed: null,
    motion_completion_pct: null,
    flagged_movements: null,
    mqtt_connects: null,
    mqtt_disconnects: null,
    mqtt_uptime_pct: null,
    mqtt_publish_attempts: null,
    mqtt_reconnect_failures: null,
    dns_failures: null,
    dns_failures_per_hour: null,
    mqtt_publishes_confirmed: null,
    encoder_mode: null,
    nvs_ok: null,
    homing_startup_ok: null,
    homing_sleep_ok: null,
    session_continuous: null,
  };

  const sink = out as unknown as Record<string, unknown>;
  for (const k of NUM_KEYS) {
    const v = src[k as string];
    if (typeof v === "number" && Number.isFinite(v)) sink[k as string] = v;
  }
  for (const k of STR_KEYS) {
    const v = src[k as string];
    if (typeof v === "string" && v.length > 0) sink[k as string] = v;
  }
  for (const k of BOOL_KEYS) {
    const v = src[k as string];
    if (typeof v === "boolean") sink[k as string] = v;
  }

  if (Array.isArray(src.crash_kinds)) {
    out.crash_kinds = src.crash_kinds.filter((x): x is string => typeof x === "string").slice(0, 5);
  }

  if (out.schema > METRICS_SCHEMA && !warnedNewerSchema) {
    warnedNewerSchema = true;

    console.warn(`axum-metrics schema ${out.schema} newer than reader (${METRICS_SCHEMA})`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Headline metric cards (sparkline overview). Locked to four continuous
// metrics that behave well under σ + domain floor. Homing is a discrete
// status and is rendered separately in the masthead — do not add here.
// ---------------------------------------------------------------------------

export type CardDirection = "higher-better" | "lower-better";

export interface CardSpec {
  key: keyof AxumMetrics;
  label: string;
  /** Domain floor for regression flag. Units depend on direction. */
  floor: number;
  /** Multiplier comparison for ratios (e.g. DNS rate × baseline). */
  ratio?: number;
  direction: CardDirection;
  /** Formatter for the headline number on the card. */
  format: (v: number) => string;
  /** Suffix appended after the formatted number, e.g. "%" or " /hr". */
  suffix?: string;
}

const pct = (v: number) => v.toFixed(v >= 99.95 ? 0 : 1);
const intFmt = (v: number) => Math.round(v).toString();
const oneDec = (v: number) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1));

export const DEFAULT_CARDS: CardSpec[] = [
  {
    key: "mqtt_uptime_pct",
    label: "MQTT uptime",
    floor: 1, // >1pp drop
    direction: "higher-better",
    format: pct,
    suffix: "%",
  },
  {
    key: "motion_completion_pct",
    label: "Motion completion",
    floor: 5, // >5pp drop
    direction: "higher-better",
    format: pct,
    suffix: "%",
  },
  {
    key: "dns_failures_per_hour",
    label: "DNS failures",
    floor: 10, // must be at least 10/hr before ratio matters
    ratio: 2, // >2× baseline
    direction: "lower-better",
    format: oneDec,
    suffix: " /hr",
  },
  {
    key: "crashes",
    label: "Crashes",
    floor: 1, // any new crash above baseline
    direction: "lower-better",
    format: intFmt,
  },
];
