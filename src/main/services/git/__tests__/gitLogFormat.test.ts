import { describe, expect, it } from 'vitest';
import {
  GIT_LOG_FIELD_SEPARATOR,
  GIT_LOG_RECORD_SEPARATOR,
  parseGitLogOutput,
} from '../gitLogFormat';

describe('parseGitLogOutput', () => {
  it('parses subject and full message separately for multi-line commits', () => {
    const output =
      [
        'abc123',
        '2026-03-24 10:38:45 +0800',
        'Test Author',
        'test@example.com',
        'feat(workflow/approval): 增加可配置审批附件非修正附件预下载策略',
        [
          'feat(workflow/approval): 增加可配置审批附件非修正附件预下载策略',
          '',
          '- 增加预下载开关',
          '- 修复历史回显不完整',
        ].join('\n'),
        'HEAD -> main, origin/main',
      ].join(GIT_LOG_FIELD_SEPARATOR) + GIT_LOG_RECORD_SEPARATOR;

    expect(parseGitLogOutput(output)).toEqual([
      {
        hash: 'abc123',
        date: '2026-03-24 10:38:45 +0800',
        author_name: 'Test Author',
        author_email: 'test@example.com',
        message: 'feat(workflow/approval): 增加可配置审批附件非修正附件预下载策略',
        fullMessage: [
          'feat(workflow/approval): 增加可配置审批附件非修正附件预下载策略',
          '',
          '- 增加预下载开关',
          '- 修复历史回显不完整',
        ].join('\n'),
        refs: 'main, origin/main',
      },
    ]);
  });

  it('falls back to subject when full message is empty', () => {
    const output =
      [
        'def456',
        '2026-03-24 11:00:00 +0800',
        'EnsoAI Team',
        'admin@j3n5en.com',
        'fix(editor): 修复路径解析错误',
        '',
        '',
      ].join(GIT_LOG_FIELD_SEPARATOR) + GIT_LOG_RECORD_SEPARATOR;

    expect(parseGitLogOutput(output)).toEqual([
      {
        hash: 'def456',
        date: '2026-03-24 11:00:00 +0800',
        author_name: 'EnsoAI Team',
        author_email: 'admin@j3n5en.com',
        message: 'fix(editor): 修复路径解析错误',
        fullMessage: 'fix(editor): 修复路径解析错误',
        refs: undefined,
      },
    ]);
  });
});
