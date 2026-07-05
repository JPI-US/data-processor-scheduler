import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  setVersions,
  fetchFirmwareTags,
  type SavedReport,
  type Versions,
} from "@/lib/report/storage";

/** GitHub link for a registry version, but only if that tag actually exists in
 *  the firmware repo (matched loosely on a leading "v"). null = show no link. */
function tagLink(repo: string, tags: string[], value: string): string | null {
  const v = (value ?? "").trim();
  if (!repo || !v) return null;
  const norm = (s: string) => s.replace(/^v/i, "");
  const found = tags.find((t) => t === v || norm(t) === norm(v));
  return found ? `https://github.com/${repo}/tree/${encodeURIComponent(found)}` : null;
}

/** Which slice of nights the trend layer (strip / cards / streak) shows. */
export interface OverviewView {
  category: "normal" | "test";
  version: string; // "all" or a version string
  testName: string; // "all" or a test name
}

export const DEFAULT_VIEW: OverviewView = { category: "normal", version: "all", testName: "all" };

const TRACKS: { key: keyof Versions; label: string }[] = [
  { key: "stable", label: "Stable (master)" },
  { key: "deployment", label: "Deployment" },
  { key: "testing", label: "Testing" },
];

const selectCls =
  "rounded border border-rule bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function OverviewControls({
  reports,
  versions,
  view,
  onView,
}: {
  reports: SavedReport[];
  versions: Versions;
  view: OverviewView;
  onView: (v: OverviewView) => void;
}) {
  const [draft, setDraft] = useState<Versions>(versions);
  useEffect(() => setDraft(versions), [versions]);

  // Firmware repo + tags, so a saved registry version can link to its GitHub tag.
  const [fw, setFw] = useState<{ repo: string; tags: string[] }>({ repo: "", tags: [] });
  useEffect(() => {
    fetchFirmwareTags().then((f) => setFw({ repo: f.repo, tags: f.tags }));
  }, []);

  const saveVersions = () => {
    if (
      draft.stable !== versions.stable ||
      draft.deployment !== versions.deployment ||
      draft.testing !== versions.testing
    ) {
      setVersions(draft).catch(() => {});
    }
  };

  const versionOptions = Array.from(
    new Set([versions.stable, versions.deployment, versions.testing].filter(Boolean)),
  );
  const testNames = Array.from(
    new Set(
      reports
        .filter((r) => r.label?.run_type === "test" && r.label.test_name)
        .map((r) => r.label!.test_name as string),
    ),
  );

  return (
    <div className="mb-6 space-y-3 rounded-xl border border-rule bg-surface px-4 py-3">
      {/* Editable version registry */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Versions
        </span>
        {TRACKS.map((t) => (
          <label key={t.key} className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">{t.label}</span>
            <input
              value={draft[t.key]}
              onChange={(e) => setDraft({ ...draft, [t.key]: e.target.value })}
              onBlur={saveVersions}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder="—"
              className="w-16 rounded border border-rule bg-background px-1.5 py-0.5 font-mono text-foreground"
            />
            {(() => {
              const url = tagLink(fw.repo, fw.tags, versions[t.key]);
              return url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open ${versions[t.key]} on GitHub`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null;
            })()}
          </label>
        ))}
      </div>

      {/* Which slice drives the trend layer */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Showing
        </span>
        <select
          value={view.category}
          onChange={(e) => onView({ ...view, category: e.target.value as "normal" | "test" })}
          className={selectCls}
        >
          <option value="normal">Normal</option>
          <option value="test">Test</option>
        </select>
        {view.category === "normal" ? (
          <select
            value={view.version}
            onChange={(e) => onView({ ...view, version: e.target.value })}
            className={selectCls}
          >
            <option value="all">all versions</option>
            {versionOptions.map((v) => (
              <option key={v} value={v}>
                v{v}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={view.testName}
            onChange={(e) => onView({ ...view, testName: e.target.value })}
            className={selectCls}
          >
            <option value="all">all tests</option>
            {testNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
