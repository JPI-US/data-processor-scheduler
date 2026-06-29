import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "./StatusPill";
import { ArrowRight, Trash2 } from "lucide-react";
import type { SavedReport } from "@/lib/report/storage";
import { deleteReport } from "@/lib/report/storage";

export function ReportSummaryDialog({
  report,
  open,
  onOpenChange,
}: {
  report: SavedReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!report) return null;
  const verdict = report.verdict;
  const verdictTone =
    verdict?.status === "pass"
      ? "text-[var(--color-pass)] bg-[var(--color-pass-soft)] border-[var(--color-pass)]/30"
      : verdict?.status === "fail"
        ? "text-[var(--color-fail)] bg-[var(--color-fail-soft)] border-[var(--color-fail)]/30"
        : "text-[var(--color-warn)] bg-[var(--color-warn-soft)] border-[var(--color-warn)]/30";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-rule px-6 py-4">
          <div className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {formatDate(report.date)}
          </div>
          <DialogTitle className="font-serif text-2xl font-medium leading-tight tracking-tight">
            {report.title}
          </DialogTitle>
          <DialogDescription className="sr-only">Quick summary of the report</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {verdict && (
            <div className={`rounded-lg border px-4 py-3 ${verdictTone}`}>
              <div className="flex items-baseline gap-3">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] opacity-70">
                  Verdict
                </span>
                <span className="text-xl font-semibold tracking-tight">{verdict.label}</span>
              </div>
              {verdict.summary && (
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {verdict.summary.replace(/\n/g, " ")}
                </p>
              )}
            </div>
          )}

          {report.subsystems.length > 0 && (
            <div>
              <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Subsystems
              </div>
              <ul className="divide-y divide-rule rounded-lg border border-rule">
                {report.subsystems.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm font-medium text-foreground">{s.name}</span>
                    <StatusPill status={s.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-rule px-6 py-3 sm:justify-between">
          {report.fromServer ? (
            <span />
          ) : (
            <button
              onClick={() => {
                if (confirm("Delete this report?")) {
                  deleteReport(report.id);
                  onOpenChange(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-[var(--color-fail)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
          <Link
            to="/report/$id"
            params={{ id: report.id }}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90"
          >
            View full report
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
