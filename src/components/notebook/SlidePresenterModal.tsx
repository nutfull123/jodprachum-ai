"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Sparkles,
  X,
} from "lucide-react";
import type { ShootNotebook } from "../../types/notebook";
import { ensureNotebookPages } from "../../lib/notebook-crdt";
import { renderNotebookPageToCanvas } from "../../lib/slide-export";

interface SlidePresenterModalProps {
  isOpen: boolean;
  notebook: ShootNotebook;
  initialPageIndex: number;
  onClose: () => void;
}

export function SlidePresenterModal({
  isOpen,
  notebook,
  initialPageIndex,
  onClose,
}: SlidePresenterModalProps) {
  const pages = useMemo(() => ensureNotebookPages(notebook), [notebook]);
  const [slideIdx, setSlideIdx] = useState(initialPageIndex);
  const [slideImageUrl, setSlideImageUrl] = useState<string>("");
  const [slideDims, setSlideDims] = useState({ width: 1280, height: 720 });
  const [laserActive, setLaserActive] = useState(true);

  const laserCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSlideIdx(
        Math.max(0, Math.min(pages.length - 1, initialPageIndex || 0))
      );
    }
  }, [isOpen, initialPageIndex, pages.length]);

  const currentPage = pages[slideIdx] || pages[0];

  useEffect(() => {
    if (!isOpen || !currentPage) return;
    let cancelled = false;

    renderNotebookPageToCanvas(notebook, currentPage, slideIdx)
      .then((canvas) => {
        if (cancelled) return;
        setSlideDims({ width: canvas.width, height: canvas.height });
        setSlideImageUrl(canvas.toDataURL("image/png"));
        const lCanvas = laserCanvasRef.current;
        if (lCanvas) {
          const ctx = lCanvas.getContext("2d");
          ctx?.clearRect(0, 0, lCanvas.width, lCanvas.height);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isOpen, notebook, currentPage, slideIdx]);

  const goPrev = useCallback(() => {
    setSlideIdx((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setSlideIdx((i) => Math.min(pages.length - 1, i + 1));
  }, [pages.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (
        e.key === "ArrowRight" ||
        e.key === "PageDown" ||
        e.key === " "
      ) {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, goNext, goPrev, onClose]);

  if (!isOpen || !currentPage) return null;

  const getLaserCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = laserCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const clearLaser = () => {
    const canvas = laserCanvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="โหมดนำเสนอสไลด์เต็มจอ"
      onTouchStart={(e) => {
        if (e.touches.length === 1 && !laserActive) {
          touchStartXRef.current = e.touches[0].clientX;
        }
      }}
      onTouchEnd={(e) => {
        if (touchStartXRef.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (dx < -60) goNext();
        else if (dx > 60) goPrev();
      }}
      className="fixed inset-0 z-50 flex flex-col bg-[#0B0E12] text-white select-none"
    >
      {/* Top Presenter Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#121720] px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white">
            นำเสนอสไลด์
          </span>
          <span className="truncate text-sm font-semibold text-white/90">
            {notebook.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLaserActive((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              laserActive
                ? "bg-rose-600 text-white"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{laserActive ? "เลเซอร์ชี้จุด: เปิด" : "เลเซอร์ชี้จุด"}</span>
          </button>

          <button
            type="button"
            onClick={clearLaser}
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/85 hover:bg-white/20"
          >
            <Eraser className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">ล้างเส้นเลเซอร์</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="ออกจากโหมดนำเสนอ"
            className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
          >
            <X className="h-4 w-4" />
            <span>ปิด</span>
          </button>
        </div>
      </div>

      {/* Stage Area */}
      <div className="relative flex-1 flex items-center justify-center p-3 sm:p-6 overflow-hidden">
        <div
          style={{
            aspectRatio: `${slideDims.width} / ${slideDims.height}`,
          }}
          className="relative max-h-full max-w-full rounded-xl overflow-hidden shadow-2xl border border-white/15 bg-white"
        >
          {slideImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slideImageUrl}
              alt={`สไลด์หน้า ${slideIdx + 1}`}
              className="h-full w-full object-contain pointer-events-none"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-500">
              กำลังเตรียมสไลด์...
            </div>
          )}

          {/* Temporary Presenter Laser Overlay */}
          <canvas
            ref={laserCanvasRef}
            width={slideDims.width}
            height={slideDims.height}
            style={{
              pointerEvents: laserActive ? "auto" : "none",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              if (!laserActive) return;
              drawingRef.current = true;
              const ctx = laserCanvasRef.current?.getContext("2d");
              if (!ctx) return;
              const { x, y } = getLaserCoords(e);
              ctx.strokeStyle = "rgba(244, 63, 94, 0.85)";
              ctx.lineWidth = 6;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.beginPath();
              ctx.moveTo(x, y);
            }}
            onPointerMove={(e) => {
              if (!drawingRef.current || !laserActive) return;
              const ctx = laserCanvasRef.current?.getContext("2d");
              if (!ctx) return;
              const { x, y } = getLaserCoords(e);
              ctx.lineTo(x, y);
              ctx.stroke();
            }}
            onPointerUp={() => {
              drawingRef.current = false;
            }}
            onPointerCancel={() => {
              drawingRef.current = false;
            }}
            className={`absolute inset-0 h-full w-full ${
              laserActive ? "cursor-crosshair" : ""
            }`}
          />
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-[#121720] px-4 py-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={slideIdx <= 0}
          className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>ก่อนหน้า</span>
        </button>

        <span className="font-mono text-xs font-semibold text-white/90 px-3">
          หน้า {slideIdx + 1} / {pages.length}
        </span>

        <button
          type="button"
          onClick={goNext}
          disabled={slideIdx >= pages.length - 1}
          className="inline-flex items-center gap-1 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-35"
        >
          <span>ถัดไป</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
