# Phase 06: Git and Worktree Management Testing

Thoroughly test the core Git worktree functionality that makes EnsoAI unique. Verify worktree creation, switching, and deletion workflows.

## Tasks

- [ ] Analyze Git service implementation and worktree operations:
  - Read `src/main/services/git/GitService.ts` in detail
  - Read `src/main/services/git/WorktreeService.ts` in detail
  - Create `Auto Run Docs/Initiation/Working/git-service-analysis.md` with front matter (type: analysis, tags: [git, worktree])
  - Document all Git operations exposed via IPC: clone, fetch, pull, push, commit, branch, worktree
  - Explain the simple-git library integration and error handling
  - Include wiki-link to `[[Git-Operations]]`

- [ ] Test worktree creation workflow:
  - Run the app: `pnpm dev`
  - Open or add a Git repository (use EnsoAI project itself as test repo)
  - Create a new worktree with a new branch name (e.g., "test-worktree-feature")
  - Verify the worktree directory is created on disk (check in file system)
  - Verify the worktree appears in the worktree list in the UI
  - Document the workflow in `Auto Run Docs/Initiation/Working/worktree-creation-test.md`

- [ ] Test worktree switching and isolation:
  - Create 2-3 worktrees with different branches
  - Switch between worktrees using the UI (Cmd+1, Cmd+2, etc.)
  - Verify each worktree has its own terminal session
  - Make a file change in one worktree, verify it doesn't affect other worktrees
  - Document switching behavior in `Auto Run Docs/Initiation/Working/worktree-switching-test.md`

- [ ] Test worktree deletion and cleanup:
  - Select a test worktree and delete it via the UI
  - Verify the worktree directory is removed from disk
  - Check if the branch is optionally deleted (UI should prompt)
  - Verify Git repository remains in valid state: `git worktree list` in terminal
  - Document deletion workflow in `Auto Run Docs/Initiation/Working/worktree-deletion-test.md`

- [ ] Test Git operations within worktrees:
  - In a test worktree, create a new file: `echo "test" > test-file.txt`
  - Use the Git panel to stage the file
  - Write a commit message following Conventional Commits format: "test: add test file"
  - Commit the changes and verify commit appears in history
  - Test push operation (optional, only if remote is configured)
  - Document Git UI workflow in `Auto Run Docs/Initiation/Working/git-operations-test.md` with wiki-link to `[[Source-Control-Panel]]`

- [ ] Test edge cases and error scenarios:
  - Attempt to create worktree with invalid branch name (e.g., "test/invalid/name")
  - Attempt to create worktree in non-Git directory
  - Test worktree creation when disk space is low (optional, requires setup)
  - Test behavior when Git is not in PATH (rename git binary temporarily)
  - Document error handling in `Auto Run Docs/Initiation/Working/git-error-handling.md`
