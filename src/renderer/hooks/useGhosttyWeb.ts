import { FitAddon, Ghostty, type ITheme, Terminal } from 'ghostty-web';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { useNavigationStore } from '@/stores/navigation';
import { useSettingsStore } from '@/stores/settings';

const FILE_PATH_REGEX =
  /(?:^|[\s'"({[])((?:\.{1,2}\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:tsx|ts|jsx|js|mjs|cjs|json|scss|css|less|html|vue|svelte|md|yaml|yml|toml|py|go|rs|java|cpp|hpp|c|h|rb|php|bash|zsh|sh))(?::(\d+))?(?::(\d+))?/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require ESC character
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;?]*[a-zA-Z]/g;

function hasVisibleContent(data: string): boolean {
  const stripped = data.replace(ANSI_ESCAPE_REGEX, '');
  return stripped.trim().length > 0;
}

let ghosttyInstance: Ghostty | null = null;
let ghosttyInitPromise: Promise<Ghostty> | null = null;

async function ensureGhosttyInit(): Promise<Ghostty> {
  if (ghosttyInstance) return ghosttyInstance;
  if (ghosttyInitPromise) return ghosttyInitPromise;

  ghosttyInitPromise = Ghostty.load().then((instance) => {
    ghosttyInstance = instance;
    return instance;
  });
  return ghosttyInitPromise;
}

export interface UseGhosttyWebOptions {
  cwd?: string;
  command?: {
    shell: string;
    args: string[];
  };
  env?: Record<string, string>;
  isActive?: boolean;
  onExit?: () => void;
  onData?: (data: string) => void;
  onCustomKey?: (event: KeyboardEvent, ptyId: string) => boolean;
  onTitleChange?: (title: string) => void;
  onPaste?: (event: ClipboardEvent) => boolean;
  onSplit?: () => void;
  onMerge?: () => void;
  canMerge?: boolean;
}

function useTerminalSettings() {
  const {
    terminalTheme,
    terminalFontSize,
    terminalFontFamily,
    terminalScrollback,
    xtermKeybindings,
  } = useSettingsStore();

  const theme = useMemo(() => {
    return getXtermTheme(terminalTheme) ?? defaultDarkTheme;
  }, [terminalTheme]);

  return {
    theme,
    fontSize: terminalFontSize,
    fontFamily: terminalFontFamily,
    scrollback: terminalScrollback,
    xtermKeybindings,
  };
}

export interface UseGhosttyWebResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  settings: ReturnType<typeof useTerminalSettings>;
  write: (data: string) => void;
  fit: () => void;
  terminal: Terminal | null;
  findNext: (
    term: string,
    options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ) => boolean;
  findPrevious: (
    term: string,
    options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ) => boolean;
  clearSearch: () => void;
  clear: () => void;
  refreshRenderer: () => void;
}

export function useGhosttyWeb({
  cwd,
  command,
  env,
  isActive = true,
  onExit,
  onData,
  onCustomKey,
  onTitleChange,
  onPaste,
  onSplit,
  onMerge,
  canMerge = false,
}: UseGhosttyWebOptions): UseGhosttyWebResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const settings = useTerminalSettings();
  const shellConfig = useSettingsStore((s) => s.shellConfig);
  const navigateToFile = useNavigationStore((s) => s.navigateToFile);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const exitCleanupRef = useRef<(() => void) | null>(null);
  const systemShortcutCleanupRef = useRef<(() => void) | null>(null);
  const pasteCleanupRef = useRef<(() => void) | null>(null);

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onCustomKeyRef = useRef(onCustomKey);
  onCustomKeyRef.current = onCustomKey;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;
  const onSplitRef = useRef(onSplit);
  onSplitRef.current = onSplit;
  const onMergeRef = useRef(onMerge);
  onMergeRef.current = onMerge;
  const canMergeRef = useRef(canMerge);
  canMergeRef.current = canMerge;
  const hasBeenActivatedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasReceivedDataRef = useRef(false);
  const commandKey = useMemo(
    () =>
      command
        ? `${command.shell}:${command.args.join(' ')}`
        : `shellConfig:${shellConfig.shellType}`,
    [command, shellConfig.shellType]
  );
  const writeBufferRef = useRef('');
  const isFlushPendingRef = useRef(false);

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
    (
      _term: string,
      _options?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        regex?: boolean;
      }
    ) => {
      return false;
    },
    []
  );

  const findPrevious = useCallback(
    (
      _term: string,
      _options?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        regex?: boolean;
      }
    ) => {
      return false;
    },
    []
  );

  const clearSearch = useCallback(() => {}, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const refreshRenderer = useCallback(() => {}, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: settings excluded - updated via separate effect
  const initTerminal = useCallback(async () => {
    if (!containerRef.current || terminalRef.current) return;

    setIsLoading(true);

    let ghostty: Ghostty;
    try {
      ghostty = await ensureGhosttyInit();
    } catch (error) {
      setIsLoading(false);
      console.error('[ghostty-web] Failed to initialize WASM:', error);
      return;
    }

    const fontFamily = settings.fontFamily || 'monospace';
    const primaryFont = fontFamily.split(',')[0].trim();

    const terminal = new Terminal({
      ghostty,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: settings.fontSize,
      fontFamily,
      theme: settings.theme as ITheme,
      scrollback: settings.scrollback,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);

    document.fonts.load(`${settings.fontSize}px "${primaryFont}"`).then(() => {
      terminal.options.fontFamily = fontFamily;
      fitAddon.fit();
    });

    fitAddon.fit();

    const terminalElement = terminal.element;
    if (terminalElement) {
      const systemShortcutHandler = (event: KeyboardEvent) => {
        if (event.metaKey && !event.ctrlKey && !event.altKey) {
          const systemKeys = ['q', ',', 'h', 'm'];
          if (systemKeys.includes(event.key.toLowerCase())) {
            event.stopImmediatePropagation();
          }
        }
      };
      terminalElement.addEventListener('keydown', systemShortcutHandler, true);
      systemShortcutCleanupRef.current = () => {
        terminalElement.removeEventListener('keydown', systemShortcutHandler, true);
      };

      const pasteHandler = (event: ClipboardEvent) => {
        if (onPasteRef.current?.(event)) {
          event.stopImmediatePropagation();
        }
      };
      terminalElement.addEventListener('paste', pasteHandler, true);
      pasteCleanupRef.current = () => {
        terminalElement.removeEventListener('paste', pasteHandler, true);
      };
    }

    terminal.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        if (!terminalRef.current) {
          callback(undefined);
          return;
        }
        const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) {
          callback(undefined);
          return;
        }

        const lineText = line.translateToString();
        const links: Array<{
          range: {
            start: { x: number; y: number };
            end: { x: number; y: number };
          };
          text: string;
          activate: () => void;
        }> = [];

        FILE_PATH_REGEX.lastIndex = 0;

        let match: RegExpExecArray | null = null;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
        while ((match = FILE_PATH_REGEX.exec(lineText)) !== null) {
          const fullMatch = match[0];
          const filePath = match[1];
          const lineNum = match[2] ? Number.parseInt(match[2], 10) : undefined;
          const colNum = match[3] ? Number.parseInt(match[3], 10) : undefined;

          const startIndex =
            match.index +
            (fullMatch.length -
              filePath.length -
              (match[2] ? `:${match[2]}`.length : 0) -
              (match[3] ? `:${match[3]}`.length : 0));

          const endIndex = match.index + fullMatch.length;

          links.push({
            range: {
              start: { x: startIndex + 1, y: bufferLineNumber },
              end: { x: endIndex + 1, y: bufferLineNumber },
            },
            text: fullMatch.trim(),
            activate: async () => {
              const basePath = cwdRef.current || '';
              const absolutePath = filePath.startsWith('/')
                ? filePath
                : `${basePath}/${filePath}`.replace(/\/\.\//g, '/');

              const exists = await window.electronAPI.file.exists(absolutePath);
              if (!exists) return;

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

    terminal.attachCustomKeyEventHandler((event) => {
      // ghostty-web: return true = handled (stop), return false = not handled (continue)

      // macOS system shortcuts (non-configurable)
      if (event.metaKey && !event.ctrlKey && !event.altKey) {
        const macSystemKeys = ['q', ',', 'h', 'm'];
        if (macSystemKeys.includes(event.key.toLowerCase())) {
          return false;
        }
      }

      // User-configurable terminal keybindings - return true to skip ghostty handling but let event bubble
      if (
        matchesKeybinding(event, settings.xtermKeybindings.newTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.closeTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.nextTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.prevTab)
      ) {
        return true;
      }
      if (event.type === 'keydown') {
        if (matchesKeybinding(event, settings.xtermKeybindings.split)) {
          onSplitRef.current?.();
          return true;
        }
        if (canMergeRef.current && matchesKeybinding(event, settings.xtermKeybindings.merge)) {
          onMergeRef.current?.();
          return true;
        }
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key >= '1' &&
        event.key <= '9'
      ) {
        return true;
      }

      const platform = window.electronAPI.env.platform;
      const isMac = platform === 'darwin';
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      if (event.type === 'keydown' && modKey && !event.altKey) {
        // Copy: Cmd+C (mac) or Ctrl+C (win/linux)
        if (event.key === 'c' || event.key === 'C') {
          if (terminal.hasSelection()) {
            navigator.clipboard.writeText(terminal.getSelection());
            return true;
          }
          if (!isMac) return false;
          return true;
        }
        // Paste: Block ghostty-web's keydown handling (which sends empty string on Windows)
        // Let browser's paste event trigger naturally, handled by ghostty-web's pasteListener
        if (event.key === 'v' || event.key === 'V') {
          return true;
        }
      }

      if (event.type === 'keydown' && ptyIdRef.current) {
        if (event.metaKey && !event.altKey && event.key === 'ArrowLeft') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x01');
          return true;
        }
        if (event.metaKey && !event.altKey && event.key === 'ArrowRight') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x05');
          return true;
        }
        if (event.altKey && !event.metaKey && event.key === 'ArrowLeft') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x1bb');
          return true;
        }
        if (event.altKey && !event.metaKey && event.key === 'ArrowRight') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x1bf');
          return true;
        }
        if (event.altKey && !event.metaKey && event.key === 'Backspace') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x17');
          return true;
        }
        if (event.metaKey && !event.altKey && event.key === 'Backspace') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x15');
          return true;
        }
      }

      if (ptyIdRef.current && onCustomKeyRef.current) {
        // Invert the result from xterm-style callback
        return !onCustomKeyRef.current(event, ptyIdRef.current);
      }
      return false;
    });

    try {
      const ptyId = await window.electronAPI.terminal.create({
        cwd: cwd || window.electronAPI.env.HOME,
        ...(command ? { shell: command.shell, args: command.args } : { shellConfig }),
        cols: terminal.cols,
        rows: terminal.rows,
        env,
      });

      ptyIdRef.current = ptyId;

      const cleanup = window.electronAPI.terminal.onData((event) => {
        if (event.id === ptyId) {
          writeBufferRef.current += event.data;

          if (!isFlushPendingRef.current) {
            isFlushPendingRef.current = true;
            setTimeout(() => {
              if (writeBufferRef.current.length > 0) {
                const bufferedData = writeBufferRef.current;
                terminal.write(bufferedData);
                if (!hasReceivedDataRef.current && hasVisibleContent(bufferedData)) {
                  hasReceivedDataRef.current = true;
                  setIsLoading(false);
                }
                onDataRef.current?.(bufferedData);
                writeBufferRef.current = '';
              }
              isFlushPendingRef.current = false;
            }, 30);
          }
        }
      });
      cleanupRef.current = cleanup;

      const exitCleanup = window.electronAPI.terminal.onExit((event) => {
        if (event.id === ptyId) {
          setTimeout(() => {
            if (writeBufferRef.current.length > 0) {
              const bufferedData = writeBufferRef.current;
              terminal.write(bufferedData);
              onDataRef.current?.(bufferedData);
              writeBufferRef.current = '';
            }
            onExitRef.current?.();
          }, 30);
        }
      });
      exitCleanupRef.current = exitCleanup;

      terminal.onData((data) => {
        if (ptyIdRef.current) {
          window.electronAPI.terminal.write(ptyIdRef.current, data);
        }
      });
    } catch (error) {
      setIsLoading(false);
      terminal.writeln('\x1b[31mFailed to start terminal.\x1b[0m');
      terminal.writeln(`\x1b[33mError: ${error}\x1b[0m`);
    }
  }, [cwd, command, shellConfig, commandKey, navigateToFile]);

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

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      exitCleanupRef.current?.();
      systemShortcutCleanupRef.current?.();
      pasteCleanupRef.current?.();
      if (ptyIdRef.current) {
        window.electronAPI.terminal.destroy(ptyIdRef.current);
      }
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = settings.theme as ITheme;
      terminalRef.current.options.fontSize = settings.fontSize;
      terminalRef.current.options.fontFamily = settings.fontFamily;
      fitAddonRef.current?.fit();
    }
  }, [settings]);

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

  useEffect(() => {
    if (isActive && terminalRef.current && !isLoading) {
      requestAnimationFrame(() => {
        fit();
        terminalRef.current?.focus();
      });
    }
  }, [isActive, isLoading, fit]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && terminalRef.current) {
        requestAnimationFrame(() => {
          if (isActive) {
            fit();
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, fit]);

  useEffect(() => {
    const handleFocus = () => {
      if (terminalRef.current) {
        requestAnimationFrame(() => {
          if (isActive) {
            fit();
          }
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
    clear,
    refreshRenderer,
  };
}
