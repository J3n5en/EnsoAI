import type * as monaco from 'monaco-editor';
import { createElement as h, type ReactElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useNavigationStore } from '@/stores/navigation';

type Monaco = typeof monaco;

// ---------------------------------------------------------------------------
// Declaration pattern templates per language group.
// {W} is replaced with the escaped symbol name at query time.
// All patterns use RE2-compatible syntax (no lookahead/lookbehind).
// ---------------------------------------------------------------------------

const JS_TS_PATTERNS: string[] = [
  // function / async function / generator
  '\\b(?:async\\s+)?function\\s*\\*?\\s+{W}\\s*[(<]',
  // const/let/var declaration
  '\\b(?:const|let|var)\\s+{W}\\s*[:=(]',
  // class (incl. abstract)
  '\\b(?:abstract\\s+)?class\\s+{W}[\\s{<(]',
  // interface
  '\\binterface\\s+{W}[\\s{<]',
  // type alias
  '\\btype\\s+{W}\\s*[=<]',
  // enum
  '\\benum\\s+{W}[\\s{]',
  // namespace / module
  '\\b(?:namespace|module)\\s+{W}[\\s{]',
  // method shorthand (indented, no keyword before name)
  '^\\s+(?:async\\s+)?\\*?{W}\\s*\\([^)]*\\)\\s*[{:]',
];

const DECLARATION_PATTERNS: Record<string, string[]> = {
  javascript: JS_TS_PATTERNS,
  typescript: JS_TS_PATTERNS,

  python: ['^\\s*(?:async\\s+)?def\\s+{W}\\s*\\(', '^\\s*class\\s+{W}\\s*[:(]'],

  java: [
    // Type declarations
    '\\b(?:class|interface|enum|record|@interface)\\s+{W}\\b',
    // Method declarations — require access modifier before return type
    '(?:public|private|protected)(?:\\s+(?:static|final|abstract|synchronized|native|default))*\\s+[\\w<>\\[\\]]+(?:<[^>]*>)?\\s+{W}\\s*\\(',
    // Annotations
    '@interface\\s+{W}\\b',
  ],

  kotlin: [
    // Functions / extension functions
    '\\bfun\\s+(?:[\\w.]+\\.)?{W}\\s*[(<]',
    // Class-like declarations
    '\\b(?:class|data class|sealed class|abstract class|open class|interface|object|enum class|companion object)\\s+{W}[\\s({<:]',
    // Properties
    '\\b(?:val|var)\\s+{W}\\s*[:=]',
  ],

  c: [
    // struct / union / enum body definition
    '\\b(?:struct|union|enum)\\s+{W}\\s*\\{',
    // typedef ... name;
    '\\btypedef\\b[^;]+\\s{W}\\s*;',
    // Function definition (line must contain opening brace for the body)
    '^[\\w\\s\\*]+\\s{W}\\s*\\([^;]*\\)\\s*(?:\\{|$)',
    // Macro
    '^#define\\s+{W}\\b',
  ],

  cpp: [
    // Type definitions
    '\\b(?:struct|union|enum|class)\\s+{W}[\\s:{]',
    // typedef
    '\\btypedef\\b[^;]+\\s{W}\\s*;',
    // Function / method definition
    '[\\w:*&<>\\s]+\\s{W}\\s*\\([^;]*\\)(?:\\s*const)?\\s*(?:override|final)?\\s*[{:;]',
    // Macro
    '^#define\\s+{W}\\b',
  ],

  go: [
    // Named function / method
    '\\bfunc\\s+(?:\\([^)]+\\)\\s+)?{W}\\s*\\(',
    // Type declaration
    '\\btype\\s+{W}\\s+(?:struct|interface|\\w)',
    // Variable
    '\\bvar\\s+{W}\\s*[:=]',
    // Constant
    '\\bconst\\s+{W}\\s*[:=]',
  ],

  rust: [
    '\\bfn\\s+{W}\\s*[(<]',
    '\\b(?:struct|enum|trait|union)\\s+{W}[\\s{<]',
    '\\btype\\s+{W}\\s*=',
    '\\b(?:const|static)\\s+(?:mut\\s+)?{W}\\s*:',
    '\\bmacro_rules!\\s+{W}\\b',
    '\\bmod\\s+{W}\\b',
  ],

  csharp: [
    '\\b(?:class|interface|enum|struct|record|delegate)\\s+{W}[\\s{<(]',
    // Method — require access modifier
    '(?:public|private|protected|internal)(?:\\s+(?:static|abstract|virtual|override|sealed|async|partial))*\\s+[\\w<>\\[\\]?]+\\s+{W}\\s*[({]',
  ],

  php: [
    '\\bfunction\\s+{W}\\s*\\(',
    '\\b(?:class|interface|trait|abstract class|final class|enum)\\s+{W}[\\s{]',
    '\\bconst\\s+{W}\\s*=',
  ],

  ruby: ['\\bdef\\s+(?:self\\.)?{W}\\b', '\\b(?:class|module)\\s+{W}\\b'],

  swift: [
    '\\bfunc\\s+{W}\\s*[(<]',
    '\\b(?:class|struct|enum|protocol|extension|actor)\\s+{W}[\\s:{<]',
    '\\b(?:var|let)\\s+{W}\\s*[:=]',
    '\\btypealias\\s+{W}\\s*=',
  ],

  scala: [
    '\\b(?:def|val|var|lazy val)\\s+{W}\\s*[:=(\\[]',
    '\\b(?:class|trait|object|case class|case object|abstract class)\\s+{W}[\\s({]',
    '\\btype\\s+{W}\\s*=',
  ],

  lua: [
    '\\bfunction\\s+(?:[\\w.]+\\.)?{W}\\s*\\(',
    '\\blocal\\s+function\\s+{W}\\s*\\(',
    '\\blocal\\s+{W}\\s*=',
    '^{W}\\s*=\\s*function',
  ],
};

// ---------------------------------------------------------------------------
// File glob patterns used to narrow the ripgrep search.
// ---------------------------------------------------------------------------

const LANG_FILE_GLOBS: Record<string, string> = {
  javascript: '*.{js,jsx,mjs,cjs}',
  typescript: '*.{ts,tsx,mts,cts}',
  vue: '*.{vue,ts,tsx,js,jsx}',
  python: '*.py',
  java: '*.java',
  kotlin: '*.{kt,kts}',
  c: '*.{c,h}',
  cpp: '*.{cpp,cc,cxx,c++,hpp,hxx,h,hh}',
  go: '*.go',
  rust: '*.rs',
  csharp: '*.cs',
  php: '*.php',
  ruby: '*.{rb,rake}',
  swift: '*.swift',
  scala: '*.{scala,sc}',
  lua: '*.lua',
};

// ---------------------------------------------------------------------------
// Map Monaco language IDs → DECLARATION_PATTERNS key + file glob key.
// ---------------------------------------------------------------------------

interface LangConfig {
  patternKey: string;
  globKey: string;
}

const LANG_ID_MAP: Record<string, LangConfig> = {
  javascript: { patternKey: 'javascript', globKey: 'javascript' },
  javascriptreact: { patternKey: 'javascript', globKey: 'javascript' },
  typescript: { patternKey: 'typescript', globKey: 'typescript' },
  typescriptreact: { patternKey: 'typescript', globKey: 'typescript' },
  vue: { patternKey: 'typescript', globKey: 'vue' },
  python: { patternKey: 'python', globKey: 'python' },
  java: { patternKey: 'java', globKey: 'java' },
  kotlin: { patternKey: 'kotlin', globKey: 'kotlin' },
  c: { patternKey: 'c', globKey: 'c' },
  cpp: { patternKey: 'cpp', globKey: 'cpp' },
  go: { patternKey: 'go', globKey: 'go' },
  rust: { patternKey: 'rust', globKey: 'rust' },
  csharp: { patternKey: 'csharp', globKey: 'csharp' },
  php: { patternKey: 'php', globKey: 'php' },
  ruby: { patternKey: 'ruby', globKey: 'ruby' },
  swift: { patternKey: 'swift', globKey: 'swift' },
  scala: { patternKey: 'scala', globKey: 'scala' },
  lua: { patternKey: 'lua', globKey: 'lua' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape RE2 special characters in a literal word. */
function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a combined ripgrep regex for all declaration templates of a language. */
function buildSearchPattern(word: string, patternKey: string): string {
  const templates = DECLARATION_PATTERNS[patternKey];
  if (!templates?.length) return '';
  const escaped = escapeRegex(word);
  return templates.map((t) => t.replace(/\{W\}/g, escaped)).join('|');
}

/**
 * Given a matched line and the symbol word, return the 0-based column where
 * the symbol name itself starts (as opposed to the start of the whole pattern
 * match which may start at a keyword like `function` or `class`).
 */
function resolveSymbolColumn(lineContent: string, word: string, fallbackCol: number): number {
  const idx = lineContent.indexOf(word, fallbackCol > 0 ? Math.max(0, fallbackCol - 1) : 0);
  return idx >= 0 ? idx : fallbackCol;
}

// ---------------------------------------------------------------------------
// Core search function
// ---------------------------------------------------------------------------

interface DefinitionLocation {
  path: string;
  line: number;
  /** 0-based column pointing at the symbol name. */
  column: number;
}

async function findDefinitions(
  word: string,
  langId: string,
  rootPath: string
): Promise<DefinitionLocation[]> {
  const config = LANG_ID_MAP[langId];
  if (!config) return [];

  const pattern = buildSearchPattern(word, config.patternKey);
  if (!pattern) return [];

  const filePattern = LANG_FILE_GLOBS[config.globKey];

  try {
    const result = await window.electronAPI.search.content({
      rootPath,
      query: pattern,
      regex: true,
      caseSensitive: true,
      maxResults: 20,
      filePattern,
    });

    return result.matches.map((m) => ({
      path: m.path,
      line: m.line,
      column: resolveSymbolColumn(m.content, word, m.column),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Definition picker widget — rendered as a Monaco ContentWidget
// ---------------------------------------------------------------------------

/** Extract the file name from an absolute path (no node:path in renderer). */
function fileName(absPath: string): string {
  return absPath.replace(/\\/g, '/').split('/').pop() ?? absPath;
}

/** Return a display-friendly relative path, falling back to the file name. */
function relativePath(absPath: string, rootPath: string): string {
  const normalized = absPath.replace(/\\/g, '/');
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
  if (normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized.slice(normalizedRoot.length + 1);
  }
  return fileName(absPath);
}

interface PickerItem {
  location: DefinitionLocation;
  /** Symbol word being navigated to. */
  symbolName: string;
  /** Relative path shown in the list item. */
  displayPath: string;
}

/**
 * Show a compact inline picker below the cursor.
 * Clicking an item navigates to that location and closes the widget.
 * Pressing Escape or clicking outside also closes it.
 */
function showDefinitionPicker(
  editor: monaco.editor.IStandaloneCodeEditor,
  m: Monaco,
  position: monaco.IPosition,
  items: PickerItem[],
  navigate: (loc: DefinitionLocation) => void
): void {
  // Ensure only one picker is alive at a time
  dismissActivePicker();

  const domNode = document.createElement('div');
  // Make the container focusable so focusout bubbling works correctly
  domNode.tabIndex = -1;
  let root: Root | null = createRoot(domNode);
  let editorClickDisposable: monaco.IDisposable | null = null;

  const dispose = (refocus = true) => {
    domNode.removeEventListener('focusout', handleFocusOut);
    editorClickDisposable?.dispose();
    editorClickDisposable = null;
    editor.removeContentWidget(widget);
    root?.unmount();
    root = null;
    if (activePickerDispose === dispose) activePickerDispose = null;
    // Return focus to the editor so keybindings (e.g. Ctrl+O) keep working
    if (refocus) editor.focus();
  };

  // Close when focus leaves the picker entirely (not just moves between children).
  // Note: clicking the Monaco editor content area calls preventDefault() on mousedown,
  // which suppresses the normal blur/focusout on the input. The editorClickDisposable
  // below handles that case instead.
  const handleFocusOut = (e: FocusEvent) => {
    if (domNode.contains(e.relatedTarget as Node | null)) return;
    dispose();
  };

  const widget: monaco.editor.IContentWidget = {
    getId: () => 'definition.picker.widget',
    getDomNode: () => domNode,
    getPosition: () => ({
      position,
      preference: [
        m.editor.ContentWidgetPositionPreference.BELOW,
        m.editor.ContentWidgetPositionPreference.ABOVE,
      ],
    }),
  };

  activePickerDispose = dispose;
  editor.addContentWidget(widget);
  domNode.addEventListener('focusout', handleFocusOut);

  // Monaco prevents default on mousedown so focusout never fires when the user
  // clicks back into the editor. Close the picker on any plain editor click.
  editorClickDisposable = editor.onMouseDown((e) => {
    // Ignore the Cmd/Ctrl+Click that may have just opened this picker
    if (e.event.metaKey || e.event.ctrlKey) return;
    // Only close when clicking actual editor content, not overlaid widgets
    if (
      e.target.type !== m.editor.MouseTargetType.CONTENT_TEXT &&
      e.target.type !== m.editor.MouseTargetType.CONTENT_EMPTY &&
      e.target.type !== m.editor.MouseTargetType.GUTTER_LINE_NUMBERS &&
      e.target.type !== m.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
    ) {
      return;
    }
    dispose();
  });

  root.render(
    h(DefinitionPickerWidget, {
      items,
      onSelect: (loc) => {
        dispose(false); // navigation handles focus itself
        navigate(loc);
      },
      onDismiss: dispose,
    })
  );
}

/** Track the currently open picker so we can close it on a new invocation. */
let activePickerDispose: (() => void) | null = null;

function dismissActivePicker(): void {
  if (activePickerDispose) {
    activePickerDispose();
    activePickerDispose = null;
  }
}

// ---------------------------------------------------------------------------
// Picker UI — plain function returning a React element (no JSX file needed)
// ---------------------------------------------------------------------------

function DefinitionPickerWidget({
  items,
  onSelect,
  onDismiss,
}: {
  items: PickerItem[];
  onSelect: (loc: DefinitionLocation) => void;
  onDismiss: () => void;
}): ReactElement {
  const [query, setQuery] = useState('');
  // -1 means the filter input has focus; >= 0 is the highlighted list index
  const [activeIndex, setActiveIndex] = useState(-1);

  // Sort base list by file name (case-insensitive ascending), preserving display names
  const sorted = [...items].sort((a, b) =>
    fileName(a.location.path).toLowerCase().localeCompare(fileName(b.location.path).toLowerCase())
  );

  // Filter by substring match against file name, preserving sort order
  const q = query.trim().toLowerCase();
  const visible = q
    ? sorted.filter((item) => fileName(item.location.path).toLowerCase().includes(q))
    : sorted;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onDismiss();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        visible.length === 0 ? -1 : prev < visible.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        visible.length === 0 ? -1 : prev > 0 ? prev - 1 : visible.length - 1
      );
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const item = visible[activeIndex];
      if (item) onSelect(item.location);
    }
  };

  return h(
    'div',
    {
      className:
        'z-50 min-w-[280px] max-w-[440px] overflow-hidden rounded-md border bg-popover shadow-md',
      onKeyDown: handleKeyDown,
    },
    // Search input
    h(
      'div',
      { className: 'border-b px-2 py-1.5' },
      h('input', {
        autoFocus: true,
        type: 'text',
        value: query,
        placeholder: 'Filter definitions…',
        className: 'w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground',
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          setQuery(e.target.value);
          setActiveIndex(-1); // Reset selection when filter changes
        },
      })
    ),
    // Header
    h(
      'div',
      { className: 'px-2 py-1 text-xs text-muted-foreground border-b' },
      `${visible.length} of ${items.length} definitions`
    ),
    // List
    h(
      'ul',
      {
        className: 'max-h-[280px] overflow-y-auto py-1',
        // Prevent wheel events from bubbling into Monaco and scrolling the editor
        onWheel: (e: React.WheelEvent) => e.stopPropagation(),
      },
      visible.length === 0
        ? h(
            'li',
            { className: 'px-3 py-2 text-xs text-muted-foreground' },
            'No matching definitions'
          )
        : visible.map((item, idx) =>
            h(
              'li',
              { key: `${item.location.path}:${item.location.line}` },
              h(
                'button',
                {
                  type: 'button',
                  className: `flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none${idx === activeIndex ? ' bg-accent text-accent-foreground' : ''}`,
                  onClick: () => onSelect(item.location),
                },
                // File name (bold, original case)
                h(
                  'span',
                  { className: 'shrink-0 font-medium text-foreground' },
                  fileName(item.location.path)
                ),
                // Symbol name chip
                h(
                  'span',
                  {
                    className:
                      'shrink-0 rounded bg-muted px-1 font-mono text-xs text-muted-foreground',
                  },
                  item.symbolName
                ),
                // Relative path + line (dim, truncated)
                h(
                  'span',
                  { className: 'min-w-0 flex-1 truncate text-xs text-muted-foreground' },
                  `${item.displayPath}:${item.location.line}`
                )
              )
            )
          )
    )
  );
}

// ---------------------------------------------------------------------------
// Main setup — call once per editor mount
// ---------------------------------------------------------------------------

/**
 * If the word at `wordStartColumn` (1-based) is preceded by a `.` on the same
 * line, return the identifier immediately before that dot (i.e. the "owner").
 * Returns null if the word is not in a member-access expression.
 *
 * Example: "myObj.someMethod" → "myObj"
 *          "a.b.someMethod"   → "b"  (nearest qualifier)
 */
function getOwnerIdentifier(lineText: string, wordStartColumn: number): string | null {
  // wordStartColumn is 1-based; convert to 0-based index
  const dotIdx = wordStartColumn - 2; // character just before the word
  if (dotIdx < 0 || lineText[dotIdx] !== '.') return null;

  // Scan left from dot to find the preceding identifier
  let end = dotIdx - 1;
  // Skip whitespace between identifier and dot (e.g. "foo .bar")
  while (end >= 0 && lineText[end] === ' ') end--;
  if (end < 0 || !/[\w$]/.test(lineText[end])) return null;

  let start = end;
  while (start > 0 && /[\w$]/.test(lineText[start - 1])) start--;

  const owner = lineText.slice(start, end + 1);
  return owner.length > 0 ? owner : null;
}

/**
 * Register Cmd/Ctrl+Click and F12 handlers for go-to-definition navigation.
 * Uses ripgrep to find declaration patterns; cross-file navigation is handled
 * via the navigation store; same-file navigation updates the editor directly.
 * When multiple results are found, an inline picker widget is shown.
 *
 * Returns a disposable that removes the mouse listener when the editor unmounts.
 */
export function setupDefinitionNavigation(
  editor: monaco.editor.IStandaloneCodeEditor,
  m: Monaco,
  getRootPath: () => string | undefined
): { dispose: () => void } {
  /** Navigate to a single resolved location. */
  const navigateTo = (loc: DefinitionLocation, currentPath: string) => {
    if (loc.path.replace(/^\/private/, '') === currentPath.replace(/^\/private/, '')) {
      const col = loc.column + 1; // Monaco is 1-based
      editor.setPosition({ lineNumber: loc.line, column: col });
      editor.revealLineInCenter(loc.line);
      editor.focus();
    } else {
      useNavigationStore.getState().navigateToFile({
        path: loc.path,
        line: loc.line,
        column: loc.column, // setPendingCursor expects 0-based
      });
    }
  };

  // Sequence counter: each invocation captures the current ID before awaiting;
  // if the ID has advanced by the time results arrive, the request is stale and discarded.
  let currentRequestId = 0;

  const handleDefinitionAt = async (position: monaco.IPosition) => {
    const model = editor.getModel();
    const rootPath = getRootPath();
    if (!model || !rootPath) return;

    const word = model.getWordAtPosition(position);
    if (!word || word.word.length < 2) return;

    const langId = model.getLanguageId();

    // For unsupported languages, fall back to Monaco's built-in action.
    if (!LANG_ID_MAP[langId]) {
      editor.getAction('editor.action.revealDefinition')?.run();
      return;
    }

    const requestId = ++currentRequestId;
    const results = await findDefinitions(word.word, langId, rootPath);
    if (requestId !== currentRequestId) return;

    if (results.length === 0) {
      // No ripgrep matches — try Monaco's built-in (handles in-file TS/JS).
      editor.getAction('editor.action.revealDefinition')?.run();
      return;
    }

    // Deduplicate by path:line
    const seen = new Set<string>();
    const unique = results.filter((r) => {
      const key = `${r.path}:${r.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Exclude the exact cursor position (avoids jumping to self).
    // Normalize paths to handle macOS symlinks (e.g. /private/Volumes vs /Volumes).
    const currentPath = model.uri.fsPath;
    const normCurrent = currentPath.replace(/^\/private/, '');
    const currentLine = position.lineNumber;
    const candidates = unique.filter(
      (r) => r.path.replace(/^\/private/, '') !== normCurrent || r.line !== currentLine
    );
    let targets = candidates.length > 0 ? candidates : unique;

    // Member-access narrowing: if the symbol is "a.xxx", use "a" to filter results.
    const lineText = model.getLineContent(position.lineNumber);
    const owner = getOwnerIdentifier(lineText, word.startColumn);
    if (owner) {
      const ownerLower = owner.toLowerCase();

      // "this.xxx" / "self.xxx" — definition must be in the current file.
      if (ownerLower === 'this' || ownerLower === 'self') {
        const inFile = targets.filter((r) => r.path.replace(/^\/private/, '') === normCurrent);
        if (inFile.length > 0) targets = inFile;
      } else if (targets.length > 1) {
        // General case: filter by case-insensitive file-name match.
        const narrowed = targets.filter((r) => {
          const name = fileName(r.path).toLowerCase();
          // Strip common extensions to compare bare name (e.g. "myService.ts" → "myservice")
          const bare = name.replace(/\.[^.]+$/, '');
          return bare.includes(ownerLower) || ownerLower.includes(bare);
        });
        if (narrowed.length === 1) {
          // Unique match after owner narrowing — jump directly
          navigateTo(narrowed[0], currentPath);
          return;
        }
        // Use narrowed set if non-empty; otherwise keep full list
        if (narrowed.length > 1) targets = narrowed;
      }
    }

    if (targets.length === 1) {
      // Single result — jump directly
      navigateTo(targets[0], currentPath);
      return;
    }

    // Multiple results — show picker
    const pickerItems: PickerItem[] = targets.map((loc) => ({
      location: loc,
      symbolName: word.word,
      displayPath: relativePath(loc.path, rootPath),
    }));

    showDefinitionPicker(editor, m, position, pickerItems, (loc) => navigateTo(loc, currentPath));
  };

  // Cmd+Click (macOS) / Ctrl+Click (Windows & Linux)
  const mouseDisposable = editor.onMouseDown((e) => {
    if (!e.event.metaKey && !e.event.ctrlKey) return;
    if (e.target.type !== m.editor.MouseTargetType.CONTENT_TEXT) return;
    const pos = e.target.position;
    if (pos) void handleDefinitionAt(pos);
  });

  // F12 — use onKeyDown instead of addCommand to avoid polluting the shared
  // Monaco command registry (addCommand leaks across editor instances and can
  // silently clobber built-in keybindings like Ctrl+O / quickOutline).
  const keyDisposable = editor.onKeyDown((e) => {
    if (e.keyCode !== m.KeyCode.F12) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = editor.getPosition();
    if (pos) void handleDefinitionAt(pos);
  });

  return {
    dispose: () => {
      mouseDisposable.dispose();
      keyDisposable.dispose();
      dismissActivePicker();
    },
  };
}
