import type { ContentSearchMatch, ContentSearchResult, FileSearchResult } from '@shared/types';
import { FileCode, FileText } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/shallow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import type { SearchMode } from './useGlobalSearch';

interface SearchResultListProps {
  mode: SearchMode;
  fileResults: FileSearchResult[];
  contentResults: ContentSearchResult | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpen: (item: FileSearchResult | ContentSearchMatch) => void;
  query: string;
}

// Highlight matching text
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const parts: { text: string; highlight: boolean }[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let lastIndex = 0;

  let index = lowerText.indexOf(lowerQuery);
  while (index !== -1) {
    if (index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, index), highlight: false });
    }
    parts.push({ text: text.slice(index, index + query.length), highlight: true });
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are derived from text split, order is stable
          <mark key={i} className="bg-yellow-500/40 text-inherit rounded-sm px-0.5">
            {part.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are derived from text split, order is stable
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

// Get file icon based on extension
function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'cpp', 'c', 'h'];
  if (codeExts.includes(ext)) {
    return <FileCode className="h-4 w-4 shrink-0 text-blue-500" />;
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function SearchResultList({
  mode,
  fileResults,
  contentResults,
  selectedIndex,
  onSelect,
  onOpen,
  query,
}: SearchResultListProps) {
  const { t } = useI18n();
  const editorSettings = useSettingsStore(useShallow((s) => s.editorSettings));
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view when selection changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedIndex triggers scroll, ref is stable
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleItemClick = useCallback(
    (index: number) => {
      onSelect(index);
    },
    [onSelect]
  );

  const handleItemDoubleClick = useCallback(
    (item: FileSearchResult | ContentSearchMatch) => {
      onOpen(item);
    },
    [onOpen]
  );

  if (mode === 'files') {
    if (fileResults.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {query ? t('No files found') : t('Type to search files')}
        </div>
      );
    }

    return (
      <ScrollArea className="h-full">
        <div ref={listRef} className="p-1" role="listbox">
          {fileResults.map((result, index) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by parent dialog
            <div
              key={result.path}
              ref={index === selectedIndex ? selectedRef : undefined}
              role="option"
              aria-selected={index === selectedIndex}
              className={cn(
                'flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-sm',
                index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
              tabIndex={-1}
              onClick={() => handleItemClick(index)}
              onDoubleClick={() => handleItemDoubleClick(result)}
            >
              {getFileIcon(result.path)}
              <span className="min-w-0 flex-1 truncate" title={result.relativePath}>
                <HighlightText text={result.name} query={query} />
              </span>
              <span className="shrink-0 text-xs text-muted-foreground" title={result.relativePath}>
                {result.relativePath.replace(result.name, '').replace(/\/$/, '')}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  // Content search mode
  const matches = contentResults?.matches ?? [];

  if (matches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {query ? t('No matches found') : t('Type to search in files')}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div ref={listRef} className="p-1" role="listbox">
        {matches.map((match, index) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by parent dialog
          <div
            key={`${match.path}:${match.line}:${match.column}`}
            ref={index === selectedIndex ? selectedRef : undefined}
            role="option"
            aria-selected={index === selectedIndex}
            className={cn(
              'flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-sm',
              index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
            tabIndex={-1}
            onClick={() => handleItemClick(index)}
            onDoubleClick={() => handleItemDoubleClick(match)}
          >
            <span
              className="min-w-0 flex-1 truncate text-xs"
              style={{ fontFamily: editorSettings.fontFamily }}
            >
              <HighlightText text={match.content.trim()} query={query} />
            </span>
            <span
              className="shrink-0 truncate text-xs text-muted-foreground max-w-[200px]"
              title={match.relativePath}
            >
              {match.relativePath.split('/').pop()}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{match.line}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
