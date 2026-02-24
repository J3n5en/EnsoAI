import { AppCategory, type DetectedApp } from '@shared/types';
import { ChevronDown, FileCode, FolderOpen, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Select, SelectItem, SelectPopup, SelectTrigger } from '@/components/ui/select';
import { useDetectedApps, useOpenWith } from '@/hooks/useAppDetector';
import { useEditorStore } from '@/stores/editor';

function AppIcon({
  bundleId,
  name,
  fallback: Fallback,
}: {
  bundleId: string;
  name: string;
  fallback: React.ElementType;
}) {
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.appDetector.getIcon(bundleId).then((dataUrl) => {
      if (dataUrl) setIcon(dataUrl);
    });
  }, [bundleId]);

  if (icon) {
    return <img src={icon} alt={name} className="size-5" />;
  }
  return <Fallback className="size-5" />;
}

import type { TabId } from '@/App/constants';

interface OpenInMenuProps {
  path?: string;
  activeTab?: TabId;
}

export function OpenInMenu({ path, activeTab }: OpenInMenuProps) {
  const { data: apps = [], isLoading } = useDetectedApps();
  const openWith = useOpenWith();
  const [lastUsedApp, setLastUsedApp] = useState<string>('');
  const { activeTabPath, tabs, currentCursorLine } = useEditorStore();

  useEffect(() => {
    const saved = localStorage.getItem('enso-last-opened-app');
    if (saved) {
      setLastUsedApp(saved);
    }
  }, []);

  const handleOpen = async (bundleId: string | null) => {
    if (!bundleId || !path) return;

    setLastUsedApp(bundleId);
    localStorage.setItem('enso-last-opened-app', bundleId);

    // If in file editor tab and files are open, sync all open files
    if (activeTab === 'file' && tabs.length > 0) {
      const openFiles = tabs.map((tab) => tab.path);
      await openWith.mutateAsync({
        path,
        bundleId,
        options: {
          workspacePath: path,
          openFiles,
          activeFile: activeTabPath || undefined,
          line: currentCursorLine || undefined,
        },
      });
    } else {
      // Otherwise just open the directory/path
      await openWith.mutateAsync({ path, bundleId });
    }
  };

  const handleQuickOpen = () => {
    handleOpen(defaultApp.bundleId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
        <FolderOpen className="h-3.5 w-3.5" />
        <span>Loading...</span>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
        <FolderOpen className="h-3.5 w-3.5" />
        <span>No Apps</span>
      </div>
    );
  }

  if (!path) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm opacity-50">
        <FolderOpen className="h-3.5 w-3.5" />
        <span>Quick Open</span>
      </div>
    );
  }

  const lastApp = apps.find((app) => app.bundleId === lastUsedApp);
  const defaultApp = lastApp || apps.find((app) => app.category === 'finder') || apps[0];
  const groupedApps = groupAppsByCategory(apps);

  // Determine what we're opening
  const isOpeningFile = activeTab === 'file' && activeTabPath;
  const displayIcon = isOpeningFile ? FileCode : FolderOpen;

  return (
    <div className="flex h-8 items-center rounded-full bg-muted">
      {/* Left: Quick open button */}
      <button
        type="button"
        onClick={handleQuickOpen}
        className="flex h-full items-center gap-1.5 px-3 text-sm hover:bg-accent/50 rounded-l-full transition-colors"
      >
        <AppIcon bundleId={defaultApp.bundleId} name={defaultApp.name} fallback={displayIcon} />
        <span>{defaultApp.name}</span>
      </button>

      {/* Right: Dropdown trigger */}
      <Select value="" onValueChange={handleOpen}>
        <SelectTrigger className="h-full min-h-0 min-w-0 w-6 gap-0 rounded-r-full border-0 bg-transparent p-0 px-1 shadow-none ring-0 focus-visible:ring-0 focus-visible:border-0 hover:bg-accent/50 data-[state=open]:bg-accent/50 [&_[data-slot=select-icon]]:hidden">
          <ChevronDown className="h-3 w-3" />
        </SelectTrigger>
        <SelectPopup>
          {/* Finder at top */}
          {groupedApps.finder.map((app) => (
            <SelectItem key={app.bundleId} value={app.bundleId}>
              <div className="flex items-center gap-2">
                <AppIcon bundleId={app.bundleId} name={app.name} fallback={FolderOpen} />
                <span>{app.name}</span>
              </div>
            </SelectItem>
          ))}

          {/* Terminals */}
          {groupedApps.terminal.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Terminals
              </div>
              {groupedApps.terminal.map((app) => (
                <SelectItem key={app.bundleId} value={app.bundleId}>
                  <div className="flex items-center gap-2">
                    <AppIcon bundleId={app.bundleId} name={app.name} fallback={Terminal} />
                    <span>{app.name}</span>
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {/* Editors */}
          {groupedApps.editor.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Editors</div>
              {groupedApps.editor.map((app) => (
                <SelectItem key={app.bundleId} value={app.bundleId}>
                  <div className="flex items-center gap-2">
                    <AppIcon bundleId={app.bundleId} name={app.name} fallback={FileCode} />
                    <span>{app.name}</span>
                  </div>
                </SelectItem>
              ))}
            </>
          )}
        </SelectPopup>
      </Select>
    </div>
  );
}

function groupAppsByCategory(apps: DetectedApp[]): Record<AppCategory, DetectedApp[]> {
  const grouped: Record<AppCategory, DetectedApp[]> = {
    [AppCategory.Finder]: [],
    [AppCategory.Terminal]: [],
    [AppCategory.Editor]: [],
  };

  for (const app of apps) {
    if (grouped[app.category]) {
      grouped[app.category].push(app);
    }
  }

  return grouped;
}
