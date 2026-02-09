import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { useNavigationStore } from '@/stores/navigation';
import { useSettingsStore } from '@/stores/settings';
import '@xterm/xterm/css/xterm.css';

// Regex to match file paths with optional line:column
// Matches: path/to/file.ts:42 or path/to/file.ts:42:10 or ./file.ts:10 or @src/file.ts:42
// Note: longer extensions must come before shorter ones (tsx before ts, jsx before js, json before js, etc.)
const FILE_PATH_REGEX =
  /(?:^|[\s'"({[@])((?:\.{1,2}\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:tsx|ts|jsx|json|mjs|cjs|js|scss|css|less|html|vue|svelte|md|yaml|yml|toml|py|go|rs|java|cpp|hpp|c|h|rb|php|bash|zsh|sh))(?::(\d+))?(?::(\d+))?/g;

// Check if data contains visible characters (not just ANSI control sequences)
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require ESC character
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;?]*[a-zA-Z]/g;

function hasVisibleContent(data: string): boolean {
  // Remove all ANSI escape sequences
  const stripped = data.replace(ANSI_ESCAPE_REGEX, '');
  // Check if there are any non-whitespace visible characters
  return stripped.trim().length > 0;
}

export interface UseXtermOptions {
  cwd?: string;
  command?: {
    shell: string;
    args: string[];
  };
  env?: Record<string, string>;
  isActive?: boolean;
  initialCommand?: string;
  onExit?: () => void;
  onData?: (data: string) => void;
  onCustomKey?: (event: KeyboardEvent, ptyId: string) => boolean;
  onTitleChange?: (title: string) => void;
  onInit?: (ptyId: string) => void;
  onSplit?: () => void;
  onMerge?: () => void;
  canMerge?: boolean;
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
  /** Clear terminal display */
  clear: () => void;
  /** Manually refresh renderer (clear WebGL atlas + refresh) */
  refreshRenderer: () => void;
}

function useTerminalSettings() {
  const {
    terminalTheme,
    terminalFontSize,
    terminalFontFamily,
    terminalFontWeight,
    terminalFontWeightBold,
    terminalScrollback,
    terminalOptionIsMeta,
    xtermKeybindings,
    backgroundImageEnabled,
  } = useSettingsStore();

  const theme = useMemo(() => {
    const baseTheme = getXtermTheme(terminalTheme) ?? defaultDarkTheme;
    if (backgroundImageEnabled) {
      return { ...baseTheme, background: 'transparent' };
    }
    return baseTheme;
  }, [terminalTheme, backgroundImageEnabled]);

  return {
    theme,
    fontSize: terminalFontSize,
    fontFamily: terminalFontFamily,
    fontWeight: terminalFontWeight,
    fontWeightBold: terminalFontWeightBold,
    scrollback: terminalScrollback,
    optionIsMeta: terminalOptionIsMeta,
    xtermKeybindings,
    backgroundImageEnabled,
  };
}

export function useXterm({
  cwd,
  command,
  env,
  isActive = true,
  initialCommand,
  onExit,
  onData,
  onCustomKey,
  onTitleChange,
  onInit,
  onSplit,
  onMerge,
  canMerge = false,
}: UseXtermOptions): UseXtermResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const settings = useTerminalSettings();
  const terminalRenderer = useSettingsStore((s) => s.terminalRenderer);
  const copyOnSelection = useSettingsStore((s) => s.copyOnSelection);
  const shellConfig = useSettingsStore((s) => s.shellConfig);
  const navigateToFile = useNavigationStore((s) => s.navigateToFile);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const exitCleanupRef = useRef<(() => void) | null>(null);
  const linkProviderDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const rendererAddonRef = useRef<{ dispose: () => void } | null>(null);
  const copyOnSelectionHandlerRef = useRef<(() => void) | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onCustomKeyRef = useRef(onCustomKey);
  onCustomKeyRef.current = onCustomKey;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onInitRef = useRef(onInit);
  onInitRef.current = onInit;
  const onSplitRef = useRef(onSplit);
  onSplitRef.current = onSplit;
  const onMergeRef = useRef(onMerge);
  onMergeRef.current = onMerge;
  const canMergeRef = useRef(canMerge);
  canMergeRef.current = canMerge;
  const copyOnSelectionRef = useRef(copyOnSelection);
  copyOnSelectionRef.current = copyOnSelection;
  const hasBeenActivatedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasReceivedDataRef = useRef(false);
  const initialCommandRef = useRef(initialCommand);
  // Memoize command key to avoid dependency array issues
  const commandKey = useMemo(
    () =>
      command
        ? `${command.shell}:${command.args.join(' ')}`
        : `shellConfig:${shellConfig.shellType}`,
    [command, shellConfig.shellType]
  );
  // rAF write buffer for smooth rendering
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
      term: string,
      options?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        regex?: boolean;
      }
    ) => {
      return searchAddonRef.current?.findNext(term, options) ?? false;
    },
    []
  );

  const findPrevious = useCallback(
    (
      term: string,
      options?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        regex?: boolean;
      }
    ) => {
      return searchAddonRef.current?.findPrevious(term, options) ?? false;
    },
    []
  );

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const refreshRenderer = useCallback(() => {
    if (!terminalRef.current) return;
    const addon = rendererAddonRef.current;
    if (addon && 'clearTextureAtlas' in addon) {
      try {
        (addon as WebglAddon).clearTextureAtlas();
      } catch {
        // Ignore
      }
    }
    terminalRef.current.refresh(0, terminalRef.current.rows - 1);
  }, []);

  const loadRenderer = useCallback((terminal: Terminal, renderer: typeof terminalRenderer) => {
    // Dispose current renderer addon
    rendererAddonRef.current?.dispose();
    rendererAddonRef.current = null;

    // Load renderer based on settings (webgl > canvas > dom)
    if (renderer === 'webgl') {
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          // Guard against disposed terminal
          if (terminalRef.current && rendererAddonRef.current === webglAddon) {
            console.warn('[xterm] WebGL context lost, falling back to DOM renderer');
            webglAddon.dispose();
            rendererAddonRef.current = null;
          }
        });
        terminal.loadAddon(webglAddon);
        rendererAddonRef.current = webglAddon;
      } catch (error) {
        console.warn('[xterm] WebGL failed, falling back to DOM renderer:', error);
        rendererAddonRef.current = null;
      }
    }
    // 'dom' or 'canvas' uses the default DOM renderer, no addon needed
    // Note: 'canvas' support is removed in favor of DOM as legacy fallback

    // Trigger refresh to ensure render
    terminal.refresh(0, terminal.rows - 1);
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
      scrollback: settings.scrollback,
      macOptionIsMeta: settings.optionIsMeta,
      allowProposedApi: true,
      allowTransparency: settings.backgroundImageEnabled,
      rescaleOverlappingGlyphs: true,
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

    // IME compositionend 兜底：清空 textarea 防止旧内容残留导致输入异常
    const textarea = terminal.textarea;
    if (textarea) {
      textarea.addEventListener('compositionend', () => {
        // 延迟清空，确保 xterm 先读取最终文本
        setTimeout(() => {
          textarea.value = '';
        }, 0);
      });
    }

    // Listen for title changes (OSC escape sequences)
    terminal.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    // Load renderer
    loadRenderer(terminal, terminalRenderer);

    // Register file path link provider for click-to-open-in-editor
    const linkProviderDisposable = terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        // Guard against disposed terminal
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
            activate: async () => {
              // Resolve relative path to absolute
              const basePath = cwdRef.current || '';
              const absolutePath = filePath.startsWith('/')
                ? filePath
                : `${basePath}/${filePath}`.replace(/\/\.\//g, '/');

              // Check if file exists before navigating
              const exists = await window.electronAPI.file.exists(absolutePath);
              if (!exists) return;

              // Check if it's a Markdown file
              const isMarkdown = absolutePath.toLowerCase().endsWith('.md');

              navigateToFile({
                path: absolutePath,
                line: lineNum,
                column: colNum,
                previewMode: isMarkdown ? 'fullscreen' : undefined,
              });
            },
          });
        }

        callback(links.length > 0 ? links : undefined);
      },
    });
    linkProviderDisposableRef.current = linkProviderDisposable;

    // Copy on Selection: copy selected text to clipboard when mouse is released
    const handleCopyOnSelection = () => {
      if (!copyOnSelectionRef.current) return;
      // Defer to next task so xterm finalizes the selection first
      setTimeout(() => {
        // Guard: terminal may have been disposed between mouseup and this callback
        if (!terminalRef.current) return;
        if (terminal.hasSelection()) {
          navigator.clipboard.writeText(terminal.getSelection()).catch(() => {
            // Ignore clipboard write failures (e.g., window not focused)
          });
        }
      }, 0);
    };
    terminal.element?.addEventListener('mouseup', handleCopyOnSelection);
    copyOnSelectionHandlerRef.current = handleCopyOnSelection;

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Custom key handler
    terminal.attachCustomKeyEventHandler((event) => {
      // IME 组合输入期间必须放行，否则会导致中文输入异常
      if (event.isComposing || event.keyCode === 229) {
        return true;
      }

      if (
        matchesKeybinding(event, settings.xtermKeybindings.newTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.closeTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.nextTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.prevTab)
      ) {
        return false;
      }
      if (event.type === 'keydown') {
        if (matchesKeybinding(event, settings.xtermKeybindings.split)) {
          onSplitRef.current?.();
          return false;
        }
        if (canMergeRef.current && matchesKeybinding(event, settings.xtermKeybindings.merge)) {
          onMergeRef.current?.();
          return false;
        }
      }
      // Cmd/Ctrl+1-9 or Option+1-9: let global shortcuts handle panel/tab switching
      // Use event.code for keyboard layout independence (Option+1 may produce special chars)
      const isDigit1to9 = event.code >= 'Digit1' && event.code <= 'Digit9';
      if (isDigit1to9) {
        const hasModifier =
          ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) ||
          (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey);
        if (hasModifier) {
          return false;
        }
      }

      // Handle copy - paste is NOT intercepted to allow image paste in agents
      const platform = window.electronAPI.env.platform;
      const isMac = platform === 'darwin';
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      if (event.type === 'keydown' && modKey && !event.altKey) {
        // Paste: DO NOT intercept - let browser/agent handle it naturally
        // This allows Claude Code and other agents to receive image paste events
        if (event.key === 'v' || event.key === 'V') {
          return false; // Let event bubble up
        }

        // Copy: Cmd+C (mac) or Ctrl+C (win/linux)
        if (event.key === 'c' || event.key === 'C') {
          if (terminal.hasSelection()) {
            navigator.clipboard.writeText(terminal.getSelection());
            return false;
          }
          // On Windows/Linux, let Ctrl+C pass through as SIGINT when no selection
          if (!isMac) return true;
          return false;
        }
      }

      // macOS-style navigation shortcuts (only on keydown to avoid double-firing)
      if (event.type === 'keydown' && ptyIdRef.current) {
        // Cmd+Left: jump to line start (Ctrl+A)
        if (event.metaKey && !event.altKey && event.key === 'ArrowLeft') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x01');
          return false;
        }
        // Cmd+Right: jump to line end (Ctrl+E)
        if (event.metaKey && !event.altKey && event.key === 'ArrowRight') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x05');
          return false;
        }
        // Option+Left: jump word backward (ESC+b)
        if (event.altKey && !event.metaKey && event.key === 'ArrowLeft') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x1bb');
          return false;
        }
        // Option+Right: jump word forward (ESC+f)
        if (event.altKey && !event.metaKey && event.key === 'ArrowRight') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x1bf');
          return false;
        }
        // Option+Backspace: delete word backward (Ctrl+W)
        if (event.altKey && !event.metaKey && event.key === 'Backspace') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x17');
          return false;
        }
        // Cmd+Backspace: delete to line start (Ctrl+U)
        if (event.metaKey && !event.altKey && event.key === 'Backspace') {
          window.electronAPI.terminal.write(ptyIdRef.current, '\x15');
          return false;
        }
      }

      if (ptyIdRef.current && onCustomKeyRef.current) {
        return onCustomKeyRef.current(event, ptyIdRef.current);
      }
      return true;
    });

    try {
      const ptyId = await window.electronAPI.terminal.create({
        cwd: cwd || window.electronAPI.env.HOME,
        // If command is provided (e.g., for agent), use shell/args directly
        // Otherwise, use shellConfig from settings
        ...(command ? { shell: command.shell, args: command.args } : { shellConfig }),
        cols: terminal.cols,
        rows: terminal.rows,
        env,
        initialCommand: initialCommandRef.current,
      });

      ptyIdRef.current = ptyId;

      // Call onInit callback with ptyId
      onInitRef.current?.(ptyId);

      // Handle data from pty with debounced buffering for smooth rendering
      // 30ms delay merges fragmented TUI packets (clear + write)
      const cleanup = window.electronAPI.terminal.onData((event) => {
        if (event.id === ptyId) {
          // Buffer data
          writeBufferRef.current += event.data;

          if (!isFlushPendingRef.current) {
            isFlushPendingRef.current = true;
            setTimeout(() => {
              if (writeBufferRef.current.length > 0) {
                const bufferedData = writeBufferRef.current;
                terminal.write(bufferedData);
                // Hide loading only after receiving visible content (not just control sequences)
                if (!hasReceivedDataRef.current && hasVisibleContent(bufferedData)) {
                  hasReceivedDataRef.current = true;
                  setIsLoading(false);
                }
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
          }, 30);
        }
      });
      exitCleanupRef.current = exitCleanup;

      // Handle input
      terminal.onData((data) => {
        if (ptyIdRef.current) {
          window.electronAPI.terminal.write(ptyIdRef.current, data);
        }
      });

      // Note: Don't focus here - wait for first data to avoid cursor on blank screen
      // Focus is handled by the isActive effect after isLoading becomes false
    } catch (error) {
      setIsLoading(false);
      terminal.writeln(`\x1b[31mFailed to start terminal.\x1b[0m`);
      terminal.writeln(`\x1b[33mError: ${error}\x1b[0m`);
    }
  }, [cwd, command, shellConfig, commandKey, terminalRenderer]);

  useEffect(() => {
    const shouldActivate = isActive || initialCommandRef.current;
    if (shouldActivate && !hasBeenActivatedRef.current) {
      hasBeenActivatedRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          initTerminal();
        });
      });
    }
  }, [isActive, initTerminal]);

  // Handle dynamic renderer switching
  useEffect(() => {
    if (terminalRef.current) {
      loadRenderer(terminalRef.current, terminalRenderer);
    }
  }, [terminalRenderer, loadRenderer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      exitCleanupRef.current?.();
      if (ptyIdRef.current) {
        window.electronAPI.terminal.destroy(ptyIdRef.current);
      }
      // Remove copy-on-selection listener before disposing terminal
      if (copyOnSelectionHandlerRef.current) {
        terminalRef.current?.element?.removeEventListener(
          'mouseup',
          copyOnSelectionHandlerRef.current
        );
        copyOnSelectionHandlerRef.current = null;
      }
      // Dispose addons before terminal to prevent async callback errors
      linkProviderDisposableRef.current?.dispose();
      linkProviderDisposableRef.current = null;
      rendererAddonRef.current?.dispose();
      rendererAddonRef.current = null;
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
      // Update transparency options dynamically
      terminalRef.current.options.allowTransparency = settings.backgroundImageEnabled;
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
        // Clear WebGL texture atlas on resize to prevent glitches
        const addon = rendererAddonRef.current;
        if (addon && 'clearTextureAtlas' in addon) {
          try {
            (addon as WebglAddon).clearTextureAtlas();
          } catch {
            // Ignore if addon is disposed
          }
        }
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

  // Fit and focus when becoming active (only after loading completes)
  useEffect(() => {
    if (isActive && terminalRef.current && !isLoading) {
      requestAnimationFrame(() => {
        fit();
        terminalRef.current?.focus();
      });
    }
  }, [isActive, isLoading, fit]);

  // Handle window visibility change to refresh terminal rendering
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && terminalRef.current) {
        requestAnimationFrame(() => {
          // Clear WebGL texture atlas when page becomes visible (GPU resources may have been reclaimed)
          const addon = rendererAddonRef.current;
          if (addon && 'clearTextureAtlas' in addon) {
            try {
              (addon as WebglAddon).clearTextureAtlas();
            } catch {
              // Ignore if addon is disposed
            }
          }
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
          if (isActive) {
            fit();
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, fit]);

  // Handle app focus/blur events (macOS app switching)
  useEffect(() => {
    const handleFocus = () => {
      if (terminalRef.current) {
        requestAnimationFrame(() => {
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
          if (isActive) {
            fit();
          }
        });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isActive, fit]);

  // Silent Reset: Proactively clear texture atlas every 30 mins to prevent long-term fragmentation
  useEffect(() => {
    if (!isActive) return;

    const preventGlitchInterval = setInterval(
      () => {
        const addon = rendererAddonRef.current;
        if (
          terminalRenderer === 'webgl' &&
          terminalRef.current &&
          addon &&
          'clearTextureAtlas' in addon &&
          !document.hidden
        ) {
          requestAnimationFrame(() => {
            try {
              (addon as WebglAddon).clearTextureAtlas();
              terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
            } catch {
              // Ignore errors if addon is disposed or method missing
            }
          });
        }
      },
      1000 * 60 * 30
    ); // 30 minutes

    return () => clearInterval(preventGlitchInterval);
  }, [isActive, terminalRenderer]);

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
