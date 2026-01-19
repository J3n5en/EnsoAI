# Phase 03: Architecture Documentation and Code Exploration

Understand the project's architecture, module boundaries, and code organization. This phase creates reference documentation for future development work.

## Tasks

- [ ] Document the project structure and key directories:
  - Create `Auto Run Docs/Initiation/Working/architecture-overview.md` with YAML front matter (type: architecture, tags: [structure, electron, modules])
  - Document the main modules: `src/main/`, `src/renderer/`, `src/preload/`, `src/shared/`
  - Explain the Electron architecture: Main process (Node.js) vs Renderer process (React)
  - Map IPC communication patterns: how main and renderer communicate
  - Include wiki-link references like `[[IPC-Channels]]` and `[[Service-Architecture]]`

- [ ] Analyze and document the main process services:
  - Read key service files in `src/main/services/` (Git, Terminal, Worktree, Task)
  - Create `Auto Run Docs/Initiation/Working/main-process-services.md`
  - Document each service's responsibility and dependencies
  - Identify service initialization flow from `src/main/index.ts`
  - Note IPC handlers registered by each service

- [ ] Analyze and document the renderer architecture:
  - Examine `src/renderer/` structure: components, hooks, views, lib
  - Create `Auto Run Docs/Initiation/Working/renderer-architecture.md`
  - Document state management approach (Zustand stores)
  - Identify key React hooks and their purposes
  - Map view components and their roles (GitView, Terminal, Editor, etc.)

- [ ] Document the IPC communication layer:
  - Read `src/shared/types/ipc.ts` to understand IPC channel definitions
  - Create `Auto Run Docs/Initiation/Working/ipc-communication.md`
  - List all IPC channels and their purposes
  - Document the request/response patterns used
  - Include examples of how renderer invokes main process functions

- [ ] Analyze the Git and Worktree management system:
  - Read `src/main/services/git/GitService.ts` and `WorktreeService.ts`
  - Create `Auto Run Docs/Initiation/Working/git-worktree-system.md`
  - Document how worktrees are created, listed, and deleted
  - Explain the integration with simple-git library
  - Note any special handling for encoding or platform differences

- [ ] Document the AI Agent integration architecture:
  - Read `src/main/services/task/TaskService.ts` and agent-related files
  - Create `Auto Run Docs/Initiation/Working/ai-agent-integration.md`
  - Document how agents are registered and launched (AgentRegistry)
  - Explain the terminal-based agent execution model
  - Note supported agents: Claude, Codex, Gemini, Cursor, etc.
  - Include wiki-links to `[[Terminal-Integration]]` and `[[Agent-Registry]]`
