import { useMemo } from 'react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@/components/ui/code-block';
import { MermaidRenderer } from '@/components/ui/mermaid-renderer';
import { toLocalFileBaseUrl } from '@/lib/localFileUrl';

const URL_SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function getDirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx === -1) return '';
  return idx === 0 ? '/' : normalized.slice(0, idx);
}

function normalizePathnameForCompare(pathname: string): string {
  const platform = window.electronAPI.env.platform;
  const normalized = pathname.replace(/\/+$/, '');
  if (platform === 'win32' || platform === 'darwin') return normalized.toLowerCase();
  return normalized;
}

function resolveImageSrc(
  src: string | undefined,
  markdownFilePath: string,
  rootPath?: string
): string | undefined {
  if (!src) return undefined;

  const raw = src.trim();
  if (!raw) return undefined;

  // External images / data URIs are allowed.
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }

  // Protocol-relative URL (//example.com/img.png) → default to https.
  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  // Disallow explicit schemes like file:, local-file:, javascript:, etc.
  if (URL_SCHEME_REGEX.test(raw)) {
    return undefined;
  }

  if (!rootPath) return undefined;

  const rootBaseUrl = toLocalFileBaseUrl(rootPath);
  const fileDirBaseUrl = toLocalFileBaseUrl(getDirname(markdownFilePath));

  const normalizedSrc = raw.replace(/\\/g, '/');
  const resolvedUrl = normalizedSrc.startsWith('/')
    ? new URL(normalizedSrc.slice(1), rootBaseUrl)
    : new URL(normalizedSrc, fileDirBaseUrl);

  const rootPathname = normalizePathnameForCompare(rootBaseUrl.pathname);
  const resolvedPathname = normalizePathnameForCompare(resolvedUrl.pathname);

  if (resolvedPathname !== rootPathname && !resolvedPathname.startsWith(`${rootPathname}/`)) {
    return undefined;
  }

  return resolvedUrl.toString();
}

function createMarkdownComponents(markdownFilePath: string, rootPath?: string): Components {
  return {
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match?.[1];
      const codeString = String(children).replace(/\n$/, '');

      // 检测 mermaid 代码块
      if (language === 'mermaid') {
        return <MermaidRenderer code={codeString} />;
      }

      if (language) {
        return <CodeBlock code={codeString} language={language} />;
      }

      if (codeString.includes('\n')) {
        return <CodeBlock code={codeString} />;
      }

      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
          {children}
        </code>
      );
    },
    p: ({ children, ...props }) => (
      <p className="my-3 leading-7" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul className="my-3 ml-6 list-disc" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="my-3 ml-6 list-decimal" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="mt-1" {...props}>
        {children}
      </li>
    ),
    a: ({ children, href, ...props }) => (
      <a
        className="text-primary underline underline-offset-4 hover:text-primary/80"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    ),
    table: ({ children, ...props }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse border border-border" {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th className="border border-border bg-muted px-3 py-2 text-left font-semibold" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="border border-border px-3 py-2" {...props}>
        {children}
      </td>
    ),
    h1: ({ children, ...props }) => (
      <h1 className="mt-8 mb-4 text-2xl font-bold" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="mt-6 mb-3 text-xl font-semibold" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="mt-5 mb-2 text-lg font-semibold" {...props}>
        {children}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4 className="mt-4 mb-2 text-base font-semibold" {...props}>
        {children}
      </h4>
    ),
    h5: ({ children, ...props }) => (
      <h5 className="mt-3 mb-1 text-sm font-semibold" {...props}>
        {children}
      </h5>
    ),
    h6: ({ children, ...props }) => (
      <h6 className="mt-3 mb-1 text-sm font-medium text-muted-foreground" {...props}>
        {children}
      </h6>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="my-4 border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
        {...props}
      >
        {children}
      </blockquote>
    ),
    hr: (props) => <hr className="my-6 border-border" {...props} />,
    img: ({ src, alt, ...props }) => (
      <img
        className="my-4 max-w-full rounded-md"
        src={resolveImageSrc(src, markdownFilePath, rootPath)}
        alt={alt}
        loading="lazy"
        {...props}
      />
    ),
  };
}

interface MarkdownPreviewProps {
  content: string;
  filePath: string;
  rootPath?: string;
}

export function MarkdownPreview({ content, filePath, rootPath }: MarkdownPreviewProps) {
  const components = useMemo(
    () => createMarkdownComponents(filePath, rootPath),
    [filePath, rootPath]
  );

  return (
    <div className="p-4 text-sm text-foreground">
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
