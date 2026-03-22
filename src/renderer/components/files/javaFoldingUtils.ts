// Pure Java folding range computation — no monaco dependency.
// Exported so unit tests can import directly without mocking the monaco runtime.

// Numeric constants matching monaco.languages.FoldingRangeKind values.
export const JAVA_FOLDING_KIND = { Comment: 1, Imports: 2, Region: 3 } as const;

export interface JavaFoldingRange {
  start: number;
  end: number;
  kind?: number;
}

// Region marker patterns shared between Pass 3 and Pass 4.
const REGION_START_RE = /^\s*\/\/\s*(?:#?region\b|<editor-fold\b)/;
const REGION_END_RE = /^\s*\/\/\s*(?:#?endregion\b|<\/editor-fold>)/;

/** Pass 1: character-level scan for brace blocks and block comments. */
export function scanBracesAndBlockComments(lines: string[]): JavaFoldingRange[] {
  const ranges: JavaFoldingRange[] = [];
  let inBlockComment = false;
  let inString = false;
  let inCharLiteral = false;
  let inTextBlock = false; // Java 15+ text block: """..."""
  const braceStack: number[] = [];
  let blockCommentStartLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    let j = 0;

    while (j < line.length) {
      const ch = line[j];
      const next = line[j + 1];

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          if (lineNum > blockCommentStartLine) {
            ranges.push({
              start: blockCommentStartLine,
              end: lineNum,
              kind: JAVA_FOLDING_KIND.Comment,
            });
          }
          inBlockComment = false;
          blockCommentStartLine = -1;
          j += 2;
        } else {
          j++;
        }
        continue;
      }

      if (inTextBlock) {
        if (ch === '"' && next === '"' && line[j + 2] === '"') {
          inTextBlock = false;
          j += 3;
        } else {
          j++;
        }
        continue;
      }

      if (inString) {
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === '"') inString = false;
        j++;
        continue;
      }

      if (inCharLiteral) {
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === "'") inCharLiteral = false;
        j++;
        continue;
      }

      // Line comment: skip the rest of the line entirely
      if (ch === '/' && next === '/') {
        break;
      }

      if (ch === '/' && next === '*') {
        inBlockComment = true;
        blockCommentStartLine = lineNum;
        j += 2;
        continue;
      }

      // Text block must be checked before regular string (both start with ")
      if (ch === '"' && next === '"' && line[j + 2] === '"') {
        inTextBlock = true;
        j += 3;
        continue;
      }

      if (ch === '"') {
        inString = true;
        j++;
        continue;
      }
      if (ch === "'") {
        inCharLiteral = true;
        j++;
        continue;
      }

      if (ch === '{') {
        braceStack.push(lineNum);
        j++;
        continue;
      }
      if (ch === '}') {
        if (braceStack.length > 0) {
          const openLine = braceStack.pop()!;
          if (lineNum > openLine) ranges.push({ start: openLine, end: lineNum });
        }
        j++;
        continue;
      }

      j++;
    }
  }

  return ranges;
}

/** Pass 2: line-level scan for import blocks (blank lines between groups are tolerated). */
export function scanImportBlocks(lines: string[]): JavaFoldingRange[] {
  const ranges: JavaFoldingRange[] = [];
  let importStart = -1;
  let importLastLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('import ')) {
      if (importStart === -1) importStart = lineNum;
      importLastLine = lineNum;
    } else if (trimmed.length > 0) {
      // Non-blank, non-import line: close the block
      if (importStart !== -1) {
        if (importLastLine > importStart) {
          ranges.push({
            start: importStart,
            end: importLastLine,
            kind: JAVA_FOLDING_KIND.Imports,
          });
        }
        importStart = -1;
        importLastLine = -1;
      }
    }
    // Blank lines are skipped silently, keeping the current import block open
  }
  if (importStart !== -1 && importLastLine > importStart) {
    ranges.push({
      start: importStart,
      end: importLastLine,
      kind: JAVA_FOLDING_KIND.Imports,
    });
  }

  return ranges;
}

/** Pass 3: line-level scan for consecutive single-line comment groups (region markers excluded). */
export function scanLineCommentGroups(lines: string[]): JavaFoldingRange[] {
  const ranges: JavaFoldingRange[] = [];
  let lineCommentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trimStart();
    const isLineComment =
      trimmed.startsWith('//') && !REGION_START_RE.test(line) && !REGION_END_RE.test(line);
    if (isLineComment) {
      if (lineCommentStart === -1) lineCommentStart = lineNum;
    } else {
      if (lineCommentStart !== -1) {
        const commentEnd = lineNum - 1;
        if (commentEnd > lineCommentStart) {
          ranges.push({
            start: lineCommentStart,
            end: commentEnd,
            kind: JAVA_FOLDING_KIND.Comment,
          });
        }
        lineCommentStart = -1;
      }
    }
  }
  if (lineCommentStart !== -1 && lines.length > lineCommentStart) {
    ranges.push({
      start: lineCommentStart,
      end: lines.length,
      kind: JAVA_FOLDING_KIND.Comment,
    });
  }

  return ranges;
}

/** Pass 4: line-level scan for region markers (// region, // #region, // <editor-fold>). */
export function scanRegionMarkers(lines: string[]): JavaFoldingRange[] {
  const ranges: JavaFoldingRange[] = [];
  const regionStack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    if (REGION_START_RE.test(line)) {
      regionStack.push(lineNum);
    } else if (REGION_END_RE.test(line)) {
      if (regionStack.length > 0) {
        const startLine = regionStack.pop()!;
        if (lineNum > startLine) {
          ranges.push({
            start: startLine,
            end: lineNum,
            kind: JAVA_FOLDING_KIND.Region,
          });
        }
      }
    }
  }

  return ranges;
}

/** Orchestrates all four passes to produce the complete Java folding ranges. */
export function computeJavaFoldingRanges(lines: string[]): JavaFoldingRange[] {
  return [
    ...scanBracesAndBlockComments(lines),
    ...scanImportBlocks(lines),
    ...scanLineCommentGroups(lines),
    ...scanRegionMarkers(lines),
  ];
}
