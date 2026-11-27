"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Delete,
  Eraser,
  ImagePlus,
  KeyRound,
  PenTool,
  PlusCircle,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { compressImageToDataUrl } from "../../lib/media-utils";
import {
  evaluateScientificMath,
  type AngleMode,
} from "../../lib/math-engine";

interface MathCalculatorPanelProps {
  isOpen: boolean;
  apiKey?: string;
  passcode?: string;
  onOpenApiModal: () => void;
  onInsertResult: (text: string) => void;
  onInsertEquationImage?: (
    dataUrl: string,
    width: number,
    height: number,
    solutionText?: string
  ) => void;
  onClose: () => void;
}

const KEYPAD_BUTTONS: Array<{
  label: string;
  insert: string;
  accent?: boolean;
  varKey?: boolean;
}> = [
  { label: "sin", insert: "sin(" },
  { label: "cos", insert: "cos(" },
  { label: "tan", insert: "tan(" },
  { label: "log", insert: "log(" },
  { label: "ln", insert: "ln(" },
  { label: "√", insert: "sqrt(" },
  { label: "x²", insert: "^2" },
  { label: "xʸ", insert: "^" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "x", insert: "x", varKey: true },
  { label: "y", insert: "y", varKey: true },
  { label: ";", insert: "; ", varKey: true },
  { label: "π", insert: "pi" },
  { label: "e", insert: "e" },
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "÷", insert: "/" },
  { label: "!", insert: "!" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "×", insert: "*" },
  { label: "Ans", insert: "ans" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "−", insert: "-" },
  { label: "=", insert: "=", accent: true },
  { label: "0", insert: "0" },
  { label: ".", insert: "." },
  { label: "+", insert: "+", accent: true },
];

const QUICK_EXAMPLES: Array<{ label: string; expr: string }> = [
  { label: "5x+3=y", expr: "5x+3=y" },
  { label: "x²-5x+6=0", expr: "x^2-5x+6=0" },
  { label: "ระบบ 2 สมการ", expr: "5x+3=y; x+y=15" },
  { label: "sin(30)+√16", expr: "sin(30)+sqrt(16)" },
];

export function MathCalculatorPanel({
  isOpen,
  apiKey,
  passcode,
  onOpenApiModal,
  onInsertResult,
  onInsertEquationImage,
  onClose,
}: MathCalculatorPanelProps) {
  const [tab, setTab] = useState<"draw" | "image" | "keypad">("draw");
  const [angleMode, setAngleMode] = useState<AngleMode>("deg");
  const [expression, setExpression] = useState("");
  const [displayEquation, setDisplayEquation] = useState("");
  const [lastAnswer, setLastAnswer] = useState<number>(0);
  const [autoDetectOnPause, setAutoDetectOnPause] = useState(true);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState("");
  const [hasInk, setHasInk] = useState(false);

  // Interactive substitution for 2-var equations (e.g. substitute x to get y)
  const [subInputs, setSubInputs] = useState<Record<string, string>>({});

  // Attached image state & Vision AI fallback
  const [attachedImage, setAttachedImage] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [aiFallback, setAiFallback] = useState<{
    solution?: string;
    steps?: string[];
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Array<Array<[number, number]>>>([]);
  const activeStrokeRef = useRef<Array<[number, number]>>([]);
  const drawingRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Reset substitutions when expression changes
  useEffect(() => {
    setSubInputs({});
  }, [expression]);

  const evalResult = useMemo(() => {
    if (!expression.trim()) return null;
    return evaluateScientificMath(expression, {
      angleMode,
      lastAnswer,
      decimals: 8,
    });
  }, [expression, angleMode, lastAnswer]);

  const activeSubstitutions = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, raw] of Object.entries(subInputs)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        out[k] = num;
      }
    }
    return out;
  }, [subInputs]);

  const subEvalResult = useMemo(() => {
    if (
      !expression.trim() ||
      Object.keys(activeSubstitutions).length === 0 ||
      !evalResult?.ok ||
      evalResult.kind !== "linear2var"
    ) {
      return null;
    }
    return evaluateScientificMath(expression, {
      angleMode,
      lastAnswer,
      decimals: 8,
      substitutions: activeSubstitutions,
    });
  }, [expression, activeSubstitutions, evalResult, angleMode, lastAnswer]);

  useEffect(() => {
    if (evalResult?.ok && evalResult.kind === "number") {
      setLastAnswer(evalResult.value);
    }
  }, [evalResult]);

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle dot grid
    ctx.fillStyle = "#E2E8F0";
    for (let x = 20; x < canvas.width; x += 24) {
      for (let y = 20; y < canvas.height; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = "#1C1B18";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const allStrokes = [...strokesRef.current, activeStrokeRef.current];
    for (const st of allStrokes) {
      if (st.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(st[0][0], st[0][1]);
      for (let i = 1; i < st.length; i += 1) {
        ctx.lineTo(st[i][0], st[i][1]);
      }
      if (st.length === 1) {
        ctx.lineTo(st[0][0] + 0.5, st[0][1] + 0.5);
      }
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    if (isOpen && tab === "draw") {
      redrawCanvas();
    }
  }, [isOpen, tab, redrawCanvas]);

  const recognizeFromDataUrl = useCallback(
    async (dataUrl: string, mimeType: string) => {
      setIsRecognizing(true);
      setRecognizeError("");
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey?.trim()) headers["x-gemini-api-key"] = apiKey.trim();
        if (passcode?.trim()) headers["x-access-passcode"] = passcode.trim();

        const res = await fetch("/api/math/recognize", {
          method: "POST",
          headers,
          body: JSON.stringify({
            imageBase64: dataUrl,
            mimeType: mimeType || "image/png",
          }),
        });
        const json = (await res.json()) as {
          expression?: string;
          displayText?: string;
          solution?: string;
          steps?: string[];
          error?: string;
        };
        if (!res.ok) {
          setRecognizeError(json.error || "ตรวจจับสมการไม่สำเร็จ");
          return;
        }
        if (json.expression) {
          setExpression(json.expression);
          setDisplayEquation(json.displayText || json.expression);
          setAiFallback({
            solution: json.solution,
            steps: json.steps,
          });
        } else {
          setRecognizeError(
            "ยังอ่านสมการไม่ชัดเจน ลองเขียนตัวใหญ่ขึ้นหรือใช้ภาพที่ชัดขึ้นครับ"
          );
        }
      } catch {
        setRecognizeError("เชื่อมต่อระบบตรวจจับสมการไม่สำเร็จ กรุณาลองใหม่");
      } finally {
        setIsRecognizing(false);
      }
    },
    [apiKey, passcode]
  );

  const handleRecognizeHandwriting = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) {
      setRecognizeError("กรุณาเขียนสมการลงในช่องก่อนครับ");
      return;
    }
    await recognizeFromDataUrl(canvas.toDataURL("image/png"), "image/png");
  }, [recognizeFromDataUrl]);

  const handleAttachImageFile = async (file: File) => {
    setRecognizeError("");
    try {
      const res = await compressImageToDataUrl(file, 1600, 0.9);
      const nextImg = {
        dataUrl: res.dataUrl,
        width: res.width,
        height: res.height,
        mimeType: res.mimeType,
        fileName: file.name,
      };
      setAttachedImage(nextImg);
      setAiFallback(null);
      await recognizeFromDataUrl(res.dataUrl, res.mimeType);
    } catch {
      setRecognizeError("ไม่สามารถอ่านไฟล์รูปสมการนี้ได้");
    }
  };

  if (!isOpen) return null;

  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0] as [number, number];
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    ] as [number, number];
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    drawingRef.current = true;
    activeStrokeRef.current = [toCanvasCoords(e)];
    redrawCanvas();
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    activeStrokeRef.current.push(toCanvasCoords(e));
    redrawCanvas();
  };

  const handleCanvasPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (activeStrokeRef.current.length > 0) {
      strokesRef.current.push(activeStrokeRef.current);
      activeStrokeRef.current = [];
      setHasInk(true);
      redrawCanvas();
      if (autoDetectOnPause) {
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = setTimeout(() => {
          pauseTimerRef.current = null;
          handleRecognizeHandwriting();
        }, 900);
      }
    }
  };

  const handleClearCanvas = () => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    strokesRef.current = [];
    activeStrokeRef.current = [];
    setHasInk(false);
    setRecognizeError("");
    redrawCanvas();
  };

  const handleUndoStroke = () => {
    strokesRef.current.pop();
    setHasInk(strokesRef.current.length > 0);
    redrawCanvas();
  };

  const formattedInsertText = (() => {
    if (!evalResult?.ok) {
      if (aiFallback?.solution) {
        return `${displayEquation || expression}\n⇒ ${aiFallback.solution}`;
      }
      return expression;
    }
    if (evalResult.kind === "linear2var" && evalResult.summaryLines?.length) {
      const subText =
        subEvalResult?.ok && subEvalResult.solvedVariable
          ? `\n⇒ (เมื่อแทนค่า) ${subEvalResult.solvedVariable} = ${subEvalResult.formatted}`
          : "";
      return `สมการ: ${displayEquation || expression}\n${evalResult.summaryLines.join("\n")}${subText}`;
    }
    if (evalResult.kind === "system2var" && evalResult.summaryLines?.length) {
      return `ระบบสมการ: ${displayEquation || expression}\n⇒ ${evalResult.formatted}`;
    }
    if (evalResult.kind === "quadratic1var" && evalResult.summaryLines?.length) {
      return `${displayEquation || expression}\n⇒ ${evalResult.summaryLines.join("\n")}`;
    }
    if (evalResult.solvedVariable) {
      return `${displayEquation || expression}\n⇒ ${evalResult.solvedVariable} = ${evalResult.formatted}`;
    }
    const cleanExpr = (displayEquation || expression).replace(/=\s*$/, "").trim();
    return `${cleanExpr} = ${evalResult.formatted}`;
  })();

  const canInsertText = Boolean(
    evalResult?.ok || (!evalResult?.ok && aiFallback?.solution)
  );

  return (
    <div
      role="dialog"
      aria-label="เครื่องคิดเลขวิทยาศาสตร์แบบเขียนมือและแก้สมการ"
      className="no-print fixed bottom-16 right-4 left-4 sm:left-auto sm:w-[415px] z-40 rounded-2xl border border-line bg-white shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink">
              คิดเลขวิทย์ & แก้สมการอัตโนมัติ
            </h3>
            <p className="text-[10px] text-muted">
              คิดคำนวณให้ทันที (รองรับ 5x+3=y, x², ระบบ 2 สมการ, แนบรูป)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAngleMode((m) => (m === "deg" ? "rad" : "deg"))}
            className="rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[10px] font-bold text-accent-dark hover:bg-accent-soft"
            title="สลับหน่วยมุม DEG / RAD"
          >
            {angleMode.toUpperCase()}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดเครื่องคิดเลข"
            className="rounded-lg p-1 text-muted hover:bg-paper hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mode Switch Tabs */}
      <div className="grid grid-cols-3 gap-1 border-b border-line bg-paper p-1.5">
        <button
          type="button"
          onClick={() => setTab("draw")}
          className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
            tab === "draw"
              ? "bg-white text-accent-dark shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <PenTool className="h-3.5 w-3.5" />
          <span>เขียนสมการ</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("image")}
          className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
            tab === "image"
              ? "bg-white text-accent-dark shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          <span>แนบรูปสมการ</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("keypad")}
          className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
            tab === "keypad"
              ? "bg-white text-accent-dark shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <Calculator className="h-3.5 w-3.5" />
          <span>แป้นคิดเลข</span>
        </button>
      </div>

      <div className="p-3.5 space-y-3 max-h-[72vh] overflow-y-auto">
        {tab === "draw" && (
          <div className="space-y-2">
            <div className="relative rounded-xl border border-line overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                width={640}
                height={240}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                style={{ touchAction: "none" }}
                className="w-full h-[135px] cursor-crosshair block"
              />
              {!hasInk && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-stone-400 px-3 text-center">
                  เขียนสมการที่นี่ เช่น 5x+3=y หรือ x²-5x+6=0
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleUndoStroke}
                  disabled={!hasInk}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink disabled:opacity-40"
                >
                  <Undo2 className="h-3 w-3" />
                  <span>ย้อน</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink"
                >
                  <Eraser className="h-3 w-3" />
                  <span>ล้าง</span>
                </button>
                {hasInk && onInsertEquationImage && canvasRef.current && (
                  <button
                    type="button"
                    onClick={() => {
                      const c = canvasRef.current;
                      if (!c) return;
                      onInsertEquationImage(
                        c.toDataURL("image/png"),
                        340,
                        130,
                        canInsertText ? formattedInsertText : undefined
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink hover:bg-[#efede6]"
                    title="วางรูปลายมือที่เขียนลงสมุดโดยตรง"
                  >
                    <ImagePlus className="h-3 w-3 text-accent" />
                    <span>วางรูปลายมือ</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleRecognizeHandwriting}
                disabled={isRecognizing || !hasInk}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                <span>{isRecognizing ? "กำลังอ่าน..." : "ตรวจจับสมการ"}</span>
              </button>
            </div>

            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={autoDetectOnPause}
                onChange={(e) => setAutoDetectOnPause(e.target.checked)}
                className="accent-teal-700"
              />
              <span>ตรวจจับอัตโนมัติหลังหยุดเขียน</span>
            </label>
          </div>
        )}

        {tab === "image" && (
          <div
            className="space-y-2.5"
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (let i = 0; i < items.length; i += 1) {
                if (items[i].type.startsWith("image/")) {
                  const file = items[i].getAsFile();
                  if (file) {
                    handleAttachImageFile(file);
                    break;
                  }
                }
              }
            }}
          >
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAttachImageFile(f);
                e.target.value = "";
              }}
            />

            {!attachedImage ? (
              <div
                onClick={() => imageInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f && f.type.startsWith("image/")) {
                    handleAttachImageFile(f);
                  }
                }}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-paper p-5 text-center hover:border-accent transition-colors"
              >
                <ImagePlus className="h-7 w-7 text-accent" />
                <div>
                  <p className="text-xs font-semibold text-ink">
                    คลิกอัปโหลด / ลากวาง / Ctrl+V รูปสมการ
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    อ่านสมการจากภาพถ่ายหรือสกรีนช็อต แล้วคำนวณคำตอบหรือวางรูปลงสมุดได้ทันที
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-line bg-paper p-2.5">
                <div className="relative overflow-hidden rounded-lg border border-line bg-white flex items-center justify-center max-h-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachedImage.dataUrl}
                    alt={attachedImage.fileName || "รูปสมการที่แนบ"}
                    className="max-h-36 w-auto object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-rose-600 shadow hover:bg-rose-50"
                    title="เปลี่ยนรูปอื่น"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <button
                    type="button"
                    disabled={isRecognizing}
                    onClick={() =>
                      recognizeFromDataUrl(
                        attachedImage.dataUrl,
                        attachedImage.mimeType
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>
                      {isRecognizing
                        ? "กำลังอ่านรูปสมการ..."
                        : "ตรวจจับ & แก้สมการจากรูป (AI)"}
                    </span>
                  </button>

                  {onInsertEquationImage && (
                    <button
                      type="button"
                      onClick={() => {
                        const ratio = Math.min(
                          380 / attachedImage.width,
                          240 / attachedImage.height,
                          1
                        );
                        onInsertEquationImage(
                          attachedImage.dataUrl,
                          Math.max(140, Math.round(attachedImage.width * ratio)),
                          Math.max(90, Math.round(attachedImage.height * ratio)),
                          canInsertText ? formattedInsertText : undefined
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:bg-paper"
                    >
                      <PlusCircle className="h-3.5 w-3.5 text-accent" />
                      <span>วางรูปสมการลงสมุด</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "keypad" && (
          <div className="grid grid-cols-5 gap-1.5">
            {KEYPAD_BUTTONS.map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={() => setExpression((prev) => prev + btn.insert)}
                className={`rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                  btn.accent
                    ? "border-accent bg-accent text-white hover:bg-accent-dark"
                    : btn.varKey
                      ? "border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                      : "border-line bg-paper text-ink hover:bg-[#efede6]"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        {recognizeError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 flex items-center justify-between gap-2">
            <span>{recognizeError}</span>
            {recognizeError.includes("Key") && (
              <button
                type="button"
                onClick={onOpenApiModal}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white border border-rose-200 px-2 py-1 font-semibold text-rose-800"
              >
                <KeyRound className="h-3 w-3" />
                ตั้งค่าคีย์
              </button>
            )}
          </div>
        )}

        {/* Quick Clickable Equation Examples */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted">ตัวอย่าง:</span>
          {QUICK_EXAMPLES.map((ex) => (
            <button
              key={ex.expr}
              type="button"
              onClick={() => {
                setExpression(ex.expr);
                setDisplayEquation(ex.expr);
                setAiFallback(null);
                setRecognizeError("");
              }}
              className="rounded-full border border-line bg-paper px-2 py-0.5 font-mono text-[10px] font-medium text-ink hover:border-accent hover:bg-accent-soft transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Formula Input & Deterministic Rich Solver Output */}
        <div className="rounded-xl border border-line bg-paper p-2.5 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={expression}
              onChange={(e) => {
                setExpression(e.target.value);
                setDisplayEquation(e.target.value);
                setAiFallback(null);
              }}
              aria-label="สูตรสมการคณิตศาสตร์"
              placeholder="พิมพ์สมการ เช่น 5x+3=y หรือ x^2-5x+6=0"
              className="flex-1 rounded-lg border border-line bg-white px-2.5 py-1.5 font-mono text-xs text-ink focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setExpression((p) => p.slice(0, -1))}
              title="ลบ 1 ตัว"
              className="rounded-lg border border-line bg-white p-1.5 text-ink hover:bg-paper"
            >
              <Delete className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setExpression("");
                setDisplayEquation("");
                setAiFallback(null);
              }}
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
            >
              AC
            </button>
          </div>

          <div className="space-y-2">
            {evalResult ? (
              evalResult.ok ? (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <span className="text-[10px] text-muted block">
                        {evalResult.kind === "linear2var"
                          ? "จัดรูปและวิเคราะห์สมการ 2 ตัวแปร:"
                          : evalResult.kind === "system2var"
                            ? "คำตอบระบบสมการ:"
                            : evalResult.kind === "quadratic1var"
                              ? "คำตอบสมการกำลังสอง:"
                              : `คำตอบ (${angleMode.toUpperCase()}):`}
                      </span>
                      <span className="font-mono text-base sm:text-lg font-bold text-accent-dark break-all block">
                        {evalResult.kind === "linear2var" ||
                        evalResult.kind === "system2var"
                          ? evalResult.formatted
                          : evalResult.solvedVariable
                            ? `${evalResult.solvedVariable} = ${evalResult.formatted}`
                            : `= ${evalResult.formatted}`}
                      </span>
                      {evalResult.summaryLines &&
                        evalResult.summaryLines.length > 0 && (
                          <div className="space-y-0.5 font-mono text-[11px] text-ink">
                            {evalResult.summaryLines.slice(1).map((ln, idx) => (
                              <p key={idx} className="leading-snug">
                                {ln}
                              </p>
                            ))}
                          </div>
                        )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onInsertResult(formattedInsertText)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark shadow-sm"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>วางลงสมุด</span>
                    </button>
                  </div>

                  {/* Interactive Variable Substitution & Sample Table for 5x+3=y */}
                  {evalResult.kind === "linear2var" &&
                    evalResult.variables?.length === 2 && (
                      <div className="rounded-lg border border-line bg-white p-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold text-muted">
                            แทนค่าหาคำตอบทันที:
                          </span>
                          {evalResult.variables.map((vName) => (
                            <label
                              key={vName}
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-ink"
                            >
                              <span>{vName} =</span>
                              <input
                                type="number"
                                step="any"
                                value={subInputs[vName] ?? ""}
                                onChange={(e) =>
                                  setSubInputs({
                                    [vName]: e.target.value,
                                  })
                                }
                                placeholder="?"
                                aria-label={`แทนค่า ${vName}`}
                                className="w-16 rounded border border-line bg-paper px-1.5 py-0.5 text-xs text-ink focus:border-accent focus:outline-none"
                              />
                            </label>
                          ))}
                        </div>

                        {subEvalResult?.ok && subEvalResult.solvedVariable && (
                          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 font-mono text-xs font-bold text-emerald-800">
                            ⇒ {subEvalResult.solvedVariable} ={" "}
                            {subEvalResult.formatted}
                          </div>
                        )}

                        {evalResult.sampleTable &&
                          evalResult.sampleTable.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-center font-mono text-[10px] border-collapse">
                                <tbody>
                                  <tr className="border-b border-line bg-paper text-muted">
                                    <th className="py-0.5 px-1.5 font-semibold text-left">
                                      {evalResult.variables[0]}
                                    </th>
                                    {evalResult.sampleTable.map((row, idx) => (
                                      <td key={idx} className="py-0.5 px-1.5">
                                        {row.inputs[evalResult.variables![0]]}
                                      </td>
                                    ))}
                                  </tr>
                                  <tr className="text-ink font-semibold">
                                    <th className="py-0.5 px-1.5 text-left text-accent-dark">
                                      {evalResult.variables[1]}
                                    </th>
                                    {evalResult.sampleTable.map((row, idx) => (
                                      <td key={idx} className="py-0.5 px-1.5">
                                        {row.outputs[evalResult.variables![1]]}
                                      </td>
                                    ))}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                      </div>
                    )}
                </div>
              ) : aiFallback?.solution ? (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <span className="text-[10px] text-muted block">
                      คำตอบ (AI):
                    </span>
                    <span className="font-mono text-base font-bold text-accent-dark break-all block">
                      {aiFallback.solution}
                    </span>
                    {aiFallback.steps && aiFallback.steps.length > 0 && (
                      <div className="space-y-0.5 text-[11px] text-ink">
                        {aiFallback.steps.map((st, idx) => (
                          <p key={idx}>• {st}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onInsertResult(formattedInsertText)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark shadow-sm"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>วางลงสมุด</span>
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-rose-600">
                  {evalResult.error}
                </span>
              )
            ) : (
              <span className="text-[11px] text-muted">
                พร้อมคำนวณ: ตัวเลข, ตรีโกณ, สมการ 1–2 ตัวแปร (เช่น 5x+3=y), สมการกำลังสอง และแนบรูปสมการ
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
