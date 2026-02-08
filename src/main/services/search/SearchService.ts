import { spawn } from 'node:child_process';
import { basename, relative } from 'node:path';
import type {
  ContentSearchMatch,
  ContentSearchParams,
  ContentSearchResult,
  FileSearchParams,
  FileSearchResult,
} from '@shared/types';
import { rgPath as originalRgPath } from '@vscode/ripgrep';
import { killProcessTree } from '../../utils/processUtils';

const MAX_FILE_RESULTS = 100;
const MAX_CONTENT_RESULTS = 500;
const SEARCH_TIMEOUT_MS = 10000;

// 统一的排除规则
const EXCLUDE_GLOBS = [
  '!node_modules/**',
  '!dist/**',
  '!build/**',
  '!.git/**',
  '!*.lock',
  '!package-lock.json',
];

const rgPath = originalRgPath.replace(/\.asar([\\/])/, '.asar.unpacked$1');

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

// 使用 ripgrep 获取所有文件列表
async function getAllFilesWithRipgrep(
  rootPath: string
): Promise<{ path: string; name: string; relativePath: string }[]> {
  return new Promise((resolve) => {
    const args = ['--files', ...EXCLUDE_GLOBS.flatMap((g) => ['--glob', g]), rootPath];

    const files: { path: string; name: string; relativePath: string }[] = [];
    let buffer = '';

    const rg = spawn(rgPath, args);

    rg.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const filePath = line.trim();
        if (!filePath) continue;

        files.push({
          path: filePath,
          name: basename(filePath),
          relativePath: relative(rootPath, filePath),
        });
      }
    });

    const timeoutId = setTimeout(() => {
      rg.stdout.removeAllListeners('data');
      rg.removeAllListeners('close');
      rg.removeAllListeners('error');
      killProcessTree(rg);
      resolve(files);
    }, SEARCH_TIMEOUT_MS);

    rg.on('close', () => {
      clearTimeout(timeoutId);

      // 处理最后一行
      if (buffer.trim()) {
        const filePath = buffer.trim();
        files.push({
          path: filePath,
          name: basename(filePath),
          relativePath: relative(rootPath, filePath),
        });
      }

      resolve(files);
    });

    rg.on('error', (err) => {
      clearTimeout(timeoutId);
      console.error('[SearchService] ripgrep --files spawn error:', err.message);
      resolve([]);
    });
  });
}

export class SearchService {
  // 文件名搜索（使用 ripgrep --files）
  async searchFiles(params: FileSearchParams): Promise<FileSearchResult[]> {
    const { rootPath, query, maxResults = MAX_FILE_RESULTS } = params;

    const allFiles = await getAllFilesWithRipgrep(rootPath);

    // Empty query: return files sorted by path (shallow files first)
    if (!query.trim()) {
      return allFiles
        .map((file) => ({ ...file, score: 0 }))
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
        .slice(0, maxResults);
    }

    // Fuzzy match and rank
    const scoredResults = allFiles
      .map((file) => {
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

  // 内容搜索（使用 ripgrep）
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
      args.push(...EXCLUDE_GLOBS.flatMap((g) => ['--glob', g]));

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

      const rg = spawn(rgPath, args);
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
                const submatch = json.data.submatches?.[0];
                const match: ContentSearchMatch = {
                  path: json.data.path.text,
                  relativePath: relative(rootPath, json.data.path.text),
                  line: json.data.line_number,
                  column: submatch?.start || 0,
                  matchLength: submatch ? submatch.end - submatch.start : 0,
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

      const timeoutId = setTimeout(() => {
        rg.stdout.removeAllListeners('data');
        rg.stderr.removeAllListeners('data');
        rg.removeAllListeners('close');
        rg.removeAllListeners('error');
        killProcessTree(rg);
        resolve({
          matches,
          totalMatches,
          totalFiles: fileSet.size,
          truncated: true,
        });
      }, SEARCH_TIMEOUT_MS);

      rg.on('close', (code) => {
        clearTimeout(timeoutId);

        // 处理最后一行
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.type === 'match') {
              totalMatches++;
              fileSet.add(json.data.path.text);
              if (matches.length < maxResults) {
                const submatch = json.data.submatches?.[0];
                const match: ContentSearchMatch = {
                  path: json.data.path.text,
                  relativePath: relative(rootPath, json.data.path.text),
                  line: json.data.line_number,
                  column: submatch?.start || 0,
                  matchLength: submatch ? submatch.end - submatch.start : 0,
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

      rg.on('error', (err) => {
        clearTimeout(timeoutId);
        console.error('[SearchService] ripgrep spawn error:', err.message);
        resolve({
          matches: [],
          totalMatches: 0,
          totalFiles: 0,
          truncated: false,
        });
      });
    });
  }
}

export const searchService = new SearchService();
