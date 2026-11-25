import type { MeetingAnalysis } from "../types/meeting";
import {
  UPLOAD_CHUNK_SIZE,
  computeChunkRanges,
  normalizeAudioMimeType,
} from "./mime";

export type AnalyzeStage =
  | "preparing"
  | "uploading"
  | "processing_file"
  | "analyzing"
  | "done";

export interface AnalyzeProgress {
  stage: AnalyzeStage;
  percent: number;
  message: string;
}

export interface UploadAnalyzeOptions {
  file: Blob;
  fileName: string;
  meetingContext?: string;
  apiKey?: string;
  passcode?: string;
  signal?: AbortSignal;
  onProgress?: (progress: AnalyzeProgress) => void;
}

function buildAuthHeaders(apiKey?: string, passcode?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiKey?.trim()) {
    headers["x-gemini-api-key"] = apiKey.trim();
  }
  if (passcode?.trim()) {
    headers["x-access-passcode"] = passcode.trim();
  }
  return headers;
}

export async function uploadAndAnalyzeAudio(
  options: UploadAnalyzeOptions
): Promise<MeetingAnalysis> {
  const { file, fileName, meetingContext, apiKey, passcode, signal, onProgress } =
    options;

  const mimeType = normalizeAudioMimeType(fileName, file.type);
  const authHeaders = buildAuthHeaders(apiKey, passcode);

  onProgress?.({
    stage: "preparing",
    percent: 4,
    message: "กำลังเตรียมส่งไฟล์เสียง...",
  });

  const initRes = await fetch("/api/upload/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      fileName,
      mimeType,
      totalBytes: file.size,
    }),
    signal,
  });

  if (!initRes.ok) {
    const errJson = (await initRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      errJson.error || `ไม่สามารถเริ่มอัปโหลดไฟล์ได้ (HTTP ${initRes.status})`
    );
  }

  const { uploadUrl, chunkGranularity } = (await initRes.json()) as {
    uploadUrl: string;
    chunkGranularity?: number;
  };
  const effectiveChunkSize =
    chunkGranularity && chunkGranularity > 0
      ? chunkGranularity
      : UPLOAD_CHUNK_SIZE;
  const chunks = computeChunkRanges(file.size, effectiveChunkSize);

  let uploadedFileMeta: {
    name?: string;
    uri?: string;
    mimeType?: string;
  } | null = null;

  for (const chunk of chunks) {
    const slice = file.slice(chunk.start, chunk.end);
    const command = chunk.isFinal ? "upload, finalize" : "upload";
    const pct = 8 + Math.round(((chunk.index + 1) / chunks.length) * 32);

    onProgress?.({
      stage: "uploading",
      percent: pct,
      message: `กำลังส่งไฟล์เสียง (${chunk.index + 1}/${chunks.length})...`,
    });

    const chunkRes = await fetch("/api/upload/chunk", {
      method: "POST",
      headers: {
        ...authHeaders,
        "x-upload-url": uploadUrl,
        "x-upload-offset": String(chunk.start),
        "x-upload-command": command,
        "Content-Type": "application/octet-stream",
      },
      body: slice,
      signal,
    });

    if (chunkRes.status === 413) {
      // Fallback for serverless gateways (e.g. Vercel Hobby 4.5 MB cap)
      const directRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "X-Goog-Upload-Offset": String(chunk.start),
          "X-Goog-Upload-Command": command,
        },
        body: slice,
        signal,
      });

      if (!directRes.ok) {
        throw new Error(
          `อัปโหลดไฟล์ขนาดใหญ่ตรงไปยัง AI ล้มเหลว (HTTP ${directRes.status})`
        );
      }

      const directText = await directRes.text().catch(() => "");
      if (directText.trim()) {
        try {
          const parsedDirect = JSON.parse(directText) as {
            file?: { name?: string; uri?: string; mimeType?: string };
          };
          if (parsedDirect.file) {
            uploadedFileMeta = parsedDirect.file;
          }
        } catch {
          // Intermediate chunk
        }
      }
      continue;
    }

    if (!chunkRes.ok) {
      const errJson = (await chunkRes.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        errJson.error || `อัปโหลดไฟล์ล้มเหลว (HTTP ${chunkRes.status})`
      );
    }

    const chunkData = (await chunkRes.json()) as {
      file?: { name?: string; uri?: string; mimeType?: string } | null;
    };
    if (chunkData.file) {
      uploadedFileMeta = chunkData.file;
    }
  }

  if (!uploadedFileMeta?.uri || !uploadedFileMeta?.name) {
    throw new Error("ไม่ได้รับข้อมูลอ้างอิงไฟล์เสียงหลังอัปโหลดเสร็จ");
  }

  onProgress?.({
    stage: "processing_file",
    percent: 45,
    message: "AI กำลังรับไฟล์เสียงเข้าคิวประมวลผล...",
  });

  const analyzeRes = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      fileUri: uploadedFileMeta.uri,
      fileName: uploadedFileMeta.name,
      mimeType: uploadedFileMeta.mimeType || mimeType,
      meetingContext: meetingContext || "",
    }),
    signal,
  });

  if (!analyzeRes.ok || !analyzeRes.body) {
    const errJson = (await analyzeRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      errJson.error || `ไม่สามารถเริ่มวิเคราะห์เสียงได้ (HTTP ${analyzeRes.status})`
    );
  }

  const reader = analyzeRes.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let finalAnalysis: MeetingAnalysis | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const events = sseBuffer.split("\n\n");
    sseBuffer = events.pop() ?? "";

    for (const evt of events) {
      const dataLine = evt
        .split(/\r?\n/)
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine.slice(5).trim()) as {
        type: string;
        stage?: AnalyzeStage;
        message?: string;
        chars?: number;
        analysis?: MeetingAnalysis;
        error?: string;
      };

      if (payload.type === "error") {
        throw new Error(payload.error || "การวิเคราะห์เสียงล้มเหลว");
      }

      if (payload.type === "status") {
        onProgress?.({
          stage: payload.stage || "analyzing",
          percent: payload.stage === "processing_file" ? 55 : 65,
          message: payload.message || "กำลังประมวลผล...",
        });
      }

      if (payload.type === "progress") {
        const dynamicPct = Math.min(
          94,
          68 + Math.floor((payload.chars || 0) / 450)
        );
        onProgress?.({
          stage: "analyzing",
          percent: dynamicPct,
          message: payload.message || "กำลังถอดเสียงและแยกหัวข้อประชุม...",
        });
      }

      if (payload.type === "result" && payload.analysis) {
        finalAnalysis = payload.analysis;
      }
    }
  }

  if (!finalAnalysis) {
    throw new Error("ไม่ได้รับผลสรุปจาก AI กรุณาลองใหม่อีกครั้ง");
  }

  onProgress?.({
    stage: "done",
    percent: 100,
    message: "ถอดเสียงและสรุปงานเรียบร้อยแล้ว!",
  });

  return finalAnalysis;
}
