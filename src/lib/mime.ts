// Exact multiple of 8 MiB (8,388,608 bytes) required by Google Gemini File API
// resumable upload (x-goog-upload-chunk-granularity: 8388608).
export const GOOGLE_UPLOAD_GRANULARITY = 8 * 1024 * 1024; // 8,388,608 bytes
export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

export interface UploadChunkRange {
  index: number;
  start: number;
  end: number;
  size: number;
  isFinal: boolean;
}

const EXT_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  wave: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  "3gp": "audio/3gpp",
};

const MIME_ALIAS: Record<string, string> = {
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp4a-latm": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-pn-wav": "audio/wav",
  "audio/x-aac": "audio/aac",
  "audio/x-flac": "audio/flac",
  "audio/vorbis": "audio/ogg",
  "video/webm": "audio/webm",
};

export function normalizeAudioMimeType(fileName: string, rawMimeType?: string): string {
  const cleaned = (rawMimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (cleaned && MIME_ALIAS[cleaned]) {
    return MIME_ALIAS[cleaned];
  }

  const ext = fileName.split(".").pop()?.trim().toLowerCase() || "";
  if (ext && EXT_TO_MIME[ext]) {
    if (!cleaned || cleaned === "application/octet-stream" || cleaned === "audio/x-m4a") {
      return EXT_TO_MIME[ext];
    }
    if (ext === "m4a" && cleaned === "audio/mp4") {
      return "audio/mp4";
    }
  }

  if (cleaned && (cleaned.startsWith("audio/") || cleaned.startsWith("video/"))) {
    return cleaned;
  }

  if (ext && EXT_TO_MIME[ext]) {
    return EXT_TO_MIME[ext];
  }

  return "audio/mpeg";
}

export function computeChunkRanges(
  totalBytes: number,
  chunkSize: number = UPLOAD_CHUNK_SIZE
): UploadChunkRange[] {
  if (totalBytes <= 0 || chunkSize <= 0) {
    return [];
  }
  const ranges: UploadChunkRange[] = [];
  let offset = 0;
  let index = 0;
  while (offset < totalBytes) {
    const end = Math.min(offset + chunkSize, totalBytes);
    ranges.push({
      index,
      start: offset,
      end,
      size: end - offset,
      isFinal: end >= totalBytes,
    });
    offset = end;
    index += 1;
  }
  return ranges;
}

export function parseTimestampToSeconds(ts?: string): number {
  if (!ts) return 0;
  const cleaned = ts.trim().replace(/^\[|\]$/g, "");
  const parts = cleaned.split(":").map((part) => Number(part));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return 0;
  }
  if (parts.length === 2) {
    return Math.floor(parts[0] * 60 + parts[1]);
  }
  if (parts.length === 3) {
    return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return 0;
}

export function formatSeconds(totalSec: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}
