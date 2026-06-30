import { useState } from "react";
import { setLabel, type RunLabel, type SavedReport } from "@/lib/report/storage";

/** Tag a night as normal or test (with a name/note). Normal is the default;
 *  test runs are excluded from the trend baselines so experiments don't pollute
 *  day-over-day analysis. */
export function ClassificationControl({ report }: { report: SavedReport }) {
  const initial = report.label ?? { run_type: "normal" as const };
  const [runType, setRunType] = useState<"normal" | "test">(initial.run_type);
  const [testName, setTestName] = useState(initial.test_name ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    runType !== initial.run_type ||
    testName !== (initial.test_name ?? "") ||
    note !== (initial.note ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const label: RunLabel = { run_type: runType };
      if (runType === "test" && testName.trim()) label.test_name = testName.trim();
      if (note.trim()) label.note = note.trim();
      await setLabel(report.date, label);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

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
          <input
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            placeholder="Test name (e.g. motors-no-wifi)"
            className="w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
          />
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
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
