import type { LinkProvider } from "../types/notebook";

function parseYouTubeStartParam(raw: string | null): number {
  if (!raw) return 0;
  const clean = raw.trim().toLowerCase();
  if (/^\d+$/.test(clean)) {
    return Math.max(0, Number(clean));
  }
  const match = clean.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!match) return 0;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  return h * 3600 + m * 60 + s;
}

export function parseYouTubeUrl(
  rawUrl: string
): { videoId: string; startSeconds: number } | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`
    );
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  let videoId = "";

  if (host === "youtu.be") {
    videoId = url.pathname.replace(/^\/+/, "").split("/")[0] || "";
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") || "";
    } else if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.slice("/shorts/".length).split("/")[0] || "";
    } else if (url.pathname.startsWith("/embed/")) {
      videoId = url.pathname.slice("/embed/".length).split("/")[0] || "";
    } else if (url.pathname.startsWith("/live/")) {
      videoId = url.pathname.slice("/live/".length).split("/")[0] || "";
    }
  } else {
    return null;
  }

  if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
    return null;
  }

  const startSeconds = parseYouTubeStartParam(
    url.searchParams.get("t") || url.searchParams.get("start")
  );
  return { videoId, startSeconds };
}

export function detectLinkProvider(rawUrl: string): LinkProvider {
  const lower = rawUrl.trim().toLowerCase();
  if (!lower) return "web";
  if (lower.includes("drive.google.com") || lower.includes("docs.google.com")) {
    return "gdrive";
  }
  if (
    lower.includes("onedrive.live.com") ||
    lower.includes("1drv.ms") ||
    lower.includes("sharepoint.com")
  ) {
    return "onedrive";
  }
  if (lower.includes("dropbox.com")) {
    return "dropbox";
  }
  if (lower.split("?")[0].endsWith(".pdf")) {
    return "pdf";
  }
  return "web";
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
