export interface TempWorkspaceItem {
  id: string;
  path: string;
  folderName: string;
  title: string;
  createdAt: number;
}

export type TempWorkspaceCreateResult =
  | { ok: true; item: TempWorkspaceItem }
  | { ok: false; code: string; message: string };

export type TempWorkspaceRemoveResult = { ok: true } | { ok: false; code: string; message: string };

export type TempWorkspaceCheckResult = { ok: true } | { ok: false; code: string; message: string };
