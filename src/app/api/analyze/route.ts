import {
  GEMINI_API_BASE,
  GEMINI_RESPONSE_SCHEMA,
  buildAnalysisPrompt,
  isSafeGoogleUrl,
  normalizeGeminiAnalysis,
  resolveAuth,
  translateGeminiHttpError,
} from "@/lib/gemini-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

export async function POST(req: Request) {
  const auth = resolveAuth(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: {
    fileUri?: string;
    fileName?: string;
    mimeType?: string;
    meetingContext?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "ข้อมูลคำขอวิเคราะห์ไม่ถูกต้อง" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fileUri = (body.fileUri || "").trim();
  const fileName = (body.fileName || "").trim();
  const mimeType = (body.mimeType || "audio/mpeg").trim();
  const meetingContext = (body.meetingContext || "").trim();

  if (!isSafeGoogleUrl(fileUri) || !fileName.startsWith("files/")) {
    return new Response(
      JSON.stringify({ error: "ข้อมูลไฟล์ที่อัปโหลดไม่ถูกต้อง" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          // Stream closed by client
        }
      };

      try {
        // 1. Wait until Google File API marks audio file ACTIVE
        send({
          type: "status",
          stage: "processing_file",
          message: "กำลังเตรียมไฟล์เสียงบนเซิร์ฟเวอร์ AI...",
        });

        for (let attempt = 0; attempt < 90; attempt += 1) {
          if (req.signal.aborted) return;

          const metaRes = await fetch(
            `${GEMINI_API_BASE}/v1beta/${fileName}?key=${encodeURIComponent(auth.apiKey)}`,
            { signal: req.signal }
          );

          if (metaRes.ok) {
            const meta = (await metaRes.json()) as {
              state?: string;
              error?: { message?: string };
            };
            if (meta.state === "ACTIVE") {
              break;
            }
            if (meta.state === "FAILED") {
              throw new Error(
                meta.error?.message ||
                  "Google Gemini ไม่สามารถประมวลผลไฟล์เสียงนี้ได้"
              );
            }
          }

          if (attempt > 0 && attempt % 3 === 0) {
            send({
              type: "status",
              stage: "processing_file",
              message: "กำลังถอดรหัสไฟล์เสียง...",
            });
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // 2. Stream analysis from Gemini
        send({
          type: "status",
          stage: "analyzing",
          message: "AI กำลังฟัง ถอดเสียง และแยกหัวข้อประชุม...",
        });

        const baseContents = [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  mimeType,
                  fileUri,
                },
              },
              {
                text: buildAnalysisPrompt(meetingContext),
              },
            ],
          },
        ];

        const requestPayload = {
          contents: baseContents,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        };

        let upstream: Response | null = null;
        let lastErrStatus = 500;
        let lastErrBody = "";

        for (const model of MODEL_CANDIDATES) {
          let res = await fetch(
            `${GEMINI_API_BASE}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(auth.apiKey)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestPayload),
              signal: req.signal,
            }
          );

          if (!res.ok) {
            lastErrStatus = res.status;
            lastErrBody = await res.text().catch(() => "");

            // Retry once without responseSchema if upstream rejects schema syntax with HTTP 400
            if (
              res.status === 400 &&
              (lastErrBody.includes("response_schema") ||
                lastErrBody.includes("responseSchema"))
            ) {
              res = await fetch(
                `${GEMINI_API_BASE}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(auth.apiKey)}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: baseContents,
                    generationConfig: {
                      temperature: 0.2,
                      responseMimeType: "application/json",
                    },
                  }),
                  signal: req.signal,
                }
              );

              if (!res.ok) {
                lastErrStatus = res.status;
                lastErrBody = await res.text().catch(() => "");
              }
            }
          }

          if (res.ok && res.body) {
            upstream = res;
            break;
          }

          // Fallback to next model only if model not found or temporarily unavailable
          if (lastErrStatus !== 404 && lastErrStatus !== 503) {
            break;
          }
        }

        if (!upstream || !upstream.body) {
          throw new Error(translateGeminiHttpError(lastErrStatus, lastErrBody));
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let fullJsonText = "";
        let lastProgressEmit = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          const lines = sseBuffer.split(/\r?\n/);
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              const chunkObj = JSON.parse(jsonStr) as {
                candidates?: Array<{
                  content?: {
                    parts?: Array<{ text?: string; thought?: boolean }>;
                  };
                }>;
              };
              const parts = chunkObj.candidates?.[0]?.content?.parts || [];
              for (const part of parts) {
                if (part.thought) continue;
                if (part.text) {
                  fullJsonText += part.text;
                }
              }
            } catch {
              // Ignore partial SSE chunk
            }
          }

          const now = Date.now();
          if (now - lastProgressEmit > 700) {
            lastProgressEmit = now;
            send({
              type: "progress",
              chars: fullJsonText.length,
              message: "กำลังถอดเสียงและเรียบเรียงงาน/หัวข้อ...",
            });
          }
        }

        const cleanedText = stripJsonFence(fullJsonText);
        if (!cleanedText) {
          throw new Error(
            "AI ไม่ได้ส่งผลลัพธ์กลับมา (ไฟล์เสียงอาจเงียบหรือสั้นเกินไป)"
          );
        }

        let parsedRaw: unknown;
        try {
          parsedRaw = JSON.parse(cleanedText);
        } catch {
          throw new Error(
            "ไม่สามารถอ่านโครงสร้าง JSON ที่ AI ตอบกลับมาได้ กรุณาลองใหม่อีกครั้ง"
          );
        }

        const analysis = normalizeGeminiAnalysis(parsedRaw);
        send({ type: "result", analysis });
      } catch (error) {
        if (!req.signal.aborted) {
          const message =
            error instanceof Error
              ? error.message
              : "เกิดข้อผิดพลาดระหว่างวิเคราะห์เสียง";
          send({ type: "error", error: message });
        }
      } finally {
        // Best-effort cleanup of uploaded file from Google File API
        fetch(
          `${GEMINI_API_BASE}/v1beta/${fileName}?key=${encodeURIComponent(auth.apiKey)}`,
          { method: "DELETE" }
        ).catch(() => undefined);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
