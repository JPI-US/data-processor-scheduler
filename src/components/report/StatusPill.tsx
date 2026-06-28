import type { Status } from "@/lib/report/parse";

const styles: Record<Exclude<Status, null>, { bg: string; fg: string; label: string }> = {
  pass: { bg: "bg-[var(--color-pass-soft)]", fg: "text-[var(--color-pass)]", label: "PASS" },
  warn: { bg: "bg-[var(--color-warn-soft)]", fg: "text-[var(--color-warn)]", label: "WARN" },
  fail: { bg: "bg-[var(--color-fail-soft)]", fg: "text-[var(--color-fail)]", label: "FAIL" },
};

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  if (!status) return null;
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${s.bg} ${s.fg}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? s.label}
    </span>
  );
}
