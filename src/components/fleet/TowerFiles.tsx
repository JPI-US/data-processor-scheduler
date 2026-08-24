import { useEffect, useMemo, useState } from "react";
import { Download, FolderOpen, FileCode2, Cpu, File as FileIcon, RefreshCw } from "lucide-react";
import {
  fetchFleet,
  fetchFleetConfig,
  fetchTowerFiles,
  towerFileUrl,
  type Tower,
  type TowerFile,
} from "@/lib/report/storage";
import { formatDateTime } from "@/lib/report/format";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Firmware first, then the .env, then anything else — the order a tech wants. */
const KIND_ORDER: Record<TowerFile["kind"], number> = { binary: 0, env: 1, other: 2 };

const KIND_META: Record<TowerFile["kind"], { label: string; Icon: typeof Cpu; cls: string }> = {
  binary: {
    label: "Firmware",
    Icon: Cpu,
    cls: "bg-[var(--color-pass-soft)] text-[var(--color-pass)]",
  },
  env: {
    label: "Config",
    Icon: FileCode2,
    cls: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  },
  other: { label: "Other", Icon: FileIcon, cls: "bg-muted text-muted-foreground" },
};

/** Pick a tower, see what's in its Drive folder, download it. The bytes come
 *  through our own server (which holds the Apps Script secret), so a download is
 *  an ordinary link — no base64 in the browser, no Google login for the user. */
export function TowerFiles() {
  const [fleet, setFleet] = useState<Record<string, Tower>>({});
  const [driveEnabled, setDriveEnabled] = useState(true);
  const [towerId, setTowerId] = useState("");
  const [files, setFiles] = useState<TowerFile[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFleet().then(setFleet);
    fetchFleetConfig().then((c) => setDriveEnabled(c.drive_enabled));
    const onChange = () => fetchFleet().then(setFleet);
    window.addEventListener("fleet-changed", onChange);
    return () => window.removeEventListener("fleet-changed", onChange);
  }, []);

  const towers = useMemo(
    () =>
      Object.values(fleet).sort((a, b) =>
        (a.id || "").localeCompare(b.id || "", undefined, { numeric: true }),
      ),
    [fleet],
  );

  // Group the picker by site so a long fleet stays navigable.
  const bySite = useMemo(() => {
    const m = new Map<string, Tower[]>();
    for (const t of towers) {
      const key = (t.site || "").trim() || "Ungrouped";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return m;
  }, [towers]);

  const tower = towerId ? fleet[towerId] : undefined;

  const load = (id: string) => {
    if (!id) {
      setFiles([]);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    fetchTowerFiles(id).then((r) => {
      setFiles(r.files);
      setError(r.error);
      setLoading(false);
    });
  };

  const select = (id: string) => {
    setTowerId(id);
    load(id);
  };

  const sorted = useMemo(
    () =>
      [...files].sort(
        (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
      ),
    [files],
  );

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
          Tower files
        </h1>
        {tower?.drive_url && (
          <a
            href={tower.drive_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open folder in Drive
          </a>
        )}
      </div>

      {!driveEnabled && (
        <p className="mb-4 rounded-lg border border-rule bg-surface px-4 py-3 text-sm text-muted-foreground">
          The Drive hook isn&apos;t configured, so there&apos;s nothing to fetch yet. Set{" "}
          <code className="font-mono text-xs text-foreground">DRIVE_HOOK_URL</code> and{" "}
          <code className="font-mono text-xs text-foreground">DRIVE_HOOK_SECRET</code> on the server
          (and the matching <code className="font-mono text-xs text-foreground">SECRET</code> in the
          Apps Script).
        </p>
      )}

      <div className="rounded-xl border border-rule bg-surface p-4">
        <label
          htmlFor="tower-pick"
          className="mb-1.5 block text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Tower
        </label>
        <div className="flex gap-2">
          <select
            id="tower-pick"
            value={towerId}
            onChange={(e) => select(e.target.value)}
            className="w-full rounded-md border border-rule bg-background px-2.5 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">
              {towers.length ? "Select a tower…" : "No towers in the registry yet"}
            </option>
            {[...bySite.entries()].map(([site, list]) => (
              <optgroup key={site} label={site}>
                {list.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id}
                    {t.name ? ` — ${t.name}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {towerId && (
            <button
              onClick={() => load(towerId)}
              title="Re-check the folder"
              className="shrink-0 rounded-md border border-rule px-2.5 py-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {tower && (
          <p className="mt-2 text-xs text-muted-foreground">
            {[tower.name, tower.site, tower.status, tower.version && `fw ${tower.version}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {/* Results */}
        {towerId && (
          <div className="mt-4 border-t border-rule pt-4">
            {loading && <p className="text-sm text-muted-foreground">Looking in the folder…</p>}

            {!loading && error && (
              <p className="rounded-lg bg-[var(--color-fail-soft)] px-3 py-2.5 text-sm text-[var(--color-fail)]">
                {error}
              </p>
            )}

            {!loading && !error && sorted.length === 0 && (
              <p className="text-sm text-muted-foreground">
                The folder for <span className="font-mono text-foreground">{towerId}</span> is empty
                — nothing has been put there yet.
              </p>
            )}

            {!loading && !error && sorted.length > 0 && (
              <ul className="space-y-2">
                {sorted.map((f) => {
                  const { label, Icon, cls } = KIND_META[f.kind] ?? KIND_META.other;
                  return (
                    <li
                      key={f.name}
                      className="flex items-center gap-3 rounded-lg border border-rule bg-background px-3 py-2.5"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm text-foreground">{f.name}</p>
                        <p className="text-[0.7rem] text-muted-foreground">
                          {formatBytes(f.size)}
                          {f.updated ? ` · ${formatDateTime(f.updated)}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[0.6rem] ${cls}`}>
                        {label}
                      </span>
                      <a
                        href={towerFileUrl(towerId, f.name)}
                        download={f.name}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
