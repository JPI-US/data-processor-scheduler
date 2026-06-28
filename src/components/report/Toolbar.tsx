import { FileUp, Moon, Printer, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function Toolbar({ onReset }: { onReset: () => void }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("report-theme");
    const isDark =
      stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("report-theme", next ? "dark" : "light");
  };

  return (
    <div className="no-print fixed right-6 top-6 z-50 flex items-center gap-1 rounded-full border border-rule bg-surface/90 px-1.5 py-1.5 shadow-sm backdrop-blur">
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Back to reports"
      >
        <FileUp className="h-3.5 w-3.5" />
        Reports
      </button>
      <button
        onClick={() => window.print()}
        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Print / Save as PDF"
      >
        <Printer className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={toggle}
        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Toggle theme"
      >
        {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
