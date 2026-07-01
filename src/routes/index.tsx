import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UploadDropzone } from "@/components/report/UploadDropzone";
import { UploadCard } from "@/components/report/UploadCard";
import { ReportList } from "@/components/report/ReportList";
import { Masthead } from "@/components/overview/Masthead";
import { VerdictStrip } from "@/components/overview/VerdictStrip";
import { MetricCard } from "@/components/overview/MetricCard";
import {
  OverviewControls,
  DEFAULT_VIEW,
  type OverviewView,
} from "@/components/overview/OverviewControls";
import { useReports } from "@/lib/report/useReports";
import { effectiveVersion, saveReport } from "@/lib/report/storage";
import { DEFAULT_CARDS } from "@/lib/report/metrics";
import { numericSeries, regressionFor } from "@/lib/report/trends";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Axum Nightly — Trend & Triage" },
      {
        name: "description",
        content:
          "Glance at last night's verdict, scan 30 nights at a stroke, and drill into any report.",
      },
      { property: "og:title", content: "Axum Nightly" },
      {
        property: "og:description",
        content: "Nightly verdicts, trends, and triage for the Axum tower.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { reports, versions, loading } = useReports();
  const [view, setView] = useState<OverviewView>(DEFAULT_VIEW);

  const handleLoad = (text: string, name: string) => {
    saveReport(text, name);
  };

  // The slice the trend layer (strip / cards / streak) is computed over.
  const trendReports = useMemo(() => {
    if (view.category === "test") {
      return reports.filter(
        (r) =>
          r.label?.run_type === "test" &&
          (view.testName === "all" || r.label.test_name === view.testName),
      );
    }
    return reports.filter((r) => {
      if (r.label?.run_type === "test") return false;
      return view.version === "all" || effectiveVersion(r, versions) === view.version;
    });
  }, [reports, versions, view]);

  // While the server fetch is in flight, show a neutral skeleton so we don't
  // flash the upload screen when pipeline reports are about to appear.
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 h-16 animate-pulse rounded-xl bg-surface" />
        <div className="mb-10 h-9 animate-pulse rounded-lg bg-surface" />
        <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
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
    <div className="mx-auto max-w-5xl px-6 py-12">
      <OverviewControls reports={reports} versions={versions} view={view} onView={setView} />
      <Masthead reports={trendReports} />
      <VerdictStrip reports={trendReports} />

      <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DEFAULT_CARDS.map((card) => {
          const series = numericSeries(trendReports, card.key);
          const regression = regressionFor(series, card);
          return (
            <MetricCard
              key={card.key as string}
              card={card}
              series={series}
              regression={regression}
            />
          );
        })}
      </section>

      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">Reports</h2>
        <span className="text-xs text-muted-foreground">
          {reports.length} {reports.length === 1 ? "night" : "nights"} · trend over{" "}
          {trendReports.length}
        </span>
      </div>

      <div className="mb-5">
        <UploadCard onLoad={handleLoad} />
      </div>

      <ReportList reports={reports} />
    </div>
  );
}
