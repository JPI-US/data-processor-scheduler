import { useMemo } from "react";
import { extractToc, parseReport } from "@/lib/report/parse";
import { Markdown } from "./Markdown";
import { TableOfContents } from "./TableOfContents";
import { VerdictHero } from "./VerdictHero";

export function ReportView({ source, fileName }: { source: string; fileName: string }) {
  const { title, metaLines, verdict, body } = useMemo(() => parseReport(source), [source]);
  const toc = useMemo(() => extractToc(body), [body]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
      <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="no-print">
          <TableOfContents items={toc} />
        </aside>

        <article className="min-w-0">
          <header className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            {fileName}
          </header>
          <h1 className="font-serif text-4xl font-medium leading-tight tracking-tight text-foreground sm:text-5xl">
            {title}
          </h1>

          {metaLines.length > 0 && (
            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-y border-rule py-4 text-sm">
              {metaLines.map((m, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    {m.key}
                  </dt>
                  <dd className="font-mono text-foreground">{stripMd(m.value)}</dd>
                </div>
              ))}
            </dl>
          )}

          {verdict && (
            <VerdictHero status={verdict.status} label={verdict.label} summary={verdict.summary} />
          )}

          <Markdown source={body} />
        </article>
      </div>
    </div>
  );
}

function stripMd(s: string): string {
  return s.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}
