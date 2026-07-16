import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract: OMP is a first-class builtin agent (like pi), not a custom agent.
 * These source-level checks keep the multi-site registry in sync.
 */
describe('OMP builtin agent registration', () => {
  const root = path.join(__dirname, '../../../..');

  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8');

  it('includes omp in BuiltinAgentId union', () => {
    const source = read('shared/types/cli.ts');
    expect(source).toMatch(/export type BuiltinAgentId =[\s\S]*\|\s*'omp'/);
  });

  it('detects omp CLI with --version', () => {
    const source = read('main/services/cli/CliDetector.ts');
    expect(source).toContain("id: 'omp'");
    expect(source).toContain("command: 'omp'");
    expect(source).toContain("versionFlag: '--version'");
  });

  it('lists omp in settings builtin agent IDs and defaults', () => {
    const types = read('renderer/stores/settings/types.ts');
    const defaults = read('renderer/stores/settings/defaults.ts');
    expect(types).toMatch(/BUILTIN_AGENT_IDS[\s\S]*'omp'/);
    expect(defaults).toMatch(/omp:\s*\{\s*enabled:\s*false,\s*isDefault:\s*false\s*\}/);
  });

  it('exposes omp in settings UI constants', () => {
    const source = read('renderer/components/settings/constants.ts');
    expect(source).toMatch(/omp:\s*\{\s*name:\s*'OMP'/);
    expect(source).toMatch(/BUILTIN_AGENTS[\s\S]*'omp'/);
  });

  it('maps omp display name and command in agent UIs', () => {
    for (const rel of [
      'renderer/components/chat/AgentPanel.tsx',
      'renderer/components/chat/SessionBar.tsx',
      'renderer/components/todo/useEnabledAgents.ts',
    ]) {
      const source = read(rel);
      expect(source, rel).toContain("omp: { name: 'OMP', command: 'omp' }");
    }
  });

  it('registers omp metadata in AgentRegistry', () => {
    const source = read('main/services/agent/AgentRegistry.ts');
    expect(source).toContain("id: 'omp'");
    expect(source).toContain("binary: 'omp'");
  });
});
