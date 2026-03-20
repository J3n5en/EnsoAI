import { describe, expect, it } from 'vitest';
import {
  computeJavaFoldingRanges,
  JAVA_FOLDING_KIND,
  scanBracesAndBlockComments,
  scanImportBlocks,
  scanLineCommentGroups,
  scanRegionMarkers,
} from '../javaFoldingUtils';

// ---------------------------------------------------------------------------
// Pass 1: scanBracesAndBlockComments
// ---------------------------------------------------------------------------

describe('scanBracesAndBlockComments', () => {
  it('produces a range for a single brace block', () => {
    const lines = ['class Foo {', '  int x;', '}'];
    expect(scanBracesAndBlockComments(lines)).toEqual([{ start: 1, end: 3 }]);
  });

  it('handles nested brace blocks', () => {
    const lines = ['class Foo {', '  void bar() {', '    return;', '  }', '}'];
    expect(scanBracesAndBlockComments(lines)).toEqual([
      { start: 2, end: 4 },
      { start: 1, end: 5 },
    ]);
  });

  it('ignores braces inside string literals', () => {
    const lines = ['String s = "hello { world }";'];
    expect(scanBracesAndBlockComments(lines)).toEqual([]);
  });

  it('ignores braces inside char literals', () => {
    const lines = ["char c = '{';"];
    expect(scanBracesAndBlockComments(lines)).toEqual([]);
  });

  it('ignores braces inside Java 15+ text blocks', () => {
    const lines = ['var s = """', '  {', '  }', '""";'];
    expect(scanBracesAndBlockComments(lines)).toEqual([]);
  });

  it('ignores braces after a line comment marker', () => {
    const lines = ['// comment {', 'class Foo {}'];
    // Only the inline {}: same line open/close so start===end → no range
    expect(scanBracesAndBlockComments(lines)).toEqual([]);
  });

  it('produces a Comment range for a multi-line block comment', () => {
    const lines = ['/* start', ' * middle', ' * end */'];
    expect(scanBracesAndBlockComments(lines)).toEqual([
      { start: 1, end: 3, kind: JAVA_FOLDING_KIND.Comment },
    ]);
  });

  it('does not produce a range for a single-line block comment', () => {
    const lines = ['/* one-liner */'];
    // start === end (both line 1) → no range pushed
    expect(scanBracesAndBlockComments(lines)).toEqual([]);
  });

  it('ignores braces inside block comments', () => {
    const lines = ['/*', ' * { not a brace }', ' */'];
    expect(scanBracesAndBlockComments(lines)).toEqual([
      { start: 1, end: 3, kind: JAVA_FOLDING_KIND.Comment },
    ]);
  });

  it('handles escape sequences in strings', () => {
    const lines = ['String s = "he said \\"hello\\" {";'];
    expect(scanBracesAndBlockComments(lines)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(scanBracesAndBlockComments([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pass 2: scanImportBlocks
// ---------------------------------------------------------------------------

describe('scanImportBlocks', () => {
  it('produces an Imports range for a consecutive import block', () => {
    const lines = ['import java.util.List;', 'import java.util.Map;', '', 'class Foo {}'];
    expect(scanImportBlocks(lines)).toEqual([
      { start: 1, end: 2, kind: JAVA_FOLDING_KIND.Imports },
    ]);
  });

  it('does not produce a range for a single import line', () => {
    const lines = ['import java.util.List;', 'class Foo {}'];
    expect(scanImportBlocks(lines)).toEqual([]);
  });

  it('treats blank lines between import groups as part of the same block', () => {
    const lines = ['import java.util.List;', '', 'import java.util.Map;', 'class Foo {}'];
    expect(scanImportBlocks(lines)).toEqual([
      { start: 1, end: 3, kind: JAVA_FOLDING_KIND.Imports },
    ]);
  });

  it('produces a range for an import block at end of file', () => {
    const lines = ['import java.util.List;', 'import java.util.Map;'];
    expect(scanImportBlocks(lines)).toEqual([
      { start: 1, end: 2, kind: JAVA_FOLDING_KIND.Imports },
    ]);
  });

  it('handles import static statements', () => {
    const lines = [
      'import static java.util.Collections.sort;',
      'import java.util.List;',
      'class Foo {}',
    ];
    expect(scanImportBlocks(lines)).toEqual([
      { start: 1, end: 2, kind: JAVA_FOLDING_KIND.Imports },
    ]);
  });

  it('returns empty array when no imports', () => {
    const lines = ['package com.example;', '', 'class Foo {}'];
    expect(scanImportBlocks(lines)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pass 3: scanLineCommentGroups
// ---------------------------------------------------------------------------

describe('scanLineCommentGroups', () => {
  it('produces a Comment range for consecutive line comments', () => {
    const lines = ['// comment 1', '// comment 2', '// comment 3', 'code'];
    expect(scanLineCommentGroups(lines)).toEqual([
      { start: 1, end: 3, kind: JAVA_FOLDING_KIND.Comment },
    ]);
  });

  it('does not produce a range for a single line comment', () => {
    const lines = ['// comment', 'code'];
    expect(scanLineCommentGroups(lines)).toEqual([]);
  });

  it('excludes region start markers from comment groups', () => {
    const lines = ['// region foo', '// regular comment', '// endregion'];
    // Only '// regular comment' is a plain comment; single line → no range
    expect(scanLineCommentGroups(lines)).toEqual([]);
  });

  it('splits groups when interrupted by a non-comment line', () => {
    const lines = ['// group 1a', '// group 1b', 'code', '// group 2a', '// group 2b', 'code'];
    expect(scanLineCommentGroups(lines)).toEqual([
      { start: 1, end: 2, kind: JAVA_FOLDING_KIND.Comment },
      { start: 4, end: 5, kind: JAVA_FOLDING_KIND.Comment },
    ]);
  });

  it('produces a range for a comment group that runs to end of file', () => {
    const lines = ['code', '// a', '// b'];
    expect(scanLineCommentGroups(lines)).toEqual([
      { start: 2, end: 3, kind: JAVA_FOLDING_KIND.Comment },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(scanLineCommentGroups([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pass 4: scanRegionMarkers
// ---------------------------------------------------------------------------

describe('scanRegionMarkers', () => {
  it('matches // region / // endregion', () => {
    const lines = ['// region foo', 'code', '// endregion'];
    expect(scanRegionMarkers(lines)).toEqual([
      { start: 1, end: 3, kind: JAVA_FOLDING_KIND.Region },
    ]);
  });

  it('matches // #region / // #endregion', () => {
    const lines = ['// #region', 'code', '// #endregion'];
    expect(scanRegionMarkers(lines)).toEqual([
      { start: 1, end: 3, kind: JAVA_FOLDING_KIND.Region },
    ]);
  });

  it('matches // <editor-fold> / // </editor-fold>', () => {
    const lines = ['// <editor-fold>', 'code', '// </editor-fold>'];
    expect(scanRegionMarkers(lines)).toEqual([
      { start: 1, end: 3, kind: JAVA_FOLDING_KIND.Region },
    ]);
  });

  it('handles nested regions', () => {
    const lines = ['// region outer', '// region inner', 'code', '// endregion', '// endregion'];
    expect(scanRegionMarkers(lines)).toEqual([
      { start: 2, end: 4, kind: JAVA_FOLDING_KIND.Region },
      { start: 1, end: 5, kind: JAVA_FOLDING_KIND.Region },
    ]);
  });

  it('ignores unmatched endregion', () => {
    const lines = ['code', '// endregion'];
    expect(scanRegionMarkers(lines)).toEqual([]);
  });

  it('ignores unmatched region start', () => {
    const lines = ['// region foo', 'code'];
    expect(scanRegionMarkers(lines)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(scanRegionMarkers([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration: computeJavaFoldingRanges
// ---------------------------------------------------------------------------

describe('computeJavaFoldingRanges', () => {
  it('combines all four passes on a representative Java file', () => {
    const lines = [
      'package com.example;', // 1
      '', // 2
      'import java.util.List;', // 3
      'import java.util.Map;', // 4
      '', // 5
      '/**', // 6
      ' * Javadoc', // 7
      ' */', // 8
      'public class Foo {', // 9
      '  // This is a comment', // 10
      '  // Another line', // 11
      '  void bar() {', // 12
      '    // region myRegion', // 13
      '    int x = 0;', // 14
      '    // endregion', // 15
      '  }', // 16
      '}', // 17
    ];

    const result = computeJavaFoldingRanges(lines);

    // Import block (Pass 2)
    expect(result).toContainEqual({ start: 3, end: 4, kind: JAVA_FOLDING_KIND.Imports });
    // Block comment (Pass 1)
    expect(result).toContainEqual({ start: 6, end: 8, kind: JAVA_FOLDING_KIND.Comment });
    // Class brace (Pass 1)
    expect(result).toContainEqual({ start: 9, end: 17 });
    // Method brace (Pass 1)
    expect(result).toContainEqual({ start: 12, end: 16 });
    // Line comment group (Pass 3)
    expect(result).toContainEqual({ start: 10, end: 11, kind: JAVA_FOLDING_KIND.Comment });
    // Region (Pass 4)
    expect(result).toContainEqual({ start: 13, end: 15, kind: JAVA_FOLDING_KIND.Region });
  });

  it('returns empty array for empty input', () => {
    expect(computeJavaFoldingRanges([])).toEqual([]);
  });
});
