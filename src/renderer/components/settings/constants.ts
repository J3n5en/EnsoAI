import type { BuiltinAgentId } from '@shared/types';
import type { FontWeight } from '@/stores/settings';

export type SettingsCategory =
  | 'general'
  | 'appearance'
  | 'editor'
  | 'keybindings'
  | 'agent'
  | 'ai'
  | 'integration'
  | 'hapi';

export const fontWeightOptions: { value: FontWeight; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: '100', label: '100 (Thin)' },
  { value: '200', label: '200 (Extra Light)' },
  { value: '300', label: '300 (Light)' },
  { value: '400', label: '400 (Regular)' },
  { value: '500', label: '500 (Medium)' },
  { value: '600', label: '600 (Semi Bold)' },
  { value: '700', label: '700 (Bold)' },
  { value: '800', label: '800 (Extra Bold)' },
  { value: '900', label: '900 (Black)' },
  { value: 'bold', label: 'Bold' },
];

// Auto save delay default (in milliseconds)
export const AUTO_SAVE_DELAY_DEFAULT = 1000;

export const BUILTIN_AGENT_INFO: Record<BuiltinAgentId, { name: string; description: string }> = {
  claude: { name: 'Claude', description: 'Anthropic Claude Code CLI' },
  codex: { name: 'Codex', description: 'OpenAI Codex CLI' },
  droid: { name: 'Droid', description: 'Droid AI CLI' },
  gemini: { name: 'Gemini', description: 'Google Gemini CLI' },
  auggie: { name: 'Auggie', description: 'Augment Code CLI' },
  cursor: { name: 'Cursor', description: 'Cursor Agent CLI' },
  opencode: { name: 'OpenCode', description: 'OpenCode AI CLI' },
};

export const BUILTIN_AGENTS: BuiltinAgentId[] = [
  'claude',
  'codex',
  'droid',
  'gemini',
  'auggie',
  'cursor',
  'opencode',
];
