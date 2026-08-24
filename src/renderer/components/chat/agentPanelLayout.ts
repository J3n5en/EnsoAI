export const TERMINAL_BOTTOM_GAP_PX = 8;

export function getTerminalBottomOffset(
  groupId: string | null,
  heightsByGroupId: Readonly<Record<string, number>>
): number {
  return TERMINAL_BOTTOM_GAP_PX + (groupId ? (heightsByGroupId[groupId] ?? 0) : 0);
}
