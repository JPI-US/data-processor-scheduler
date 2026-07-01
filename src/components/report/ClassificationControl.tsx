import { useEffect, useState } from "react";
import {
  EMPTY_VERSIONS,
  fetchLabels,
  fetchVersions,
  setLabel,
  type RunLabel,
  type SavedReport,
  type Versions,
} from "@/lib/report/storage";

const inputCls =
  "w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground";

/** Tag a night as normal or test (with a name/version/note). Normal is the
 *  default and is assumed to be the deployment version unless overridden here.
 *  Test runs are excluded from the normal trend baselines. */
export function ClassificationControl({ report }: { report: SavedReport }) {
  const initial = report.label ?? { run_type: "normal" as const };
  const [runType, setRunType] = useState<"normal" | "test">(initial.run_type);
  const [testName, setTestName] = useState(initial.test_name ?? "");
  const [version, setVersion] = useState(initial.version ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [versions, setVersions] = useState<Versions>(EMPTY_VERSIONS);
  const [knownTests, setKnownTests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchVersions().then(setVersions);
    // Offer test names already used elsewhere so the same test is spelled the
    // same way every time (and shows up as one series in the trend layer).
    fetchLabels().then((labels) => {
      const names = Array.from(
        new Set(
          Object.values(labels)
            .filter((l) => l.run_type === "test" && l.test_name)
            .map((l) => l.test_name as string),
        ),
      ).sort();
      setKnownTests(names);
    });
  }, []);

  const dirty =
    runType !== initial.run_type ||
    testName !== (initial.test_name ?? "") ||
    version !== (initial.version ?? "") ||
    note !== (initial.note ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const label: RunLabel = { run_type: runType };
      if (runType === "test" && testName.trim()) label.test_name = testName.trim();
      if (runType === "normal" && version) label.version = version;
      if (note.trim()) label.note = note.trim();
      await setLabel(report.date, label);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const versionOpts = Array.from(
    new Set([versions.stable, versions.deployment, versions.testing].filter(Boolean)),
  );

  return (
    <div>
      <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Classification
      </div>
      <div className="space-y-2 rounded-lg border border-rule p-3">
        <div className="flex gap-1.5">
          {(["normal", "test"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setRunType(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                runType === t
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-surface-2"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {runType === "test" && (
          <>
            <input
              list="axum-known-tests"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Test name — pick an existing one or type a new one"
              className={inputCls}
            />
            <datalist id="axum-known-tests">
              {knownTests.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </>
        )}

        {runType === "normal" && (
          <select value={version} onChange={(e) => setVersion(e.target.value)} className={inputCls}>
            <option value="">
              deployment default{versions.deployment ? ` (v${versions.deployment})` : ""}
            </option>
            {versionOpts.map((v) => (
              <option key={v} value={v}>
                v{v}
              </option>
            ))}
          </select>
        )}

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className={inputCls}
        />

        {report.metrics?.firmware && (
          <div className="text-[0.65rem] text-muted-foreground">
            device reported: <span className="font-mono">{report.metrics.firmware}</span>
          </div>
        )}

        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
