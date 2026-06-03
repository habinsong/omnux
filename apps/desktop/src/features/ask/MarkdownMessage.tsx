import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeHref(value: unknown) {
  const href = typeof value === "string" ? value.trim() : "";
  if (!href) return undefined;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  return undefined;
}

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ href, children }) {
          const safe = safeHref(href);
          return safe ? (
            <a href={safe} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          );
        }
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
