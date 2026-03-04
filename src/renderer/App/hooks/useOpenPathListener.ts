import { getPathBasename } from '@shared/utils/path';
import { useEffect } from 'react';
import type { Repository } from '../constants';
import { pathsEqual } from '../storage';

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
        const name = getPathBasename(path);
        const newRepo: Repository = { name, path };
        const updated = [...repositories, newRepo];
        saveRepositories(updated);
        setSelectedRepo(path);
      }
    });
    return cleanup;
  }, [repositories, saveRepositories, setSelectedRepo]);
}
