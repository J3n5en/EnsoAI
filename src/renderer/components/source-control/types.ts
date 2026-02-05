import type { GitBranch } from '@shared/types';

/**
 * Unified repository type for both main repo and submodules
 */
export type RepositoryType = 'main' | 'submodule';

/**
 * Base repository properties
 */
interface BaseRepository {
  name: string;
  path: string;
  branch: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  changesCount: number;
  branches?: GitBranch[];
  branchesLoading?: boolean;
}

/**
 * Main repository (no submodulePath)
 */
interface MainRepository extends BaseRepository {
  type: 'main';
  submodulePath?: never;
}

/**
 * Submodule repository (requires submodulePath)
 */
interface SubmoduleRepository extends BaseRepository {
  type: 'submodule';
  submodulePath: string;
}

/**
 * Discriminated union for repository types
 */
export type Repository = MainRepository | SubmoduleRepository;

/**
 * Selected file state
 */
export interface SelectedFile {
  path: string;
  staged: boolean;
  submodulePath?: string;
}
