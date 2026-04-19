import type { McpServer, McpServerConfig } from '@shared/types';
import { isHttpMcpConfig, isHttpMcpServer } from '@shared/types';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Globe,
  Plus,
  Server,
  Terminal,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { McpServerDialog } from './McpServerDialog';

/**
 * 将配置转换为 McpServer（与 McpManager 保持一致）
 */
function configToServer(id: string, config: McpServerConfig): McpServer {
  if (isHttpMcpConfig(config)) {
    return {
      id,
      name: id,
      transportType: config.type,
      url: config.url,
      headers: config.headers,
      enabled: true,
    };
  }
  return {
    id,
    name: id,
    transportType: 'stdio',
    command: config.command,
    args: config.args,
    env: config.env,
    enabled: true,
  };
}

export function McpSection() {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingServer, setEditingServer] = React.useState<McpServer | null>(null);
  const [initialized, setInitialized] = React.useState(false);

  const mcpServers = useSettingsStore((s) => s.mcpServers);
  const addMcpServer = useSettingsStore((s) => s.addMcpServer);
  const updateMcpServer = useSettingsStore((s) => s.updateMcpServer);
  const removeMcpServer = useSettingsStore((s) => s.removeMcpServer);
  const setMcpServerEnabled = useSettingsStore((s) => s.setMcpServerEnabled);

  // 从 ~/.claude.json 读取现有 MCP 配置并合并到 store
  React.useEffect(() => {
    if (initialized) return;

    const loadExistingMcpServers = async () => {
      try {
        const existingConfig = await window.electronAPI.claudeConfig.mcp.read();
        if (!existingConfig || Object.keys(existingConfig).length === 0) {
          setInitialized(true);
          return;
        }

        // 获取当前 store 中已有的 server IDs
        const existingIds = new Set(mcpServers.map((s) => s.id));

        // 将 ~/.claude.json 中的配置转换为 McpServer 格式并添加到 store
        for (const [id, config] of Object.entries(existingConfig)) {
          if (!existingIds.has(id)) {
            const server = configToServer(id, config);
            addMcpServer(server);
          }
        }

        setInitialized(true);
      } catch (error) {
        console.error('Failed to load existing MCP servers:', error);
        setInitialized(true);
      }
    };

    loadExistingMcpServers();
  }, [initialized, mcpServers, addMcpServer]);

  const enabledCount = mcpServers.filter((s) => s.enabled).length;

  const handleToggle = async (id: string, enabled: boolean) => {
    // 找到要更新的服务器
    const server = mcpServers.find((s) => s.id === id);
    if (!server) return;

    // 更新 store
    setMcpServerEnabled(id, enabled);

    // 使用 upsert 更新单个服务器
    await window.electronAPI.claudeConfig.mcp.upsert({ ...server, enabled });
  };

  const handleEdit = (server: McpServer) => {
    setEditingServer(server);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingServer(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    removeMcpServer(id);
    await window.electronAPI.claudeConfig.mcp.delete(id);
    toastManager.add({ type: 'success', title: t('MCP server removed') });
  };

  const handleSave = async (server: McpServer) => {
    if (editingServer) {
      updateMcpServer(server.id, server);
    } else {
      addMcpServer(server);
    }
    // 使用 upsert 更新单个服务器
    await window.electronAPI.claudeConfig.mcp.upsert(server);
    setDialogOpen(false);
    toastManager.add({ type: 'success', title: t('MCP server saved') });
  };

  return (
    <div className="border-t pt-4 mt-4">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Server className="h-4 w-4" />
          <span className="text-sm font-medium">{t('MCP Servers')}</span>
          <span className="text-xs text-muted-foreground">
            ({enabledCount}/{mcpServers.length})
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            handleAdd();
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {mcpServers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('No MCP servers configured')}
            </p>
          ) : (
            mcpServers.map((server) => {
              const isHttp = isHttpMcpServer(server);
              return (
                <div
                  key={server.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/50 hover:bg-muted"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Switch
                      checked={server.enabled}
                      onCheckedChange={(checked) => handleToggle(server.id, checked)}
                    />
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isHttp ? (
                        <Globe className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                      ) : (
                        <Terminal className="h-3.5 w-3.5 shrink-0 text-green-500" />
                      )}
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block">{server.name}</span>
                        <span className="text-xs text-muted-foreground truncate block">
                          {isHttp ? server.url : server.command}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button variant="ghost" size="icon-xs" onClick={() => handleEdit(server)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(server.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <McpServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        server={editingServer}
        onSave={handleSave}
      />
    </div>
  );
}
