import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TerminalSearchBar,
  type TerminalSearchBarRef,
} from '@/components/terminal/TerminalSearchBar';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useTerminalScrollToBottom } from '@/hooks/useTerminalScrollToBottom';
import { useXterm } from '@/hooks/useXterm';
import { useI18n } from '@/i18n';
import { type OutputState, useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import {
  registerSessionWorktree,
  unregisterSessionWorktree,
  useWorktreeActivityStore,
} from '@/stores/worktreeActivity';

interface AgentTerminalProps {
  id?: string; // Terminal session ID (UI key)
  cwd?: string;
  sessionId?: string; // Claude session ID for --session-id/--resume (falls back to id)
  agentCommand?: string;
  customPath?: string; // custom absolute path to the agent CLI
  customArgs?: string; // additional arguments to pass to the agent
  environment?: 'native' | 'hapi' | 'happy';
  initialized?: boolean;
  activated?: boolean;
  isActive?: boolean;
  canMerge?: boolean; // whether merge option should be enabled (has multiple groups)
  onInitialized?: () => void;
  onActivated?: () => void;
  onExit?: () => void;
  onTerminalTitleChange?: (title: string) => void;
  onSplit?: () => void;
  onMerge?: () => void;
  onFocus?: () => void; // called when terminal is clicked/focused to activate the group
}

const MIN_RUNTIME_FOR_AUTO_CLOSE = 10000; // 10 seconds
const MIN_OUTPUT_FOR_NOTIFICATION = 100; // Minimum chars to consider agent is doing work
const MIN_OUTPUT_FOR_INDICATOR = 200; // Minimum chars to show "outputting" indicator (higher to avoid noise)
const ACTIVITY_POLL_INTERVAL_MS = 1000; // Poll process activity every 1000ms
const IDLE_CONFIRMATION_COUNT = 2; // Require 2 consecutive idle polls (2 seconds) before marking as idle
const RECENT_OUTPUT_TIMEOUT_MS = 3000; // If output received within this time, consider still active

export function AgentTerminal({
  id,
  cwd,
  sessionId,
  agentCommand = 'claude',
  customPath,
  customArgs,
  environment = 'native',
  initialized,
  activated,
  isActive = false,
  canMerge = false,
  onInitialized,
  onActivated,
  onExit,
  onTerminalTitleChange,
  onSplit,
  onMerge,
  onFocus,
}: AgentTerminalProps) {
  const { t } = useI18n();
  const {
    agentNotificationEnabled,
    agentNotificationDelay,
    agentNotificationEnterDelay,
    hapiSettings,
    shellConfig,
    claudeCodeIntegration,
    glowEffectEnabled,
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
      window.electronAPI.hapi.checkGlobal(false).then((status) => {
        setHapiGlobalInstalled(status.installed);
      });
    }
  }, [environment]);
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
  const tmuxSessionNameRef = useRef<string | null>(null); // Tmux session name for cleanup.

  // Output state tracking for global store
  const outputStateRef = useRef<OutputState>('idle');
  const isMonitoringOutputRef = useRef(false); // Only monitor after user presses Enter
  const outputSinceEnterRef = useRef(0); // Track output volume since Enter for indicator
  const lastOutputTimeRef = useRef(0); // Track last output timestamp for idle detection
  const activityPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveIdleCountRef = useRef(0); // Count consecutive idle polls
  const ptyIdRef = useRef<string | null>(null); // Store PTY ID for activity checks
  const isActiveRef = useRef(isActive); // Track latest isActive value for interval callback
  const setOutputState = useAgentSessionsStore((s) => s.setOutputState);
  const markSessionActive = useAgentSessionsStore((s) => s.markSessionActive);
  const clearRuntimeState = useAgentSessionsStore((s) => s.clearRuntimeState);

  const terminalSessionId = id ?? sessionId;
  const resumeSessionId = sessionId ?? id;

  // Keep isActiveRef in sync with isActive prop
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Helper to update output state (with ref tracking to avoid unnecessary store updates)
  const updateOutputState = useCallback(
    (newState: OutputState) => {
      if (!terminalSessionId) return;
      if (outputStateRef.current === newState) return;
      outputStateRef.current = newState;
      // Use isActiveRef.current to get latest value (important for interval callbacks)
      setOutputState(terminalSessionId, newState, isActiveRef.current);
    },
    [terminalSessionId, setOutputState]
  );

  // Mark session as active when user is viewing it
  useEffect(() => {
    if (isActive && terminalSessionId) {
      markSessionActive(terminalSessionId);
    }
  }, [isActive, terminalSessionId, markSessionActive]);

  // Register session worktree mapping for activity state tracking.
  // The cleanup function uses the closure value of terminalSessionId (not a ref) because:
  // 1. React guarantees cleanup runs with the values from the effect that created it
  // 2. This ensures we unregister the exact sessionId that was registered
  // 3. Using a ref would risk unregistering a different sessionId if it changed between registration and cleanup
  useEffect(() => {
    if (terminalSessionId && cwd) {
      registerSessionWorktree(terminalSessionId, cwd);
      return () => {
        unregisterSessionWorktree(terminalSessionId);
      };
    }
  }, [terminalSessionId, cwd]);

  // Activity state setter - used by startActivityPolling and handleData/handleCustomKey
  const setActivityState = useWorktreeActivityStore((s) => s.setActivityState);

  // Start polling for process activity
  const startActivityPolling = useCallback(() => {
    // Clear any existing interval
    if (activityPollIntervalRef.current) {
      clearInterval(activityPollIntervalRef.current);
    }
    consecutiveIdleCountRef.current = 0;

    activityPollIntervalRef.current = setInterval(async () => {
      if (!ptyIdRef.current || !isMonitoringOutputRef.current) {
        // Stop polling if no PTY or not monitoring
        if (activityPollIntervalRef.current) {
          clearInterval(activityPollIntervalRef.current);
          activityPollIntervalRef.current = null;
        }
        return;
      }

      try {
        const hasProcessActivity = await window.electronAPI.terminal.getActivity(ptyIdRef.current);
        const now = Date.now();
        const hasRecentOutput = now - lastOutputTimeRef.current < RECENT_OUTPUT_TIMEOUT_MS;

        if (hasProcessActivity || hasRecentOutput) {
          // Process is active OR has recent output, reset idle counter
          consecutiveIdleCountRef.current = 0;
          // If we have enough output, show the indicator
          if (outputSinceEnterRef.current > MIN_OUTPUT_FOR_INDICATOR) {
            updateOutputState('outputting');
            // Also update worktree activity state to 'running'
            if (cwd) {
              setActivityState(cwd, 'running');
            }
          }
        } else {
          // Process is idle AND no recent output
          consecutiveIdleCountRef.current++;
          // Only mark as idle after several consecutive idle polls
          if (consecutiveIdleCountRef.current >= IDLE_CONFIRMATION_COUNT) {
            updateOutputState('idle');
            isMonitoringOutputRef.current = false;
            // Stop polling when confirmed idle
            if (activityPollIntervalRef.current) {
              clearInterval(activityPollIntervalRef.current);
              activityPollIntervalRef.current = null;
            }
          }
        }
      } catch {
        // Error checking activity, ignore
      }
    }, ACTIVITY_POLL_INTERVAL_MS);
  }, [updateOutputState, cwd, setActivityState]);

  // Stop polling for process activity
  const stopActivityPolling = useCallback(() => {
    if (activityPollIntervalRef.current) {
      clearInterval(activityPollIntervalRef.current);
      activityPollIntervalRef.current = null;
    }
  }, []);

  // Cleanup runtime state on unmount
  useEffect(() => {
    return () => {
      if (terminalSessionId) {
        clearRuntimeState(terminalSessionId);
      }
      stopActivityPolling();
    };
  }, [terminalSessionId, clearRuntimeState, stopActivityPolling]);

  // Cleanup tmux session on unmount
  useEffect(() => {
    return () => {
      if (tmuxSessionNameRef.current) {
        window.electronAPI.tmux.killSession(tmuxSessionNameRef.current);
      }
    };
  }, []);

  // Build command with session args
  const { command, env } = useMemo(() => {
    // Wait for shell config to be resolved
    if (!resolvedShell) {
      return { command: undefined, env: undefined };
    }

    // Use custom path if provided, otherwise use agentCommand
    const effectiveCommand = customPath || agentCommand;

    const supportsSession = agentCommand?.startsWith('claude') || agentCommand === 'cursor-agent';
    // Only Claude CLI supports --ide; Cursor CLI does not (errors with "unknown option '--ide'")
    const supportIde = agentCommand?.startsWith('claude');
    const effectiveSessionId = resumeSessionId;

    // Build agent args: cursor-agent and initialized claude use --resume; otherwise --session-id
    let agentArgs: string[] = [];
    if (supportsSession && effectiveSessionId) {
      if (agentCommand === 'cursor-agent' || initialized) {
        agentArgs = ['--resume', effectiveSessionId];
      } else {
        agentArgs = ['--session-id', effectiveSessionId];
      }
    }

    if (supportIde) {
      agentArgs.push('--ide');
    }

    // Append custom args if provided
    if (customArgs) {
      agentArgs.push(customArgs);
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
      // claude is default for hapi, so omit agent name for claude
      const hapiArgs = agentCommand?.startsWith('claude') ? '' : effectiveCommand;
      const hapiCommand = `${hapiPrefix} ${hapiArgs} ${agentArgs.join(' ')}`.trim();

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
      const happyArgs = agentCommand?.startsWith('claude') ? '' : effectiveCommand;
      const happyCommand = `happy ${happyArgs} ${agentArgs.join(' ')}`.trim();

      return {
        command: {
          shell: resolvedShell.shell,
          args: [...resolvedShell.execArgs, happyCommand],
        },
        env: envVars,
      };
    }

    const fullCommand = `${effectiveCommand} ${agentArgs.join(' ')}`.trim();
    const shellName = resolvedShell.shell.toLowerCase();

    // Determine if tmux wrapping should be applied
    const isClaude = agentCommand?.startsWith('claude') ?? false;
    const shouldUseTmux = claudeCodeIntegration.tmuxEnabled && isClaude && !isWindows;

    // Build tmux session name from terminal session ID
    const tmuxSessionName =
      shouldUseTmux && terminalSessionId
        ? `enso-${terminalSessionId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
        : null;
    tmuxSessionNameRef.current = tmuxSessionName;

    // Wrap command in tmux if enabled
    let finalCommand = fullCommand;
    if (tmuxSessionName) {
      const escaped = fullCommand.replace(/'/g, "'\\''");
      finalCommand = `env -u TMUX tmux -L enso -f /dev/null new-session -A -s ${tmuxSessionName} '${escaped}'`;
    }

    // WSL: detect from shell name (wsl.exe)
    if (shellName.includes('wsl') && isWindows) {
      // Use -e to run command directly, sh -lc loads login profile
      // exec $SHELL replaces with user's shell (zsh/bash/etc.)
      const escapedCommand = finalCommand.replace(/"/g, '\\"');
      return {
        command: {
          shell: 'wsl.exe',
          args: ['-e', 'sh', '-lc', `exec "$SHELL" -ilc "${escapedCommand}"`],
        },
        env: envVars,
      };
    }

    // PowerShell: wrap command in script block to preserve argument structure
    // Without this, PowerShell interprets args like --session-id as its own parameters
    if (shellName.includes('powershell') || shellName.includes('pwsh')) {
      return {
        command: {
          shell: resolvedShell.shell,
          args: [...resolvedShell.execArgs, `& { ${finalCommand} }`],
        },
        env: envVars,
      };
    }

    // Native environment: use user's configured shell
    return {
      command: {
        shell: resolvedShell.shell,
        args: [...resolvedShell.execArgs, finalCommand],
      },
      env: envVars,
    };
  }, [
    agentCommand,
    customPath,
    customArgs,
    resumeSessionId,
    initialized,
    environment,
    hapiSettings.cliApiToken,
    hapiGlobalInstalled,
    resolvedShell,
    claudeCodeIntegration.tmuxEnabled,
    terminalSessionId,
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

      // === Output state tracking for UI indicator ===
      // Only track when we're monitoring (after user pressed Enter)
      if (isMonitoringOutputRef.current) {
        outputSinceEnterRef.current += data.length;
        lastOutputTimeRef.current = Date.now(); // Track last output time for idle detection

        // Update to 'outputting' once we have substantial output after Enter
        if (outputSinceEnterRef.current > MIN_OUTPUT_FOR_INDICATOR) {
          updateOutputState('outputting');
          // Note: Activity state 'running' is set by handleCustomKey (on Enter) and
          // startActivityPolling (during polling), so no need to set it here
        }
        // Note: The transition to 'idle' is handled by process activity polling
        // (startActivityPolling), not by a simple timeout
      }

      // Only arm idle monitoring after receiving substantial output
      // This prevents notifications from simple prompt echoes
      if (
        pendingIdleMonitorRef.current &&
        dataSinceEnterRef.current > MIN_OUTPUT_FOR_NOTIFICATION
      ) {
        isWaitingForIdleRef.current = true;
        pendingIdleMonitorRef.current = false;
      }

      const stopHookEnabledForSession =
        claudeCodeIntegration.stopHookEnabled && agentCommand.startsWith('claude');

      if (!agentNotificationEnabled || !isWaitingForIdleRef.current || stopHookEnabledForSession)
        return;

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
          if (!terminalSessionId) return;
          window.electronAPI.notification.show({
            title: t('{{command}} completed', { command: agentCommand }),
            body: notificationBody,
            sessionId: terminalSessionId,
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
      claudeCodeIntegration.stopHookEnabled,
      terminalSessionId,
      t,
      updateOutputState,
    ]
  );

  // Handle terminal title changes (OSC escape sequences)
  const handleTitleChange = useCallback(
    (title: string) => {
      currentTitleRef.current = title;
      onTerminalTitleChange?.(title);
    },
    [onTerminalTitleChange]
  );

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

        // Set activity state to 'running' immediately when user presses Enter
        if (cwd) {
          setActivityState(cwd, 'running');
        }

        if (terminalSessionId && glowEffectEnabled) {
          isMonitoringOutputRef.current = true;
          outputSinceEnterRef.current = 0;
          ptyIdRef.current = ptyId;
          startActivityPolling();
        }

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
    [
      activated,
      onActivated,
      agentNotificationEnterDelay,
      startActivityPolling,
      terminalSessionId,
      glowEffectEnabled,
      cwd,
      setActivityState,
    ]
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
    refreshRenderer,
    write,
  } = useXterm({
    cwd,
    command,
    env,
    isActive: effectiveIsActive,
    onExit: handleExit,
    onData: handleData,
    onCustomKey: handleCustomKey,
    onTitleChange: handleTitleChange,
    onSplit,
    onMerge,
    canMerge,
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchBarRef = useRef<TerminalSearchBarRef>(null);
  const { showScrollToBottom, handleScrollToBottom } = useTerminalScrollToBottom(terminal);

  // Register write and focus functions to global store for external access
  const { register, unregister } = useTerminalWriteStore();
  useEffect(() => {
    if (!terminalSessionId || !write) return;

    register(terminalSessionId, write, () => terminal?.focus());
    return () => unregister(terminalSessionId);
  }, [terminalSessionId, write, terminal, register, unregister]);

  // Handle Cmd+F / Ctrl+F
  const handleKeyDown = useCallback(
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
      onFocus?.();

      const menuItems = [
        { id: 'split', label: t('Split Agent') },
        ...(canMerge ? [{ id: 'merge', label: t('Merge Agent') }] : []),
        { id: 'separator-0', label: '', type: 'separator' as const },
        { id: 'clear', label: t('Clear terminal') },
        { id: 'refresh', label: t('Refresh terminal') },
        { id: 'separator-1', label: '', type: 'separator' as const },
        { id: 'copy', label: t('Copy'), disabled: !terminal?.hasSelection() },
        { id: 'paste', label: t('Paste') },
        { id: 'selectAll', label: t('Select all') },
      ];

      const selectedId = await window.electronAPI.contextMenu.show(menuItems);

      if (!selectedId) return;

      switch (selectedId) {
        case 'split':
          onSplit?.();
          break;
        case 'merge':
          onMerge?.();
          break;
        case 'clear':
          clear();
          break;
        case 'refresh':
          refreshRenderer();
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
    [terminal, clear, refreshRenderer, t, onSplit, canMerge, onMerge, onFocus]
  );

  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleKeyDown]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [handleContextMenu, containerRef]);

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  // Handle external file drop (from OS file manager, VS Code, etc.)
  const terminalWrapperRef = useFileDrop<HTMLDivElement>({
    cwd,
    onDrop: useCallback(
      (paths: string[]) => {
        if (paths.length > 0 && write) {
          write(paths.map((p) => `@${p}`).join(' '));
          terminal?.focus();
        }
      },
      [write, terminal]
    ),
  });

  // Handle click to activate group
  const handleClick = useCallback(() => {
    if (!isActive) {
      onFocus?.();
    }
  }, [isActive, onFocus]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: click is for focus activation
    <div
      ref={terminalWrapperRef}
      className="relative h-full w-full"
      style={{ backgroundColor: settings.theme.background, contain: 'strict' }}
      onClick={handleClick}
    >
      <div ref={containerRef} className="h-full w-full" />
      <TerminalSearchBar
        ref={searchBarRef}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onFindNext={findNext}
        onFindPrevious={findPrevious}
        onClearSearch={clearSearch}
        theme={settings.theme}
      />
      {showScrollToBottom && (
        <button
          type="button"
          onClick={handleScrollToBottom}
          className="absolute bottom-12 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/80 text-primary-foreground shadow-lg transition-all hover:bg-primary hover:scale-105 active:scale-95"
          title={t('Scroll to bottom')}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
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
