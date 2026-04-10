# URL Scheme Focus Session — Design

## Overview

Extend the existing `enso://` protocol to support focusing specific sessions via URL. When a user opens `enso://focus?session=<sessionId>&cwd=<path>`, the app switches to the corresponding tab/pane.

## URL Format

```
enso://focus?session=<sessionId>&cwd=<path>
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `session` | Session ID to focus (matches `session.id` in `agentSessionsStore`) |
| `cwd` | Worktree path for the session (used as key for `activeIds`) |

### URL Matching

- `parsed.host === 'focus'` or `parsed.pathname === '//focus'`

## Architecture

### Main Process (src/main/index.ts)

**Existing Protocol Registration:**
```typescript
app.setAsDefaultProtocolClient('enso');
app.on('open-url', (event, url) => { ... });
handleCommandLineArgs(argv); // handles enso:// URLs
```

**Modified `parseEnsoUrl()`:**
- Parse `session` and `cwd` from URL searchParams
- If `host === 'focus'` or `pathname === '//focus'`, extract session/cwd
- Send via IPC channel `APP_FOCUS_SESSION`

### IPC Channel

**File:** `src/shared/types/ipc.ts`

```typescript
APP_FOCUS_SESSION: 'app:focusSession'
```

**Payload:**
```typescript
interface FocusSessionPayload {
  sessionId?: string;
  cwd?: string;
}
```

### Renderer (src/renderer)

**New Hook:** `src/renderer/App/hooks/useFocusSession.ts`
- Listen for `APP_FOCUS_SESSION` IPC event
- If `sessionId` exists: find session in `agentSessionsStore`, call `setActiveId(cwd, sessionId)`
- If `sessionId` not found but `cwd` exists: fallback to switching worktree via `handleSwitchWorktreePath`
- If neither found: silently ignore
- Switch to `chat` tab after focusing session

## Behavior

| Parameters | Behavior |
|------------|----------|
| `session` only | Find and focus session by ID, switch to chat tab |
| `session` + `cwd` | Focus session within specified worktree |
| `cwd` only | Switch to specified worktree |
| Neither found | Silently ignore |

## Files to Change

1. **src/shared/types/ipc.ts** — Add `APP_FOCUS_SESSION` channel
2. **src/main/index.ts** — Modify `parseEnsoUrl()` to extract session/cwd, send IPC
3. **src/preload/index.ts** — Expose `onFocusSession` API in `electronAPI.app`
4. **src/renderer/App/hooks/useFocusSession.ts** — New hook for focus logic
5. **src/renderer/App.tsx** — Call `useFocusSession` hook

## Implementation Notes

- Session lookup uses `useAgentSessionsStore` which stores all sessions indexed by `id`
- Active session per worktree is tracked in `activeIds: Record<string, string | null>` keyed by normalized cwd
- `setActiveId(cwd, sessionId)` updates the active session for a specific worktree
- Tab switching uses existing `setActiveTab('chat')` mechanism
