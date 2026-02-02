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

export type Monaco = typeof monaco;
export { monaco };
