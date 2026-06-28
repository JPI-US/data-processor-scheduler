import { detectStatus, parseReport, type Status } from "./parse";

export interface SubsystemStatus {
  name: string;
  status: Status;
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
  source: string; // raw markdown content
  fromServer?: boolean; // true = lives on disk, not deletable from the UI
}

const KEY = "report-viewer:reports";

export function getReports(): SavedReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedReport[];
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

export function saveReport(source: string, fileName: string): SavedReport {
  const saved = buildSavedReport(source, fileName);
  const existing = getReports().filter((r) => r.id !== saved.id);
  localStorage.setItem(KEY, JSON.stringify([saved, ...existing]));
  window.dispatchEvent(new Event("reports-changed"));
  return saved;
}

/** Fetch a single server report by date id, e.g. "2026-06-28". */
export async function fetchServerReport(id: string): Promise<SavedReport | null> {
  try {
    const filename = `axum_report_${id}.md`;
    const src = await fetch(`/reports/${filename}`).then((r) => {
      if (!r.ok) return null;
      return r.text();
    });
    if (!src) return null;
    return buildSavedReport(src, filename, true);
  } catch {
    return null;
  }
}

/** Fetch all reports that process_log.py has written to public/reports/. */
export async function fetchServerReports(): Promise<SavedReport[]> {
  try {
    const res = await fetch("/reports/index.json");
    if (!res.ok) return [];
    const data = (await res.json()) as { reports: string[] };
    if (!Array.isArray(data.reports)) return [];
    const results = await Promise.all(
      data.reports.map(async (filename) => {
        try {
          const src = await fetch(`/reports/${filename}`).then((r) => r.text());
          return buildSavedReport(src, filename, true);
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

// ---------- private helpers ----------

function buildSavedReport(
  source: string,
  fileName: string,
  fromServer = false,
): SavedReport {
  const parsed = parseReport(source);
  const date =
    extractDate(parsed.metaLines) ??
    (fileName.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? today());
  return {
    id: date,
    date,
    uploadedAt: Date.now(),
    fileName,
    title: parsed.title,
    verdict: parsed.verdict,
    subsystems: extractSubsystems(parsed.body),
    source,
    fromServer,
  };
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
  while (i < lines.length && !lines[i].trim().startsWith("|")) i++;
  if (i >= lines.length) return [];
  const rows: SubsystemStatus[] = [];
  let j = i + 2;
  while (j < lines.length && lines[j].trim().startsWith("|")) {
    const cells = lines[j]
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length >= 2) {
      rows.push({ name: cells[0], status: detectStatus(cells[1]), note: cells[2] });
    }
    j++;
  }
  return rows;
}
