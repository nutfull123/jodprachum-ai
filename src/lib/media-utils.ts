import type { InkStroke } from "../types/notebook";

export async function compressImageToDataUrl(
  file: File,
  maxDim: number = 1280,
  quality: number = 0.82
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || 800;
        let h = img.naturalHeight || 600;
        if (w > maxDim || h > maxDim) {
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
          reject(new Error("ไม่สามารถย่อขนาดรูปภาพได้"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const outType =
          file.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl =
          outType === "image/png"
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(objectUrl);
        resolve({ dataUrl, width: w, height: h });
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
