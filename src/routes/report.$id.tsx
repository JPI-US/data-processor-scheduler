import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ReportView } from "@/components/report/ReportView";
import { Toolbar } from "@/components/report/Toolbar";
import { fetchServerReport, getReport, type SavedReport } from "@/lib/report/storage";

export const Route = createFileRoute("/report/$id")({
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<SavedReport | null | undefined>(undefined);

  useEffect(() => {
    const local = getReport(id);
    if (local) {
      setReport(local);
      return;
    }
    // Not in localStorage — try the pipeline report files on the server.
    fetchServerReport(id).then(setReport);
  }, [id]);

  if (report === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  if (report === null) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <h1 className="font-serif text-3xl font-medium">Report not found</h1>
          <p className="mt-2 text-muted-foreground">
            It may have been deleted, or this device doesn't have it saved.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            <ArrowLeft className="h-4 w-4" /> Back to reports
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toolbar onReset={() => navigate({ to: "/" })} />
      <div className="no-print mx-auto max-w-7xl px-6 pt-10 lg:px-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All reports
        </Link>
      </div>
      <ReportView source={report.source} fileName={report.fileName} />
    </>
  );
}
