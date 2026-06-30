import { detectStatus, parseReport, type Status } from "./parse";
import { extractMetrics, type AxumMetrics } from "./metrics";

export interface SubsystemStatus {
  name: string;
  status: Status;
  note?: string;
}

export type RunType = "normal" | "test";

/** Classification label for a night (default: normal). Stored server-side so the
 *  whole team sees the same test/normal tags. */
export interface RunLabel {
  run_type: RunType;
  test_name?: string;
  note?: string;
}

export interface SavedReport {
  id: string; // date key e.g. "2026-06-27"
  date: string; // ISO date
  uploadedAt: number;
  fileName: string;
  title: string;
  verdict: { status: Status; label: string; summary: string } | null;
  subsystems: SubsystemStatus[];
  metrics: AxumMetrics | null;
  source: string;
  /** true = written by the pipeline (lives on disk), not deletable from the UI. */
  fromServer?: boolean;
  /** classification label (normal/test + name/note); defaults to normal. */
  label?: RunLabel;
}

const KEY = "report-viewer:reports";

/** Fetch all classification labels (date -> RunLabel) from the server. */
export async function fetchLabels(): Promise<Record<string, RunLabel>> {
  try {
    const res = await fetch("/labels");
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, RunLabel>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** Set (or clear) a night's classification label; returns the stored label. */
export async function setLabel(date: string, label: RunLabel): Promise<RunLabel> {
  const res = await fetch("/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, ...label }),
  });
  if (!res.ok) throw new Error(`setLabel failed: ${res.status}`);
  window.dispatchEvent(new Event("labels-changed"));
  return (await res.json()) as RunLabel;
}

export function getReports(): SavedReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedReport[];
    // Backfill metrics for entries saved before the metrics block existed.
    for (const r of list) {
      if (r.metrics === undefined) r.metrics = extractMetrics(r.source);
    }
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  } catch {
    return [];
  }
}

export function getReport(id: string): SavedReport | null {
  return getReports().find((r) => r.id === id) ?? null;
}

export function deleteReport(id: string) {
  const next = getReports().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("reports-changed"));
}

/** Build a SavedReport from raw markdown (shared by uploads and server fetch). */
export function buildSavedReport(
  source: string,
  fileName: string,
  fromServer = false,
): SavedReport {
  const parsed = parseReport(source);
  const metrics = extractMetrics(source);
  const date = metrics?.session_date ?? extractDate(parsed.metaLines) ?? today();
  return {
    id: date,
    date,
    uploadedAt: Date.now(),
    fileName,
    title: parsed.title,
    verdict: parsed.verdict,
    subsystems: extractSubsystems(parsed.body),
    metrics,
    source,
    fromServer,
  };
}

export function saveReport(source: string, fileName: string): SavedReport {
  const saved = buildSavedReport(source, fileName);
  const existing = getReports().filter((r) => r.id !== saved.id);
  localStorage.setItem(KEY, JSON.stringify([saved, ...existing]));
  window.dispatchEvent(new Event("reports-changed"));
  return saved;
}

/** Fetch one server report by date id, e.g. "2026-06-28". */
export async function fetchServerReport(id: string): Promise<SavedReport | null> {
  try {
    const fileName = `axum_report_${id}.md`;
    const res = await fetch(`/reports/${fileName}`);
    if (!res.ok) return null;
    return buildSavedReport(await res.text(), fileName, true);
  } catch {
    return null;
  }
}

/** Fetch every report the pipeline has written to public/reports/. */
export async function fetchServerReports(): Promise<SavedReport[]> {
  try {
    const res = await fetch("/reports/index.json");
    if (!res.ok) return [];
    const data = (await res.json()) as { reports: string[] };
    if (!Array.isArray(data.reports)) return [];
    const results = await Promise.all(
      data.reports.map(async (fileName) => {
        try {
          const src = await fetch(`/reports/${fileName}`).then((r) => r.text());
          return buildSavedReport(src, fileName, true);
        } catch {
          return null;
        }
      }),
    );
    return results.filter((r): r is SavedReport => r !== null);
  } catch {
    return [];
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function extractDate(meta: { key: string; value: string }[]): string | null {
  for (const m of meta) {
    if (/date/i.test(m.key)) {
      const cleaned = m.value.replace(/`/g, "").trim();
      const iso = cleaned.match(/\d{4}-\d{2}-\d{2}/);
      if (iso) return iso[0];
      const d = new Date(cleaned);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function extractSubsystems(body: string): SubsystemStatus[] {
  const lines = body.split("\n");
  let i = lines.findIndex((l) => /^##\s+.*subsystem/i.test(l));
  if (i === -1) return [];
  // walk forward to a table
  while (i < lines.length && !lines[i].trim().startsWith("|")) i++;
  if (i >= lines.length) return [];
  const rows: SubsystemStatus[] = [];
  // skip header + separator
  let j = i + 2;
  while (j < lines.length && lines[j].trim().startsWith("|")) {
    const cells = lines[j]
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length >= 2) {
      rows.push({
        name: cells[0],
        status: detectStatus(cells[1]),
        note: cells[2],
      });
    }
    j++;
  }
  return rows;
}
