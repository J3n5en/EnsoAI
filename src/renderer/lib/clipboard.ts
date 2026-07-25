export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    const electronClipboard =
      typeof window === 'undefined' ? undefined : window.electronAPI?.clipboard;

    if (electronClipboard?.writeText) {
      electronClipboard.writeText(text);
      return true;
    }
  } catch {
    // Electron 原生剪贴板不可用时，继续使用浏览器侧兜底。
  }

  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  try {
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Electron 某些窗口可能拒绝 navigator.clipboard，失败时交给调用方保持原状态。
  }

  return copyTextWithTextarea(text);
}

function copyTextWithTextarea(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    activeElement?.focus({ preventScroll: true });
  }
}
