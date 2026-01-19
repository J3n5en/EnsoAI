# Phase 08: Settings and Configuration Management

Test the settings system, configuration persistence, and integration with various app features. Ensure user preferences are stored and applied correctly.

## Tasks

- [ ] Analyze settings storage and persistence mechanism:
  - Search for settings-related code in `src/main/ipc/settings.ts` and renderer
  - Create `Auto Run Docs/Initiation/Working/settings-architecture.md` with front matter (type: architecture, tags: [settings, persistence])
  - Document where settings are stored (userData directory, settings.json)
  - Document the settings schema and available options
  - Explain how settings sync between main and renderer processes
  - Include wiki-link to `[[Settings-Persistence]]`

- [ ] Test settings UI and navigation:
  - Run the app: `pnpm dev`
  - Open Settings dialog (Cmd+, or Ctrl+,)
  - Navigate through all settings sections (General, Terminal, Editor, Git, Agents, etc.)
  - Verify all UI controls render correctly (inputs, selects, toggles, sliders)
  - Document settings UI structure in `Auto Run Docs/Initiation/Working/settings-ui-testing.md`

- [ ] Test terminal settings and theme configuration:
  - In Settings → Terminal, test changing shell path
  - Test switching terminal renderer: WebGL vs DOM
  - Test changing terminal theme (select from Ghostty themes)
  - Verify theme changes apply immediately to open terminals
  - Test font size adjustment and verify terminal rerenders
  - Document terminal settings in `Auto Run Docs/Initiation/Working/terminal-settings-testing.md`

- [ ] Test editor and UI appearance settings:
  - In Settings → Appearance, toggle light/dark theme
  - Verify entire UI respects theme change (background, foreground, accent colors)
  - Test font family and size for editor
  - Test enabling/disabling auto-save and verify behavior
  - Test language selection (English, 中文) and verify UI text changes
  - Document appearance settings in `Auto Run Docs/Initiation/Working/appearance-settings-testing.md`

- [ ] Test agent and integration settings:
  - In Settings → Agents, review available agent configurations
  - Test adding a custom agent (provide CLI command)
  - Test editing agent paths (e.g., change Claude CLI path)
  - Test enabling/disabling specific agents
  - Document agent settings in `Auto Run Docs/Initiation/Working/agent-settings-testing.md` with wiki-link to `[[Agent-Configuration]]`

- [ ] Verify settings persistence across app restarts:
  - Make changes to multiple settings (theme, terminal, editor, language)
  - Close the app completely
  - Locate settings.json in userData directory: `~/Library/Application Support/enso-ai/settings.json` (macOS) or equivalent
  - Inspect settings.json to verify changes are saved
  - Reopen the app and verify all settings are restored correctly
  - Document persistence behavior in `Auto Run Docs/Initiation/Working/settings-persistence-testing.md`
