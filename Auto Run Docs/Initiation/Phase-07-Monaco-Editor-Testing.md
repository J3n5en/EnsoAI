# Phase 07: Monaco Editor and File Management

Test the built-in Monaco editor functionality, file tree operations, and editor state persistence. Ensure the editor provides a smooth development experience.

## Tasks

- [ ] Analyze Monaco Editor integration and configuration:
  - Search for Monaco Editor initialization code in `src/renderer/`
  - Create `Auto Run Docs/Initiation/Working/monaco-editor-integration.md` with front matter (type: architecture, tags: [editor, monaco])
  - Document worker configuration (local workers vs CDN)
  - Document language auto-detection based on file extensions
  - Document theme synchronization with terminal/app themes
  - Include wiki-link to `[[Editor-Configuration]]`

- [ ] Test file tree operations and navigation:
  - Run the app: `pnpm dev`
  - Open a worktree with multiple files and directories
  - Test expanding and collapsing directories in the file tree
  - Test single-click to open files in editor
  - Test right-click context menu for files and folders
  - Verify file icons match design system: directories (yellow), TypeScript (blue), JSON (yellow)
  - Document file tree behavior in `Auto Run Docs/Initiation/Working/file-tree-testing.md`

- [ ] Test Monaco Editor functionality and features:
  - Open various file types: .ts, .tsx, .js, .json, .md, .css
  - Verify syntax highlighting works for each language
  - Test basic editing: typing, deleting, undo (Cmd+Z), redo (Cmd+Shift+Z)
  - Test code completion: type `const x = ` and verify IntelliSense appears
  - Test multi-cursor editing: hold Option/Alt and click multiple lines
  - Document editor features in `Auto Run Docs/Initiation/Working/monaco-editor-testing.md`

- [ ] Test editor tab management and multi-file editing:
  - Open 5-10 files in the editor (multiple tabs)
  - Test tab switching: click tabs, use Cmd+1-9 shortcuts
  - Test drag-and-drop to reorder tabs
  - Test closing tabs with close button (X icon)
  - Test closing all tabs and reopening a file
  - Document tab management in `Auto Run Docs/Initiation/Working/editor-tabs-testing.md`

- [ ] Test file save operations and persistence:
  - Edit a file and press Cmd+S to save
  - Verify the file is saved to disk (check modification time in file system)
  - Make changes to multiple files, save all, and verify with `git status` in terminal
  - Test auto-save behavior if enabled in settings
  - Close and reopen the app, verify open tabs are restored
  - Document save behavior in `Auto Run Docs/Initiation/Working/editor-save-testing.md` with wiki-link to `[[Editor-State-Persistence]]`

- [ ] Test file create, rename, and delete operations:
  - Right-click in file tree and create a new file: "test-new-file.ts"
  - Verify the file appears in the tree and can be opened
  - Right-click the file and rename it to "renamed-file.ts"
  - Right-click and delete the file, verify it's removed
  - Test creating nested directories and files
  - Document file operations in `Auto Run Docs/Initiation/Working/file-operations-testing.md`
