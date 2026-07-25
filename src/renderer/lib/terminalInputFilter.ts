// Codex 在 Windows 终端里偶尔会把 xterm 的颜色查询回答当成普通输入显示出来。
// 这些回答是终端协议数据，不是用户键盘输入，所以可以在写回 PTY 前过滤掉。
// biome-ignore lint/complexity/useRegexLiterals: 用字符串构造正则可以避开控制字符字面量误报
const TERMINAL_COLOR_QUERY_RESPONSE_REGEX = new RegExp(
  String.raw`\x1b\](?:10|11);rgb:[0-9a-f]{1,4}/[0-9a-f]{1,4}/[0-9a-f]{1,4}(?:\x1b\\|\x07)`,
  'gi'
);

export function stripTerminalColorQueryResponses(data: string): string {
  return data.replace(TERMINAL_COLOR_QUERY_RESPONSE_REGEX, '');
}
