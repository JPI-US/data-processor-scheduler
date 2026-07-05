import { useEffect, useState } from "react";
import { X, Plus, Trash2, FolderOpen, FolderPlus } from "lucide-react";
import {
  fetchFleet,
  fetchFleetConfig,
  saveTower,
  deleteTower,
  createTowerFolder,
  type Tower,
  type TowerStatus,
} from "@/lib/report/storage";

const inputCls =
  "w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const STATUS: Record<TowerStatus, { label: string; cls: string }> = {
  deployed: { label: "Deployed", cls: "bg-[var(--color-pass-soft)] text-[var(--color-pass)]" },
  testing: { label: "Testing", cls: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]" },
  maintenance: { label: "Maintenance", cls: "bg-surface-2 text-muted-foreground" },
  offline: { label: "Offline", cls: "bg-[var(--color-fail-soft)] text-[var(--color-fail)]" },
  retired: { label: "Retired", cls: "bg-muted text-muted-foreground" },
};
const STATUS_KEYS = Object.keys(STATUS) as TowerStatus[];

/** A manually-maintained record of deployed towers — a notebook in the app. It
 *  never contacts the towers, AWS, or firmware hosting; it only stores and shows
 *  what you type. Lives in the JantaServer-local fleet.json. */
export function FleetPanel() {
  const [open, setOpen] = useState(false);
  const [fleet, setFleet] = useState<Record<string, Tower>>({});
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [driveEnabled, setDriveEnabled] = useState(false);

  useEffect(() => {
    const load = () => fetchFleet().then(setFleet);
    load();
    fetchFleetConfig().then((c) => setDriveEnabled(c.drive_enabled));
    window.addEventListener("fleet-changed", load);
    return () => window.removeEventListener("fleet-changed", load);
  }, []);

  const towers = Object.values(fleet).sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 top-4 z-30 inline-flex items-center gap-2 rounded-lg border border-rule bg-surface px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-surface-2"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pass)]" />
        Fleet
        {towers.length > 0 && (
          <span className="rounded bg-muted px-1 tabular-nums text-muted-foreground">
            {towers.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-background shadow-2xl">
            <header className="flex items-center justify-between border-b border-rule px-5 py-3">
              <div>
                <h2 className="font-serif text-lg font-medium text-foreground">Fleet Registry</h2>
                <p className="text-[0.7rem] text-muted-foreground">
                  A record of your towers — nothing is sent to them.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {adding ? (
                <TowerForm
                  isNew
                  initial={{ id: "", status: "deployed" }}
                  existingIds={towers.map((t) => t.id)}
                  onDone={() => setAdding(false)}
                />
              ) : (
                <button
                  onClick={() => {
                    setAdding(true);
                    setEditingId(null);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-rule py-2 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add tower
                </button>
              )}

              {towers.length === 0 && !adding && (
                <p className="pt-6 text-center text-sm text-muted-foreground">
                  No towers recorded yet.
                </p>
              )}

              {towers.map((t) =>
                editingId === t.id ? (
                  <TowerForm
                    key={t.id}
                    initial={t}
                    existingIds={towers.map((x) => x.id)}
                    driveEnabled={driveEnabled}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <TowerRow
                    key={t.id}
                    tower={t}
                    onEdit={() => {
                      setEditingId(t.id);
                      setAdding(false);
                    }}
                  />
                ),
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function TowerRow({ tower, onEdit }: { tower: Tower; onEdit: () => void }) {
  const s = STATUS[tower.status ?? "deployed"];
  const coords =
    tower.lat != null && tower.lng != null
      ? `${tower.lat.toFixed(4)}, ${tower.lng.toFixed(4)}`
      : null;
  return (
    <button
      onClick={onEdit}
      className="w-full rounded-lg border border-rule bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium text-foreground">{tower.id}</span>
        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${s.cls}`}>
          {s.label}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {tower.name && <span className="text-foreground">{tower.name}</span>}
        {tower.version && (
          <span>
            fw <span className="font-mono">{tower.version}</span>
          </span>
        )}
        {coords && <span className="font-mono">{coords}</span>}
      </div>
      {tower.notes && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tower.notes}</p>
      )}
    </button>
  );
}

function TowerForm({
  initial,
  isNew = false,
  existingIds,
  driveEnabled = false,
  onDone,
}: {
  initial: Tower;
  isNew?: boolean;
  existingIds: string[];
  driveEnabled?: boolean;
  onDone: () => void;
}) {
  const [id, setId] = useState(initial.id ?? "");
  const [name, setName] = useState(initial.name ?? "");
  const [lat, setLat] = useState(initial.lat != null ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial.lng != null ? String(initial.lng) : "");
  const [altitude, setAltitude] = useState(
    initial.altitude != null ? String(initial.altitude) : "",
  );
  const [version, setVersion] = useState(initial.version ?? "");
  const [status, setStatus] = useState<TowerStatus>(initial.status ?? "deployed");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);

  const makeFolder = async () => {
    setFolderBusy(true);
    await createTowerFolder(initial.id);
    setFolderBusy(false);
    // fleet-changed fires -> the panel reloads and this form re-renders with the
    // new initial.drive_url, flipping the button to "Open Drive folder".
  };

  const idClash = isNew && existingIds.includes(id.trim());
  const canSave = id.trim().length > 0 && !idClash && !busy;

  const numOrNull = (s: string) => {
    const t = s.trim();
    if (t === "") return null;
    const f = parseFloat(t);
    return Number.isFinite(f) ? f : null;
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const saved = await saveTower({
      id: id.trim(),
      name: name.trim(),
      lat: numOrNull(lat),
      lng: numOrNull(lng),
      altitude: numOrNull(altitude),
      version: version.trim(),
      status,
      notes: notes.trim(),
    });
    setBusy(false);
    if (saved) onDone();
  };

  const remove = async () => {
    if (!confirm(`Remove ${id} from the registry?`)) return;
    setBusy(true);
    const ok = await deleteTower(id);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-surface p-3">
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="Tower ID (e.g. tower_5)"
        disabled={!isNew}
        className={`${inputCls} font-mono disabled:opacity-60`}
      />
      {idClash && <p className="text-[0.7rem] text-[var(--color-fail)]">That id already exists.</p>}

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Site / name"
        className={inputCls}
      />

      <div className="grid grid-cols-3 gap-2">
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Latitude"
          inputMode="decimal"
          className={inputCls}
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="Longitude"
          inputMode="decimal"
          className={inputCls}
        />
        <input
          value={altitude}
          onChange={(e) => setAltitude(e.target.value)}
          placeholder="Alt (m)"
          inputMode="decimal"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="Firmware (e.g. 1.1.4)"
          className={`${inputCls} font-mono`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TowerStatus)}
          className={inputCls}
        >
          {STATUS_KEYS.map((k) => (
            <option key={k} value={k}>
              {STATUS[k].label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        rows={2}
        className={`${inputCls} resize-none`}
      />

      {/* Google Drive dossier: open it if it exists, else offer to create it
          (only when the server has the hook configured). Hidden for a brand-new
          unsaved tower — its folder is auto-created on first save. */}
      {!isNew && (initial.drive_url || driveEnabled) && (
        <div className="rounded-md border border-rule bg-background px-2.5 py-2">
          {initial.drive_url ? (
            <a
              href={initial.drive_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:underline"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open Drive folder
            </a>
          ) : (
            <button
              onClick={makeFolder}
              disabled={folderBusy}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {folderBusy ? "Creating folder…" : "Create Drive folder"}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {!isNew ? (
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-[var(--color-fail)] disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onDone}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
