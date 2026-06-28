import { useCallback, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";

export function UploadDropzone({ onLoad }: { onLoad: (text: string, name: string) => void }) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!/\.(md|markdown|txt)$/i.test(file.name)) {
        setError("Please upload a .md, .markdown, or .txt file.");
        return;
      }
      const text = await file.text();
      onLoad(text, file.name);
    },
    [onLoad],
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
      <div className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <FileText className="h-3.5 w-3.5" /> Report viewer
        </div>
        <h1 className="font-serif text-5xl font-medium tracking-tight text-foreground">
          Read your Claude reports
          <br />
          <span className="italic text-accent">like they were printed.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
          Drop in a markdown report and we'll set it in proper type — verdicts,
          status pills, metric tables, and timelines, all rendered with care.
        </p>
      </div>

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
        className={`group flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-surface px-8 py-14 text-center transition-all ${
          drag ? "border-accent bg-accent/5" : "border-rule hover:border-accent/50 hover:bg-surface-2"
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
          }}
        />
        <div className="rounded-full bg-accent/10 p-3 text-accent transition-transform group-hover:scale-110">
          <Upload className="h-6 w-6" />
        </div>
        <div>
          <div className="text-base font-medium text-foreground">
            Drop a report here, or <span className="text-accent underline">browse</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            .md, .markdown, or .txt — parsed locally, never uploaded
          </div>
        </div>
      </label>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-fail)]/30 bg-[var(--color-fail-soft)] px-4 py-2 text-sm text-[var(--color-fail)]">
          {error}
        </div>
      )}
    </div>
  );
}
