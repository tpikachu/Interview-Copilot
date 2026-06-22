import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders model answers as clean, readable markdown (headings, lists, code,
 *  bold). Styled for compact overlay reading; no remote/raw HTML (CSP-safe). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-[1.1em] font-semibold text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[1.05em] font-semibold text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="font-semibold text-neutral-100">{children}</h3>,
          p: ({ children }) => <p className="text-neutral-200">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="text-neutral-300">{children}</em>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 text-neutral-200">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 text-neutral-200">{children}</ol>,
          li: ({ children }) => <li className="marker:text-neutral-500">{children}</li>,
          a: ({ children }) => <span className="text-indigo-300 underline">{children}</span>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-neutral-700 pl-3 text-neutral-400">{children}</blockquote>
          ),
          code: ({ className, children }) => {
            const inline = !className;
            return inline ? (
              <code className="rounded bg-neutral-800 px-1 py-0.5 text-[0.9em] text-amber-200">
                {children}
              </code>
            ) : (
              <code className={className}>{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-2.5 text-[0.85em] leading-snug text-neutral-200 ring-1 ring-white/5">
              {children}
            </pre>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
