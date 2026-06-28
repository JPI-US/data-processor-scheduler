import { Info, AlertTriangle, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";

type Kind = "note" | "warning" | "tip" | "info";

const config: Record<Kind, { Icon: typeof Info; tone: string }> = {
  note: { Icon: Info, tone: "text-accent border-accent/30 bg-accent/5" },
  info: { Icon: Info, tone: "text-accent border-accent/30 bg-accent/5" },
  warning: {
    Icon: AlertTriangle,
    tone: "text-[var(--color-warn)] border-[var(--color-warn)]/30 bg-[var(--color-warn-soft)]/40",
  },
  tip: {
    Icon: Lightbulb,
    tone: "text-[var(--color-pass)] border-[var(--color-pass)]/30 bg-[var(--color-pass-soft)]/40",
  },
};

export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: Kind;
  title?: string;
  children: ReactNode;
}) {
  const c = config[kind] ?? config.note;
  const Icon = c.Icon;
  return (
    <aside className={`my-5 flex gap-3 rounded-lg border-l-4 px-4 py-3 ${c.tone}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1 text-foreground">
        {title && <div className="mb-1 font-semibold">{title}</div>}
        <div className="text-[0.95rem] leading-relaxed [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </aside>
  );
}
