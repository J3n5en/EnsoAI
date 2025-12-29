import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TerminalSearchBar,
  type TerminalSearchBarRef,
} from '@/components/terminal/TerminalSearchBar';
import { useXterm } from '@/hooks/useXterm';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

interface AgentTerminalProps {
  cwd?: string;
  sessionId?: string;
  agentCommand?: string;
  environment?: 'native' | 'wsl' | 'hapi' | 'happy';
  initialized?: boolean;
  activated?: boolean;
  isActive?: boolean;
  onInitialized?: () => void;
  onActivated?: () => void;
  onExit?: () => void;
}

const MIN_RUNTIME_FOR_AUTO_CLOSE = 10000; // 10 seconds
const MIN_OUTPUT_FOR_NOTIFICATION = 100; // Minimum chars to consider agent is doing work

export function AgentTerminal({
  cwd,
  sessionId,
  agentCommand = 'claude',
  environment = 'native',
  initialized,
  activated,
  isActive = false,
  onInitialized,
  onActivated,
  onExit,
}: AgentTerminalProps) {
  const { t } = useI18n();
  const {
    agentNotificationEnabled,
    agentNotificationDelay,
    agentNotificationEnterDelay,
    hapiSettings,
    shellConfig,
  } = useSettingsStore();

  // Track if hapi is globally installed (cached in main process)
  const [hapiGlobalInstalled, setHapiGlobalInstalled] = useState<boolean | null>(null);

  // Resolved shell for command execution
  const [resolvedShell, setResolvedShell] = useState<{
    shell: string;
    execArgs: string[];
  } | null>(null);

  // Resolve shell configuration on mount and when shellConfig changes
  useEffect(() => {
    window.electronAPI.shell.resolveForCommand(shellConfig).then(setResolvedShell);
  }, [shellConfig]);

  // Check hapi global installation on mount (only for hapi environment)
  useEffect(() => {
    if (environment === 'hapi') {
      window.electronAPI.hapi.checkGlobal(false, shellConfig).then((status) => {
        setHapiGlobalInstalled(status.installed);
      });
    }
  }, [environment, shellConfig]);
  const outputBufferRef = useRef('');
  const startTimeRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);
  const hasActivatedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Delay after Enter before arming idle monitor.
  const isWaitingForIdleRef = useRef(false); // Wait for idle notification; enabled after substantial output.
  const pendingIdleMonitorRef = useRef(false); // Pending idle monitor; enabled after Enter.
  const dataSinceEnterRef = useRef(0); // Track output volume since last Enter.
  const currentTitleRef = useRef<string>(''); // Terminal title from OSC escape sequence.

  // Build command with session args
  const { command, env } = useMemo(() => {
    // Wait for shell config to be resolved
    if (!resolvedShell) {
      return { command: undefined, env: undefined };
    }

    const supportsSession = agentCommand === 'claude';
    const supportIde = agentCommand === 'claude';
    const agentArgs =
      supportsSession && sessionId
        ? initialized
          ? ['--resume', sessionId]
          : ['--session-id', sessionId]
        : [];
    if (supportIde) {
      agentArgs.push('--ide');
    }

    const isWindows = window.electronAPI?.env?.platform === 'win32';
    let envVars: Record<string, string> | undefined;

    // Hapi environment: run through hapi (global) or npx @twsxtd/hapi with CLI_API_TOKEN
    if (environment === 'hapi') {
      // Wait for hapi global check to complete - return undefined to delay terminal init
      if (hapiGlobalInstalled === null) {
        return { command: undefined, env: undefined };
      }

      // Use global 'hapi' command if installed, otherwise use npx
      const hapiPrefix = hapiGlobalInstalled ? 'hapi' : 'npx -y @twsxtd/hapi';
      const hapiCommand = `${hapiPrefix} ${agentCommand} ${agentArgs.join(' ')}`.trim();

      // Pass CLI_API_TOKEN from hapiSettings
      if (hapiSettings.cliApiToken) {
        envVars = { CLI_API_TOKEN: hapiSettings.cliApiToken };
      }

      return {
        command: {
          shell: resolvedShell.shell,
          args: [...resolvedShell.execArgs, hapiCommand],
        },
        env: envVars,
      };
    }

    // Happy environment: run through 'happy' command
    // claude -> happy (claude is default), codex -> happy codex
    if (environment === 'happy') {
      const happyArgs = agentCommand === 'claude' ? '' : agentCommand;
      const happyCommand = `happy ${happyArgs} ${agentArgs.join(' ')}`.trim();

      return {
        command: {
          shell: resolvedShell.shell,
          args: [...resolvedShell.execArgs, happyCommand],
        },
        env: envVars,
      };
    }

    const fullCommand = `${agentCommand} ${agentArgs.join(' ')}`.trim();

    // WSL environment: run through WSL with interactive login shell
    if (environment === 'wsl' && isWindows) {
      // Use $SHELL -ilc to load nvm/rbenv, add explicit exit to ensure shell exits
      const wslCommand = `exec $SHELL -ilc "${fullCommand}; exit \\$?"`;
      return {
        command: {
          shell: 'wsl.exe',
          args: ['--', 'sh', '-c', wslCommand],
        },
        env: envVars,
      };
    }

    // Native environment: use user's configured shell
    return {
      command: {
        shell: resolvedShell.shell,
        args: [...resolvedShell.execArgs, fullCommand],
      },
      env: envVars,
    };
  }, [
    agentCommand,
    sessionId,
    initialized,
    environment,
    hapiSettings.cliApiToken,
    hapiGlobalInstalled,
    resolvedShell,
  ]);

  // Handle exit with auto-close logic
  const handleExit = useCallback(() => {
    const runtime = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    const isSessionNotFound = outputBufferRef.current.includes(
      'No conversation found with session ID'
    );

    if (runtime >= MIN_RUNTIME_FOR_AUTO_CLOSE || isSessionNotFound) {
      onExit?.();
    }
    // Quick exit without session error - keep tab open for debugging
  }, [onExit]);

  // Track output for error detection and idle notification
  const handleData = useCallback(
    (data: string) => {
      // Start timer on first data
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      // Mark as initialized on first data
      if (!hasInitializedRef.current && !initialized) {
        hasInitializedRef.current = true;
        onInitialized?.();
      }

      // Buffer output for error detection
      outputBufferRef.current += data;
      if (outputBufferRef.current.length > 1000) {
        outputBufferRef.current = outputBufferRef.current.slice(-500);
      }

      // Track output volume since last Enter
      dataSinceEnterRef.current += data.length;

      // Only arm idle monitoring after receiving substantial output
      // This prevents notifications from simple prompt echoes
      if (
        pendingIdleMonitorRef.current &&
        dataSinceEnterRef.current > MIN_OUTPUT_FOR_NOTIFICATION
      ) {
        isWaitingForIdleRef.current = true;
        pendingIdleMonitorRef.current = false;
      }

      // Skip if notification disabled or not waiting for idle
      if (!agentNotificationEnabled || !isWaitingForIdleRef.current) return;

      // Clear existing idle timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      // Set new idle timer - notify when agent stops outputting
      idleTimerRef.current = setTimeout(() => {
        if (isWaitingForIdleRef.current) {
          // Stop waiting after sending the notification, wait for next Enter.
          isWaitingForIdleRef.current = false;
          // Use terminal title as body, fall back to project name.
          const projectName = cwd?.split('/').pop() || 'Unknown';
          const notificationBody = currentTitleRef.current || projectName;
          window.electronAPI.notification.show({
            title: t('{{command}} completed', { command: agentCommand }),
            body: notificationBody,
            sessionId,
          });
        }
      }, agentNotificationDelay * 1000);
    },
    [
      initialized,
      onInitialized,
      agentCommand,
      cwd,
      agentNotificationEnabled,
      agentNotificationDelay,
      sessionId,
      t,
    ]
  );

  // Handle terminal title changes (OSC escape sequences)
  const handleTitleChange = useCallback((title: string) => {
    currentTitleRef.current = title;
  }, []);

  // Handle Shift+Enter for newline (Ctrl+J / LF for all agents)
  // Also detect Enter key press to mark session as activated
  const handleCustomKey = useCallback(
    (event: KeyboardEvent, ptyId: string) => {
      // Handle Shift+Enter for newline - must be before keydown check to block both keydown and keypress
      if (event.key === 'Enter' && event.shiftKey) {
        if (event.type === 'keydown') {
          window.electronAPI.terminal.write(ptyId, '\x0a');
        }
        return false;
      }

      // Only handle keydown events for other logic
      if (event.type !== 'keydown') return true;

      // Detect Enter key press (without modifiers) to activate session and start idle monitoring
      // Skip if IME is composing (e.g. selecting Chinese characters)
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.isComposing
      ) {
        // First Enter activates the session.
        if (!hasActivatedRef.current && !activated) {
          hasActivatedRef.current = true;
          onActivated?.();
        }
        // Reset output counter.
        dataSinceEnterRef.current = 0;
        // Clear any existing enter delay timer.
        if (enterDelayTimerRef.current) {
          clearTimeout(enterDelayTimerRef.current);
          enterDelayTimerRef.current = null;
        }
        // If enter delay is configured, wait before arming idle monitor.
        if (agentNotificationEnterDelay > 0) {
          enterDelayTimerRef.current = setTimeout(() => {
            pendingIdleMonitorRef.current = true;
            enterDelayTimerRef.current = null;
          }, agentNotificationEnterDelay * 1000);
        } else {
          // No delay - arm idle monitor immediately.
          pendingIdleMonitorRef.current = true;
        }
        return true; // Let Enter through normally
      }

      // User is typing - cancel idle notification and enter delay timer
      if (
        (isWaitingForIdleRef.current ||
          pendingIdleMonitorRef.current ||
          enterDelayTimerRef.current) &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        isWaitingForIdleRef.current = false;
        pendingIdleMonitorRef.current = false;
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        if (enterDelayTimerRef.current) {
          clearTimeout(enterDelayTimerRef.current);
          enterDelayTimerRef.current = null;
        }
      }

      return true;
    },
    [activated, onActivated, agentNotificationEnterDelay]
  );

  // Wait for shell config and hapi check to complete before activating terminal
  const effectiveIsActive = useMemo(() => {
    if (!resolvedShell) {
      return false;
    }
    if (environment === 'hapi' && hapiGlobalInstalled === null) {
      return false;
    }
    return isActive;
  }, [environment, hapiGlobalInstalled, isActive, resolvedShell]);

  const {
    containerRef,
    isLoading,
    settings,
    findNext,
    findPrevious,
    clearSearch,
    terminal,
    clear,
  } = useXterm({
    cwd,
    command,
    env,
    isActive: effectiveIsActive,
    onExit: handleExit,
    onData: handleData,
    onCustomKey: handleCustomKey,
    onTitleChange: handleTitleChange,
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchBarRef = useRef<TerminalSearchBarRef>(null);

  // Handle Cmd+F / Ctrl+F
  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (isSearchOpen) {
          searchBarRef.current?.focus();
        } else {
          setIsSearchOpen(true);
        }
      }
    },
    [isSearchOpen]
  );

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();

      const selectedId = await window.electronAPI.contextMenu.show([
        { id: 'clear', label: t('Clear terminal') },
        { id: 'separator-1', label: '', type: 'separator' },
        { id: 'copy', label: t('Copy'), disabled: !terminal?.hasSelection() },
        { id: 'paste', label: t('Paste') },
        { id: 'selectAll', label: t('Select all') },
      ]);

      if (!selectedId) return;

      switch (selectedId) {
        case 'clear':
          clear();
          break;
        case 'copy':
          if (terminal?.hasSelection()) {
            const selection = terminal.getSelection();
            navigator.clipboard.writeText(selection);
          }
          break;
        case 'paste':
          navigator.clipboard.readText().then((text) => {
            terminal?.paste(text);
          });
          break;
        case 'selectAll':
          terminal?.selectAll();
          break;
      }
    },
    [terminal, clear, t]
  );

  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('keydown', handleSearchKeyDown);
    return () => window.removeEventListener('keydown', handleSearchKeyDown);
  }, [isActive, handleSearchKeyDown]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isActive) return;

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [isActive, handleContextMenu, containerRef]);

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: settings.theme.background, contain: 'strict' }}
    >
      <div ref={containerRef} className="h-full w-full px-[5px] py-[2px]" />
      <TerminalSearchBar
        ref={searchBarRef}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onFindNext={findNext}
        onFindPrevious={findPrevious}
        onClearSearch={clearSearch}
        theme={settings.theme}
      />
      {(isLoading ||
        !resolvedShell ||
        (environment === 'hapi' && hapiGlobalInstalled === null)) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: settings.theme.foreground, opacity: 0.5 }}
            />
            <span style={{ color: settings.theme.foreground, opacity: 0.5 }} className="text-sm">
              {t('Loading {{agent}}...', { agent: agentCommand })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
