import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Advisor prose. Figures land inside tables and lists constantly, so numerals
 * stay tabular and tables get the same hairline treatment as the rest of the
 * app rather than browser defaults.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("advisor-prose text-sm leading-relaxed text-foreground/90", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children: content }) => <p className="mb-3 last:mb-0">{content}</p>,
          h1: ({ children: content }) => (
            <h3 className="mb-2 mt-5 text-base font-medium tracking-tight text-foreground first:mt-0">
              {content}
            </h3>
          ),
          h2: ({ children: content }) => (
            <h3 className="mb-2 mt-5 text-sm font-medium tracking-tight text-foreground first:mt-0">
              {content}
            </h3>
          ),
          h3: ({ children: content }) => (
            <h4 className="mb-2 mt-4 text-xs font-medium uppercase tracking-[0.12em] text-gold first:mt-0">
              {content}
            </h4>
          ),
          h4: ({ children: content }) => (
            <h4 className="mb-2 mt-4 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground first:mt-0">
              {content}
            </h4>
          ),
          ul: ({ children: content }) => (
            <ul className="mb-3 space-y-1.5 last:mb-0">{content}</ul>
          ),
          ol: ({ children: content }) => (
            <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0 marker:text-muted-foreground">
              {content}
            </ol>
          ),
          li: ({ children: content, ...props }) => {
            const ordered = "index" in props;
            return (
              <li className={ordered ? "pl-1" : "relative pl-4"}>
                {!ordered && (
                  <span className="absolute left-0 top-[0.55em] h-1 w-1 rounded-full bg-gold/70" />
                )}
                {content}
              </li>
            );
          },
          strong: ({ children: content }) => (
            <strong className="font-medium text-foreground">{content}</strong>
          ),
          em: ({ children: content }) => <em className="italic text-foreground/80">{content}</em>,
          a: ({ children: content, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-gold underline underline-offset-2"
            >
              {content}
            </a>
          ),
          blockquote: ({ children: content }) => (
            <blockquote className="mb-3 border-l-2 border-gold-line pl-3 text-foreground/75">
              {content}
            </blockquote>
          ),
          code: ({ children: content, className: codeClass }) =>
            codeClass?.includes("language-") ? (
              <code className="num block overflow-x-auto rounded-md border border-border bg-surface-raised p-3 text-xs">
                {content}
              </code>
            ) : (
              <code className="num rounded border border-border bg-surface-raised px-1 py-0.5 text-[0.8em]">
                {content}
              </code>
            ),
          pre: ({ children: content }) => <pre className="mb-3 last:mb-0">{content}</pre>,
          hr: () => <hr className="my-4 border-border" />,
          table: ({ children: content }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-xs">{content}</table>
            </div>
          ),
          thead: ({ children: content }) => (
            <thead className="border-b border-border text-muted-foreground">{content}</thead>
          ),
          th: ({ children: content }) => (
            <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium uppercase tracking-[0.08em] text-[0.62rem]">
              {content}
            </th>
          ),
          td: ({ children: content }) => (
            <td className="num border-b border-border/60 px-2 py-1.5 align-top text-foreground/85">
              {content}
            </td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
