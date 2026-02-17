import { useEffect } from 'react';
import { pathsEqual } from '../storage';
import type { Repository } from '../constants';

export function useOpenPathListener(
  repositories: Repository[],
  saveRepositories: (repos: Repository[]) => void,
  setSelectedRepo: (repo: string) => void
) {
  useEffect(() => {
    const cleanup = window.electronAPI.app.onOpenPath((rawPath) => {
      const path = rawPath.replace(/[\\/]+$/, '').replace(/^["']|["']$/g, '');
      const existingRepo = repositories.find((r) => pathsEqual(r.path, path));
      if (existingRepo) {
        setSelectedRepo(existingRepo.path);
      } else {
        const name = path.split(/[\\/]/).pop() || path;
        const newRepo: Repository = { name, path };
        const updated = [...repositories, newRepo];
        saveRepositories(updated);
        setSelectedRepo(path);
      }
    });
    return cleanup;
  }, [repositories, saveRepositories, setSelectedRepo]);
}
