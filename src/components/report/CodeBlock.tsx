import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";

export function CodeBlock({
  raw,
  language,
  children,
  collapsible = false,
  title,
}: {
  raw: string;
  language?: string;
  children: ReactNode;
  collapsible?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(!collapsible);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-rule bg-surface-2">
      <header className="flex items-center justify-between gap-2 border-b border-rule bg-surface px-3 py-1.5">
        <button
          onClick={() => collapsible && setOpen((v) => !v)}
          className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground ${
            collapsible ? "cursor-pointer hover:text-foreground" : "cursor-default"
          }`}
        >
          {collapsible && (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
          {title ?? language ?? "code"}
        </button>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </header>
      {open && (
        <pre className="overflow-x-auto bg-surface-2 px-4 py-3 font-mono text-[0.85rem] leading-relaxed">
          {children}
        </pre>
      )}
    </figure>
  );
}
