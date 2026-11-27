import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isCloudFilesConfigured } from "../../../../lib/cloud-store";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 4.4 * 1024 * 1024; // Safe under Vercel 4.5 MB serverless body limit

export async function POST(req: Request) {
  if (!isCloudFilesConfigured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "ไม่พบไฟล์ที่อัปโหลด" },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          configured: true,
          error:
            "ไฟล์มีขนาดใหญ่เกิน 4.4 MB สำหรับอัปโหลดตรงผ่านเซิร์ฟเวอร์ แนะนำวางเป็นลิงก์ Google Drive / OneDrive แทนครับ",
        },
        { status: 413 }
      );
    }

    const safeName = file.name.replace(/[^\w.\-\u0E00-\u0E7F ]+/g, "_");
    const blob = await put(`shootnote/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || "application/octet-stream",
    });

    return NextResponse.json({
      configured: true,
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        error:
          err instanceof Error ? err.message : "อัปโหลดไฟล์ขึ้นคลาวด์ไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
