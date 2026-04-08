# AI Performance Optimization Settings Design

**Date:** 2026-04-08
**Status:** Draft

## Overview

Remove hardcoded `--bare` and `--effort` CLI parameters and expose them as user-configurable settings in the AI Settings page.

## Background

Currently, `--bare` and `--effort low` are hardcoded in `src/main/ipc/git.ts` for commit message generation. These parameters optimize Claude CLI performance by:
- `--bare`: Skips hooks, LSP, plugins, skills for faster response
- `--effort`: Controls token usage vs quality balance (low/medium/high/max/auto)

Users should be able to control these settings globally rather than having them forced.

## Requirements

1. **Global Configuration**: Single configuration point affecting all AI features (Commit Message, Code Review, Branch Name, Todo Polish)
2. **Default Off**: Both settings default to disabled (no bare, no effort override)
3. **Independent Control**: Users can enable bare and effort separately
4. **Effort Options**: When enabled, users can choose: low, medium, high, max, auto

## Design

### UI Changes

Add a "Performance Optimization" section at the top of `AISettings.tsx`, right after the "AI Features" header:

```
AI Features
Configure AI-powered features for code generation and review

┌─ Performance Optimization ──────────────────────────┐
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ☐ Enable bare mode                              │ │
│ │   Skip hooks, LSP, plugins for faster response  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ☐ Enable effort control                         │ │
│ │   [low ▼]  Token usage vs quality balance       │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘

Commit Message Generator
...
```

### Type Changes

Add new settings type in `src/renderer/stores/settings/types.ts`:

```typescript
// AI Performance Optimization Settings
export interface AIPerformanceSettings {
  bareEnabled: boolean;
  effortEnabled: boolean;
  effortLevel: ClaudeEffort;
}
```

Update `SettingsState` to include:
```typescript
aiPerformance: AIPerformanceSettings;
setAiPerformance: (settings: Partial<AIPerformanceSettings>) => void;
```

### Store Changes

Update `src/renderer/stores/settings/defaults.ts`:
```typescript
export const defaultAiPerformanceSettings: AIPerformanceSettings = {
  bareEnabled: false,
  effortEnabled: false,
  effortLevel: 'low',
};
```

### IPC Changes

Modify `src/main/ipc/git.ts`:
- Remove hardcoded `bare: true` and `claudeEffort: 'low'`
- Read settings from store and pass to AI functions

### Backend Changes

Update `src/main/services/ai/index.ts` and related service functions to:
- Accept `bare` and `claudeEffort` from settings
- Pass to CLI spawn options

## Implementation Steps

1. Add `AIPerformanceSettings` type and defaults
2. Update settings store with new state and setter
3. Add UI components in `AISettings.tsx`
4. Update IPC handlers to read settings
5. Remove hardcoded values from `git.ts`
6. Update AI service calls to use settings

## Files to Modify

- `src/renderer/stores/settings/types.ts` - Add new type
- `src/renderer/stores/settings/defaults.ts` - Add defaults
- `src/renderer/stores/settings/index.ts` - Add store implementation
- `src/renderer/components/settings/AISettings.tsx` - Add UI
- `src/main/ipc/git.ts` - Remove hardcoded values, use settings
- `src/main/services/ai/index.ts` - Pass settings to CLI spawn

## Migration

No migration needed - new settings with defaults will be applied automatically.
