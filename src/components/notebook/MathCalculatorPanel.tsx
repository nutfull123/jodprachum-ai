"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Delete,
  Eraser,
  KeyRound,
  PenTool,
  PlusCircle,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
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
  onClose: () => void;
}

const KEYPAD_BUTTONS: Array<{ label: string; insert: string; accent?: boolean }> = [
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
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "÷", insert: "/" },
  { label: "π", insert: "pi" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "×", insert: "*" },
  { label: "e", insert: "e" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "−", insert: "-" },
  { label: "!", insert: "!" },
  { label: "0", insert: "0" },
  { label: ".", insert: "." },
  { label: "Ans", insert: "ans" },
  { label: "+", insert: "+", accent: true },
  { label: "=", insert: "=" },
];

export function MathCalculatorPanel({
  isOpen,
  apiKey,
  passcode,
  onOpenApiModal,
  onInsertResult,
  onClose,
}: MathCalculatorPanelProps) {
  const [tab, setTab] = useState<"draw" | "keypad">("draw");
  const [angleMode, setAngleMode] = useState<AngleMode>("deg");
  const [expression, setExpression] = useState("");
  const [displayEquation, setDisplayEquation] = useState("");
  const [lastAnswer, setLastAnswer] = useState<number>(0);
  const [autoDetectOnPause, setAutoDetectOnPause] = useState(true);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState("");
  const [hasInk, setHasInk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Array<Array<[number, number]>>>([]);
  const activeStrokeRef = useRef<Array<[number, number]>>([]);
  const drawingRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const evalResult = useMemo(() => {
    if (!expression.trim()) return null;
    return evaluateScientificMath(expression, {
      angleMode,
      lastAnswer,
      decimals: 8,
    });
  }, [expression, angleMode, lastAnswer]);

  useEffect(() => {
    if (evalResult?.ok) {
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

  const handleRecognizeHandwriting = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) {
      setRecognizeError("กรุณาเขียนสมการลงในช่องก่อนครับ");
      return;
    }

    setIsRecognizing(true);
    setRecognizeError("");
    try {
      const dataUrl = canvas.toDataURL("image/png");
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
          mimeType: "image/png",
        }),
      });
      const json = (await res.json()) as {
        expression?: string;
        displayText?: string;
        error?: string;
      };
      if (!res.ok) {
        setRecognizeError(json.error || "ตรวจจับลายมือไม่สำเร็จ");
        return;
      }
      if (json.expression) {
        setExpression(json.expression);
        setDisplayEquation(json.displayText || json.expression);
      } else {
        setRecognizeError("ยังอ่านสมการไม่ชัดเจน ลองเขียนตัวใหญ่ขึ้นอีกนิดครับ");
      }
    } catch {
      setRecognizeError("เชื่อมต่อระบบตรวจจับสมการไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsRecognizing(false);
    }
  }, [apiKey, passcode]);

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
    if (!evalResult?.ok) return expression;
    if (evalResult.solvedVariable) {
      return `${displayEquation || expression}\n⇒ ${evalResult.solvedVariable} = ${evalResult.formatted}`;
    }
    const cleanExpr = (displayEquation || expression).replace(/=\s*$/, "").trim();
    return `${cleanExpr} = ${evalResult.formatted}`;
  })();

  return (
    <div
      role="dialog"
      aria-label="เครื่องคิดเลขวิทยาศาสตร์แบบเขียนมือ"
      className="no-print fixed bottom-16 right-4 left-4 sm:left-auto sm:w-[380px] z-40 rounded-2xl border border-line bg-white shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink">
              เครื่องคิดเลขวิทยาศาสตร์
            </h3>
            <p className="text-[10px] text-muted">
              เขียนสมการด้วยปากกาหรือกดปุ่มคิดเลขจริง
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
      <div className="grid grid-cols-2 gap-1 border-b border-line bg-paper p-1.5">
        <button
          type="button"
          onClick={() => setTab("draw")}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            tab === "draw"
              ? "bg-white text-accent-dark shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <PenTool className="h-3.5 w-3.5" />
          <span>เขียนสมการ (AI)</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("keypad")}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            tab === "keypad"
              ? "bg-white text-accent-dark shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <Calculator className="h-3.5 w-3.5" />
          <span>แป้นคิดเลข (ออฟไลน์)</span>
        </button>
      </div>

      <div className="p-3.5 space-y-3 max-h-[70vh] overflow-y-auto">
        {tab === "draw" ? (
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
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-stone-400">
                  เขียนสมการที่นี่ เช่น 2x + 5 = 19 หรือ sin(30) + √16
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
              </div>

              <button
                type="button"
                onClick={handleRecognizeHandwriting}
                disabled={isRecognizing || !hasInk}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                <span>{isRecognizing ? "กำลังอ่านสมการ..." : "ตรวจจับสมการ"}</span>
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
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1.5">
            {KEYPAD_BUTTONS.map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={() => setExpression((prev) => prev + btn.insert)}
                className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
                  btn.accent
                    ? "border-accent bg-accent text-white hover:bg-accent-dark"
                    : "border-line bg-paper text-ink hover:bg-[#efede6]"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        {/* Formula Input & Deterministic Result */}
        <div className="rounded-xl border border-line bg-paper p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={expression}
              onChange={(e) => {
                setExpression(e.target.value);
                setDisplayEquation(e.target.value);
              }}
              aria-label="สูตรสมการคณิตศาสตร์"
              placeholder="พิมพ์หรือแก้สูตร เช่น sin(30) + sqrt(16)"
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
              }}
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
            >
              AC
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            {evalResult ? (
              evalResult.ok ? (
                <div className="min-w-0">
                  <span className="text-[10px] text-muted block">
                    คำตอบ ({angleMode.toUpperCase()}):
                  </span>
                  <span className="font-mono text-lg font-bold text-accent-dark break-all">
                    {evalResult.solvedVariable
                      ? `${evalResult.solvedVariable} = ${evalResult.formatted}`
                      : `= ${evalResult.formatted}`}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-rose-600">
                  {evalResult.error}
                </span>
              )
            ) : (
              <span className="text-[11px] text-muted">
                พร้อมคำนวณ (รองรับ sin, cos, log, ln, √, แก้สมการ 1 ตัวแปร)
              </span>
            )}

            {evalResult?.ok && (
              <button
                type="button"
                onClick={() => onInsertResult(formattedInsertText)}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark shadow-sm"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>วางลงสมุด</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
