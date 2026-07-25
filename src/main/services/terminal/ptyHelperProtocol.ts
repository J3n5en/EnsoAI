export interface PtyHelperSpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
  useConptyDll?: boolean;
}

export type PtyHelperCommand =
  | {
      type: 'create';
      shell: string;
      args: string[];
      options: PtyHelperSpawnOptions;
    }
  | { type: 'write'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'destroy' };

export type PtyHelperEvent =
  | { type: 'created'; ptyPid: number }
  | { type: 'data'; data: string }
  | { type: 'exit'; exitCode: number; signal?: number }
  | { type: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPtyHelperCommand(value: unknown): value is PtyHelperCommand {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'create':
      return (
        typeof value.shell === 'string' &&
        Array.isArray(value.args) &&
        value.args.every((arg) => typeof arg === 'string') &&
        isRecord(value.options)
      );
    case 'write':
      return typeof value.data === 'string';
    case 'resize':
      return typeof value.cols === 'number' && typeof value.rows === 'number';
    case 'destroy':
      return true;
    default:
      return false;
  }
}

export function isPtyHelperEvent(value: unknown): value is PtyHelperEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'created':
      return typeof value.ptyPid === 'number';
    case 'data':
      return typeof value.data === 'string';
    case 'exit':
      return (
        typeof value.exitCode === 'number' &&
        (value.signal === undefined || typeof value.signal === 'number')
      );
    case 'error':
      return typeof value.message === 'string';
    default:
      return false;
  }
}

export function formatPtyHelperError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
