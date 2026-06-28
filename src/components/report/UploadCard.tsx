import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

export function UploadCard({ onLoad }: { onLoad: (text: string, name: string) => void }) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!/\.(md|markdown|txt)$/i.test(file.name)) {
        setError("Please upload a .md, .markdown, or .txt file.");
        return;
      }
      setError(null);
      const text = await file.text();
      onLoad(text, file.name);
    },
    [onLoad],
  );

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed bg-surface px-5 py-4 transition-all ${
          drag
            ? "border-accent bg-accent/5"
            : "border-rule hover:border-accent/50 hover:bg-surface-2"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = "";
          }}
        />
        <div className="rounded-full bg-accent/10 p-2.5 text-accent">
          <Upload className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">Add today's report</div>
          <div className="text-xs text-muted-foreground">
            Drop a .md file, or click to browse. One row per report date — re-uploading overwrites.
          </div>
        </div>
      </label>
      {error && <div className="mt-2 text-xs text-[var(--color-fail)]">{error}</div>}
    </div>
  );
}
