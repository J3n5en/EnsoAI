# Phase 04: UI Design System Implementation

Implement or verify the design system components according to `docs/design-system.md`. Ensure all UI components follow the established patterns for consistency.

## Tasks

- [ ] Audit existing UI components against design system specifications:
  - Review all components in `src/renderer/components/ui/`
  - Create `Auto Run Docs/Initiation/Working/ui-component-audit.md` with front matter (type: analysis, tags: [ui, design-system])
  - Check each component uses CSS variables (background, foreground, primary, accent, muted)
  - Verify height standards: Tab bar (h-9), tree nodes (h-7), small buttons (h-6)
  - Verify spacing: gap-1 (4px), gap-2 (8px), gap-3 (12px)

- [ ] Verify icon usage follows Lucide React patterns:
  - Search for icon imports across renderer components: use grep/ast-grep for `from 'lucide-react'`
  - Document icon usage patterns in `Auto Run Docs/Initiation/Working/icon-usage.md`
  - Check file tree icons use correct colors: directories (text-yellow-500), TypeScript (text-blue-500), JavaScript (text-yellow-400)
  - Verify icon sizes are consistent: h-4 w-4 for standard, h-3.5 w-3.5 for small

- [ ] Review and document text truncation patterns:
  - Search for truncate usage in components
  - Verify proper flexbox structure: `min-w-0 flex-1 truncate` for text, `shrink-0` for fixed elements
  - Document examples in `Auto Run Docs/Initiation/Working/text-truncation-patterns.md`
  - Test long file names and paths in the file tree to ensure truncation works

- [ ] Verify Monaco Editor configuration follows design system:
  - Read `src/renderer/` files that configure Monaco Editor
  - Check that workers are loaded locally (no CDN): editorWorker, tsWorker, etc.
  - Verify theme synchronization with terminal theme (Ghostty themes)
  - Document Monaco configuration in `Auto Run Docs/Initiation/Working/monaco-editor-config.md` with wiki-link to `[[Terminal-Themes]]`

- [ ] Test responsive behavior and theme switching:
  - Run the app in dev mode: `pnpm dev`
  - Toggle between light and dark themes in Settings
  - Verify all UI components respect theme changes (background, foreground, accent colors update)
  - Resize the window to minimum and maximum sizes
  - Document any UI issues in `Auto Run Docs/Initiation/Working/ui-theme-testing.md`

- [ ] Create design system compliance checklist for future components:
  - Create `Auto Run Docs/Initiation/Working/design-system-checklist.md` with front matter (type: reference, tags: [ui, checklist])
  - Include checklist items: uses CSS variables, follows height standards, uses Lucide icons, proper spacing
  - Add wiki-link to `[[Design-System-Guidelines]]`
  - This document serves as a reference when creating new UI components
