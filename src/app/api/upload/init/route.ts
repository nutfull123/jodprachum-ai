import { NextResponse } from "next/server";
import {
  GEMINI_API_BASE,
  isSafeGoogleUrl,
  resolveAuth,
  translateGeminiHttpError,
} from "@/lib/gemini-server";
import { UPLOAD_CHUNK_SIZE } from "@/lib/mime";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = resolveAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { fileName?: string; mimeType?: string; totalBytes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "ข้อมูลคำขออัปโหลดไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const fileName = (body.fileName || "meeting-audio").trim();
  const mimeType = (body.mimeType || "audio/mpeg").trim();
  const totalBytes = Number(body.totalBytes || 0);

  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return NextResponse.json(
      { error: "ไฟล์เสียงมีขนาด 0 ไบต์ ไม่สามารถอัปโหลดได้" },
      { status: 400 }
    );
  }

  try {
    const clientOrigin = req.headers.get("origin")?.trim();
    const upstream = await fetch(
      `${GEMINI_API_BASE}/upload/v1beta/files?key=${encodeURIComponent(auth.apiKey)}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(totalBytes),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
          ...(clientOrigin ? { Origin: clientOrigin } : {}),
        },
        body: JSON.stringify({
          file: { display_name: fileName.slice(0, 100) },
        }),
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: translateGeminiHttpError(upstream.status, errText) },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 }
      );
    }

    const uploadUrl =
      upstream.headers.get("x-goog-upload-url") ||
      upstream.headers.get("location") ||
      "";

    if (!uploadUrl || !isSafeGoogleUrl(uploadUrl)) {
      return NextResponse.json(
        { error: "ไม่ได้รับ URL สำหรับอัปโหลดไฟล์จาก Google Gemini API" },
        { status: 502 }
      );
    }

    const rawGranularity = Number(
      upstream.headers.get("x-goog-upload-chunk-granularity")
    );
    const chunkGranularity =
      Number.isFinite(rawGranularity) && rawGranularity > 0
        ? rawGranularity
        : UPLOAD_CHUNK_SIZE;

    return NextResponse.json({ uploadUrl, chunkGranularity });
  } catch (error) {
    console.error("upload/init error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถเชื่อมต่อ Google Gemini API เพื่อเริ่มอัปโหลดได้" },
      { status: 502 }
    );
  }
}
