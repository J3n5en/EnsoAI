import { loader } from '@monaco-editor/react';
import { shikiToMonaco } from '@shikijs/monaco';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import langAstro from 'shiki/langs/astro.mjs';
import langSvelte from 'shiki/langs/svelte.mjs';
import langVue from 'shiki/langs/vue.mjs';
import themeVitesseDark from 'shiki/themes/vitesse-dark.mjs';
import themeVitesseLight from 'shiki/themes/vitesse-light.mjs';
// Import ini language for .env file syntax highlighting
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution';

// Configure Monaco workers for Electron environment
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Tell @monaco-editor/react to use our pre-configured monaco instance
loader.config({ monaco });

// Pre-initialize Monaco to ensure it's ready before any editor renders
const _loadedMonaco = await loader.init();

// Pre-create models to trigger language feature loading (tokenizers are lazy-loaded)
// This ensures syntax highlighting works immediately for DiffEditor
const preloadLanguages = [
  'typescript',
  'javascript',
  'json',
  'markdown',
  'css',
  'scss',
  'html',
  'xml',
  'yaml',
  'python',
  'go',
  'rust',
  'swift',
  'java',
  'kotlin',
  'shell',
  'sql',
  'graphql',
  'ini', // For .env files
];
for (const lang of preloadLanguages) {
  try {
    const tempModel = monaco.editor.createModel('', lang);
    tempModel.dispose();
  } catch {
    // Language may not be supported by Monaco, skip silently
  }
}

// Register .env file extensions to use ini syntax highlighting
monaco.languages.register({
  id: 'ini',
  extensions: ['.env', '.env.local', '.env.development', '.env.production', '.env.test'],
  filenames: ['.env'],
});

// Languages to highlight with Shiki (not natively supported by Monaco)
const SHIKI_LANGUAGES = ['vue', 'svelte', 'astro'];
const SHIKI_THEMES = ['vitesse-dark', 'vitesse-light'];

// Register Shiki languages with Monaco for syntax highlighting
// Uses fine-grained imports for smaller bundle size (no WASM needed)
const shikiHighlighter = await createHighlighterCore({
  themes: [themeVitesseDark, themeVitesseLight],
  langs: [langVue, langSvelte, langAstro],
  engine: createJavaScriptRegexEngine(),
});

// Register language IDs with Monaco (include extensions for auto-detection)
for (const lang of SHIKI_LANGUAGES) {
  monaco.languages.register({ id: lang, extensions: [`.${lang}`] });
}

// Save original setTheme before shikiToMonaco patches it
const originalSetTheme = monaco.editor.setTheme.bind(monaco.editor);

// Apply Shiki highlighting to Monaco (this patches setTheme)
shikiToMonaco(shikiHighlighter, monaco);

// Get Shiki's patched setTheme
const shikiSetTheme = monaco.editor.setTheme.bind(monaco.editor);
const shikiThemeSet = new Set<string>(SHIKI_THEMES);

// Restore setTheme with fallback for non-Shiki themes
monaco.editor.setTheme = (themeName: string) => {
  if (shikiThemeSet.has(themeName)) {
    shikiSetTheme(themeName);
  } else {
    originalSetTheme(themeName);
  }
};

// Configure TypeScript compiler options to suppress module resolution errors
// Monaco's TS service can't resolve project-specific paths like @/* aliases
monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  jsx: monaco.typescript.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  // Suppress module not found errors since we can't provide full project context
  noResolve: true,
});

monaco.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  jsx: monaco.typescript.JsxEmit.ReactJSX,
  noResolve: true,
});

// Disable semantic and syntax validation to avoid module resolution errors
// and prevent errors with inmemory:// virtual files used by diff editors
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

// --- DocumentSymbolProviders for languages without built-in language servers ---

/** Build a DocumentSymbol and push it into the symbols array */
function pushSymbol(
  symbols: monaco.languages.DocumentSymbol[],
  model: monaco.editor.ITextModel,
  name: string,
  detail: string,
  kind: monaco.languages.SymbolKind,
  matchIndex: number,
  matchLength: number,
  nameOffset: number,
  nameLength: number
): void {
  const startPos = model.getPositionAt(matchIndex);
  const endPos = model.getPositionAt(matchIndex + matchLength);
  const nameStart = model.getPositionAt(nameOffset);
  const nameEnd = model.getPositionAt(nameOffset + nameLength);
  symbols.push({
    name,
    detail,
    kind,
    tags: [],
    range: {
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    },
    selectionRange: {
      startLineNumber: nameStart.lineNumber,
      startColumn: nameStart.column,
      endLineNumber: nameEnd.lineNumber,
      endColumn: nameEnd.column,
    },
  });
}

// Java: regex-based extraction of classes, methods, and fields
monaco.languages.registerDocumentSymbolProvider('java', {
  provideDocumentSymbols(model) {
    const text = model.getValue();
    const symbols: monaco.languages.DocumentSymbol[] = [];

    // Match class / interface / enum declarations
    const classRe =
      /^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*(?:class|interface|enum)\s+(\w+)/gm;
    let m: RegExpExecArray | null = classRe.exec(text);
    while (m !== null) {
      const nameIdx = m[0].indexOf(m[1]);
      pushSymbol(
        symbols,
        model,
        m[1],
        '',
        monaco.languages.SymbolKind.Class,
        m.index,
        m[0].length,
        m.index + nameIdx,
        m[1].length
      );
      m = classRe.exec(text);
    }

    // Match method declarations (modifiers + return-type + name + params)
    // Note: 'override' is removed — it is a Java annotation (@Override), not a modifier keyword
    const methodRe =
      /^\s*((?:(?:public|private|protected|static|final|abstract|synchronized|native)\s+)*)(<[^>]+>\s+)?(\w+(?:\[\])*(?:<[^>]*>)?(?:\[\])*)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*)?\s*(?:\{|;)/gm;
    let methodMatch: RegExpExecArray | null = methodRe.exec(text);
    while (methodMatch !== null) {
      const modifiers = methodMatch[1].trim();
      const returnType = methodMatch[3];
      const methodName = methodMatch[4];
      const params = methodMatch[5].trim();
      const detail = `${modifiers ? `${modifiers} ` : ''}${returnType} (${params})`;
      const nameIdx = methodMatch[0].indexOf(
        methodName,
        (methodMatch[1] + (methodMatch[2] ?? '') + methodMatch[3]).length
      );
      pushSymbol(
        symbols,
        model,
        methodName,
        detail,
        monaco.languages.SymbolKind.Method,
        methodMatch.index,
        methodMatch[0].length,
        methodMatch.index + nameIdx,
        methodName.length
      );
      methodMatch = methodRe.exec(text);
    }

    // Match field declarations (modifiers + type + name)
    const fieldRe =
      /^\s*((?:(?:public|private|protected|static|final|volatile|transient)\s+)+)(\w+(?:<[^>]*>)?(?:\[\])*)\s+(\w+)\s*(?:=|;)/gm;
    let fieldMatch: RegExpExecArray | null = fieldRe.exec(text);
    while (fieldMatch !== null) {
      const fieldName = fieldMatch[3];
      const typeName = fieldMatch[2];
      const nameIdx = fieldMatch[0].lastIndexOf(fieldName);
      pushSymbol(
        symbols,
        model,
        fieldName,
        typeName,
        monaco.languages.SymbolKind.Field,
        fieldMatch.index,
        fieldMatch[0].length,
        fieldMatch.index + nameIdx,
        fieldName.length
      );
      fieldMatch = fieldRe.exec(text);
    }

    return symbols;
  },
});

// Vue SFC: extract symbols from all <script> and <script setup> blocks
monaco.languages.registerDocumentSymbolProvider('vue', {
  provideDocumentSymbols(model) {
    const text = model.getValue();
    const symbols: monaco.languages.DocumentSymbol[] = [];

    // Collect all <script> blocks (supports both <script> and <script setup>)
    const scriptBlockRe = /<script(\s[^>]*)?>[\s\S]*?<\/script>/gi;
    let blockMatch: RegExpExecArray | null = scriptBlockRe.exec(text);
    while (blockMatch !== null) {
      const blockTag = blockMatch[0];
      const blockAttrs = blockMatch[1] ?? '';
      const isSetup = /\bsetup\b/i.test(blockAttrs);

      // Extract inner content (between opening and closing tag)
      const openTagEnd = blockTag.indexOf('>') + 1;
      const scriptText = blockTag.slice(openTagEnd, blockTag.lastIndexOf('</script>'));
      const scriptOffset = blockMatch.index + openTagEnd;

      if (isSetup) {
        // <script setup>: extract top-level variables and functions
        extractSetupSymbols(scriptText, scriptOffset);
      } else {
        // <script> Options API: extract methods, computed, props, data fields
        extractOptionsApiSymbols(scriptText, scriptOffset);
      }

      blockMatch = scriptBlockRe.exec(text);
    }

    /** Extract symbols from <script setup>: all top-level const/let/var/function declarations */
    function extractSetupSymbols(source: string, offset: number): void {
      // Match: (export) (async) function name
      const fnRe = /(?:^|\n)([ \t]*)(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
      let fm: RegExpExecArray | null = fnRe.exec(source);
      while (fm !== null) {
        const indent = fm[1].length;
        // Only top-level declarations (no indentation inside blocks)
        if (indent === 0) {
          const name = fm[2];
          const nameIdx = fm[0].lastIndexOf(name);
          pushSymbol(
            symbols,
            model,
            name,
            'function',
            monaco.languages.SymbolKind.Function,
            offset + fm.index,
            fm[0].length,
            offset + fm.index + nameIdx,
            name.length
          );
        }
        fm = fnRe.exec(source);
      }

      // Match: (export) const/let/var name = ...
      // Distinguishes arrow functions from regular variables by checking for => after =
      const varRe = /(?:^|\n)([ \t]*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*([^\n;,}]*)/g;
      let vm: RegExpExecArray | null = varRe.exec(source);
      while (vm !== null) {
        const indent = vm[1].length;
        if (indent === 0) {
          const name = vm[2];
          const rhs = vm[3].trim();
          // Arrow function: rhs starts with ( or identifier followed by =>
          const isArrow =
            /^(?:\([^)]*\)|\w+)\s*=>/.test(rhs) || /^async\s*(?:\([^)]*\)|\w+)\s*=>/.test(rhs);
          const kind = isArrow
            ? monaco.languages.SymbolKind.Function
            : monaco.languages.SymbolKind.Variable;
          const nameIdx = vm[0].indexOf(name, vm[1].length);
          pushSymbol(
            symbols,
            model,
            name,
            isArrow ? 'arrow function' : 'variable',
            kind,
            offset + vm.index,
            vm[0].length,
            offset + vm.index + nameIdx,
            name.length
          );
        }
        vm = varRe.exec(source);
      }
    }

    /** Extract symbols from Options API <script> block */
    function extractOptionsApiSymbols(source: string, offset: number): void {
      extractSection(source, offset, 'methods', monaco.languages.SymbolKind.Method);
      extractSection(source, offset, 'computed', monaco.languages.SymbolKind.Property);
      extractSection(source, offset, 'props', monaco.languages.SymbolKind.Property);
      extractDataFields(source, offset);
    }

    /**
     * Walk a brace-delimited body and collect only the direct (depth-1) key names.
     * Returns an array of { name, localIndex } where localIndex is the char offset
     * inside `body` where the key identifier starts.
     */
    function collectTopLevelKeys(body: string): { name: string; localIndex: number }[] {
      const keys: { name: string; localIndex: number }[] = [];
      let depth = 0; // 0 = top level inside the body
      let i = 0;
      while (i < body.length) {
        const ch = body[i];
        if (ch === '{' || ch === '[' || ch === '(') {
          depth++;
          i++;
          continue;
        }
        if (ch === '}' || ch === ']' || ch === ')') {
          depth--;
          i++;
          continue;
        }
        // Only match keys at depth 0 (direct children)
        if (depth === 0) {
          // Skip whitespace / newlines
          if (/\s/.test(ch)) {
            i++;
            continue;
          }
          // Try to match: (async ) identifier followed by ( or :
          const slice = body.slice(i);
          const keyM = /^(?:async\s+)?([a-zA-Z_$][\w$]*)\s*(?:\(|:)/.exec(slice);
          if (keyM) {
            const name = keyM[1];
            const nameOffset = keyM[0].indexOf(name);
            if (name !== 'return' && name !== 'async') {
              keys.push({ name, localIndex: i + nameOffset });
            }
            // Advance past the identifier to avoid re-matching same position
            i += keyM[0].length - 1;
            continue;
          }
        }
        i++;
      }
      return keys;
    }

    /** Extract keys from a top-level Options API section like `methods: { ... }` */
    function extractSection(
      source: string,
      offset: number,
      sectionName: string,
      kind: monaco.languages.SymbolKind
    ): void {
      const sectionRe = new RegExp(`\\b${sectionName}\\s*:\\s*\\{`, 'g');
      const sectionMatch = sectionRe.exec(source);
      if (!sectionMatch) return;

      const bodyStart = sectionMatch.index + sectionMatch[0].length;
      let depth = 1;
      let i = bodyStart;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
      }
      const sectionBody = source.slice(bodyStart, i - 1);
      const bodyOffset = offset + bodyStart;

      for (const { name, localIndex } of collectTopLevelKeys(sectionBody)) {
        pushSymbol(
          symbols,
          model,
          name,
          sectionName,
          kind,
          bodyOffset + localIndex,
          name.length,
          bodyOffset + localIndex,
          name.length
        );
      }
    }

    /** Extract properties returned from the data() function */
    function extractDataFields(source: string, offset: number): void {
      // Find data() { return { ... } }
      const dataRe = /\bdata\s*\(\s*\)\s*\{[\s\S]*?return\s*\{/g;
      const dataMatch = dataRe.exec(source);
      if (!dataMatch) return;

      const returnBraceIdx = dataMatch.index + dataMatch[0].length - 1; // points to '{'
      let depth = 1;
      let i = returnBraceIdx + 1;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
      }
      const returnBody = source.slice(returnBraceIdx + 1, i - 1);
      const returnOffset = offset + returnBraceIdx + 1;

      for (const { name, localIndex } of collectTopLevelKeys(returnBody)) {
        pushSymbol(
          symbols,
          model,
          name,
          'data',
          monaco.languages.SymbolKind.Variable,
          returnOffset + localIndex,
          name.length,
          returnOffset + localIndex,
          name.length
        );
      }
    }

    return symbols;
  },
});

export type Monaco = typeof monaco;
export { monaco };
