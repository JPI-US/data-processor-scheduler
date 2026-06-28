import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/report/parse";

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav className="sticky top-8 hidden max-h-[calc(100vh-4rem)] overflow-y-auto pr-4 lg:block">
      <div className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Contents
      </div>
      <ol className="space-y-1 border-l border-rule">
        {items.map((item) => (
          <li key={item.id} style={{ paddingLeft: `${(item.level - 2) * 0.75}rem` }}>
            <a
              href={`#${item.id}`}
              className={`-ml-px block border-l-2 py-1 pl-3 text-sm transition-colors ${
                active === item.id
                  ? "border-accent font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-rule hover:text-foreground"
              }`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
