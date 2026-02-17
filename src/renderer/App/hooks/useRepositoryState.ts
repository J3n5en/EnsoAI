import { useCallback, useEffect, useState } from 'react';
import { normalizeHexColor } from '@/lib/colors';
import {
  ALL_GROUP_ID,
  DEFAULT_GROUP_COLOR,
  generateGroupId,
  type Repository,
  type RepositoryGroup,
} from '../constants';
import {
  getActiveGroupId,
  getStoredGroups,
  migrateRepositoryGroups,
  pathsEqual,
  saveActiveGroupId,
  saveGroups,
  STORAGE_KEYS,
} from '../storage';

export function useRepositoryState() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [groups, setGroups] = useState<RepositoryGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>(ALL_GROUP_ID);

  // Initialize repositories and groups from localStorage
  useEffect(() => {
    migrateRepositoryGroups();

    const savedGroups = getStoredGroups();
    setGroups(savedGroups);
    setActiveGroupId(getActiveGroupId());

    const validGroupIds = new Set(savedGroups.map((g) => g.id));

    const savedRepos = localStorage.getItem(STORAGE_KEYS.REPOSITORIES);
    if (savedRepos) {
      try {
        let parsed = JSON.parse(savedRepos) as Repository[];
        let needsMigration = false;
        parsed = parsed.map((repo) => {
          if (repo.name.includes('/') || repo.name.includes('\\')) {
            needsMigration = true;
            const fixedName = repo.path.split(/[\\/]/).pop() || repo.path;
            return { ...repo, name: fixedName };
          }
          if (repo.groupId && !validGroupIds.has(repo.groupId)) {
            needsMigration = true;
            return { ...repo, groupId: undefined };
          }
          return repo;
        });
        if (needsMigration) {
          localStorage.setItem(STORAGE_KEYS.REPOSITORIES, JSON.stringify(parsed));
        }
        setRepositories(parsed);
      } catch {
        // ignore
      }
    }

    const savedSelectedRepo = localStorage.getItem(STORAGE_KEYS.SELECTED_REPO);
    if (savedSelectedRepo) {
      setSelectedRepo(savedSelectedRepo);
    }
  }, []);

  // Save repositories to localStorage
  const saveRepositories = useCallback((repos: Repository[]) => {
    localStorage.setItem(STORAGE_KEYS.REPOSITORIES, JSON.stringify(repos));
    setRepositories(repos);
  }, []);

  // Save selected repo to localStorage
  useEffect(() => {
    if (selectedRepo) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_REPO, selectedRepo);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_REPO);
    }
  }, [selectedRepo]);

  // Group management
  const handleCreateGroup = useCallback(
    (name: string, emoji: string, color: string) => {
      const normalizedColor = normalizeHexColor(color, DEFAULT_GROUP_COLOR);
      const newGroup: RepositoryGroup = {
        id: generateGroupId(),
        name: name.trim(),
        emoji,
        color: normalizedColor,
        order: groups.length,
      };
      const updated = [...groups, newGroup];
      setGroups(updated);
      saveGroups(updated);
      return newGroup;
    },
    [groups]
  );

  const handleUpdateGroup = useCallback(
    (groupId: string, name: string, emoji: string, color: string) => {
      const normalizedColor = normalizeHexColor(color, DEFAULT_GROUP_COLOR);
      const updated = groups.map((g) =>
        g.id === groupId ? { ...g, name: name.trim(), emoji, color: normalizedColor } : g
      );
      setGroups(updated);
      saveGroups(updated);
    },
    [groups]
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      const updatedGroups = groups
        .filter((g) => g.id !== groupId)
        .map((g, i) => ({ ...g, order: i }));
      setGroups(updatedGroups);
      saveGroups(updatedGroups);

      const updatedRepos = repositories.map((r) =>
        r.groupId === groupId ? { ...r, groupId: undefined } : r
      );
      saveRepositories(updatedRepos);

      if (activeGroupId === groupId) {
        setActiveGroupId(ALL_GROUP_ID);
        saveActiveGroupId(ALL_GROUP_ID);
      }
    },
    [groups, repositories, saveRepositories, activeGroupId]
  );

  const handleSwitchGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    saveActiveGroupId(groupId);
  }, []);

  const handleMoveToGroup = useCallback(
    (repoPath: string, targetGroupId: string | null) => {
      const updated = repositories.map((r) =>
        r.path === repoPath ? { ...r, groupId: targetGroupId || undefined } : r
      );
      saveRepositories(updated);
    },
    [repositories, saveRepositories]
  );

  // Repository management
  const handleAddRepository = useCallback(
    (path: string, groupId: string | null = null) => {
      if (repositories.some((r) => pathsEqual(r.path, path))) {
        setSelectedRepo(path);
        return;
      }

      const name = path.split(/[\\/]/).pop() || path;
      const newRepo: Repository = {
        name,
        path,
        groupId: groupId || undefined,
      };

      const updated = [...repositories, newRepo];
      saveRepositories(updated);
      setSelectedRepo(path);
    },
    [repositories, saveRepositories]
  );

  const handleReorderRepositories = useCallback(
    (fromIndex: number, toIndex: number) => {
      const reordered = [...repositories];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      saveRepositories(reordered);
    },
    [repositories, saveRepositories]
  );

  return {
    repositories,
    selectedRepo,
    groups,
    activeGroupId,
    setSelectedRepo,
    setActiveGroupId,
    saveRepositories,
    handleCreateGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleSwitchGroup,
    handleMoveToGroup,
    handleAddRepository,
    handleReorderRepositories,
  };
}
