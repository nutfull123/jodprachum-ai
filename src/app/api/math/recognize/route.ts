import { NextResponse } from "next/server";
import {
  DEFAULT_MODEL_CANDIDATES,
  GEMINI_API_BASE,
  type ListedGeminiModel,
  resolveAuth,
  selectBestFallbackModels,
  translateGeminiHttpError,
} from "../../../../lib/gemini-server";

export const dynamic = "force-dynamic";

const MATH_RECOGNITION_SCHEMA = {
  type: "OBJECT",
  properties: {
    expression: {
      type: "STRING",
      description:
        "Clean ASCII math expression evaluable by standard calculator parser using +, -, *, /, ^, !, %, (, ), sqrt(), cbrt(), sin(), cos(), tan(), asin(), acos(), atan(), log(), ln(), abs(), pi, e, and optional single variable = equation.",
    },
    displayText: {
      type: "STRING",
      description: "Clean human-readable equation matching the handwriting.",
    },
  },
  required: ["expression", "displayText"],
};

const MATH_RECOGNITION_PROMPT = `Transcribe the handwritten mathematical or scientific equation in this image ONLY.
Rules:
1. Do NOT calculate or guess the answer unless the user literally wrote "= <number>" in the image.
2. Convert fractions like a over b into (a)/(b), square roots into sqrt(...), exponents into ^(...), multiplication signs x or · into *, division ÷ into /.
3. Use lowercase function names: sin(), cos(), tan(), asin(), acos(), atan(), log(), ln(), sqrt(), abs(), pi, e.
4. Keep Thai/English prose out of "expression". If unclear, output your best exact mathematical transcription.`;

async function callGeminiVision(
  model: string,
  apiKey: string,
  imageBase64: string,
  mimeType: string
) {
  return fetch(
    `${GEMINI_API_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: MATH_RECOGNITION_PROMPT },
              {
                inlineData: {
                  mimeType: mimeType || "image/png",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: MATH_RECOGNITION_SCHEMA,
        },
      }),
    }
  );
}

export async function POST(req: Request) {
  const auth = resolveAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as {
      imageBase64?: string;
      mimeType?: string;
    };
    const rawB64 = (body.imageBase64 || "").replace(/^data:[^;]+;base64,/, "").trim();
    if (!rawB64) {
      return NextResponse.json(
        { error: "ไม่พบภาพลายมือสมการ" },
        { status: 400 }
      );
    }

    const mimeType = body.mimeType || "image/png";
    const tried = new Set<string>();
    let response: Response | null = null;
    let lastErrBody = "";

    const attempt = async (model: string): Promise<boolean> => {
      tried.add(model);
      const res = await callGeminiVision(model, auth.apiKey, rawB64, mimeType);
      if (res.ok) {
        response = res;
        return true;
      }
      lastErrBody = await res.text().catch(() => "");
      if (res.status === 404 || res.status === 400) {
        return false;
      }
      response = new Response(lastErrBody, { status: res.status });
      return true;
    };

    for (const candidate of DEFAULT_MODEL_CANDIDATES) {
      const done = await attempt(candidate);
      if (done) break;
    }

    if (!response) {
      const listRes = await fetch(
        `${GEMINI_API_BASE}/v1beta/models?key=${encodeURIComponent(auth.apiKey)}`
      );
      if (listRes.ok) {
        const listJson = (await listRes.json()) as {
          models?: ListedGeminiModel[];
        };
        const fallbacks = selectBestFallbackModels(
          listJson.models || [],
          tried
        );
        for (const fb of fallbacks.slice(0, 3)) {
          const done = await attempt(fb);
          if (done) break;
        }
      }
    }

    if (!response) {
      return NextResponse.json(
        { error: translateGeminiHttpError(404, lastErrBody) },
        { status: 404 }
      );
    }

    const finalRes: Response = response;
    if (!finalRes.ok) {
      const errText = lastErrBody || (await finalRes.text().catch(() => ""));
      return NextResponse.json(
        { error: translateGeminiHttpError(finalRes.status, errText) },
        { status: finalRes.status }
      );
    }

    const json = (await finalRes.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string; thought?: boolean }>;
        };
      }>;
    };

    const parts = json.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p) => !p.thought && typeof p.text === "string")?.text || "";
    const parsed = JSON.parse(textPart) as {
      expression?: string;
      displayText?: string;
    };

    return NextResponse.json({
      expression: (parsed.expression || "").trim(),
      displayText: (parsed.displayText || parsed.expression || "").trim(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "ไม่สามารถตรวจจับลายมือสมการได้",
      },
      { status: 500 }
    );
  }
}
