// Derive per-subsystem status + a short display value from the deterministic
// metrics block. This is better than scraping the prose: it's always present,
// colour-coded by the same thresholds as the verdict, and carries the exact
// percentage so the list rows read "Connectivity 47%" (red), "Motion 100%"
// (green) at a glance.

import type { AxumMetrics } from "./metrics";
import type { Status } from "./parse";

export interface SubsystemView {
  name: string;
  status: Status; // pass | warn | fail | null (neutral / no data)
  value: string; // short display, e.g. "47%", "clean", "guarded"
}

function fmtPct(p: number): string {
  if (p >= 99.95) return "100";
  return p >= 10 ? p.toFixed(0) : p.toFixed(1);
}

/** Subsystem statuses derived from the metrics block (empty if no metrics). */
export function subsystemsFromMetrics(m: AxumMetrics | null): SubsystemView[] {
  if (!m) return [];
  const out: SubsystemView[] = [];

  // Stability — crashes are fatal; a Wi-Fi reconnect timeout is a warning.
  if (m.crashes !== null || m.wifi_reconnect_failures !== null) {
    const crashes = m.crashes ?? 0;
    const wifi = m.wifi_reconnect_failures ?? 0;
    out.push({
      name: "Stability",
      status: crashes > 0 ? "fail" : wifi > 0 ? "warn" : "pass",
      value: crashes > 0 ? `${crashes} crash` : wifi > 0 ? `${wifi} wifi` : "clean",
    });
  }

  // Motion — completion rate (FAIL < 75, WARN < 90).
  if (m.motion_completion_pct !== null) {
    const p = m.motion_completion_pct;
    out.push({
      name: "Motion",
      status: p >= 90 ? "pass" : p >= 75 ? "warn" : "fail",
      value: `${fmtPct(p)}%`,
    });
  }

  // Encoder — EncoderGuarded is healthy; StepperOnly is degraded-but-handled.
  if (m.encoder_mode) {
    out.push({
      name: "Encoder",
      status: m.encoder_mode === "EncoderGuarded" ? "pass" : "warn",
      value: m.encoder_mode === "EncoderGuarded" ? "guarded" : m.encoder_mode,
    });
  }

  // Connectivity — MQTT uptime (FAIL < 50, WARN < 95).
  if (m.mqtt_uptime_pct !== null) {
    const p = m.mqtt_uptime_pct;
    out.push({
      name: "Connectivity",
      status: p >= 95 ? "pass" : p >= 50 ? "warn" : "fail",
      value: `${fmtPct(p)}%`,
    });
  }

  // Homing — startup + sleep; null means not attempted this session.
  if (m.homing_startup_ok !== null || m.homing_sleep_ok !== null) {
    const vals = [m.homing_startup_ok, m.homing_sleep_ok].filter((v): v is boolean => v !== null);
    const anyFail = vals.some((v) => v === false);
    const allOk = vals.length > 0 && vals.every((v) => v === true);
    out.push({
      name: "Homing",
      status: anyFail ? "fail" : allOk ? "pass" : null,
      value: anyFail ? "missed" : allOk ? "ok" : "n/a",
    });
  }

  // Persistence — NVS writes.
  if (m.nvs_ok !== null) {
    out.push({
      name: "Persistence",
      status: m.nvs_ok ? "pass" : "fail",
      value: m.nvs_ok ? "ok" : "fail",
    });
  }

  return out;
}
