import type { Status } from "@/lib/report/parse";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

const config: Record<
  Exclude<Status, null>,
  { Icon: typeof CheckCircle2; tone: string; border: string; label: string }
> = {
  pass: {
    Icon: CheckCircle2,
    tone: "text-[var(--color-pass)] bg-[var(--color-pass-soft)]",
    border: "border-[var(--color-pass)]/30",
    label: "All systems nominal",
  },
  warn: {
    Icon: AlertTriangle,
    tone: "text-[var(--color-warn)] bg-[var(--color-warn-soft)]",
    border: "border-[var(--color-warn)]/40",
    label: "Needs attention",
  },
  fail: {
    Icon: XCircle,
    tone: "text-[var(--color-fail)] bg-[var(--color-fail-soft)]",
    border: "border-[var(--color-fail)]/40",
    label: "Action required",
  },
};

export function VerdictHero({
  status,
  label,
  summary,
}: {
  status: Status;
  label: string;
  summary: string;
}) {
  const c = status ? config[status] : null;
  const Icon = c?.Icon ?? AlertTriangle;
  return (
    <section
      className={`my-8 overflow-hidden rounded-xl border ${c?.border ?? "border-rule"} bg-surface`}
    >
      <div className={`flex items-center gap-3 px-6 py-3 ${c?.tone ?? ""}`}>
        <Icon className="h-5 w-5" strokeWidth={2.2} />
        <div className="flex items-baseline gap-3">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] opacity-70">
            Verdict
          </span>
          <span className="text-2xl font-semibold tracking-tight">{label}</span>
        </div>
        <span className="ml-auto text-xs font-medium opacity-70">{c?.label}</span>
      </div>
      {summary && (
        <p className="px-6 py-5 text-[1.05rem] leading-relaxed text-foreground">
          {summary.replace(/\n/g, " ")}
        </p>
      )}
    </section>
  );
}
