import { useEffect, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  FolderOpen,
  FolderPlus,
  Pencil,
  Copy,
  MapPin,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
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
  fetchFirmwareTags,
  saveTower,
  deleteTower,
  createTowerFolder,
  type Tower,
  type TowerStatus,
} from "@/lib/report/storage";
import { formatDateTime } from "@/lib/report/format";

interface Firmware {
  enabled: boolean;
  repo: string;
  tags: string[];
}
const EMPTY_FIRMWARE: Firmware = { enabled: false, repo: "", tags: [] };

/** Link to a tag on GitHub, or plain text if we don't have the repo. */
function tagUrl(repo: string, tag: string): string | null {
  return repo && tag ? `https://github.com/${repo}/tree/${encodeURIComponent(tag)}` : null;
}

/** Guess a site from a tower name by dropping a trailing "#3" / " 3".
 *  "Saddler #1" -> "Saddler", "FIFA Dallas #2" -> "FIFA Dallas". */
function siteSuggestion(name: string): string {
  return name.replace(/\s*#?\d+\s*$/, "").trim();
}

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
  const [addSeed, setAddSeed] = useState<Tower | null>(null);
  const [driveEnabled, setDriveEnabled] = useState(false);
  const [firmware, setFirmware] = useState<Firmware>(EMPTY_FIRMWARE);
  const [grouping, setGrouping] = useState(false); // bulk "assign a site" mode
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignSite, setAssignSite] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = () => fetchFleet().then(setFleet);
    load();
    fetchFleetConfig().then((c) => setDriveEnabled(c.drive_enabled));
    fetchFirmwareTags().then(setFirmware);
    window.addEventListener("fleet-changed", load);
    return () => window.removeEventListener("fleet-changed", load);
  }, []);

  const towers = Object.values(fleet).sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const existingIds = towers.map((t) => t.id);

  // Duplicate: seed a new-tower dialog with everything but the id + Drive folder.
  const duplicate = (t: Tower) => {
    setSelectedId(null);
    setAddSeed({ ...t, id: "", drive_url: undefined, updated_at: undefined });
  };

  // --- grouping by site ---
  const sites = Array.from(new Set(towers.map((t) => (t.site ?? "").trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );
  const grouped = new Map<string, Tower[]>();
  for (const t of towers) {
    const key = (t.site ?? "").trim();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }
  // Named sites first (alphabetical), the "Ungrouped" bucket last.
  const groupKeys = [...grouped.keys()].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
  );

  const saveSite = (t: Tower, site: string) => saveTower({ ...t, site });
  const autoGroup = async () => {
    for (const t of towers) {
      if (!(t.site ?? "").trim()) {
        const s = siteSuggestion(t.name ?? "");
        if (s) await saveSite(t, s);
      }
    }
  };
  const applyGroup = async () => {
    const site = assignSite.trim();
    if (!site) return;
    for (const id of selected) {
      const t = fleet[id];
      if (t) await saveSite(t, site);
    }
    setSelected(new Set());
    setAssignSite("");
    setGrouping(false);
  };
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
              {/* Toolbar */}
              {!grouping ? (
                <>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setAddSeed({ id: "", status: "deployed" });
                        setSelectedId(null);
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-rule py-2 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add tower
                    </button>
                    {towers.length > 1 && (
                      <button
                        onClick={() => setGrouping(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rule px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Group
                      </button>
                    )}
                  </div>
                  {sites.length === 0 && towers.length > 1 && (
                    <button
                      onClick={autoGroup}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-2"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Auto-group {towers.length} towers by name
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Select towers, then assign a site</span>
                  <button
                    onClick={() => {
                      setGrouping(false);
                      setSelected(new Set());
                      setAssignSite("");
                    }}
                    className="font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {towers.length === 0 && (
                <p className="pt-6 text-center text-sm text-muted-foreground">
                  No towers recorded yet.
                </p>
              )}

              {/* List: select-mode checklist, grouped view, or a flat list. */}
              {grouping ? (
                <>
                  {towers.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-rule bg-surface px-3 py-2.5 hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                      />
                      <span className="font-mono text-sm text-foreground">{t.id}</span>
                      {t.name && (
                        <span className="truncate text-xs text-muted-foreground">{t.name}</span>
                      )}
                      {t.site && (
                        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
                          {t.site}
                        </span>
                      )}
                    </label>
                  ))}
                  <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-rule bg-background px-4 py-3">
                    <datalist id="fleet-sites">
                      {sites.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    <input
                      list="fleet-sites"
                      value={assignSite}
                      onChange={(e) => setAssignSite(e.target.value)}
                      placeholder="Site name (pick or type)"
                      className={inputCls}
                    />
                    <button
                      onClick={applyGroup}
                      disabled={selected.size === 0 || !assignSite.trim()}
                      className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-40"
                    >
                      Assign{selected.size ? ` ${selected.size}` : ""}
                    </button>
                  </div>
                </>
              ) : sites.length === 0 ? (
                towers.map((t) => (
                  <TowerRow key={t.id} tower={t} onOpen={() => setSelectedId(t.id)} />
                ))
              ) : (
                groupKeys.map((key) => (
                  <div key={key || "__ungrouped__"} className="space-y-2">
                    <button
                      onClick={() => toggleCollapse(key)}
                      className="flex w-full items-center gap-1.5 pt-1 text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
                    >
                      {collapsed.has(key) ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {key || "Ungrouped"}
                      <span className="rounded bg-muted px-1 text-[0.6rem] tabular-nums text-muted-foreground">
                        {grouped.get(key)!.length}
                      </span>
                    </button>
                    {!collapsed.has(key) &&
                      grouped
                        .get(key)!
                        .map((t) => (
                          <TowerRow key={t.id} tower={t} onOpen={() => setSelectedId(t.id)} />
                        ))}
                  </div>
                ))
              )}
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
          firmware={firmware}
          sites={sites}
          onDuplicate={duplicate}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Add a new tower (or a duplicate) — opens straight in edit mode. */}
      {addSeed && (
        <TowerDialog
          tower={addSeed}
          isNew
          existingIds={existingIds}
          driveEnabled={driveEnabled}
          firmware={firmware}
          sites={sites}
          onClose={() => setAddSeed(null)}
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
  firmware,
  sites,
  onDuplicate,
  onClose,
}: {
  tower: Tower;
  isNew?: boolean;
  existingIds: string[];
  driveEnabled: boolean;
  firmware: Firmware;
  sites: string[];
  onDuplicate?: (t: Tower) => void;
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
            firmware={firmware}
            sites={sites}
            onDone={() => (isNew ? onClose() : setEditing(false))}
            onRemoved={onClose}
          />
        ) : (
          <TowerDetail
            tower={tower}
            driveEnabled={driveEnabled}
            firmware={firmware}
            onEdit={() => setEditing(true)}
            onDuplicate={onDuplicate}
          />
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

function VersionValue({ repo, tag }: { repo: string; tag?: string }) {
  if (!tag) return <>—</>;
  const url = tagUrl(repo, tag);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-foreground underline decoration-rule underline-offset-2 hover:decoration-foreground"
    >
      {tag}
    </a>
  ) : (
    <span className="font-mono">{tag}</span>
  );
}

function TowerDetail({
  tower,
  driveEnabled,
  firmware,
  onEdit,
  onDuplicate,
}: {
  tower: Tower;
  driveEnabled: boolean;
  firmware: Firmware;
  onEdit: () => void;
  onDuplicate?: (t: Tower) => void;
}) {
  const [folderBusy, setFolderBusy] = useState(false);
  const makeFolder = async () => {
    setFolderBusy(true);
    await createTowerFolder(tower.id);
    setFolderBusy(false);
  };
  const hasCoords = tower.lat != null && tower.lng != null;

  return (
    <>
      <div className="px-5 py-2">
        <DetailRow label="Name" value={tower.name} />
        <DetailRow label="Site" value={tower.site} />
        <div className="flex items-start justify-between gap-4 border-b border-rule py-2">
          <span className="shrink-0 text-xs text-muted-foreground">Coordinates</span>
          <span className="text-right text-sm">
            {hasCoords ? (
              <a
                href={`https://www.google.com/maps?q=${tower.lat},${tower.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-foreground underline decoration-rule underline-offset-2 hover:decoration-foreground"
              >
                <MapPin className="h-3 w-3" />
                {tower.lat}, {tower.lng}
              </a>
            ) : (
              "—"
            )}
          </span>
        </div>
        <DetailRow label="Altitude" value={tower.altitude != null ? `${tower.altitude} m` : null} />
        <div className="flex items-start justify-between gap-4 border-b border-rule py-2">
          <span className="shrink-0 text-xs text-muted-foreground">Flashed firmware</span>
          <span className="text-right text-sm">
            <VersionValue repo={firmware.repo} tag={tower.flashed_version} />
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-rule py-2">
          <span className="shrink-0 text-xs text-muted-foreground">Current firmware</span>
          <span className="text-right text-sm">
            <VersionValue repo={firmware.repo} tag={tower.version} />
          </span>
        </div>
        <DetailRow label="Notes" value={tower.notes} />
        {tower.updated_at && (
          <div className="flex items-start justify-between gap-4 py-2">
            <span className="shrink-0 text-xs text-muted-foreground">Last updated</span>
            <span className="text-right text-xs text-muted-foreground">
              {formatDateTime(tower.updated_at) ?? tower.updated_at}
            </span>
          </div>
        )}
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

      <div className="flex items-center justify-between gap-2 border-t border-rule px-5 py-3">
        {onDuplicate ? (
          <button
            onClick={() => onDuplicate(tower)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
        ) : (
          <span />
        )}
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
  firmware,
  sites,
  onDone,
  onRemoved,
}: {
  initial: Tower;
  isNew?: boolean;
  existingIds: string[];
  firmware: Firmware;
  sites: string[];
  onDone: () => void;
  onRemoved: () => void;
}) {
  const [id, setId] = useState(initial.id ?? "");
  const [name, setName] = useState(initial.name ?? "");
  const [site, setSite] = useState(initial.site ?? "");
  const [lat, setLat] = useState(initial.lat != null ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial.lng != null ? String(initial.lng) : "");
  const [altitude, setAltitude] = useState(
    initial.altitude != null ? String(initial.altitude) : "",
  );
  const [version, setVersion] = useState(initial.version ?? "");
  const [flashedVersion, setFlashedVersion] = useState(initial.flashed_version ?? "");
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
      site: site.trim(),
      lat: numOrNull(lat),
      lng: numOrNull(lng),
      altitude: numOrNull(altitude),
      version: version.trim(),
      flashed_version: flashedVersion.trim(),
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
        placeholder="Name (e.g. Saddler #1)"
        className={inputCls}
      />

      <datalist id="form-sites">
        {sites.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <input
        list="form-sites"
        value={site}
        onChange={(e) => setSite(e.target.value)}
        placeholder="Site — groups towers (e.g. Saddler)"
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

      {/* Firmware: pick a real git tag (or type a value, e.g. a describe string). */}
      <datalist id="fw-tags">
        {firmware.tags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Flashed
          </span>
          <input
            list="fw-tags"
            value={flashedVersion}
            onChange={(e) => setFlashedVersion(e.target.value)}
            placeholder={firmware.enabled ? "pick a tag" : "e.g. v1.1.3"}
            className={`${inputCls} font-mono`}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Current
          </span>
          <input
            list="fw-tags"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder={firmware.enabled ? "pick a tag" : "e.g. v1.1.4"}
            className={`${inputCls} font-mono`}
          />
        </label>
      </div>

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
