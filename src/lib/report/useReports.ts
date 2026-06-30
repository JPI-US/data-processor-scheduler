import { useEffect, useMemo, useState } from "react";
import type { RunLabel, SavedReport } from "@/lib/report/storage";
import { fetchLabels, fetchServerReports, getReports } from "@/lib/report/storage";

export interface ReportsState {
  reports: SavedReport[];
  loading: boolean;
}

export function useReports(): ReportsState {
  const [localReports, setLocalReports] = useState<SavedReport[]>([]);
  const [serverReports, setServerReports] = useState<SavedReport[]>([]);
  const [labels, setLabels] = useState<Record<string, RunLabel>>({});
  const [loading, setLoading] = useState(true);

  // Fetch classification labels (and refresh when one is changed in the UI).
  useEffect(() => {
    const load = () => fetchLabels().then(setLabels);
    load();
    window.addEventListener("labels-changed", load);
    return () => window.removeEventListener("labels-changed", load);
  }, []);

  // Keep localStorage uploads in sync.
  useEffect(() => {
    const sync = () => setLocalReports(getReports());
    sync();
    window.addEventListener("reports-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("reports-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Fetch pipeline reports from /reports/index.json. Refetch on a timer and on
  // tab focus, so a browser left open overnight picks up the nightly report
  // without a manual refresh.
  useEffect(() => {
    let active = true;
    const REFRESH_MS = 5 * 60 * 1000;

    const load = () =>
      fetchServerReports()
        .then((r) => {
          if (active) setServerReports(r);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    load();
    const timer = setInterval(load, REFRESH_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Server reports win; show local-only uploads that aren't on the server.
  // Attach each night's classification label (default normal).
  const reports = useMemo(() => {
    const serverIds = new Set(serverReports.map((r) => r.id));
    const localOnly = localReports.filter((r) => !serverIds.has(r.id));
    return [...serverReports, ...localOnly]
      .map((r) => ({ ...r, label: labels[r.date] ?? { run_type: "normal" as const } }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [localReports, serverReports, labels]);

  return { reports, loading };
}
