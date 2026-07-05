import { useEffect, useState } from "react";
import { X, Plus, Trash2, FolderOpen, FolderPlus, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
 *  what you type. Clicking a tower opens a read-only dialog; editing is behind an
 *  explicit Edit button so nobody changes a record by accident. */
export function FleetPanel() {
  const [open, setOpen] = useState(false);
  const [fleet, setFleet] = useState<Record<string, Tower>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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
  const existingIds = towers.map((t) => t.id);

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
              <button
                onClick={() => {
                  setAdding(true);
                  setSelectedId(null);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-rule py-2 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add tower
              </button>

              {towers.length === 0 && (
                <p className="pt-6 text-center text-sm text-muted-foreground">
                  No towers recorded yet.
                </p>
              )}

              {towers.map((t) => (
                <TowerRow key={t.id} tower={t} onOpen={() => setSelectedId(t.id)} />
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* Read-only detail dialog (view existing tower); Edit unlocks the fields. */}
      {selectedId && fleet[selectedId] && (
        <TowerDialog
          tower={fleet[selectedId]}
          existingIds={existingIds}
          driveEnabled={driveEnabled}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Add a new tower — opens straight in edit mode. */}
      {adding && (
        <TowerDialog
          tower={{ id: "", status: "deployed" }}
          isNew
          existingIds={existingIds}
          driveEnabled={driveEnabled}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}

function TowerRow({ tower, onOpen }: { tower: Tower; onOpen: () => void }) {
  const s = STATUS[tower.status ?? "deployed"];
  const coords =
    tower.lat != null && tower.lng != null
      ? `${tower.lat.toFixed(4)}, ${tower.lng.toFixed(4)}`
      : null;
  return (
    <button
      onClick={onOpen}
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

/** Dialog shell that shows a tower read-only, with an Edit button that swaps in
 *  the editable form. New towers open straight in edit mode. */
function TowerDialog({
  tower,
  isNew = false,
  existingIds,
  driveEnabled,
  onClose,
}: {
  tower: Tower;
  isNew?: boolean;
  existingIds: string[];
  driveEnabled: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(isNew);
  const s = STATUS[tower.status ?? "deployed"];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-rule px-5 py-3 pr-10 text-left">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="font-mono text-base">
              {isNew ? "Add tower" : tower.id}
            </DialogTitle>
            {!isNew && (
              <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${s.cls}`}>
                {s.label}
              </span>
            )}
          </div>
          <DialogDescription className="sr-only">Tower record details</DialogDescription>
        </DialogHeader>

        {editing ? (
          <TowerForm
            initial={tower}
            isNew={isNew}
            existingIds={existingIds}
            onDone={() => (isNew ? onClose() : setEditing(false))}
            onRemoved={onClose}
          />
        ) : (
          <TowerDetail tower={tower} driveEnabled={driveEnabled} onEdit={() => setEditing(true)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-rule py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-sm text-foreground ${mono ? "font-mono" : ""}`}>
        {value ? value : "—"}
      </span>
    </div>
  );
}

function TowerDetail({
  tower,
  driveEnabled,
  onEdit,
}: {
  tower: Tower;
  driveEnabled: boolean;
  onEdit: () => void;
}) {
  const [folderBusy, setFolderBusy] = useState(false);
  const makeFolder = async () => {
    setFolderBusy(true);
    await createTowerFolder(tower.id);
    setFolderBusy(false);
  };
  const coords = tower.lat != null && tower.lng != null ? `${tower.lat}, ${tower.lng}` : null;

  return (
    <>
      <div className="px-5 py-2">
        <DetailRow label="Site / name" value={tower.name} />
        <DetailRow label="Coordinates" value={coords} mono />
        <DetailRow label="Altitude" value={tower.altitude != null ? `${tower.altitude} m` : null} />
        <DetailRow label="Firmware" value={tower.version} mono />
        <DetailRow label="Notes" value={tower.notes} />
      </div>

      {(tower.drive_url || driveEnabled) && (
        <div className="px-5 pb-3">
          {tower.drive_url ? (
            <a
              href={tower.drive_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open Drive folder
            </a>
          ) : (
            <button
              onClick={makeFolder}
              disabled={folderBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {folderBusy ? "Creating folder…" : "Create Drive folder"}
            </button>
          )}
        </div>
      )}

      <div className="flex justify-end border-t border-rule px-5 py-3">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
    </>
  );
}

function TowerForm({
  initial,
  isNew = false,
  existingIds,
  onDone,
  onRemoved,
}: {
  initial: Tower;
  isNew?: boolean;
  existingIds: string[];
  onDone: () => void;
  onRemoved: () => void;
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
    if (ok) onRemoved();
  };

  return (
    <div className="space-y-2 px-5 py-4">
      {isNew && (
        <>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="Tower ID (e.g. tower_5)"
            className={`${inputCls} font-mono`}
          />
          {idClash && (
            <p className="text-[0.7rem] text-[var(--color-fail)]">That id already exists.</p>
          )}
        </>
      )}

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
