# Phase 09: Multi-Window and Advanced Features

Test advanced features like multi-window support, keyboard shortcuts, command palette, and IDE integrations. Ensure power-user workflows function correctly.

## Tasks

- [ ] Test multi-window support and window management:
  - Run the app: `pnpm dev`
  - Open a second window via File → New Window (or check menu for equivalent)
  - Verify both windows function independently (separate worktrees, terminals, editors)
  - Test opening different repositories in each window
  - Test closing one window while the other remains open
  - Document multi-window behavior in `Auto Run Docs/Initiation/Working/multi-window-testing.md` with front matter (type: analysis, tags: [windows, workflow])

- [ ] Test keyboard shortcuts and navigation:
  - Test Cmd+1 through Cmd+9 for tab switching
  - Test Cmd+T for new terminal/agent session
  - Test Cmd+W for closing current tab
  - Test Cmd+S for saving files
  - Test Shift+Enter for newline in terminal input
  - Test Cmd+Shift+P for command palette
  - Document all shortcuts in `Auto Run Docs/Initiation/Working/keyboard-shortcuts-testing.md` with wiki-link to `[[Keyboard-Navigation]]`

- [ ] Test command palette functionality:
  - Open command palette: Cmd+Shift+P
  - Test searching for commands: type "settings", "toggle", "open"
  - Test executing panel control commands (toggle sidebars)
  - Test "Open In" commands (Cursor, VS Code, Ghostty - if installed)
  - Verify fuzzy search works (partial matches)
  - Document command palette in `Auto Run Docs/Initiation/Working/command-palette-testing.md`

- [ ] Test IDE bridge integrations:
  - Right-click a file or directory in file tree
  - Test "Open In Cursor" option (if Cursor is installed, otherwise note missing)
  - Test "Open In VS Code" option (if VS Code is installed)
  - Test "Open In Ghostty" terminal option
  - Verify the external app opens with correct path context
  - Document IDE integrations in `Auto Run Docs/Initiation/Working/ide-bridge-testing.md` with wiki-link to `[[IDE-Integration]]`

- [ ] Test application update mechanism:
  - Check Settings → General for auto-update settings
  - Verify current version is displayed (should match package.json version)
  - Test "Check for Updates" button if available
  - Document update mechanism in `Auto Run Docs/Initiation/Working/auto-update-testing.md`
  - Note: Actual update testing may require published releases

- [ ] Test error handling and crash recovery:
  - Intentionally trigger errors: open non-existent file path
  - Test behavior when Git repository is corrupted (optional, requires setup)
  - Test behavior when terminal crashes (kill PTY process manually)
  - Verify app shows user-friendly error messages, not raw stack traces
  - Test app recovery: does it gracefully handle errors without full crash?
  - Document error handling in `Auto Run Docs/Initiation/Working/error-handling-testing.md`
