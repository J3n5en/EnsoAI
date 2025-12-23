import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { useSettingsStore } from '@/stores/settings';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';

interface AgentTerminalProps {
  cwd?: string;
  sessionId?: string;
  agentCommand?: string; // CLI command to run (e.g., 'claude', 'codex', 'gemini')
  initialized?: boolean;
  isActive?: boolean; // true when this terminal should be visible/active
  onInitialized?: () => void;
  onExit?: () => void;
}

// Hook to get terminal settings from store
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

export function AgentTerminal({
  cwd,
  sessionId,
  agentCommand = 'claude',
  initialized,
  isActive = false,
  onInitialized,
  onExit,
}: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const settings = useTerminalSettings();
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const exitCleanupRef = useRef<(() => void) | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onInitializedRef = useRef(onInitialized);
  onInitializedRef.current = onInitialized;
  // Track if terminal has ever been activated (for lazy loading)
  const hasBeenActivatedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasReceivedDataRef = useRef(false);
  // Buffer for detecting error messages (e.g., session not found)
  const outputBufferRef = useRef('');
  // Track when terminal was started for auto-close logic
  const startTimeRef = useRef<number | null>(null);
  const MIN_RUNTIME_FOR_AUTO_CLOSE = 10000; // 10 seconds

  // biome-ignore lint/correctness/useExhaustiveDependencies: settings is intentionally excluded - terminal is initialized once with initial settings, then updated dynamically via a separate effect
  const initTerminal = useCallback(async () => {
    if (!containerRef.current || terminalRef.current) return;

    setIsLoading(true);

    // Create xterm instance
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      fontWeight: settings.fontWeight,
      fontWeightBold: settings.fontWeightBold,
      theme: settings.theme,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Create pty session running agent command
    try {
      // Only Claude supports --session-id/--resume for session persistence
      const supportsSession = agentCommand === 'claude';
      const agentArgs =
        supportsSession && sessionId
          ? initialized
            ? ['--resume', sessionId]
            : ['--session-id', sessionId]
          : [];
      // Use interactive login shell to get full user environment (node, nvm, etc.)
      const command = `${agentCommand} ${agentArgs.join(' ')}`.trim();
      const ptyId = await window.electronAPI.terminal.create({
        cwd: cwd || window.electronAPI.env.HOME,
        shell: '/bin/zsh',
        args: ['-i', '-l', '-c', command],
        cols: terminal.cols,
        rows: terminal.rows,
      });

      ptyIdRef.current = ptyId;
      startTimeRef.current = Date.now();

      // Mark as initialized after first successful creation
      if (!initialized) {
        onInitializedRef.current?.();
      }

      // Handle data from pty
      const cleanup = window.electronAPI.terminal.onData((event) => {
        if (event.id === ptyId) {
          // Hide loading on first data
          if (!hasReceivedDataRef.current) {
            hasReceivedDataRef.current = true;
            setIsLoading(false);
          }
          terminal.write(event.data);

          // Accumulate output for error detection (limit buffer size)
          outputBufferRef.current += event.data;
          if (outputBufferRef.current.length > 1000) {
            outputBufferRef.current = outputBufferRef.current.slice(-500);
          }
        }
      });
      cleanupRef.current = cleanup;

      // Handle exit from pty
      const exitCleanup = window.electronAPI.terminal.onExit((event) => {
        if (event.id === ptyId) {
          const runtime = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
          const isSessionNotFound = outputBufferRef.current.includes(
            'No conversation found with session ID'
          );
          if (runtime >= MIN_RUNTIME_FOR_AUTO_CLOSE || isSessionNotFound) {
            // Normal exit or session not found - auto close
            onExitRef.current?.();
          } else {
            // Quick exit - likely an error, keep tab open for debugging
            terminal.writeln('');
            terminal.writeln(
              '\x1b[33m[Process exited quickly - tab kept open for debugging]\x1b[0m'
            );
          }
        }
      });
      exitCleanupRef.current = exitCleanup;

      // Handle input from terminal
      terminal.onData((data) => {
        if (ptyIdRef.current) {
          window.electronAPI.terminal.write(ptyIdRef.current, data);
        }
      });
    } catch (error) {
      setIsLoading(false);
      terminal.writeln(
        `\x1b[31mFailed to start ${agentCommand}. Make sure it is installed and in PATH.\x1b[0m`
      );
      terminal.writeln(`\x1b[33mError: ${error}\x1b[0m`);
    }
  }, [cwd]);

  // Lazy initialization: only init when first activated and visible
  useEffect(() => {
    if (isActive && !hasBeenActivatedRef.current) {
      hasBeenActivatedRef.current = true;
      // Wait for next frame to ensure container is visible and has dimensions
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
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      if (exitCleanupRef.current) {
        exitCleanupRef.current();
      }
      if (ptyIdRef.current) {
        window.electronAPI.terminal.destroy(ptyIdRef.current);
      }
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, []);

  // Update settings dynamically when they change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = settings.theme;
      terminalRef.current.options.fontSize = settings.fontSize;
      terminalRef.current.options.fontFamily = settings.fontFamily;
      terminalRef.current.options.fontWeight = settings.fontWeight;
      terminalRef.current.options.fontWeightBold = settings.fontWeightBold;
      // Refit after font changes
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }
  }, [settings]);

  // Handle resize
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current && ptyIdRef.current) {
          fitAddonRef.current.fit();
          window.electronAPI.terminal.resize(ptyIdRef.current, {
            cols: terminalRef.current.cols,
            rows: terminalRef.current.rows,
          });
        }
      }, 50);
    };

    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for container resize
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Also trigger on visibility change (when switching tabs)
    const intersectionObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        handleResize();
      }
    });
    if (containerRef.current) {
      intersectionObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  return (
    <div className="relative h-full w-full" style={{ backgroundColor: settings.theme.background }}>
      <div ref={containerRef} className="h-full w-full px-[5px] py-[2px]" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: settings.theme.foreground, opacity: 0.5 }}
            />
            <span style={{ color: settings.theme.foreground, opacity: 0.5 }} className="text-sm">
              Loading {agentCommand}...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
