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
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useKeybindingInterceptor } from '@/hooks/useKeybindingInterceptor';
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

interface SettingsDialogProps {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Initial category to show when dialog opens */
  initialCategory?: SettingsCategory;
  /** Scroll to Claude Provider section (only works with integration category) */
  scrollToProvider?: boolean;
}

export function SettingsDialog({
  trigger,
  open,
  onOpenChange,
  initialCategory,
  scrollToProvider,
}: SettingsDialogProps) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = React.useState<SettingsCategory>(
    initialCategory ?? 'general'
  );
  const [internalOpen, setInternalOpen] = React.useState(false);

  // Update active category when initialCategory changes and dialog opens
  React.useEffect(() => {
    if (open && initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [open, initialCategory]);

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

  // Controlled mode (open prop provided) doesn't need trigger
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (isControlled) {
        onOpenChange?.(newOpen);
      } else {
        setInternalOpen(newOpen);
      }
    },
    [isControlled, onOpenChange]
  );

  const handleClose = React.useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  // Intercept close tab keybinding when dialog is open
  useKeybindingInterceptor(isOpen, 'closeTab', handleClose);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            )
          }
        />
      )}
      <DialogPopup className="sm:max-w-4xl" showCloseButton={true} disableNestedTransform>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="text-lg font-medium">{t('Settings')}</DialogTitle>
        </div>
        <div className="flex min-h-[600px] max-h-[600px] flex-1">
          {/* Left: Category List */}
          <nav className="w-48 shrink-0 space-y-1 border-r p-2">
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
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
          <div className="flex-1 overflow-y-auto p-6">
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
      </DialogPopup>
    </Dialog>
  );
}
