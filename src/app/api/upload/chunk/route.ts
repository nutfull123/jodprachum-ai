import { NextResponse } from "next/server";
import {
  isSafeGoogleUrl,
  resolveAuth,
  translateGeminiHttpError,
} from "@/lib/gemini-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = resolveAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const uploadUrl = req.headers.get("x-upload-url")?.trim() || "";
  const offset = req.headers.get("x-upload-offset")?.trim() || "0";
  const command = req.headers.get("x-upload-command")?.trim() || "upload";

  if (!isSafeGoogleUrl(uploadUrl)) {
    return NextResponse.json(
      { error: "URL อัปโหลดไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  if (command !== "upload" && command !== "upload, finalize") {
    return NextResponse.json(
      { error: "คำสั่งอัปโหลดไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const buffer = await req.arrayBuffer();
    const upstream = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(buffer.byteLength),
        "X-Goog-Upload-Offset": offset,
        "X-Goog-Upload-Command": command,
      },
      body: buffer,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: translateGeminiHttpError(upstream.status, errText) },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 }
      );
    }

    const rawText = await upstream.text();
    let fileInfo: {
      name?: string;
      uri?: string;
      mimeType?: string;
      state?: string;
    } | null = null;

    if (rawText.trim()) {
      try {
        const parsed = JSON.parse(rawText) as {
          file?: { name?: string; uri?: string; mimeType?: string; state?: string };
        };
        fileInfo = parsed.file || null;
      } catch {
        // Intermediate chunks often return empty body
      }
    }

    return NextResponse.json({
      ok: true,
      uploadStatus: upstream.headers.get("x-goog-upload-status") || "",
      file: fileInfo,
    });
  } catch (error) {
    console.error("upload/chunk error:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดระหว่างส่งชิ้นส่วนไฟล์ไปยัง Gemini API" },
      { status: 502 }
    );
  }
}
