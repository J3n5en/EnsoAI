# Phase 05: Terminal and xterm.js Integration

Deep dive into the terminal implementation, testing various shells, and ensuring robust PTY management across platforms.

## Tasks

- [ ] Analyze terminal service architecture and PTY management:
  - Read `src/main/services/terminal/PtyManager.ts` and `ShellDetector.ts`
  - Create `Auto Run Docs/Initiation/Working/terminal-architecture.md` with front matter (type: architecture, tags: [terminal, pty, xterm])
  - Document how node-pty creates and manages pseudo-terminals
  - Explain shell detection logic for different platforms (macOS, Windows, Linux)
  - Map the IPC communication for terminal data (stdin/stdout)
  - Include wiki-link to `[[PTY-Management]]`

- [ ] Test terminal functionality with different shells:
  - Run the app: `pnpm dev`
  - Open Settings and check which shell is detected
  - Create multiple terminal tabs and verify each spawns correctly
  - Test basic commands: `ls`, `cd`, `git status`, `npm --version`
  - Test interactive commands: `vim` (then `:q!`), `less` (then `q`)
  - Document results in `Auto Run Docs/Initiation/Working/terminal-testing.md`

- [ ] Verify xterm.js renderer configuration and addons:
  - Read renderer files that initialize xterm.js (search for `@xterm/xterm` imports)
  - Check which addons are loaded: FitAddon, SearchAddon, Unicode11Addon, WebLinksAddon, WebglAddon
  - Document the terminal rendering pipeline in `Auto Run Docs/Initiation/Working/xterm-rendering.md`
  - Test terminal rendering modes: WebGL vs DOM (toggle in Settings → Terminal)
  - Verify terminal themes sync with app themes (Ghostty theme support)

- [ ] Test AI Agent terminal integration:
  - In the app, navigate to the Agents panel
  - Attempt to start an AI agent (Claude, Codex, or any available)
  - If agent CLI is not installed, document the error handling
  - If agent is available, verify it launches in a dedicated terminal session
  - Test agent session persistence: switch worktrees, then return to verify session remains
  - Document agent terminal behavior in `Auto Run Docs/Initiation/Working/agent-terminal-integration.md` with wiki-link to `[[Agent-Sessions]]`

- [ ] Test terminal edge cases and error handling:
  - Close terminal tabs while commands are running
  - Test maximum terminal output (run `yes` command, then Ctrl+C)
  - Test Unicode and emoji rendering: `echo "你好 🚀 EnsoAI"`
  - Test copy/paste in terminal (Cmd+C, Cmd+V)
  - Test terminal search functionality (Cmd+F in terminal)
  - Document any issues in `Auto Run Docs/Initiation/Working/terminal-edge-cases.md`

- [ ] Verify terminal cleanup and resource management:
  - Create multiple terminals (5-10 tabs)
  - Close all terminals using the close button
  - Check for zombie processes: on macOS/Linux use `ps aux | grep EnsoAI`, on Windows use Task Manager
  - Quit the app and verify all child processes are terminated
  - Document cleanup behavior in `Auto Run Docs/Initiation/Working/terminal-cleanup.md`
