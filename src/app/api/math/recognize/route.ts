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
        "Clean ASCII math expression or equation evaluable by standard calculator parser using +, -, *, /, ^, !, %, (, ), sqrt(), cbrt(), sin(), cos(), tan(), asin(), acos(), atan(), log(), ln(), abs(), pi, e, and optional = equation (supports 1 or 2 variables such as 5x+3=y or 2 equations separated by ;).",
    },
    displayText: {
      type: "STRING",
      description: "Clean human-readable equation matching the image or handwriting.",
    },
    solution: {
      type: "STRING",
      description:
        "Concise final answer or symbolic rearrangement (in Thai/math notation), especially helpful when solving equations, systems, derivatives, or integrals.",
    },
    steps: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Short Thai step-by-step explanation of how to solve the equation.",
    },
  },
  required: ["expression", "displayText"],
};

const MATH_RECOGNITION_PROMPT = `Transcribe AND solve the mathematical or scientific equation shown in this image (either handwritten or a photo/screenshot of a math problem).
Rules:
1. Extract the exact ASCII expression into "expression" (convert fractions a/b -> (a)/(b), roots -> sqrt(...), exponents -> ^(...), ×/· -> *, ÷ -> /; separate multiple simultaneous equations with ";").
2. Keep variables like x, y cleanly (e.g., "5x + 3 = y", "x^2 - 5x + 6 = 0", "5x + 3 = y; x + y = 15").
3. Put the exact readable equation into "displayText".
4. Put the computed answer/solution (and symbolic form if multi-variable) in "solution", and concise Thai step-by-step lines in "steps".`;

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
      solution?: string;
      steps?: string[];
    };

    return NextResponse.json({
      expression: (parsed.expression || "").trim(),
      displayText: (parsed.displayText || parsed.expression || "").trim(),
      solution: (parsed.solution || "").trim(),
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
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
