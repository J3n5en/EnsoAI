import { useEditorStore } from '@/stores/editor';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useEditor() {
  const {
    openFiles,
    activeFilePath,
    openFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    markFileSaved,
  } = useEditorStore();

  const queryClient = useQueryClient();

  const loadFile = useMutation({
    mutationFn: async (path: string) => {
      const content = await window.electronAPI.file.read(path);
      const language = getLanguageFromPath(path);
      openFile({ path, content, isDirty: false, language });
      return content;
    },
  });

  const saveFile = useMutation({
    mutationFn: async (path: string) => {
      const file = openFiles.find((f) => f.path === path);
      if (!file) throw new Error('File not found');
      await window.electronAPI.file.write(path, file.content);
      markFileSaved(path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file', 'list'] });
    },
  });

  const activeFile = openFiles.find((f) => f.path === activeFilePath) || null;

  return {
    openFiles,
    activeFile,
    loadFile,
    saveFile,
    closeFile,
    setActiveFile,
    updateFileContent,
  };
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    py: 'python',
    rs: 'rust',
    go: 'go',
    swift: 'swift',
    sql: 'sql',
  };
  return languageMap[ext || ''] || 'plaintext';
}
