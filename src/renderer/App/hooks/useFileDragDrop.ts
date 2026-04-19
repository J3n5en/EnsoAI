import { useEffect, useRef, useState } from 'react';

export function useFileDragDrop(
  setInitialLocalPath: (path: string | null) => void,
  setAddRepoDialogOpen: (open: boolean) => void
) {
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const repositorySidebarRef = useRef<HTMLDivElement>(null);
  const isFileDragOverRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isFileDragOverRef.current = isFileDragOver;
  }, [isFileDragOver]);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      const el = repositorySidebarRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const over =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        setIsFileDragOver(over);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.clientX <= 0 || e.clientY <= 0) {
        setIsFileDragOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const wasOver = isFileDragOverRef.current;
      setIsFileDragOver(false);

      if (wasOver && e.dataTransfer?.files.length) {
        const file = e.dataTransfer.files[0];
        const path = window.electronAPI.utils.getPathForFile(file);
        if (path) {
          setInitialLocalPath(path);
          setAddRepoDialogOpen(true);
        }
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [setInitialLocalPath, setAddRepoDialogOpen]);

  return {
    isFileDragOver,
    repositorySidebarRef,
  };
}
