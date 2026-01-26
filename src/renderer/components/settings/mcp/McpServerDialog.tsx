import type { McpServer, McpTransportType } from '@shared/types';
import { isHttpMcpServer } from '@shared/types';
import { Code, FormInput } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n';

type InputMode = 'form' | 'json';

/** 将 McpServer 转换为 JSON 配置格式（不含 id/name/enabled 等 UI 字段） */
function serverToJson(server: McpServer): string {
  // 兼容旧数据：没有 transportType 的视为 stdio
  const type = server.transportType || 'stdio';
  if (type === 'http' || type === 'sse') {
    const httpServer = server as { url?: string; headers?: Record<string, string> };
    const config: Record<string, unknown> = {
      type,
      url: httpServer.url ?? '',
    };
    if (httpServer.headers && Object.keys(httpServer.headers).length > 0) {
      config.headers = httpServer.headers;
    }
    return JSON.stringify(config, null, 2);
  }
  const stdioServer = server as { command?: string; args?: string[]; env?: Record<string, string> };
  const config: Record<string, unknown> = {
    command: stdioServer.command ?? '',
  };
  if (stdioServer.args && stdioServer.args.length > 0) {
    config.args = stdioServer.args;
  }
  if (stdioServer.env && Object.keys(stdioServer.env).length > 0) {
    config.env = stdioServer.env;
  }
  return JSON.stringify(config, null, 2);
}

/** 解析 JSON 配置 */
type ParsedConfig =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> };

function parseJsonConfig(json: string): ParsedConfig | null {
  try {
    const parsed = JSON.parse(json);
    // HTTP/SSE 类型
    if (parsed.type === 'http' || parsed.type === 'sse') {
      if (typeof parsed.url !== 'string' || !parsed.url) return null;
      return {
        type: parsed.type,
        url: parsed.url,
        headers: parsed.headers && typeof parsed.headers === 'object' ? parsed.headers : undefined,
      };
    }
    // stdio 类型
    if (typeof parsed.command !== 'string' || !parsed.command) return null;
    return {
      type: 'stdio',
      command: parsed.command,
      args: Array.isArray(parsed.args)
        ? parsed.args.filter((a: unknown) => typeof a === 'string')
        : undefined,
      env: parsed.env && typeof parsed.env === 'object' ? parsed.env : undefined,
    };
  } catch {
    return null;
  }
}

interface McpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: McpServer | null;
  onSave: (server: McpServer) => void;
}

export function McpServerDialog({ open, onOpenChange, server, onSave }: McpServerDialogProps) {
  const { t } = useI18n();
  const isEditing = !!server;

  const [mode, setMode] = React.useState<InputMode>('form');
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [transportType, setTransportType] = React.useState<McpTransportType>('stdio');

  // stdio 表单数据
  const [stdioData, setStdioData] = React.useState({
    command: '',
    args: [] as string[],
    env: {} as Record<string, string>,
  });
  // http 表单数据
  const [httpData, setHttpData] = React.useState({
    url: '',
    headers: {} as Record<string, string>,
  });
  // 通用字段
  const [baseData, setBaseData] = React.useState({ id: '', enabled: true });

  React.useEffect(() => {
    if (open) {
      if (server) {
        setBaseData({ id: server.id, enabled: server.enabled });
        // 兼容旧数据：没有 transportType 的视为 stdio
        const type = server.transportType || 'stdio';
        setTransportType(type);
        if (type === 'http' || type === 'sse') {
          const httpServer = server as { url?: string; headers?: Record<string, string> };
          setHttpData({ url: httpServer.url ?? '', headers: httpServer.headers ?? {} });
          setStdioData({ command: '', args: [], env: {} });
        } else {
          const stdioServer = server as {
            command?: string;
            args?: string[];
            env?: Record<string, string>;
          };
          setStdioData({
            command: stdioServer.command ?? '',
            args: stdioServer.args ?? [],
            env: stdioServer.env ?? {},
          });
          setHttpData({ url: '', headers: {} });
        }
        setJsonText(serverToJson(server));
      } else {
        setBaseData({ id: '', enabled: true });
        setTransportType('stdio');
        setStdioData({ command: '', args: [], env: {} });
        setHttpData({ url: '', headers: {} });
        setJsonText('{\n  "command": ""\n}');
      }
      setJsonError(null);
      setMode('form');
    }
  }, [open, server]);

  // 构建当前服务器对象
  const buildServer = (): McpServer => {
    if (transportType === 'http' || transportType === 'sse') {
      return {
        id: baseData.id,
        name: baseData.id,
        transportType,
        url: httpData.url,
        headers: httpData.headers,
        enabled: baseData.enabled,
      };
    }
    return {
      id: baseData.id,
      name: baseData.id,
      transportType: 'stdio',
      command: stdioData.command,
      args: stdioData.args,
      env: stdioData.env,
      enabled: baseData.enabled,
    };
  };

  // 切换传输类型时更新 JSON
  const handleTransportChange = (newType: McpTransportType) => {
    setTransportType(newType);
    if (newType === 'http' || newType === 'sse') {
      setJsonText(JSON.stringify({ type: newType, url: httpData.url || '' }, null, 2));
    } else {
      setJsonText(JSON.stringify({ command: stdioData.command || '' }, null, 2));
    }
  };

  // 切换到 JSON 模式时，同步表单数据到 JSON
  const handleModeChange = (newMode: string) => {
    if (newMode === 'json' && mode === 'form') {
      setJsonText(serverToJson(buildServer()));
      setJsonError(null);
    } else if (newMode === 'form' && mode === 'json') {
      // 切换到表单模式时，尝试解析 JSON 并同步
      const parsed = parseJsonConfig(jsonText);
      if (parsed) {
        if (parsed.type === 'http' || parsed.type === 'sse') {
          setTransportType(parsed.type);
          setHttpData({ url: parsed.url, headers: parsed.headers ?? {} });
        } else if (parsed.type === 'stdio') {
          setTransportType('stdio');
          setStdioData({ command: parsed.command, args: parsed.args ?? [], env: parsed.env ?? {} });
        }
        setJsonError(null);
      }
    }
    setMode(newMode as InputMode);
  };

  // JSON 文本变化时验证
  const handleJsonChange = (text: string) => {
    setJsonText(text);
    const parsed = parseJsonConfig(text);
    if (parsed) {
      setJsonError(null);
    } else if (text.trim()) {
      setJsonError(t('Invalid JSON config'));
    } else {
      setJsonError(null);
    }
  };

  const handleSubmit = () => {
    if (mode === 'json') {
      const parsed = parseJsonConfig(jsonText);
      if (!parsed || !baseData.id) return;
      if (parsed.type === 'http' || parsed.type === 'sse') {
        onSave({
          id: baseData.id,
          name: baseData.id,
          transportType: parsed.type,
          url: parsed.url,
          headers: parsed.headers,
          enabled: baseData.enabled,
        });
      } else if (parsed.type === 'stdio') {
        onSave({
          id: baseData.id,
          name: baseData.id,
          transportType: 'stdio',
          command: parsed.command,
          args: parsed.args,
          env: parsed.env,
          enabled: baseData.enabled,
        });
      }
    } else {
      const srv = buildServer();
      if (!srv.id) return;
      if (isHttpMcpServer(srv) && !srv.url) return;
      if (!isHttpMcpServer(srv) && !srv.command) return;
      onSave(srv);
    }
  };

  const isFormValid = () => {
    if (!baseData.id) return false;
    if (transportType === 'http' || transportType === 'sse') {
      return !!httpData.url;
    }
    return !!stdioData.command;
  };

  const isValid =
    baseData.id && (mode === 'form' ? isFormValid() : parseJsonConfig(jsonText) !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup zIndexLevel="nested">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('Edit MCP Server') : t('Add MCP Server')}</DialogTitle>
          <DialogDescription>{t('Configure MCP server connection settings')}</DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          {/* ID 始终显示在 Tab 外部 */}
          <Field>
            <FieldLabel>{t('ID')} *</FieldLabel>
            <Input
              value={baseData.id}
              onChange={(e) => setBaseData((f) => ({ ...f, id: e.target.value }))}
              placeholder="mcp-example"
              disabled={isEditing}
            />
          </Field>

          {/* Tab 切换：表单 / JSON */}
          <Tabs value={mode} onValueChange={handleModeChange}>
            <TabsList className="w-full">
              <TabsTrigger value="form" className="flex-1 gap-1.5">
                <FormInput className="h-3.5 w-3.5" />
                {t('Form')}
              </TabsTrigger>
              <TabsTrigger value="json" className="flex-1 gap-1.5">
                <Code className="h-3.5 w-3.5" />
                JSON
              </TabsTrigger>
            </TabsList>

            <TabsContent value="form" className="space-y-3 mt-3">
              <Field>
                <FieldLabel>{t('Type')}</FieldLabel>
                <Select
                  value={transportType}
                  onValueChange={(v) => handleTransportChange(v as McpTransportType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">stdio</SelectItem>
                    <SelectItem value="http">http</SelectItem>
                    <SelectItem value="sse">sse</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {transportType === 'stdio' ? (
                <>
                  <Field>
                    <FieldLabel>{t('Command')} *</FieldLabel>
                    <Input
                      value={stdioData.command}
                      onChange={(e) => setStdioData((f) => ({ ...f, command: e.target.value }))}
                      placeholder="npx"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t('Arguments')}</FieldLabel>
                    <Input
                      value={stdioData.args.join(' ')}
                      onChange={(e) =>
                        setStdioData((f) => ({
                          ...f,
                          args: e.target.value.split(' ').filter(Boolean),
                        }))
                      }
                      placeholder="-y @modelcontextprotocol/server-fetch"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('Space separated')}</p>
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel>URL *</FieldLabel>
                  <Input
                    value={httpData.url}
                    onChange={(e) => setHttpData((f) => ({ ...f, url: e.target.value }))}
                    placeholder="http://localhost:8080/mcp"
                  />
                </Field>
              )}
            </TabsContent>

            <TabsContent value="json" className="mt-3">
              <Field>
                <FieldLabel>JSON {t('Config')}</FieldLabel>
                <Textarea
                  value={jsonText}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  placeholder={'{\n  "command": "npx",\n  "args": ["-y", "@mcp/server"]\n}'}
                  className="font-mono text-xs min-h-[160px] resize-none"
                  spellCheck={false}
                />
                {jsonError && <p className="text-xs text-destructive mt-1">{jsonError}</p>}
                <p className="text-xs text-muted-foreground mt-1">{t('Paste MCP config JSON')}</p>
              </Field>
            </TabsContent>
          </Tabs>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button onClick={handleSubmit} disabled={!isValid}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
