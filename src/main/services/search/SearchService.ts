import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import type {
  ContentSearchMatch,
  ContentSearchParams,
  ContentSearchResult,
  FileSearchParams,
  FileSearchResult,
} from '@shared/types';

const MAX_FILE_RESULTS = 100;
const MAX_CONTENT_RESULTS = 500;
const SEARCH_TIMEOUT_MS = 10000; // 10 seconds timeout for ripgrep

// Gitignore pattern matcher
class GitignoreMatcher {
  private patterns: { regex: RegExp; negated: boolean }[] = [];

  constructor(rootPath: string) {
    this.loadGitignore(rootPath);
  }

  private loadGitignore(rootPath: string) {
    const gitignorePath = join(rootPath, '.gitignore');
    if (!existsSync(gitignorePath)) return;

    try {
      const content = readFileSync(gitignorePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        let pattern = trimmed;
        let negated = false;

        // Handle negation
        if (pattern.startsWith('!')) {
          negated = true;
          pattern = pattern.slice(1);
        }

        // Convert gitignore pattern to regex
        const regex = this.patternToRegex(pattern);
        if (regex) {
          this.patterns.push({ regex, negated });
        }
      }
    } catch {
      // Ignore errors reading .gitignore
    }
  }

  private patternToRegex(pattern: string): RegExp | null {
    try {
      // Remove trailing slash (directory indicator)
      const isDir = pattern.endsWith('/');
      if (isDir) pattern = pattern.slice(0, -1);

      // Check if pattern is anchored to root
      const anchored = pattern.startsWith('/');
      if (anchored) pattern = pattern.slice(1);

      // Escape special regex chars except * and ?
      let regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/\{\{GLOBSTAR\}\}/g, '.*');

      // If not anchored, match anywhere in path
      if (!anchored) {
        regexStr = `(^|/)${regexStr}`;
      } else {
        regexStr = `^${regexStr}`;
      }

      // Match end of string or followed by /
      regexStr = `${regexStr}($|/)`;

      return new RegExp(regexStr);
    } catch {
      return null;
    }
  }

  isIgnored(relativePath: string): boolean {
    let ignored = false;
    for (const { regex, negated } of this.patterns) {
      if (regex.test(relativePath)) {
        ignored = !negated;
      }
    }
    return ignored;
  }
}

// Common paths where ripgrep might be installed
const RG_PATHS = [
  '/opt/homebrew/bin/rg',
  '/usr/local/bin/rg',
  '/usr/bin/rg',
  // Add more if needed
];

// Find ripgrep executable
function findRipgrep(): string | null {
  const isWindows = process.platform === 'win32';

  // Try common paths first (Unix only)
  if (!isWindows) {
    for (const rgPath of RG_PATHS) {
      try {
        execSync(`test -x "${rgPath}"`, { stdio: 'ignore' });
        return rgPath;
      } catch {
        // Path doesn't exist or isn't executable
      }
    }
  }

  // Try to find in PATH
  try {
    // Use 'where.exe' on Windows (not 'where' which is PowerShell alias for Where-Object)
    const command = isWindows ? 'where.exe rg' : 'which rg';
    const result = execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    // 'where.exe' on Windows may return multiple lines, take the first one
    const firstLine = result.trim().split('\n')[0];
    return firstLine?.trim() || null;
  } catch {
    // Not found
  }

  return null;
}

// Text file extensions for content search
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.md',
  '.mdx',
  '.txt',
  '.csv',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.graphql',
  '.xml',
  '.svg',
  '.env',
  '.gitignore',
  '.dockerignore',
  '.vue',
  '.svelte',
]);

// 模糊匹配分数计算
function fuzzyMatch(query: string, target: string): number {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  // 精确匹配
  if (targetLower === queryLower) return 1000;

  // 包含匹配
  if (targetLower.includes(queryLower)) {
    // 前缀匹配得分更高
    if (targetLower.startsWith(queryLower)) return 900;
    return 800 - targetLower.indexOf(queryLower);
  }

  // 模糊匹配（连续字符）
  let score = 0;
  let queryIndex = 0;
  let consecutiveBonus = 0;

  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      score += 10 + consecutiveBonus;
      consecutiveBonus += 5;
      queryIndex++;
    } else {
      consecutiveBonus = 0;
    }
  }

  // 所有字符都匹配到才算有效
  if (queryIndex === queryLower.length) {
    return score;
  }

  return 0;
}

// 递归遍历目录
async function walkDirectory(
  dir: string,
  rootPath: string,
  results: { path: string; name: string; relativePath: string }[],
  maxResults: number,
  gitignore: GitignoreMatcher | null = null
): Promise<void> {
  if (results.length >= maxResults) return;

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      // 跳过隐藏文件和常见忽略目录
      if (
        entry.startsWith('.') ||
        entry === 'node_modules' ||
        entry === 'dist' ||
        entry === 'build'
      ) {
        continue;
      }

      const fullPath = join(dir, entry);
      const relativePath = relative(rootPath, fullPath);

      // 检查 gitignore
      if (gitignore?.isIgnored(relativePath)) {
        continue;
      }

      try {
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          await walkDirectory(fullPath, rootPath, results, maxResults, gitignore);
        } else {
          results.push({
            path: fullPath,
            name: entry,
            relativePath,
          });
        }
      } catch {
        // 跳过无法访问的文件
      }
    }
  } catch {
    // 跳过无法访问的目录
  }
}

// Check if file should be searched (based on extension)
function isSearchableFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  // Files without extension might be config files
  if (!ext) {
    const name = basename(filePath);
    return !name.startsWith('.');
  }
  return TEXT_EXTENSIONS.has(ext);
}

// Node.js fallback content search
async function searchContentFallback(
  rootPath: string,
  query: string,
  options: {
    maxResults: number;
    caseSensitive: boolean;
    wholeWord: boolean;
    regex: boolean;
    useGitignore: boolean;
  }
): Promise<ContentSearchResult> {
  const matches: ContentSearchMatch[] = [];
  const fileSet = new Set<string>();
  let totalMatches = 0;
  let truncated = false;

  // 初始化 gitignore 匹配器
  const gitignore = options.useGitignore ? new GitignoreMatcher(rootPath) : null;

  // Create regex for matching
  let searchPattern: RegExp;
  try {
    if (options.regex) {
      searchPattern = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
      searchPattern = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
    }
  } catch {
    // Invalid regex, use simple string search
    searchPattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  }

  async function searchInDirectory(dir: string): Promise<void> {
    if (truncated) return;

    try {
      const entries = await readdir(dir);

      for (const entry of entries) {
        if (truncated) break;

        // Skip hidden files and common ignore directories
        if (
          entry.startsWith('.') ||
          entry === 'node_modules' ||
          entry === 'dist' ||
          entry === 'build'
        ) {
          continue;
        }

        const fullPath = join(dir, entry);
        const relativePath = relative(rootPath, fullPath);

        // 检查 gitignore
        if (gitignore?.isIgnored(relativePath)) {
          continue;
        }

        try {
          const stats = await stat(fullPath);

          if (stats.isDirectory()) {
            await searchInDirectory(fullPath);
          } else if (stats.isFile() && isSearchableFile(fullPath) && stats.size < 1024 * 1024) {
            // Only search text files under 1MB
            try {
              const content = await readFile(fullPath, 'utf-8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                searchPattern.lastIndex = 0; // Reset regex

                if (searchPattern.test(line)) {
                  totalMatches++;
                  fileSet.add(fullPath);

                  if (matches.length < options.maxResults) {
                    // Find column position
                    searchPattern.lastIndex = 0;
                    const match = searchPattern.exec(line);
                    const column = match ? match.index : 0;

                    matches.push({
                      path: fullPath,
                      relativePath: relative(rootPath, fullPath),
                      line: i + 1,
                      column,
                      content: line.trim(),
                    });
                  } else {
                    truncated = true;
                    break;
                  }
                }
              }
            } catch {
              // Skip files that can't be read as text
            }
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await searchInDirectory(rootPath);

  return {
    matches,
    totalMatches,
    totalFiles: fileSet.size,
    truncated,
  };
}

export class SearchService {
  private rgPath: string | null = null;
  private rgChecked = false;

  // Check if ripgrep is available
  checkRipgrep(): boolean {
    if (!this.rgChecked) {
      this.rgPath = findRipgrep();
      this.rgChecked = true;
    }
    return this.rgPath !== null;
  }
  // 文件名搜索
  async searchFiles(params: FileSearchParams): Promise<FileSearchResult[]> {
    const { rootPath, query, maxResults = MAX_FILE_RESULTS, useGitignore = true } = params;

    if (!query.trim()) return [];

    // 初始化 gitignore 匹配器
    const gitignore = useGitignore ? new GitignoreMatcher(rootPath) : null;

    const allFiles: { path: string; name: string; relativePath: string }[] = [];
    await walkDirectory(rootPath, rootPath, allFiles, maxResults * 10, gitignore);

    // 计算匹配分数并排序
    const scoredResults = allFiles
      .map((file) => {
        // 同时匹配文件名和相对路径
        const nameScore = fuzzyMatch(query, file.name);
        const pathScore = fuzzyMatch(query, file.relativePath) * 0.8;
        return {
          ...file,
          score: Math.max(nameScore, pathScore),
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return scoredResults;
  }

  // 内容搜索（使用 ripgrep 或 Node.js 后备方案）
  async searchContent(params: ContentSearchParams): Promise<ContentSearchResult> {
    const {
      rootPath,
      query,
      maxResults = MAX_CONTENT_RESULTS,
      caseSensitive = false,
      wholeWord = false,
      regex = false,
      filePattern,
      useGitignore = true,
    } = params;

    if (!query.trim()) {
      return { matches: [], totalMatches: 0, totalFiles: 0, truncated: false };
    }

    // Check for ripgrep availability (only once)
    if (!this.rgChecked) {
      this.rgPath = findRipgrep();
      this.rgChecked = true;
      if (this.rgPath) {
        console.log('[SearchService] Using ripgrep at:', this.rgPath);
      } else {
        console.log('[SearchService] ripgrep not found, using Node.js fallback');
      }
    }

    // Use Node.js fallback if ripgrep is not available
    if (!this.rgPath) {
      return searchContentFallback(rootPath, query, {
        maxResults,
        caseSensitive,
        wholeWord,
        regex,
        useGitignore,
      });
    }

    // Use ripgrep
    return new Promise((resolve) => {
      const args = [
        '--json',
        '--line-number',
        '--column',
        '--max-count',
        '100',
        '--max-filesize',
        '1M',
      ];

      // 忽略常见目录
      args.push('--glob', '!node_modules/**');
      args.push('--glob', '!dist/**');
      args.push('--glob', '!build/**');
      args.push('--glob', '!.git/**');
      args.push('--glob', '!*.lock');
      args.push('--glob', '!package-lock.json');

      // ripgrep 默认遵循 .gitignore，如果不使用则添加 --no-ignore
      if (!useGitignore) args.push('--no-ignore');

      if (!caseSensitive) args.push('-i');
      if (wholeWord) args.push('-w');
      if (!regex) args.push('-F');
      if (filePattern) args.push('--glob', filePattern);

      args.push('--', query, rootPath);

      const matches: ContentSearchMatch[] = [];
      const fileSet = new Set<string>();
      let totalMatches = 0;
      let truncated = false;
      let stderr = '';

      const rg = spawn(this.rgPath!, args);
      let buffer = '';

      rg.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            if (json.type === 'match') {
              totalMatches++;
              fileSet.add(json.data.path.text);

              if (matches.length < maxResults) {
                const match: ContentSearchMatch = {
                  path: json.data.path.text,
                  relativePath: relative(rootPath, json.data.path.text),
                  line: json.data.line_number,
                  column: json.data.submatches?.[0]?.start || 0,
                  content: json.data.lines.text.replace(/\n$/, ''),
                };
                matches.push(match);
              } else {
                truncated = true;
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      });

      rg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 超时处理 - 需要在 close handler 之前定义以便清除
      const timeoutId = setTimeout(() => {
        // Remove listeners before killing to prevent further processing
        rg.stdout.removeAllListeners('data');
        rg.stderr.removeAllListeners('data');
        rg.removeAllListeners('close');
        rg.removeAllListeners('error');
        rg.kill();
        resolve({
          matches,
          totalMatches,
          totalFiles: fileSet.size,
          truncated: true,
        });
      }, SEARCH_TIMEOUT_MS);

      rg.on('close', (code) => {
        // Clear timeout when process ends normally
        clearTimeout(timeoutId);

        // 处理最后一行
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.type === 'match') {
              totalMatches++;
              fileSet.add(json.data.path.text);
              if (matches.length < maxResults) {
                const match: ContentSearchMatch = {
                  path: json.data.path.text,
                  relativePath: relative(rootPath, json.data.path.text),
                  line: json.data.line_number,
                  column: json.data.submatches?.[0]?.start || 0,
                  content: json.data.lines.text.replace(/\n$/, ''),
                };
                matches.push(match);
              }
            }
          } catch {
            // ignore
          }
        }

        if (code === 2 && stderr) {
          console.error('[SearchService] ripgrep error:', stderr);
        }

        resolve({
          matches,
          totalMatches,
          totalFiles: fileSet.size,
          truncated,
        });
      });

      rg.on('error', async (err) => {
        // Clear timeout on error
        clearTimeout(timeoutId);
        // Fallback to Node.js search if ripgrep fails
        console.log('[SearchService] ripgrep failed:', err.message, ', falling back to Node.js');
        this.rgPath = null;
        const result = await searchContentFallback(rootPath, query, {
          maxResults,
          caseSensitive,
          wholeWord,
          regex,
          useGitignore,
        });
        resolve(result);
      });
    });
  }
}

export const searchService = new SearchService();
