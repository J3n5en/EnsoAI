import { useSettingsStore } from '@/stores/settings';
import {
  type UseGhosttyWebOptions,
  type UseGhosttyWebResult,
  useGhosttyWeb,
} from './useGhosttyWeb';
import { type UseXtermOptions, type UseXtermResult, useXterm } from './useXterm';

export type UseTerminalEmulatorOptions = UseXtermOptions & UseGhosttyWebOptions;
export type UseTerminalEmulatorResult = UseXtermResult | UseGhosttyWebResult;

export function useTerminalEmulator(
  options: UseTerminalEmulatorOptions
): UseTerminalEmulatorResult {
  const useGhostty = useSettingsStore((s) => s.labsUseGhosttyWeb);

  const xtermResult = useXterm(useGhostty ? { ...options, isActive: false } : options);
  const ghosttyResult = useGhosttyWeb(useGhostty ? options : { ...options, isActive: false });

  return useGhostty ? ghosttyResult : xtermResult;
}
