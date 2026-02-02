import {
  Bot,
  FileCode,
  Globe,
  Keyboard,
  Link,
  Palette,
  Settings,
  Share2,
  Sparkles,
} from 'lucide-react';
import * as React from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { AgentSettings } from './AgentSettings';
import { AISettings } from './AISettings';
import { AppearanceSettings } from './AppearanceSettings';
import type { SettingsCategory } from './constants';
import { EditorSettings } from './EditorSettings';
import { GeneralSettings } from './GeneralSettings';
import { HapiSettings } from './HapiSettings';
import { IntegrationSettings } from './IntegrationSettings';
import { KeybindingsSettings } from './KeybindingsSettings';
import { WebInspectorSettings } from './WebInspectorSettings';

interface SettingsContentProps {
  activeCategory?: SettingsCategory;
  onCategoryChange?: (category: SettingsCategory) => void;
  scrollToProvider?: boolean;
}

export function SettingsContent({
  activeCategory: controlledCategory,
  onCategoryChange,
  scrollToProvider,
}: SettingsContentProps) {
  const { t } = useI18n();

  // 使用受控值,如果未提供则使用内部状态(向后兼容)
  const [internalCategory, setInternalCategory] = React.useState<SettingsCategory>('general');
  const activeCategory = controlledCategory ?? internalCategory;

  const handleCategoryChange = (category: SettingsCategory) => {
    if (onCategoryChange) {
      onCategoryChange(category);
    } else {
      setInternalCategory(category);
    }
  };

  const categories: Array<{ id: SettingsCategory; icon: React.ElementType; label: string }> = [
    { id: 'general', icon: Settings, label: t('General') },
    { id: 'appearance', icon: Palette, label: t('Appearance') },
    { id: 'editor', icon: FileCode, label: t('Editor') },
    { id: 'keybindings', icon: Keyboard, label: t('Keybindings') },
    { id: 'agent', icon: Bot, label: t('Agent') },
    { id: 'ai', icon: Sparkles, label: t('AI') },
    { id: 'integration', icon: Link, label: t('Claude Integration') },
    { id: 'hapi', icon: Share2, label: t('Remote Sharing') },
    { id: 'webInspector', icon: Globe, label: t('Web Inspector') },
  ];

  return (
    <div className="flex h-full w-full">
      {/* Left: Category List */}
      <nav className="w-48 shrink-0 space-y-1 border-r p-2">
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            onClick={() => handleCategoryChange(category.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              activeCategory === category.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            <category.icon className="h-4 w-4" />
            {category.label}
          </button>
        ))}
      </nav>

      {/* Right: Settings Panel */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        {activeCategory === 'general' && <GeneralSettings />}
        {activeCategory === 'appearance' && <AppearanceSettings />}
        {activeCategory === 'editor' && <EditorSettings />}
        {activeCategory === 'keybindings' && <KeybindingsSettings />}
        {activeCategory === 'agent' && <AgentSettings />}
        {activeCategory === 'ai' && <AISettings />}
        {activeCategory === 'integration' && (
          <IntegrationSettings scrollToProvider={scrollToProvider} />
        )}
        {activeCategory === 'hapi' && <HapiSettings />}
        {activeCategory === 'webInspector' && <WebInspectorSettings />}
      </div>
    </div>
  );
}
