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

  // Keep localStorage reports in sync.
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

  // Fetch reports written by process_log.py from /reports/index.json on mount.
  useEffect(() => {
    fetchServerReports()
      .then(setServerReports)
      .finally(() => setLoading(false));
  }, []);

  // Server reports take precedence; show local-only uploads that aren't on the server.
  const reports = useMemo(() => {
    const serverIds = new Set(serverReports.map((r) => r.id));
    const localOnly = localReports.filter((r) => !serverIds.has(r.id));
    return [...serverReports, ...localOnly].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [localReports, serverReports]);

  return { reports, loading };
}
