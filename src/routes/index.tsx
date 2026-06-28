import { createFileRoute } from "@tanstack/react-router";
import { UploadDropzone } from "@/components/report/UploadDropzone";
import { UploadCard } from "@/components/report/UploadCard";
import { ReportList } from "@/components/report/ReportList";
import { useReports } from "@/lib/report/useReports";
import { saveReport } from "@/lib/report/storage";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Axum Report Viewer" },
      {
        name: "description",
        content: "Nightly log analysis reports for the Axum solar-tracking tower.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { reports, loading } = useReports();

  const handleLoad = (text: string, name: string) => {
    saveReport(text, name);
  };

  // While the server fetch is in flight, show a neutral loading state so we
  // don't flash the upload dropzone when reports are about to appear.
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Report viewer
          </div>
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
            Axum nightly reports
          </h1>
        </header>
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return <UploadDropzone onLoad={handleLoad} />;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <FileText className="h-3.5 w-3.5" /> Report viewer
        </div>
        <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
          Axum nightly reports
        </h1>
        <p className="mt-2 text-muted-foreground">
          {reports.length} {reports.length === 1 ? "report" : "reports"} available.
        </p>
      </header>

      <div className="mb-6">
        <UploadCard onLoad={handleLoad} />
      </div>

      <ReportList reports={reports} />
    </div>
  );
}
