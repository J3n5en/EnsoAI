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
      const startPos = model.getPositionAt(m.index);
      const endPos = model.getPositionAt(m.index + m[0].length);
      const nameStart = model.getPositionAt(m.index + m[0].indexOf(m[1]));
      const nameEnd = model.getPositionAt(m.index + m[0].indexOf(m[1]) + m[1].length);
      symbols.push({
        name: m[1],
        detail: '',
        kind: monaco.languages.SymbolKind.Class,
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
      m = classRe.exec(text);
    }

    // Match method declarations (modifiers + return-type + name + params)
    const methodRe =
      /^\s*((?:(?:public|private|protected|static|final|abstract|synchronized|native|override)\s+)*)(<[^>]+>\s+)?(\w+(?:\[\])*(?:<[^>]*>)?(?:\[\])*)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*)?\s*(?:\{|;)/gm;
    let methodMatch: RegExpExecArray | null = methodRe.exec(text);
    while (methodMatch !== null) {
      const modifiers = methodMatch[1].trim();
      const returnType = methodMatch[3];
      const methodName = methodMatch[4];
      const params = methodMatch[5].trim();
      const detail = `${modifiers ? `${modifiers} ` : ''}${returnType} (${params})`;
      const startPos = model.getPositionAt(methodMatch.index);
      const endPos = model.getPositionAt(methodMatch.index + methodMatch[0].length);
      const nameIdx = methodMatch[0].indexOf(
        methodName,
        (methodMatch[1] + (methodMatch[2] ?? '') + methodMatch[3]).length
      );
      const nameStart = model.getPositionAt(methodMatch.index + nameIdx);
      const nameEnd = model.getPositionAt(methodMatch.index + nameIdx + methodName.length);
      symbols.push({
        name: methodName,
        detail,
        kind: monaco.languages.SymbolKind.Method,
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
      methodMatch = methodRe.exec(text);
    }

    // Match field declarations (modifiers + type + name)
    const fieldRe =
      /^\s*((?:(?:public|private|protected|static|final|volatile|transient)\s+)+)(\w+(?:<[^>]*>)?(?:\[\])*)\s+(\w+)\s*(?:=|;)/gm;
    let fieldMatch: RegExpExecArray | null = fieldRe.exec(text);
    while (fieldMatch !== null) {
      const fieldName = fieldMatch[3];
      const typeName = fieldMatch[2];
      const startPos = model.getPositionAt(fieldMatch.index);
      const endPos = model.getPositionAt(fieldMatch.index + fieldMatch[0].length);
      const nameIdx = fieldMatch[0].lastIndexOf(fieldName);
      const nameStart = model.getPositionAt(fieldMatch.index + nameIdx);
      const nameEnd = model.getPositionAt(fieldMatch.index + nameIdx + fieldName.length);
      symbols.push({
        name: fieldName,
        detail: typeName,
        kind: monaco.languages.SymbolKind.Field,
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
      fieldMatch = fieldRe.exec(text);
    }

    return symbols;
  },
});

// Vue SFC: extract symbols from <script> block (methods, computed, data, props)
monaco.languages.registerDocumentSymbolProvider('vue', {
  provideDocumentSymbols(model) {
    const text = model.getValue();
    const symbols: monaco.languages.DocumentSymbol[] = [];

    // Locate <script> block (Options API or setup)
    const scriptMatch = /<script(?:[^>]*)>([\s\S]*?)<\/script>/i.exec(text);
    if (!scriptMatch) return symbols;

    const scriptOffset = text.indexOf(scriptMatch[1]);
    const scriptText = scriptMatch[1];

    /** Helper: find all keys under a top-level object property like `methods: { ... }` */
    function extractObjectKeys(
      source: string,
      sectionName: string,
      kind: monaco.languages.SymbolKind
    ): void {
      const sectionRe = new RegExp(`\\b${sectionName}\\s*:\\s*\\{`, 'g');
      const sectionMatch = sectionRe.exec(source);
      if (!sectionMatch) return;

      // Find the matching closing brace
      let depth = 1;
      let i = sectionMatch.index + sectionMatch[0].length;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
      }
      const sectionBody = source.slice(sectionMatch.index + sectionMatch[0].length, i - 1);
      const bodyOffset = scriptOffset + sectionMatch.index + sectionMatch[0].length;

      // Match property / method names (identifier followed by : or ()
      const keyRe = /^\s*(?:async\s+)?(\w+)\s*(?:\([^)]*\)|:)/gm;
      let km: RegExpExecArray | null = keyRe.exec(sectionBody);
      while (km !== null) {
        const name = km[1];
        if (name !== 'return') {
          const absOffset = bodyOffset + km.index;
          const nameAbsOffset = absOffset + km[0].indexOf(name);
          const startPos = model.getPositionAt(absOffset);
          const nameStart = model.getPositionAt(nameAbsOffset);
          const nameEnd = model.getPositionAt(nameAbsOffset + name.length);
          symbols.push({
            name,
            detail: sectionName,
            kind,
            tags: [],
            range: {
              startLineNumber: startPos.lineNumber,
              startColumn: startPos.column,
              endLineNumber: startPos.lineNumber,
              endColumn: startPos.column + km[0].trimEnd().length,
            },
            selectionRange: {
              startLineNumber: nameStart.lineNumber,
              startColumn: nameStart.column,
              endLineNumber: nameEnd.lineNumber,
              endColumn: nameEnd.column,
            },
          });
        }
        km = keyRe.exec(sectionBody);
      }
    }

    extractObjectKeys(scriptText, 'methods', monaco.languages.SymbolKind.Method);
    extractObjectKeys(scriptText, 'computed', monaco.languages.SymbolKind.Property);
    extractObjectKeys(scriptText, 'props', monaco.languages.SymbolKind.Property);

    // Extract <script setup> top-level const/function declarations
    const isSetup = /<script\s[^>]*setup[^>]*>/i.test(scriptMatch[0]);
    if (isSetup) {
      const fnRe = /(?:^|\n)\s*(?:export\s+)?(?:const|function|async function)\s+(\w+)/g;
      let fm: RegExpExecArray | null = fnRe.exec(scriptText);
      while (fm !== null) {
        const name = fm[1];
        const absOffset = scriptOffset + fm.index;
        const nameAbsOffset = absOffset + fm[0].indexOf(name);
        const startPos = model.getPositionAt(absOffset);
        const nameStart = model.getPositionAt(nameAbsOffset);
        const nameEnd = model.getPositionAt(nameAbsOffset + name.length);
        symbols.push({
          name,
          detail: 'setup',
          kind: monaco.languages.SymbolKind.Function,
          tags: [],
          range: {
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: startPos.lineNumber,
            endColumn: startPos.column + fm[0].trimEnd().length,
          },
          selectionRange: {
            startLineNumber: nameStart.lineNumber,
            startColumn: nameStart.column,
            endLineNumber: nameEnd.lineNumber,
            endColumn: nameEnd.column,
          },
        });
        fm = fnRe.exec(scriptText);
      }
    }

    return symbols;
  },
});

export type Monaco = typeof monaco;
export { monaco };
