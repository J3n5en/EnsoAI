import { useMemo } from "react";
import { useSettingsStore } from "@/stores/settings";

function normalizeForUrlPath(path: string): string {
  // Replace backslashes with forward slashes
  let normalized = path.replace(/\\/g, "/");

  // If it looks like a Windows drive path (e.g. C:/...), ensure it starts with /
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `/${normalized}`;
  }

  // If it doesn't start with / and doesn't look like a protocol, add /
  if (!normalized.startsWith("/") && !normalized.includes("://")) {
    return `/${normalized}`;
  }

  return normalized;
}

function buildLocalImageUrl(rawPath: string): string {
  try {
    // encodeURI handles spaces and non-ASCII chars
    const pathPart = normalizeForUrlPath(rawPath);
    return `local-image://${encodeURI(pathPart)}`;
  } catch {
    return "";
  }
}

function resolveBackgroundImageUrl(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return trimmed;
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

  return buildLocalImageUrl(trimmed);
}

export function BackgroundLayer() {
  const {
    backgroundImageEnabled,
    backgroundImagePath,
    backgroundOpacity,
    backgroundBlur,
    backgroundSizeMode,
  } = useSettingsStore();

  const imageUrl = useMemo(() => {
    if (!backgroundImagePath) return "";
    return resolveBackgroundImageUrl(backgroundImagePath);
  }, [backgroundImagePath]);

  if (!backgroundImageEnabled || !imageUrl) {
    return null;
  }

  const opacity = Number.isFinite(backgroundOpacity) ? backgroundOpacity : 1;
  const blur = Number.isFinite(backgroundBlur) ? backgroundBlur : 0;
  const sizeMode = backgroundSizeMode || "cover";

  return (
    <div
      className="absolute inset-0"
      style={{
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: sizeMode,
        backgroundPosition: "center",
        backgroundRepeat: sizeMode === "repeat" ? "repeat" : "no-repeat",
        opacity,
        filter: `blur(${blur}px)`,
        transition: "opacity 0.3s ease, filter 0.3s ease",
      }}
      aria-hidden="true"
    />
  );
}
