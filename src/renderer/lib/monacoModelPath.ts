import { monaco } from '@/components/files/monacoSetup';

function normalizeVirtualPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function toMonacoFileUri(path: string): string {
  return monaco.Uri.file(path).toString();
}

export function toMonacoVirtualUri(scheme: string, path: string): string {
  return monaco.Uri.from({
    scheme,
    path: normalizeVirtualPath(path),
  }).toString();
}
