export type Status = "pass" | "fail" | "warn" | null;

export function detectStatus(text: string): Status {
  const t = text.toLowerCase();
  if (text.includes("✅") || /\bpass\b/.test(t)) return "pass";
  if (text.includes("❌") || /\bfail\b/.test(t)) return "fail";
  if (text.includes("⚠") || /\bwarn\b/.test(t)) return "warn";
  return null;
}

export function stripStatusGlyphs(text: string): string {
  return text.replace(/[✅❌⚠]️?/gu, "").trim();
}

export interface ReportMeta {
  title: string;
  metaLines: { key: string; value: string }[];
  verdict: { status: Status; label: string; summary: string } | null;
  body: string; // markdown with title+meta+verdict stripped
}

export function parseReport(markdown: string): ReportMeta {
  const lines = markdown.split("\n");
  let i = 0;
  let title = "Untitled Report";
  const metaLines: { key: string; value: string }[] = [];

  // Skip leading blank lines AND HTML comment blocks. process_log.py emits a
  // <!--axum-metrics ... --> block above the title; without this, the first
  // non-blank line would be the comment and title/meta/verdict detection would
  // silently fail on every generated report.
  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    if (lines[i].trimStart().startsWith("<!--")) {
      while (i < lines.length && !lines[i].includes("-->")) i++;
      if (i < lines.length) i++; // consume the closing --> line
      continue;
    }
    break;
  }

  // title (first h1)
  if (i < lines.length && lines[i].startsWith("# ")) {
    title = lines[i].slice(2).trim();
    i++;
  }

  // gather meta lines (consecutive non-blank lines that are bold key/value)
  while (i < lines.length && lines[i].trim() !== "") {
    const line = lines[i];
    // split on "·" or "•" to allow multiple per line
    const parts = line.split(/\s+[·•|]\s+/);
    for (const part of parts) {
      const m = part.match(/^\*\*([^*]+):\*\*\s*(.+)$/);
      if (m) metaLines.push({ key: m[1].trim(), value: m[2].trim() });
    }
    i++;
  }

  // skip blanks + horizontal rules
  while (i < lines.length && (lines[i].trim() === "" || /^---+$/.test(lines[i].trim()))) i++;

  // verdict header? "## ... VERDICT: X"
  let verdict: ReportMeta["verdict"] = null;
  if (i < lines.length && /^##\s+.*VERDICT/i.test(lines[i])) {
    const heading = lines[i];
    const m = heading.match(/VERDICT[:\s]+([A-Z]+)/i);
    const label = m ? m[1].toUpperCase() : "VERDICT";
    const status = detectStatus(heading);
    i++;
    // collect summary paragraph(s) until next heading or hr
    const summaryLines: string[] = [];
    while (i < lines.length && !/^#{1,6}\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim())) {
      summaryLines.push(lines[i]);
      i++;
    }
    verdict = { status, label, summary: summaryLines.join("\n").trim() };
    // skip following hr + blanks
    while (i < lines.length && (lines[i].trim() === "" || /^---+$/.test(lines[i].trim()))) i++;
  }

  const body = lines.slice(i).join("\n");
  return { title, metaLines, verdict, body };
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function extractToc(body: string): TocItem[] {
  const out: TocItem[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const text = stripStatusGlyphs(m[2].replace(/—\s*(PASS|FAIL|WARN).*$/i, "")).trim();
    out.push({ id: slugify(text), text, level });
  }
  return out;
}

export function isTimelineBlock(content: string): boolean {
  const lines = content.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return false;
  const matches = lines.filter((l) => /^\s*\d{1,2}:\d{2}(:\d{2})?\b/.test(l));
  return matches.length / lines.length > 0.6;
}
