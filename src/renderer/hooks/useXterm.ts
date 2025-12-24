import { FitAddon } from '@xterm/addon-fit';
import { LigaturesAddon } from '@xterm/addon-ligatures';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { useNavigationStore } from '@/stores/navigation';
import { useSettingsStore } from '@/stores/settings';
import '@xterm/xterm/css/xterm.css';

// Regex to match file paths with optional line:column
// Matches: path/to/file.ts:42 or path/to/file.ts:42:10 or ./file.ts:10
// Note: longer extensions must come before shorter ones (tsx before ts, jsx before js, etc.)
const FILE_PATH_REGEX =
  /(?:^|[\s'"({[])((?:\.{1,2}\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:tsx|ts|jsx|js|mjs|cjs|json|scss|css|less|html|vue|svelte|md|yaml|yml|toml|py|go|rs|java|cpp|hpp|c|h|rb|php|bash|zsh|sh))(?::(\d+))?(?::(\d+))?/g;

export interface UseXtermOptions {
  cwd?: string;
  /** Shell command and args to run */
  command?: {
    shell: string;
    args: string[];
  };
  /** Lazy init - only initialize when true */
  isActive?: boolean;
  /** Called when pty exits */
  onExit?: () => void;
  /** Called with pty data for custom processing */
  onData?: (data: string) => void;
  /** Custom key event handler, return false to prevent default */
  onCustomKey?: (event: KeyboardEvent, ptyId: string) => boolean;
}

export interface UseXtermResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  settings: ReturnType<typeof useTerminalSettings>;
  /** Write data to pty */
  write: (data: string) => void;
  /** Manually trigger fit */
  fit: () => void;
  /** Get current terminal instance */
  terminal: Terminal | null;
  /** Search for text in terminal */
  findNext: (
    term: string,
    options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ) => boolean;
  /** Search backwards for text */
  findPrevious: (
    term: string,
    options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ) => boolean;
  /** Clear search decorations */
  clearSearch: () => void;
}

function useTerminalSettings() {
  const {
    terminalTheme,
    terminalFontSize,
    terminalFontFamily,
    terminalFontWeight,
    terminalFontWeightBold,
  } = useSettingsStore();

  const theme = useMemo(() => {
    return getXtermTheme(terminalTheme) ?? defaultDarkTheme;
  }, [terminalTheme]);

  return {
    theme,
    fontSize: terminalFontSize,
    fontFamily: terminalFontFamily,
    fontWeight: terminalFontWeight,
    fontWeightBold: terminalFontWeightBold,
  };
}

export function useXterm({
  cwd,
  command = { shell: '/bin/zsh', args: ['-i', '-l'] },
  isActive = true,
  onExit,
  onData,
  onCustomKey,
}: UseXtermOptions): UseXtermResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const settings = useTerminalSettings();
  const navigateToFile = useNavigationStore((s) => s.navigateToFile);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const exitCleanupRef = useRef<(() => void) | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onCustomKeyRef = useRef(onCustomKey);
  onCustomKeyRef.current = onCustomKey;
  const hasBeenActivatedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasReceivedDataRef = useRef(false);
  // rAF write buffer for smooth rendering
  const writeBufferRef = useRef('');
  const isFlushPendingRef = useRef(false);
  const webglAddonRef = useRef<WebglAddon | null>(null);

  const write = useCallback((data: string) => {
    if (ptyIdRef.current) {
      window.electronAPI.terminal.write(ptyIdRef.current, data);
    }
  }, []);

  const fit = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current && ptyIdRef.current) {
      fitAddonRef.current.fit();
      window.electronAPI.terminal.resize(ptyIdRef.current, {
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      });
    }
  }, []);

  const findNext = useCallback(
    (term: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }) => {
      return searchAddonRef.current?.findNext(term, options) ?? false;
    },
    []
  );

  const findPrevious = useCallback(
    (term: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }) => {
      return searchAddonRef.current?.findPrevious(term, options) ?? false;
    },
    []
  );

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: settings excluded - updated via separate effect
  const initTerminal = useCallback(async () => {
    if (!containerRef.current || terminalRef.current) return;

    setIsLoading(true);

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      fontWeight: settings.fontWeight,
      fontWeightBold: settings.fontWeightBold,
      theme: settings.theme,
      allowProposedApi: true,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.electronAPI.shell.openExternal(uri);
    });
    const unicode11Addon = new Unicode11Addon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    terminal.open(containerRef.current);
    fitAddon.fit();

    // These addons must be loaded after open()
    // Try to use WebGL renderer, fallback to canvas if it fails
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        // WebGL context lost, dispose and fallback to canvas
        webglAddon.dispose();
        webglAddonRef.current = null;
      });
      terminal.loadAddon(webglAddon);
      webglAddonRef.current = webglAddon;
    } catch (error) {
      console.warn('WebGL addon failed to load, using canvas renderer:', error);
    }
    terminal.loadAddon(new LigaturesAddon());

    // Register file path link provider for click-to-open-in-editor
    terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) {
          callback(undefined);
          return;
        }

        const lineText = line.translateToString();
        const links: Array<{
          range: { start: { x: number; y: number }; end: { x: number; y: number } };
          text: string;
          activate: () => void;
        }> = [];

        // Reset regex state
        FILE_PATH_REGEX.lastIndex = 0;

        let match: RegExpExecArray | null = null;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
        while ((match = FILE_PATH_REGEX.exec(lineText)) !== null) {
          const fullMatch = match[0];
          const filePath = match[1];
          const lineNum = match[2] ? Number.parseInt(match[2], 10) : undefined;
          const colNum = match[3] ? Number.parseInt(match[3], 10) : undefined;

          // Calculate start position (skip leading whitespace/delimiter)
          const startIndex =
            match.index +
            (fullMatch.length -
              filePath.length -
              (match[2] ? `:${match[2]}`.length : 0) -
              (match[3] ? `:${match[3]}`.length : 0));

          // Calculate end position
          const endIndex = match.index + fullMatch.length;

          links.push({
            range: {
              start: { x: startIndex + 1, y: bufferLineNumber },
              end: { x: endIndex + 1, y: bufferLineNumber },
            },
            text: fullMatch.trim(),
            activate: () => {
              // Resolve relative path to absolute
              const basePath = cwdRef.current || '';
              const absolutePath = filePath.startsWith('/')
                ? filePath
                : `${basePath}/${filePath}`.replace(/\/\.\//g, '/');

              navigateToFile({
                path: absolutePath,
                line: lineNum,
                column: colNum,
              });
            },
          });
        }

        callback(links.length > 0 ? links : undefined);
      },
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Custom key handler
    terminal.attachCustomKeyEventHandler((event) => {
      if (ptyIdRef.current && onCustomKeyRef.current) {
        return onCustomKeyRef.current(event, ptyIdRef.current);
      }
      return true;
    });

    try {
      const ptyId = await window.electronAPI.terminal.create({
        cwd: cwd || window.electronAPI.env.HOME,
        shell: command.shell,
        args: command.args,
        cols: terminal.cols,
        rows: terminal.rows,
      });

      ptyIdRef.current = ptyId;

      // Handle data from pty with debounced buffering for smooth rendering
      // 30ms delay merges fragmented TUI packets (clear + write)
      const cleanup = window.electronAPI.terminal.onData((event) => {
        if (event.id === ptyId) {
          if (!hasReceivedDataRef.current) {
            hasReceivedDataRef.current = true;
            setIsLoading(false);
          }

          // Buffer data
          writeBufferRef.current += event.data;

          if (!isFlushPendingRef.current) {
            isFlushPendingRef.current = true;
            setTimeout(() => {
              if (writeBufferRef.current.length > 0) {
                const bufferedData = writeBufferRef.current;
                terminal.write(bufferedData);
                // Call onData after write to avoid React re-render storm
                onDataRef.current?.(bufferedData);
                writeBufferRef.current = '';
              }
              isFlushPendingRef.current = false;
            }, 30);
          }
        }
      });
      cleanupRef.current = cleanup;

      // Handle exit - delay to ensure pending data events are received
      // then flush remaining buffer before calling onExit
      const exitCleanup = window.electronAPI.terminal.onExit((event) => {
        if (event.id === ptyId) {
          // Wait for any pending data events to arrive (IPC race condition)
          setTimeout(() => {
            // Flush any remaining buffered data
            if (writeBufferRef.current.length > 0) {
              const bufferedData = writeBufferRef.current;
              terminal.write(bufferedData);
              onDataRef.current?.(bufferedData);
              writeBufferRef.current = '';
            }
            onExitRef.current?.();
          }, 50);
        }
      });
      exitCleanupRef.current = exitCleanup;

      // Handle input
      terminal.onData((data) => {
        if (ptyIdRef.current) {
          window.electronAPI.terminal.write(ptyIdRef.current, data);
        }
      });
    } catch (error) {
      setIsLoading(false);
      terminal.writeln(`\x1b[31mFailed to start terminal.\x1b[0m`);
      terminal.writeln(`\x1b[33mError: ${error}\x1b[0m`);
    }
  }, [cwd, command.shell, command.args.join(' ')]);

  // Lazy initialization: only init when first activated
  useEffect(() => {
    if (isActive && !hasBeenActivatedRef.current) {
      hasBeenActivatedRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          initTerminal();
        });
      });
    }
  }, [isActive, initTerminal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      exitCleanupRef.current?.();
      if (ptyIdRef.current) {
        window.electronAPI.terminal.destroy(ptyIdRef.current);
      }
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
  }, []);

  // Update settings dynamically
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = settings.theme;
      terminalRef.current.options.fontSize = settings.fontSize;
      terminalRef.current.options.fontFamily = settings.fontFamily;
      terminalRef.current.options.fontWeight = settings.fontWeight;
      terminalRef.current.options.fontWeightBold = settings.fontWeightBold;
      fitAddonRef.current?.fit();
    }
  }, [settings]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && ptyIdRef.current) {
        fitAddonRef.current.fit();
        window.electronAPI.terminal.resize(ptyIdRef.current, {
          cols: terminalRef.current.cols,
          rows: terminalRef.current.rows,
        });
      }
    };

    const debouncedResize = (() => {
      let timeout: ReturnType<typeof setTimeout>;
      return () => {
        clearTimeout(timeout);
        timeout = setTimeout(handleResize, 50);
      };
    })();

    window.addEventListener('resize', debouncedResize);

    const observer = new ResizeObserver(debouncedResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    const intersectionObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        debouncedResize();
      }
    });
    if (containerRef.current) {
      intersectionObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', debouncedResize);
      observer.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  // Fit when becoming active
  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => fit());
    }
  }, [isActive, fit]);

  // Handle window visibility change to refresh terminal rendering
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && terminalRef.current && isActive) {
        // Window became visible again, refresh terminal
        requestAnimationFrame(() => {
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
          fit();
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, fit]);

  // Handle app focus/blur events (macOS app switching)
  useEffect(() => {
    const handleFocus = () => {
      if (terminalRef.current && isActive) {
        requestAnimationFrame(() => {
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
          fit();
        });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isActive, fit]);

  return {
    containerRef,
    isLoading,
    settings,
    write,
    fit,
    terminal: terminalRef.current,
    findNext,
    findPrevious,
    clearSearch,
  };
}
