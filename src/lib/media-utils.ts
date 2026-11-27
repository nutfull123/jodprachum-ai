import type { InkStroke } from "../types/notebook";

export interface CompressedImageResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  savedPercent: number;
  mimeType: string;
}

function blobFromCanvas(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(reader.error || new Error("อ่านข้อมูลรูปไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

export async function compressImageToDataUrl(
  file: File,
  maxDim: number = 2048,
  quality: number = 0.88
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        const naturalW = img.naturalWidth || 800;
        const naturalH = img.naturalHeight || 600;
        let w = naturalW;
        let h = naturalH;
        const needsResize = w > maxDim || h > maxDim;
        if (needsResize) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("ไม่สามารถประมวลผลรูปภาพได้"));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);

        // Try crisp WebP first (visually lossless at ~0.88), fallback to JPEG/PNG
        let outBlob = await blobFromCanvas(canvas, "image/webp", quality);
        if (!outBlob || outBlob.type !== "image/webp") {
          const fallbackType =
            file.type === "image/png" ? "image/png" : "image/jpeg";
          outBlob = await blobFromCanvas(
            canvas,
            fallbackType,
            fallbackType === "image/png" ? undefined : quality
          );
        }

        // If original wasn't resized and is already smaller (e.g. optimized PNG/WebP), keep original bytes cleanly
        if (!needsResize && outBlob && outBlob.size >= file.size) {
          const origUrl = await blobToDataUrl(file);
          URL.revokeObjectURL(objectUrl);
          resolve({
            dataUrl: origUrl,
            blob: file,
            width: naturalW,
            height: naturalH,
            originalBytes: file.size,
            compressedBytes: file.size,
            savedPercent: 0,
            mimeType: file.type || "image/png",
          });
          return;
        }

        const finalBlob = outBlob || file;
        const dataUrl = await blobToDataUrl(finalBlob);
        URL.revokeObjectURL(objectUrl);

        const savedPercent =
          file.size > 0
            ? Math.max(
                0,
                Math.round(((file.size - finalBlob.size) / file.size) * 100)
              )
            : 0;

        resolve({
          dataUrl,
          blob: finalBlob,
          width: w,
          height: h,
          originalBytes: file.size,
          compressedBytes: finalBlob.size,
          savedPercent,
          mimeType: finalBlob.type || file.type || "image/webp",
        });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพนี้ได้"));
    };
    img.src = objectUrl;
  });
}

const LOSSLESS_TEXT_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".txt",
  ".md",
  ".svg",
  ".xml",
  ".tsv",
  ".bib",
]);

export async function compressFileLosslessIfBeneficial(file: File): Promise<{
  blob: Blob;
  fileName: string;
  mimeType: string;
  originalBytes: number;
  finalBytes: number;
  compressed: boolean;
}> {
  const lower = file.name.toLowerCase();
  const dotIdx = lower.lastIndexOf(".");
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : "";

  // Compress images via high-res visually-lossless WebP before storing/uploading
  if (
    file.type.startsWith("image/") &&
    !file.type.includes("svg") &&
    typeof document !== "undefined"
  ) {
    try {
      const imgRes = await compressImageToDataUrl(file, 2048, 0.88);
      if (imgRes.compressedBytes < file.size) {
        const baseName =
          dotIdx >= 0 ? file.name.slice(0, dotIdx) : file.name;
        return {
          blob: imgRes.blob,
          fileName:
            imgRes.mimeType === "image/webp" ? `${baseName}.webp` : file.name,
          mimeType: imgRes.mimeType,
          originalBytes: file.size,
          finalBytes: imgRes.compressedBytes,
          compressed: true,
        };
      }
    } catch {
      // Fallback to original file if image decode fails
    }
  }

  // Gzip-compress uncompressed text/data research files losslessly when supported & smaller
  if (
    LOSSLESS_TEXT_EXTENSIONS.has(ext) &&
    file.size >= 4096 &&
    typeof CompressionStream !== "undefined"
  ) {
    try {
      const gzStream = file
        .stream()
        .pipeThrough(new CompressionStream("gzip"));
      const gzBlob = await new Response(gzStream, {
        headers: { "Content-Type": "application/gzip" },
      }).blob();
      if (gzBlob.size > 0 && gzBlob.size < file.size * 0.9) {
        return {
          blob: gzBlob,
          fileName: `${file.name}.gz`,
          mimeType: "application/gzip",
          originalBytes: file.size,
          finalBytes: gzBlob.size,
          compressed: true,
        };
      }
    } catch {
      // Fallback cleanly to uncompressed original
    }
  }

  return {
    blob: file,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    originalBytes: file.size,
    finalBytes: file.size,
    compressed: false,
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

export function hitTestStroke(
  stroke: InkStroke,
  x: number,
  y: number,
  radius: number = 14
): boolean {
  if (stroke.deleted || stroke.points.length === 0) return false;
  const effectiveRadius = Math.max(radius, stroke.size * 0.75);

  if (stroke.points.length === 1) {
    const [px, py] = stroke.points[0];
    return Math.hypot(x - px, y - py) <= effectiveRadius;
  }

  for (let i = 1; i < stroke.points.length; i += 1) {
    const [ax, ay] = stroke.points[i - 1];
    const [bx, by] = stroke.points[i];
    if (pointToSegmentDist(x, y, ax, ay, bx, by) <= effectiveRadius) {
      return true;
    }
  }
  return false;
}
