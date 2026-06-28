import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { Children, isValidElement, type ReactNode } from "react";
import { detectStatus, isTimelineBlock, stripStatusGlyphs } from "@/lib/report/parse";
import { StatusPill } from "./StatusPill";
import { Callout } from "./Callout";
import { TimelineBlock } from "./TimelineBlock";
import { CodeBlock } from "./CodeBlock";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return textOf(props.children);
  }
  return "";
}

function HeadingWithStatus({ level, children, ...rest }: { level: 2 | 3 | 4; children: ReactNode } & Record<string, unknown>) {
  const Tag = `h${level}` as "h2" | "h3" | "h4";
  const raw = textOf(children);
  const m = raw.match(/^(.*?)\s*[—–-]\s*(PASS|FAIL|WARN)\s*$/i);
  let label: string | null = null;
  let status = detectStatus(raw);
  if (m) {
    label = m[2].toUpperCase();
    status = detectStatus(m[2]);
  }
  const cleaned = m ? m[1] : stripStatusGlyphs(raw);
  return (
    <Tag {...rest}>
      <span>{cleaned}</span>
      {status && <StatusPill status={status} label={label ?? undefined} />}
    </Tag>
  );
}

const components: Components = {
  h2: ({ children, ...rest }) => <HeadingWithStatus level={2} {...rest}>{children}</HeadingWithStatus>,
  h3: ({ children, ...rest }) => <HeadingWithStatus level={3} {...rest}>{children}</HeadingWithStatus>,
  h4: ({ children, ...rest }) => <HeadingWithStatus level={4} {...rest}>{children}</HeadingWithStatus>,
  blockquote: ({ children }) => {
    // detect "**Label:** ..." in first paragraph
    const text = textOf(children).trim();
    const m = text.match(/^([A-Z][\w \/]+):\s*([\s\S]+)$/);
    const lower = text.toLowerCase();
    const kind = lower.includes("warn") || lower.includes("caution")
      ? "warning"
      : lower.includes("tip")
      ? "tip"
      : "note";
    if (m) {
      return (
        <Callout kind={kind} title={m[1]}>
          <p>{m[2]}</p>
        </Callout>
      );
    }
    return <Callout kind={kind}>{children}</Callout>;
  },
  td: ({ children, ...rest }) => {
    const text = textOf(children).trim();
    const status = detectStatus(text);
    if (status && /^[✅❌⚠️⚠]\s*(PASS|FAIL|WARN)/i.test(text)) {
      return (
        <td {...rest}>
          <StatusPill status={status} />
        </td>
      );
    }
    return <td {...rest}>{children}</td>;
  },
  pre: ({ children }) => {
    // children is a <code>...</code>
    const codeEl = Children.toArray(children).find(
      (c) => isValidElement(c) && (c.type as { name?: string }).name !== undefined || (isValidElement(c) && c.props),
    );
    if (!isValidElement(codeEl)) return <pre>{children}</pre>;
    const codeProps = codeEl.props as { className?: string; children?: ReactNode };
    const className = codeProps.className ?? "";
    const langMatch = className.match(/language-(\w+)/);
    const language = langMatch?.[1];
    const raw = textOf(codeProps.children).replace(/\n$/, "");

    if (!language && isTimelineBlock(raw)) {
      return <TimelineBlock content={raw} />;
    }

    const isJson = language === "json";
    return (
      <CodeBlock
        raw={raw}
        language={language}
        collapsible={isJson && raw.length > 200}
        title={isJson ? "machine-readable summary" : language}
      >
        {codeEl}
      </CodeBlock>
    );
  },
};

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-report max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
