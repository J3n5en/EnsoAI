import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Sparkles } from 'lucide-react';
import type * as React from 'react';

interface CommitFormProps {
  message: string;
  onMessageChange: (message: string) => void;
  onCommit: () => void;
  onGenerateMessage?: () => void;
  isCommitting?: boolean;
  isGenerating?: boolean;
  hasStagedChanges?: boolean;
}

export function CommitForm({
  message,
  onMessageChange,
  onCommit,
  onGenerateMessage,
  isCommitting,
  isGenerating,
  hasStagedChanges,
}: CommitFormProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (hasStagedChanges && message.trim()) {
        onCommit();
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">提交信息</h3>
      </div>

      <Textarea
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="描述你的更改..."
        rows={4}
        className="resize-none"
      />

      <div className="flex items-center justify-between gap-2">
        {onGenerateMessage && (
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateMessage}
            disabled={isGenerating || !hasStagedChanges}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isGenerating ? '生成中...' : 'AI 生成'}
          </Button>
        )}

        <Button
          size="sm"
          onClick={onCommit}
          disabled={isCommitting || !hasStagedChanges || !message.trim()}
          className="ml-auto"
        >
          <Send className="mr-2 h-4 w-4" />
          {isCommitting ? '提交中...' : '提交'} <kbd className="ml-2 text-xs opacity-60">⌘⏎</kbd>
        </Button>
      </div>
    </div>
  );
}
