import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "@/stores/settings";

// Custom event name for cross-component refresh trigger
const BACKGROUND_REFRESH_EVENT = "background-refresh";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogg", ".mov"]);
const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

function getExtension(path: string): string {
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return path.slice(dotIndex).toLowerCase();
}

function isVideoFile(path: string): boolean {
  return VIDEO_EXTENSIONS.has(getExtension(path));
}

function isMediaFile(name: string): boolean {
  return MEDIA_EXTENSIONS.has(getExtension(name));
}

function normalizeForUrlPath(path: string): string {
  let normalized = path.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `/${normalized}`;
  }
  if (!normalized.startsWith("/") && !normalized.includes("://")) {
    return `/${normalized}`;
  }
  return normalized;
}

function buildLocalMediaUrl(rawPath: string): string {
  try {
    const pathPart = normalizeForUrlPath(rawPath);
    return `local-image://${encodeURI(pathPart)}`;
  } catch {
    return "";
  }
}

function resolveMediaUrl(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  // Remote URLs: proxy through main process via local-image://remote-fetch
  // This avoids renderer CORS / redirect / SSL issues with direct <img> loading
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return `local-image://remote-fetch?url=${encodeURIComponent(trimmed)}`;
  }
  if (lower.startsWith("data:") || lower.startsWith("blob:")) {
    return trimmed;
  }
  if (lower.startsWith("local-image://")) {
    return trimmed;
  }
  if (lower.startsWith("file://")) {
    return trimmed.replace(/^file:\/\//i, "local-image://");
  }

  return buildLocalMediaUrl(trimmed);
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

async function listMediaInFolder(folderPath: string): Promise<string[]> {
  try {
    const entries = await window.electronAPI.file.list(folderPath);
    return entries
      .filter((e) => !e.isDirectory && isMediaFile(e.name))
      .map((e) => e.path);
  } catch (error) {
    console.error("[BackgroundLayer] Failed to list media in folder:", error);
    return [];
  }
}

export function BackgroundLayer() {
  const {
    backgroundImageEnabled,
    backgroundImagePath,
    backgroundUrlPath,
    backgroundFolderPath,
    backgroundSourceType,
    backgroundRandomEnabled,
    backgroundRandomInterval,
    backgroundBlur,
    backgroundBrightness,
    backgroundSaturation,
    backgroundSizeMode,
  } = useSettingsStore();

  // Active path based on current source type
  const activePath =
    backgroundSourceType === "folder"
      ? backgroundFolderPath
      : backgroundSourceType === "url"
        ? backgroundUrlPath
        : backgroundImagePath;
  const isUrlMode = backgroundSourceType === "url";

  // Local refresh counter — triggered via DOM event from settings UI
  const [refreshCount, setRefreshCount] = useState(0);
  useEffect(() => {
    const handler = () => setRefreshCount((c) => c + 1);
    window.addEventListener(BACKGROUND_REFRESH_EVENT, handler);
    return () => window.removeEventListener(BACKGROUND_REFRESH_EVENT, handler);
  }, []);

  // For folder mode: the currently resolved media file path
  const [resolvedFile, setResolvedFile] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if active path is a remote URL (for compatibility with legacy file-mode URL input)
  const isRemoteUrl = useMemo(() => {
    return /^https?:\/\//i.test(activePath.trim());
  }, [activePath]);

  // Pick a random file from folder
  const pickRandomFile = useCallback(async () => {
    if (!activePath || backgroundSourceType !== "folder") return;
    const files = await listMediaInFolder(activePath);
    const picked = pickRandom(files);
    if (picked) {
      setResolvedFile(picked);
    }
  }, [activePath, backgroundSourceType]);

  // On mount, folder path change, or manual refresh trigger → pick random file
  useEffect(() => {
    if (backgroundSourceType === "folder" && activePath && !isRemoteUrl) {
      pickRandomFile();
    } else {
      setResolvedFile("");
    }
  }, [
    backgroundSourceType,
    activePath,
    pickRandomFile,
    refreshCount,
    isRemoteUrl,
  ]);

  // Auto-random interval: works for folder mode (re-pick) and URL mode (re-fetch via refresh)
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const canAutoRandom =
      backgroundRandomEnabled &&
      backgroundRandomInterval > 0 &&
      activePath &&
      (backgroundSourceType === "folder" || isUrlMode || isRemoteUrl);

    if (canAutoRandom) {
      intervalRef.current = setInterval(() => {
        if (backgroundSourceType === "folder") {
          pickRandomFile();
        } else {
          // For URL mode: dispatch refresh event to trigger re-fetch with cache busting
          window.dispatchEvent(new Event(BACKGROUND_REFRESH_EVENT));
        }
      }, backgroundRandomInterval * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    backgroundSourceType,
    backgroundRandomEnabled,
    backgroundRandomInterval,
    activePath,
    isUrlMode,
    isRemoteUrl,
    pickRandomFile,
  ]);

  // Determine the actual file to display
  const displayPath = useMemo(() => {
    // URLs are always used directly (not treated as folder paths)
    if (isRemoteUrl) {
      return activePath;
    }
    if (backgroundSourceType === "folder") {
      return resolvedFile;
    }
    return activePath;
  }, [backgroundSourceType, activePath, resolvedFile, isRemoteUrl]);

  const mediaUrl = useMemo(() => {
    if (!displayPath) return "";
    const resolved = resolveMediaUrl(displayPath);
    if (!resolved) return "";
    // Append cache-busting param on refresh (for file/URL mode re-fetch)
    if (refreshCount > 0) {
      const separator = resolved.includes("?") ? "&" : "?";
      return `${resolved}${separator}_t=${refreshCount}`;
    }
    return resolved;
  }, [displayPath, refreshCount]);

  const isVideo = useMemo(() => {
    if (!displayPath) return false;
    if (displayPath.startsWith("http")) {
      try {
        const url = new URL(displayPath);
        return isVideoFile(url.pathname);
      } catch {
        return false;
      }
    }
    return isVideoFile(displayPath);
  }, [displayPath]);

  if (!backgroundImageEnabled || !mediaUrl) {
    return null;
  }

  const blur = Number.isFinite(backgroundBlur) ? backgroundBlur : 0;
  const brightness = Number.isFinite(backgroundBrightness)
    ? backgroundBrightness
    : 1;
  const saturation = Number.isFinite(backgroundSaturation)
    ? backgroundSaturation
    : 1;
  const sizeMode = backgroundSizeMode || "cover";

  const filters: string[] = [];
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (brightness !== 1) filters.push(`brightness(${brightness})`);
  if (saturation !== 1) filters.push(`saturate(${saturation})`);
  const filterStr = filters.length > 0 ? filters.join(" ") : "none";

  // Use refreshCount in key to force DOM rebuild on manual refresh (busts browser cache)
  const refreshKey = `bg-${refreshCount}`;

  if (isVideo) {
    return (
      <div
        key={refreshKey}
        className="absolute inset-0 overflow-hidden"
        style={{
          zIndex: -1,
          pointerEvents: "none",
          filter: filterStr,
          transition: "filter 0.3s ease",
        }}
        aria-hidden="true"
      >
        <video
          src={mediaUrl}
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit:
              sizeMode === "repeat"
                ? "none"
                : sizeMode === "center"
                  ? "none"
                  : sizeMode,
            objectPosition: "center",
          }}
        />
      </div>
    );
  }

  // Remote URLs: use <img> element for reliable redirect handling and load/error feedback
  if (isRemoteUrl) {
    return (
      <div
        key={refreshKey}
        className="absolute inset-0 overflow-hidden"
        style={{
          zIndex: -1,
          pointerEvents: "none",
          filter: filterStr,
          transition: "filter 0.3s ease",
        }}
        aria-hidden="true"
      >
        <img
          src={mediaUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() =>
            console.warn(
              "[BackgroundLayer] Remote image failed to load:",
              mediaUrl,
            )
          }
          style={{
            width: "100%",
            height: "100%",
            objectFit:
              sizeMode === "repeat" || sizeMode === "center"
                ? "none"
                : (sizeMode as React.CSSProperties["objectFit"]),
            objectPosition: "center",
          }}
        />
      </div>
    );
  }

  // Local files: use CSS background-image
  return (
    <div
      key={refreshKey}
      className="absolute inset-0"
      style={{
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: `url("${mediaUrl}")`,
        backgroundSize: sizeMode,
        backgroundPosition: "center",
        backgroundRepeat: sizeMode === "repeat" ? "repeat" : "no-repeat",
        filter: filterStr,
        transition: "opacity 0.3s ease, filter 0.3s ease",
      }}
      aria-hidden="true"
    />
  );
}

/** Dispatch refresh event to force BackgroundLayer to reload */
export function dispatchBackgroundRefresh(): void {
  window.dispatchEvent(new Event(BACKGROUND_REFRESH_EVENT));
}
