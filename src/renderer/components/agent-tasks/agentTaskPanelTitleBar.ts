type AgentTaskPanelPlatform = 'darwin' | 'win32' | 'linux' | string;

export function isMacPlatform(platform: AgentTaskPanelPlatform): boolean {
  return platform === 'darwin';
}

export function getAgentTaskPanelHeaderClassName(platform: AgentTaskPanelPlatform): string {
  const horizontalPadding = isMacPlatform(platform) ? 'pl-20 pr-3' : 'px-3';

  return `flex h-9 shrink-0 items-center justify-between border-b ${horizontalPadding} select-none`;
}
