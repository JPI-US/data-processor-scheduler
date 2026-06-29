import { useEffect, useMemo, useState } from "react";
import type { SavedReport } from "@/lib/report/storage";
import { fetchServerReports, getReports } from "@/lib/report/storage";

export interface ReportsState {
  reports: SavedReport[];
  loading: boolean;
}

export function useReports(): ReportsState {
  const [localReports, setLocalReports] = useState<SavedReport[]>([]);
  const [serverReports, setServerReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);

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
  const reports = useMemo(() => {
    const serverIds = new Set(serverReports.map((r) => r.id));
    const localOnly = localReports.filter((r) => !serverIds.has(r.id));
    return [...serverReports, ...localOnly].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [localReports, serverReports]);

  return { reports, loading };
}
