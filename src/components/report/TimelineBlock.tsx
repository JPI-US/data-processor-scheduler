import { AlertTriangle } from "lucide-react";

export function TimelineBlock({ content }: { content: string }) {
  const lines = content.trim().split("\n");
  return (
    <ol className="my-6 space-y-0 rounded-xl border border-rule bg-surface p-4">
      {lines.map((line, i) => {
        const m = line.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/);
        const warn = /[⚠]/.test(line);
        const time = m?.[1];
        const rest = (m?.[2] ?? line).replace(/^⚠️?\s*/u, "").trim();
        return (
          <li key={i} className="relative flex gap-4 py-2 pl-2">
            <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {time}
            </span>
            <span className="relative flex w-3 shrink-0 items-center justify-center">
              <span
                className={`h-2 w-2 rounded-full ${
                  warn
                    ? "bg-[var(--color-warn)] ring-4 ring-[var(--color-warn-soft)]"
                    : "bg-foreground/30"
                }`}
              />
              {i < lines.length - 1 && (
                <span className="absolute top-4 h-full w-px bg-rule" aria-hidden />
              )}
            </span>
            <span className="flex flex-1 items-center gap-2 text-sm leading-relaxed">
              {warn && <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-warn)]" />}
              <span>{rest || line}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
