import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { ContentSearchMatch, FileSearchResult } from '@shared/types';
import {
  CaseSensitive,
  FileCode,
  FileText,
  Filter,
  Regex,
  Search,
  WholeWord,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogBackdrop, DialogPortal, DialogViewport } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { SearchPreviewPanel } from './SearchPreviewPanel';
import { SearchResultList } from './SearchResultList';
import { type SearchMode, useGlobalSearch } from './useGlobalSearch';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootPath: string | undefined;
  initialMode?: SearchMode;
  onOpenFile: (path: string, line?: number, column?: number, matchLength?: number) => void;
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
  rootPath,
  initialMode = 'content',
  onOpenFile,
}: GlobalSearchDialogProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dividerY, setDividerY] = useState(50);

  const {
    mode,
    query,
    options,
    fileResults,
    contentResults,
    selectedIndex,
    isLoading,
    setQuery,
    setMode,
    setOptions,
    setSelectedIndex,
    moveSelection,
    getSelectedItem,
    reset,
  } = useGlobalSearch(rootPath);

  // Set initial mode when opening
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      // Get pending search query from window (set by FilePanel when opening search)
      const pendingQuery = window._pendingSearchQuery;
      if (pendingQuery) {
        setQuery(pendingQuery);
        window._pendingSearchQuery = undefined; // Clear after use
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      reset();
    }
  }, [open, initialMode, setMode, setQuery, reset]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 中文输入法正在输入时不处理
      if (e.nativeEvent.isComposing) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveSelection(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveSelection(-1);
          break;
        case 'Enter': {
          e.preventDefault();
          const item = getSelectedItem();
          if (item) {
            if ('line' in item) {
              // ContentSearchMatch
              onOpenFile(item.path, item.line, item.column, item.matchLength);
            } else {
              // FileSearchResult
              onOpenFile(item.path);
            }
            onOpenChange(false);
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [moveSelection, getSelectedItem, onOpenFile, onOpenChange]
  );

  // Resizer handling
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startDividerY = dividerY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const container = (e.target as HTMLElement).closest('[data-search-container]');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const deltaY = moveEvent.clientY - startY;
        const deltaPercent = (deltaY / rect.height) * 100;
        const newY = Math.max(20, Math.min(80, startDividerY + deltaPercent));
        setDividerY(newY);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [dividerY]
  );

  const handleItemSelect = useCallback(
    (item: FileSearchResult | ContentSearchMatch) => {
      if ('line' in item) {
        onOpenFile(item.path, item.line, item.column, item.matchLength);
      } else {
        onOpenFile(item.path);
      }
      onOpenChange(false);
    },
    [onOpenFile, onOpenChange]
  );

  const selectedItem = getSelectedItem();
  const previewPath = selectedItem?.path ?? null;
  const previewLine = selectedItem && 'line' in selectedItem ? selectedItem.line : undefined;

  const totalMatches = mode === 'files' ? fileResults.length : (contentResults?.totalMatches ?? 0);
  const totalFiles = mode === 'files' ? fileResults.length : (contentResults?.totalFiles ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport className="grid-rows-[1fr_auto_1fr]">
          <DialogPrimitive.Popup
            className="no-drag pointer-events-auto relative row-start-2 flex min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
            style={{ height: '70vh' }}
            data-search-container
            onKeyDown={handleKeyDown}
          >
            {/* Search Header */}
            <div className="flex shrink-0 flex-col border-b">
              {/* Search Input Row */}
              <div className="flex h-12 items-center gap-2 px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder={
                    mode === 'files' ? t('Search file name...') : t('Search in files...')
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    onClick={() => setQuery('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <div className="mx-1 h-4 w-px bg-border" />
                {/* Search Options */}
                <button
                  type="button"
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    options.caseSensitive && 'bg-primary/20 text-primary'
                  )}
                  onClick={() => setOptions({ caseSensitive: !options.caseSensitive })}
                  title={t('Match case')}
                >
                  <CaseSensitive className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    options.wholeWord && 'bg-primary/20 text-primary'
                  )}
                  onClick={() => setOptions({ wholeWord: !options.wholeWord })}
                  title={t('Match whole word')}
                >
                  <WholeWord className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    options.regex && 'bg-primary/20 text-primary'
                  )}
                  onClick={() => setOptions({ regex: !options.regex })}
                  title={t('Use regular expression')}
                >
                  <Regex className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    options.useGitignore && 'bg-primary/20 text-primary'
                  )}
                  onClick={() => setOptions({ useGitignore: !options.useGitignore })}
                  title={t('Use .gitignore')}
                >
                  <Filter className="h-4 w-4" />
                </button>
              </div>

              {/* Mode Tabs + Stats */}
              <div className="flex h-8 items-center gap-2 px-3 text-xs">
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-1 rounded px-2 py-1',
                    mode === 'files'
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                  onClick={() => setMode('files')}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('Files')} (P)
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-1 rounded px-2 py-1',
                    mode === 'content'
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                  onClick={() => setMode('content')}
                >
                  <FileCode className="h-3.5 w-3.5" />
                  {t('Content')} (F)
                </button>
                <div className="flex-1" />
                {query && !isLoading && (
                  <span className="text-muted-foreground">
                    {mode === 'content'
                      ? t('{{count}} matches in {{files}} files', {
                          count: totalMatches,
                          files: totalFiles,
                        })
                      : t('{{count}} files', { count: totalMatches })}
                  </span>
                )}
              </div>
            </div>

            {/* Results Area */}
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Result List */}
              <div style={{ height: `${dividerY}%` }} className="min-h-0 overflow-hidden">
                <SearchResultList
                  mode={mode}
                  fileResults={fileResults}
                  contentResults={contentResults}
                  selectedIndex={selectedIndex}
                  onSelect={setSelectedIndex}
                  onOpen={handleItemSelect}
                  query={query}
                />
              </div>

              {/* Resizer */}
              <div
                className="group relative h-1 shrink-0 cursor-row-resize bg-border hover:bg-primary/50 transition-colors"
                onMouseDown={handleDividerMouseDown}
              >
                <div className="absolute inset-x-0 -top-1 -bottom-1" />
              </div>

              {/* Preview Panel */}
              <div style={{ height: `${100 - dividerY}%` }} className="min-h-0 overflow-hidden">
                <SearchPreviewPanel path={previewPath} line={previewLine} query={query} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex h-8 shrink-0 items-center justify-between border-t px-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>↑↓ {t('Navigate')}</span>
                <span>↵ {t('Open')}</span>
                <span>Esc {t('Close')}</span>
              </div>
              {mode === 'content' && (
                <div className="flex items-center gap-1">
                  <span>{t('File mask')}:</span>
                  <input
                    type="text"
                    className="h-5 w-20 rounded border bg-background px-1 text-xs outline-none focus:border-primary"
                    placeholder="*.ts"
                    value={options.filePattern}
                    onChange={(e) => setOptions({ filePattern: e.target.value })}
                  />
                </div>
              )}
            </div>
          </DialogPrimitive.Popup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
