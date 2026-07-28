import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AgentTerminal activity polling configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, '../AgentTerminal.tsx'), 'utf-8');
  const panelSource = fs.readFileSync(path.join(__dirname, '../AgentPanel.tsx'), 'utf-8');

  it('should use exponential backoff constants instead of fixed interval', () => {
    expect(source).toContain('ACTIVITY_POLL_INITIAL_MS = 1000');
    expect(source).toContain('ACTIVITY_POLL_MAX_MS = 8000');
    expect(source).not.toContain('ACTIVITY_POLL_INTERVAL_MS = 1000');
  });

  it('should use setTimeout-based recursive scheduling instead of setInterval', () => {
    expect(source).toContain('scheduleNext');
    expect(source).toContain('activityPollDelayRef');
    expect(source).not.toMatch(/activityPollIntervalRef\.current = setInterval/);
  });

  it('should implement exponential backoff with max cap', () => {
    expect(source).toContain('activityPollDelayRef.current * 2');
    expect(source).toContain('ACTIVITY_POLL_MAX_MS');
  });

  it('should reset backoff when activity is detected', () => {
    expect(source).toContain('activityPollDelayRef.current = ACTIVITY_POLL_INITIAL_MS');
  });

  it('should use clearTimeout for cleanup instead of clearInterval', () => {
    expect(source).toContain('clearTimeout(activityPollIntervalRef.current)');
  });

  it('routes normal, Hapi and Happy WSL commands through the shared builder', () => {
    expect(source.match(/buildAgentCommandForShell\(\{/g)).toHaveLength(3);
    expect(source).toContain('command: hapiCommand');
    expect(source).toContain('command: happyCommand');
    expect(source).toContain('command: finalCommand');
  });

  it('passes the saved WSL distribution through all three command paths', () => {
    expect(source).toContain('codexWslDistro?: string;');
    expect(source.match(/\.\.\.\(codexWslDistro \? \{ codexWslDistro \} : \{\}\)/g)).toHaveLength(
      3
    );
    expect(source).toMatch(/\[([\s\S]*?)codexWslDistro,([\s\S]*?)\]\);/);
  });

  it('notifies the Codex runtime once after the shell is resolved', () => {
    expect(source).toContain('onCodexRuntimeDetected?.(codexRuntime, detectedNativeShell)');
    expect(source).toContain('notifiedCodexRuntimeRef.current === codexRuntime');
  });

  it('restores Codex with the saved runtime instead of the current global shell', () => {
    expect(source).toContain('codexRuntime?: CodexRuntime;');
    expect(source).toContain('const shouldRestoreSavedRuntime =');
    expect(source).toContain('resolveCodexCommandShell({');
    expect(source).toContain('shell: commandShell.shell');
    expect(source).toContain('execArgs: commandShell.execArgs');
    expect(panelSource).toContain('codexRuntime={session.codexRuntime}');
  });

  it('saves and restores the resolved native Codex shell', () => {
    expect(source).toContain('codexNativeShell?: CodexNativeShell;');
    expect(source).toContain('nativeShell: savedCodexNativeShell');
    expect(source).toContain('onCodexRuntimeDetected?.(codexRuntime, detectedNativeShell)');
    expect(panelSource).toContain('codexNativeShell={session.codexNativeShell}');
    expect(panelSource).toContain('codexNativeShell: nativeShell');
  });

  it('quotes the initial prompt after resolving the actual command shell', () => {
    const shellResolutionIndex = source.indexOf('const commandShell = resolveCodexCommandShell({');
    const promptQuotingIndex = source.indexOf('quoteInitialPromptForShell(');

    expect(shellResolutionIndex).toBeGreaterThan(-1);
    expect(promptQuotingIndex).toBeGreaterThan(shellResolutionIndex);
    expect(source).toContain('commandShell.shell,');
    expect(source).toContain('commandShell.execArgs');
  });
});
