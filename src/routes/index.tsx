import { createFileRoute } from "@tanstack/react-router";
import { UploadCard } from "@/components/report/UploadCard";
import { ReportList } from "@/components/report/ReportList";
import { useReports } from "@/lib/report/useReports";
import { saveReport } from "@/lib/report/storage";
import { Clock, FileText } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Axum Tower — Nightly Reports" },
      {
        name: "description",
        content: "Nightly log analysis reports for the Axum solar-tracking tower.",
      },
    ],
  }),
  component: Index,
});

function Header({ subtitle }: { subtitle?: string }) {
  return (
    <header className="mb-10">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <FileText className="h-3.5 w-3.5" /> Report viewer
      </div>
      <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
        Axum nightly reports
      </h1>
      {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
    </header>
  );
}

function Index() {
  const { reports, loading } = useReports();

  const handleLoad = (text: string, name: string) => {
    saveReport(text, name);
  };

  // While the server fetch is in flight, show a neutral loading state so we
  // don't flash the empty state when reports are about to appear.
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Header />
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  // No reports yet — this is a monitoring view that fills itself from the
  // nightly pipeline, so lead with that, not a manual-upload pitch.
  if (reports.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Header />
        <div className="rounded-xl border border-dashed border-rule bg-surface px-8 py-12 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-full bg-accent/10 p-3 text-accent">
            <Clock className="h-6 w-6" />
          </div>
          <h2 className="font-serif text-2xl font-medium text-foreground">No reports yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            The nightly pipeline writes a report here automatically after each capture. The next one
            will appear after tonight's run — this page refreshes on its own.
          </p>
        </div>

        <div className="mt-6">
          <UploadCard onLoad={handleLoad} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Header
        subtitle={`${reports.length} ${reports.length === 1 ? "report" : "reports"} available.`}
      />

      <div className="mb-6">
        <UploadCard onLoad={handleLoad} />
      </div>

      <ReportList reports={reports} />
    </div>
  );
}
