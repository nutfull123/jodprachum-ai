"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpToLine,
  Columns,
  Download,
  Edit3,
  ExternalLink,
  FilePlus2,
  FileText,
  Globe,
  Maximize2,
  Minus,
  Plus,
  Rows,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  STICKY_COLORS,
  isDarkPaperTemplate,
  type CanvasItem,
  type CustomPaperTemplate,
  type EraserMode,
  type InkStroke,
  type NotebookPage,
  type NotebookTool,
  type PaperTemplate,
  type PeerPresence,
  type ShootNotebook,
  type StrokePoint,
} from "../../types/notebook";
import { downloadTextFile, sanitizeFileName } from "../../lib/export-utils";
import { formatFileSize } from "../../lib/link-utils";
import { hitTestStroke } from "../../lib/media-utils";
import { strokePointsToSvgPath } from "../../lib/notebook-crdt";
import { resolvePageDimensions } from "../../lib/paper-utils";
import { recognizeHeldShape } from "../../lib/shape-recognizer";
import { getShapeSvgPath } from "../../lib/shape-svg";
import { getMediaBlob } from "../../lib/storage";

interface GoodNotesCanvasProps {
  notebook: ShootNotebook;
  activePage: NotebookPage;
  isFirstPage: boolean;
  pageIndex: number;
  totalPages: number;
  tool: NotebookTool;
  color: string;
  size: number;
  fingerDrawEnabled: boolean;
  eraserMode: EraserMode;
  eraserSize: number;
  customTemplates: CustomPaperTemplate[];
  autoShape: boolean;
  peers: PeerPresence[];
  svgExportRef: React.RefObject<SVGSVGElement | null>;
  onStylusDetected?: () => void;
  onAddStroke: (stroke: InkStroke) => void;
  onEraseStrokes: (strokeIds: string[]) => void;
  onBeginEraserSession: () => void;
  onPartialErase: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    radius: number
  ) => void;
  onUpdateItem: (item: CanvasItem) => void;
  onDeleteItem: (itemId: string) => void;
  onUpdateQuickBody: (quickBody: string) => void;
  onExtendPage: () => void;
  onAddPage: () => void;
  onCursorMove: (x: number, y: number) => void;
}

const VIRTUAL_WIDTH = 1000;

const strokePathCache = new WeakMap<InkStroke, string>();

function getCachedStrokePath(stroke: InkStroke): string {
  const cached = strokePathCache.get(stroke);
  if (cached !== undefined) return cached;
  const computed = strokePointsToSvgPath(stroke.points, {
    size: stroke.size,
    tool: stroke.tool,
    isStylus: stroke.isStylus,
  });
  strokePathCache.set(stroke, computed);
  return computed;
}

const CommittedStrokePath = memo(function CommittedStrokePath({
  stroke,
}: {
  stroke: InkStroke;
}) {
  const d = getCachedStrokePath(stroke);
  if (!d) return null;
  return <path d={d} fill={stroke.color} fillOpacity={stroke.opacity} />;
});

function getTemplateStyle(tpl: PaperTemplate): React.CSSProperties {
  switch (tpl) {
    case "lined":
      return {
        backgroundColor: "#FFFFFF",
        backgroundImage:
          "linear-gradient(90deg, transparent 83px, #FCA5A5 83px, #FCA5A5 84.5px, transparent 84.5px), repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, #E2E8F0 35px, #E2E8F0 36px)",
      };
    case "grid":
      return {
        backgroundColor: "#FFFFFF",
        backgroundImage:
          "linear-gradient(to right, #E5E7EB 1px, transparent 1px), linear-gradient(to bottom, #E5E7EB 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      };
    case "dotted":
      return {
        backgroundColor: "#FFFFFF",
        backgroundImage: "radial-gradient(#CBD5E1 1.3px, transparent 1.3px)",
        backgroundSize: "24px 24px",
      };
    case "cream":
      return {
        backgroundColor: "#FDF8EC",
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, #EDE2C8 35px, #EDE2C8 36px)",
      };
    case "cornell":
      return {
        backgroundColor: "#FFFDF9",
        backgroundImage:
          "linear-gradient(90deg, transparent 238px, #FDA4AF 238px, #FDA4AF 240px, transparent 240px), repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, #E7E5E4 35px, #E7E5E4 36px)",
      };
    case "dark_lined":
      return {
        backgroundColor: "#181B20",
        backgroundImage:
          "linear-gradient(90deg, transparent 83px, #7F1D1D 83px, #7F1D1D 84.5px, transparent 84.5px), repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, #2A303B 35px, #2A303B 36px)",
      };
    case "dark_grid":
      return {
        backgroundColor: "#181B20",
        backgroundImage:
          "linear-gradient(to right, #2A303B 1px, transparent 1px), linear-gradient(to bottom, #2A303B 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      };
    case "dark_dotted":
      return {
        backgroundColor: "#181B20",
        backgroundImage: "radial-gradient(#3B4252 1.4px, transparent 1.4px)",
        backgroundSize: "24px 24px",
      };
    case "blank":
    default:
      return { backgroundColor: "#FFFFFF" };
  }
}

function MediaItemPlayer({ item }: { item: CanvasItem }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;

    if (!item.mediaBlobId) {
      setBlobUrl(null);
      return;
    }

    getMediaBlob(item.mediaBlobId)
      .then((rec) => {
        if (cancelled) return;
        if (rec?.blob) {
          activeUrl = URL.createObjectURL(rec.blob);
          setBlobUrl(activeUrl);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [item.mediaBlobId]);

  const src = blobUrl || item.dataUrl || "";

  if (item.type === "video") {
    return (
      <div className="h-full w-full flex flex-col rounded-xl overflow-hidden border border-line bg-black shadow-sm">
        {src ? (
          <video
            src={src}
            controls
            playsInline
            className="h-full w-full object-contain bg-black"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-white/75 p-3 text-center">
            กำลังโหลดคลิปวิดีโอ ({item.fileName || "video"})...
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-paper-card="true"
      className="h-full w-full flex flex-col justify-center gap-1.5 rounded-xl border border-line bg-white p-3 shadow-sm"
    >
      <p className="text-xs font-semibold text-ink truncate">
        🎵 {item.fileName || "คลิปเสียง"}
      </p>
      {src ? (
        <audio src={src} controls className="w-full h-8" />
      ) : (
        <span className="text-[11px] text-muted">กำลังโหลดไฟล์เสียง...</span>
      )}
    </div>
  );
}

function FileAttachmentCard({ item }: { item: CanvasItem }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;
    if (item.fileUrl || !item.mediaBlobId) {
      setBlobUrl(null);
      return;
    }

    getMediaBlob(item.mediaBlobId)
      .then((rec) => {
        if (cancelled || !rec?.blob) return;
        activeUrl = URL.createObjectURL(rec.blob);
        setBlobUrl(activeUrl);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [item.fileUrl, item.mediaBlobId]);

  const resolvedUrl = item.fileUrl || blobUrl || "";
  const sizeLabel = formatFileSize(item.fileSize);

  return (
    <div
      data-paper-card="true"
      className="h-full w-full rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm flex flex-col justify-between gap-2"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[#1C1B18] truncate">
            {item.fileName || item.title || "ไฟล์เอกสารแนบ"}
          </p>
          <p className="text-[11px] text-stone-500 truncate">
            {item.fileUrl ? "ไฟล์บนคลาวด์ (เปิดได้ทุกเครื่อง)" : "ไฟล์ในเครื่อง"}
            {sizeLabel ? ` · ${sizeLabel}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {resolvedUrl ? (
          <>
            <a
              data-item-control="true"
              href={resolvedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
            >
              <ExternalLink className="h-3 w-3" />
              <span>เปิดดูในเบราว์เซอร์</span>
            </a>
            <a
              data-item-control="true"
              href={resolvedUrl}
              download={item.fileName || "attachment"}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-accent-dark"
            >
              <Download className="h-3 w-3" />
              <span>ดาวน์โหลด</span>
            </a>
          </>
        ) : (
          <span className="text-[11px] text-amber-700">
            กำลังโหลดไฟล์ (หรือซิงก์ผ่านห้องคลาวด์)...
          </span>
        )}
      </div>
    </div>
  );
}

export function GoodNotesCanvas({
  notebook,
  activePage,
  isFirstPage,
  pageIndex,
  totalPages,
  tool,
  color,
  size,
  fingerDrawEnabled,
  eraserMode,
  eraserSize,
  customTemplates,
  autoShape,
  peers,
  svgExportRef,
  onStylusDetected,
  onAddStroke,
  onEraseStrokes,
  onBeginEraserSession,
  onPartialErase,
  onUpdateItem,
  onDeleteItem,
  onUpdateQuickBody,
  onExtendPage,
  onAddPage,
  onCursorMove,
}: GoodNotesCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const dims = useMemo(() => resolvePageDimensions(activePage), [activePage]);
  const isSlide = dims.paperSize === "slide16x9";
  const virtualWidth = dims.width;
  const pageHeight = dims.height;

  const [blobBgUrl, setBlobBgUrl] = useState<string | null>(null);
  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;
    if (!activePage.backgroundImageBlobId) {
      setBlobBgUrl(null);
      return;
    }
    getMediaBlob(activePage.backgroundImageBlobId)
      .then((rec) => {
        if (cancelled) return;
        if (rec?.blob) {
          activeUrl = URL.createObjectURL(rec.blob);
          setBlobBgUrl(activeUrl);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [activePage.backgroundImageBlobId]);

  const customTemplateBgUrl = useMemo(() => {
    if (activePage.backgroundImageDataUrl) {
      return activePage.backgroundImageDataUrl;
    }
    if (activePage.customTemplateId) {
      return (
        customTemplates.find((t) => t.id === activePage.customTemplateId)
          ?.dataUrl || null
      );
    }
    return null;
  }, [
    activePage.backgroundImageDataUrl,
    activePage.customTemplateId,
    customTemplates,
  ]);

  const resolvedBgUrl = blobBgUrl || customTemplateBgUrl;

  const [scale, setScale] = useState(1);
  const [manualScale, setManualScale] = useState<number | null>(null);
  const [snappedPill, setSnappedPill] = useState<string | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(
    null
  );

  // Active ink drawing (stored in refs + direct SVG DOM updates for 120Hz Apple Pencil fluidity)
  const livePointsRef = useRef<StrokePoint[]>([]);
  const liveStylusRef = useRef(false);
  const livePathRef = useRef<SVGPathElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snappedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strokeStartTimeRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<string | null>(null);
  const erasedInDragRef = useRef<Set<string>>(new Set());
  const lastEraserCoordRef = useRef<{ x: number; y: number } | null>(null);
  const lastCursorSentRef = useRef(0);

  const twoFingerRef = useRef<{
    active: boolean;
    prevMidX: number;
    prevMidY: number;
    prevDist: number;
  }>({ active: false, prevMidX: 0, prevMidY: 0, prevDist: 0 });

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const fingerDrawEnabledRef = useRef(fingerDrawEnabled);
  fingerDrawEnabledRef.current = fingerDrawEnabled;
  const autoShapeRef = useRef(autoShape);
  autoShapeRef.current = autoShape;
  const colorRef = useRef(color);
  colorRef.current = color;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const virtualWidthRef = useRef(virtualWidth);
  virtualWidthRef.current = virtualWidth;
  const pageHeightRef = useRef(pageHeight);
  pageHeightRef.current = pageHeight;

  // Item selection / drag / resize / inline text edit
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const itemActionRef = useRef<{
    mode: "move" | "resize";
    item: CanvasItem;
    startClientX: number;
    startClientY: number;
    draft: CanvasItem;
  } | null>(null);
  const [draftItemOverlay, setDraftItemOverlay] = useState<CanvasItem | null>(
    null
  );

  // Clear selection when switching page or leaving select tool
  useEffect(() => {
    setSelectedItemId(null);
    setEditingItemId(null);
  }, [activePage.id]);

  useEffect(() => {
    if (tool !== "select") {
      setSelectedItemId(null);
      setEditingItemId(null);
    }
  }, [tool]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (snappedTimerRef.current) clearTimeout(snappedTimerRef.current);
    };
  }, []);

  // Native non-passive iPadOS Safari touch guard + 2-finger Pan & Pinch-Zoom
  useEffect(() => {
    const surfaceEl = surfaceRef.current;
    if (!surfaceEl) return;

    const hasStylusTouch = (ev: TouchEvent): boolean => {
      for (let i = 0; i < ev.touches.length; i += 1) {
        if (
          (ev.touches[i] as Touch & { touchType?: string }).touchType ===
          "stylus"
        ) {
          return true;
        }
      }
      for (let i = 0; i < ev.changedTouches.length; i += 1) {
        if (
          (ev.changedTouches[i] as Touch & { touchType?: string }).touchType ===
          "stylus"
        ) {
          return true;
        }
      }
      return false;
    };

    const handleTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length === 2) {
        ev.preventDefault();
        // Cancel any stray 1-finger ink dot placed right before the 2nd finger landed
        if (
          activePointerIdRef.current !== null &&
          activePointerTypeRef.current !== "pen" &&
          Date.now() - strokeStartTimeRef.current < 180
        ) {
          activePointerIdRef.current = null;
          activePointerTypeRef.current = null;
          if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
          livePointsRef.current = [];
          livePathRef.current?.setAttribute("d", "");
        }
        const t0 = ev.touches[0];
        const t1 = ev.touches[1];
        twoFingerRef.current = {
          active: true,
          prevMidX: (t0.clientX + t1.clientX) / 2,
          prevMidY: (t0.clientY + t1.clientY) / 2,
          prevDist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        };
        return;
      }

      if (toolRef.current === "select") return;
      if (hasStylusTouch(ev) || activePointerTypeRef.current === "pen") {
        ev.preventDefault();
        return;
      }
      if (fingerDrawEnabledRef.current && ev.touches.length === 1) {
        ev.preventDefault();
      }
    };

    const handleTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length === 2 && twoFingerRef.current.active) {
        ev.preventDefault();
        const t0 = ev.touches[0];
        const t1 = ev.touches[1];
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const dist = Math.hypot(
          t1.clientX - t0.clientX,
          t1.clientY - t0.clientY
        );

        const vp = viewportRef.current;
        if (vp) {
          vp.scrollLeft -= midX - twoFingerRef.current.prevMidX;
          vp.scrollTop -= midY - twoFingerRef.current.prevMidY;
        }
        if (twoFingerRef.current.prevDist > 12 && dist > 12) {
          const factor = dist / twoFingerRef.current.prevDist;
          if (Math.abs(factor - 1) > 0.015) {
            const nextScale = Math.max(
              0.35,
              Math.min(2.0, Number((scaleRef.current * factor).toFixed(3)))
            );
            setManualScale(nextScale);
            twoFingerRef.current.prevDist = dist;
          }
        }
        twoFingerRef.current.prevMidX = midX;
        twoFingerRef.current.prevMidY = midY;
        return;
      }

      if (toolRef.current === "select") return;
      if (hasStylusTouch(ev) || activePointerTypeRef.current === "pen") {
        ev.preventDefault();
        return;
      }
      if (fingerDrawEnabledRef.current && ev.touches.length === 1) {
        ev.preventDefault();
      }
    };

    const handleTouchEnd = (ev: TouchEvent) => {
      if (ev.touches.length < 2) {
        twoFingerRef.current.active = false;
      }
    };

    surfaceEl.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    surfaceEl.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    surfaceEl.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      surfaceEl.removeEventListener("touchstart", handleTouchStart);
      surfaceEl.removeEventListener("touchmove", handleTouchMove);
      surfaceEl.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Responsive fit-to-width scaling
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateFit = () => {
      if (manualScale !== null) {
        setScale(manualScale);
        return;
      }
      const avail = Math.max(280, el.clientWidth - 24);
      const next = Math.min(1.25, Number((avail / virtualWidth).toFixed(3)));
      setScale(next);
    };

    updateFit();
    const ro = new ResizeObserver(updateFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [manualScale, virtualWidth]);

  const visibleStrokes = useMemo(
    () =>
      notebook.strokes.filter(
        (s) =>
          !s.deleted &&
          (s.pageId === activePage.id || (!s.pageId && isFirstPage))
      ),
    [notebook.strokes, activePage.id, isFirstPage]
  );

  const visibleItems = useMemo(() => {
    return notebook.items
      .filter(
        (i) =>
          !i.deleted &&
          (i.pageId === activePage.id || (!i.pageId && isFirstPage))
      )
      .map((i) => (draftItemOverlay?.id === i.id ? draftItemOverlay : i))
      .sort((a, b) => a.zIndex - b.zIndex);
  }, [notebook.items, activePage.id, isFirstPage, draftItemOverlay]);

  const maxZIndex = useMemo(
    () => Math.max(1, ...notebook.items.map((i) => i.zIndex || 1)),
    [notebook.items]
  );

  const darkPaper = isDarkPaperTemplate(activePage.paperTemplate);

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const currentScale = scaleRef.current || 1;
    return {
      x: Math.max(
        0,
        Math.min(virtualWidthRef.current, (clientX - rect.left) / currentScale)
      ),
      y: Math.max(
        0,
        Math.min(pageHeightRef.current, (clientY - rect.top) / currentScale)
      ),
    };
  };

  const cancelHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const clearLivePath = () => {
    cancelHoldTimer();
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    livePointsRef.current = [];
    if (livePathRef.current) {
      livePathRef.current.setAttribute("d", "");
    }
  };

  const renderLivePathNow = () => {
    const pathEl = livePathRef.current;
    const pts = livePointsRef.current;
    if (!pathEl) return;
    if (pts.length === 0) {
      pathEl.setAttribute("d", "");
      return;
    }
    const currentTool = toolRef.current;
    const d = strokePointsToSvgPath(pts, {
      size: sizeRef.current,
      tool: currentTool === "highlighter" ? "highlighter" : "pen",
      isStylus: liveStylusRef.current,
    });
    pathEl.setAttribute("d", d);
    pathEl.setAttribute("fill", colorRef.current);
    pathEl.setAttribute(
      "fill-opacity",
      currentTool === "highlighter" ? "0.36" : "1"
    );
  };

  const scheduleLivePathRender = () => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      renderLivePathNow();
    });
  };

  const scheduleHoldShapeSnap = () => {
    cancelHoldTimer();
    if (
      !autoShapeRef.current ||
      (toolRef.current !== "pen" && toolRef.current !== "highlighter")
    ) {
      return;
    }
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (
        activePointerIdRef.current === null ||
        livePointsRef.current.length < 8
      ) {
        return;
      }
      const snapped = recognizeHeldShape(livePointsRef.current);
      if (!snapped) return;
      livePointsRef.current = snapped.points;
      renderLivePathNow();
      setSnappedPill(snapped.labelTh);
      if (snappedTimerRef.current) clearTimeout(snappedTimerRef.current);
      snappedTimerRef.current = setTimeout(() => {
        setSnappedPill(null);
      }, 1500);
    }, 450);
  };

  const handleSurfacePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool === "select") {
      if (!(e.target as HTMLElement).closest("[data-canvas-item='true']")) {
        setSelectedItemId(null);
        setEditingItemId(null);
      }
      return;
    }

    if (e.pointerType === "pen") {
      onStylusDetected?.();
    }

    // Never allow resting palm / finger touch to interrupt an active Apple Pencil stroke
    if (
      activePointerIdRef.current !== null &&
      activePointerTypeRef.current === "pen" &&
      e.pointerType !== "pen"
    ) {
      return;
    }

    if (twoFingerRef.current.active) return;
    // When finger-draw is disabled, single-finger touch scrolls/pans natively instead of drawing
    if (!fingerDrawEnabled && e.pointerType === "touch") return;
    if (e.pointerType !== "pen" && (e.target as HTMLElement).closest("textarea")) {
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;

    setSelectedItemId(null);
    setEditingItemId(null);

    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors
    }
    activePointerIdRef.current = e.pointerId;
    activePointerTypeRef.current = e.pointerType;
    strokeStartTimeRef.current = Date.now();

    const { x, y } = toCanvasCoords(e.clientX, e.clientY);

    if (tool === "eraser") {
      onBeginEraserSession();
      erasedInDragRef.current.clear();
      lastEraserCoordRef.current = { x, y };
      setEraserCursor({ x, y });
      if (eraserMode === "stroke") {
        const hits = visibleStrokes
          .filter((s) => hitTestStroke(s, x, y, eraserSize))
          .map((s) => s.id);
        if (hits.length > 0) {
          hits.forEach((id) => erasedInDragRef.current.add(id));
          onEraseStrokes(hits);
        }
      } else {
        onPartialErase(x, y, x, y, eraserSize);
      }
      return;
    }

    const isStylus = e.pointerType === "pen";
    const pressure =
      isStylus && Number.isFinite(e.pressure) && e.pressure > 0
        ? e.pressure
        : 0.5;
    liveStylusRef.current = isStylus;
    livePointsRef.current = [[x, y, pressure]];
    renderLivePathNow();
  };

  const handleSurfacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    if (tool === "eraser") {
      setEraserCursor({ x, y });
    }

    const now = Date.now();
    if (now - lastCursorSentRef.current > 75) {
      lastCursorSentRef.current = now;
      onCursorMove(x, y);
    }

    if (itemActionRef.current) {
      const act = itemActionRef.current;
      const dx = (e.clientX - act.startClientX) / scale;
      const dy = (e.clientY - act.startClientY) / scale;

      const updated: CanvasItem =
        act.mode === "move"
          ? {
              ...act.item,
              x: Math.max(
                0,
                Math.min(virtualWidth - 40, Math.round(act.item.x + dx))
              ),
              y: Math.max(
                0,
                Math.min(pageHeight - 40, Math.round(act.item.y + dy))
              ),
              updatedAt: Date.now(),
            }
          : {
              ...act.item,
              width: Math.max(
                64,
                Math.min(
                  virtualWidth - act.item.x,
                  Math.round(act.item.width + dx)
                )
              ),
              height: Math.max(48, Math.round(act.item.height + dy)),
              updatedAt: Date.now(),
            };
      act.draft = updated;
      setDraftItemOverlay(updated);
      return;
    }

    if (twoFingerRef.current.active) return;
    if (activePointerIdRef.current !== e.pointerId) return;
    if (tool === "select") return;
    if (!fingerDrawEnabled && e.pointerType === "touch") return;

    if (tool === "eraser") {
      if (eraserMode === "stroke") {
        const hits = visibleStrokes
          .filter(
            (s) =>
              !erasedInDragRef.current.has(s.id) &&
              hitTestStroke(s, x, y, eraserSize)
          )
          .map((s) => s.id);
        if (hits.length > 0) {
          hits.forEach((id) => erasedInDragRef.current.add(id));
          onEraseStrokes(hits);
        }
      } else {
        const prev = lastEraserCoordRef.current || { x, y };
        onPartialErase(prev.x, prev.y, x, y, eraserSize);
      }
      lastEraserCoordRef.current = { x, y };
      return;
    }

    if (livePointsRef.current.length === 0) return;

    const isStylus = e.pointerType === "pen";
    const nativeEv = e.nativeEvent;
    const coalesced =
      typeof nativeEv.getCoalescedEvents === "function"
        ? nativeEv.getCoalescedEvents()
        : [];
    const samples = coalesced.length > 0 ? coalesced : [nativeEv];

    let added = false;
    for (const sample of samples) {
      const pt = toCanvasCoords(sample.clientX, sample.clientY);
      const last = livePointsRef.current[livePointsRef.current.length - 1];
      if (last) {
        const dx = pt.x - last[0];
        const dy = pt.y - last[1];
        if (dx * dx + dy * dy < 1.44) {
          continue;
        }
      }
      const pressure =
        isStylus && Number.isFinite(sample.pressure) && sample.pressure > 0
          ? sample.pressure
          : 0.5;
      livePointsRef.current.push([pt.x, pt.y, pressure]);
      added = true;
    }

    if (added) {
      scheduleLivePathRender();
      scheduleHoldShapeSnap();
    }
  };

  const finishPointerInteraction = (
    e: React.PointerEvent<HTMLDivElement>,
    isCancel: boolean = false
  ) => {
    if (itemActionRef.current) {
      const finished = itemActionRef.current.draft;
      itemActionRef.current = null;
      setDraftItemOverlay(null);
      onUpdateItem(finished);
      return;
    }

    if (activePointerIdRef.current !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release errors
    }
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;

    if (tool === "eraser") {
      erasedInDragRef.current.clear();
      lastEraserCoordRef.current = null;
      return;
    }

    const points = livePointsRef.current.slice();
    const isStylus = liveStylusRef.current;
    clearLivePath();

    const minPoints = isCancel ? 2 : 1;
    if (points.length >= minPoints) {
      const stroke: InkStroke = {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `str-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        pageId: activePage.id,
        tool: tool === "highlighter" ? "highlighter" : "pen",
        color,
        size,
        opacity: tool === "highlighter" ? 0.36 : 1,
        isStylus,
        points,
        updatedAt: Date.now(),
      };
      onAddStroke(stroke);
    }
  };

  const drawingTouchAction =
    tool === "select"
      ? "auto"
      : !fingerDrawEnabled
        ? "pan-x pan-y pinch-zoom"
        : "none";

  return (
    <div
      ref={viewportRef}
      className="relative flex-1 overflow-auto bg-[#ECEAE2] px-3 py-5 sm:px-6"
    >
      {/* Scaled Wrapper */}
      <div
        className="mx-auto transition-transform duration-100"
        style={{
          width: `${Math.round(virtualWidth * scale)}px`,
          height: `${Math.round(pageHeight * scale)}px`,
        }}
      >
        <div
          ref={surfaceRef}
          data-paper-surface="true"
          data-dark-paper={darkPaper ? "true" : "false"}
          onPointerDown={handleSurfacePointerDown}
          onPointerMove={handleSurfacePointerMove}
          onPointerUp={(e) => finishPointerInteraction(e, false)}
          onPointerCancel={(e) => finishPointerInteraction(e, true)}
          onPointerLeave={() => setEraserCursor(null)}
          style={{
            width: `${virtualWidth}px`,
            height: `${pageHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            touchAction: drawingTouchAction,
            WebkitUserSelect: tool === "select" ? "auto" : "none",
            userSelect: tool === "select" ? "auto" : "none",
            WebkitTouchCallout: "none",
            ...getTemplateStyle(activePage.paperTemplate),
          }}
          className={`relative rounded-2xl border shadow-md overflow-hidden ${
            darkPaper ? "border-[#2F3643]" : "border-[#D8D4C9]"
          } ${
            tool === "pen" || tool === "highlighter"
              ? "cursor-crosshair"
              : tool === "eraser"
                ? "cursor-none"
                : "cursor-default"
          }`}
        >
          {/* Optional PDF / Custom Template Background Image */}
          {resolvedBgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedBgUrl}
              alt="พื้นหลังเอกสาร"
              className="pointer-events-none absolute inset-0 z-0 h-full w-full object-fill select-none"
            />
          )}
          {/* Page watermark badge */}
          <div
            className={`pointer-events-none absolute right-5 top-3 z-10 font-mono text-[11px] font-medium ${
              darkPaper ? "text-slate-500" : "text-stone-400"
            }`}
          >
            หน้า {pageIndex + 1} / {totalPages}
          </div>

          {/* ShortNote Rapid Capture Strip (shown on Page 1 of ShortNotes) */}
          {notebook.kind === "shortnote" && isFirstPage && (
            <div
              data-canvas-item="true"
              data-paper-card="true"
              style={{ pointerEvents: tool === "select" ? "auto" : "none" }}
              className="relative z-20 mx-6 mt-6 rounded-2xl border border-amber-200 bg-[#FFFBEB] p-4 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-900">
                  ⚡ ShortNote ด่วน (พิมพ์บันทึกสั้นๆ แล้วเขียนปากกาหรือแนบรูป/คลิปด้านล่างต่อได้ทันที)
                </span>
              </div>
              <textarea
                value={notebook.quickBody || ""}
                onChange={(e) => onUpdateQuickBody(e.target.value)}
                rows={3}
                placeholder="จดไอเดียเร่งด่วน รายการซื้อของ หรือโน้ตสั้นๆ ที่นี่..."
                className="w-full resize-y rounded-xl border border-amber-200 bg-white px-3.5 py-2.5 text-sm text-[#1C1B18] placeholder:text-stone-400 focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {/* Items Layer */}
          {visibleItems.map((item) => {
            const isSelected = selectedItemId === item.id;
            const isEditing = editingItemId === item.id;
            const editableTextItem =
              item.type === "text" ||
              item.type === "sticky" ||
              item.type === "meeting_card" ||
              item.type === "shape";

            return (
              <div
                key={item.id}
                data-canvas-item="true"
                data-paper-card="true"
                style={{
                  left: `${item.x}px`,
                  top: `${item.y}px`,
                  width: `${item.width}px`,
                  height: `${item.height}px`,
                  zIndex: item.zIndex + 10,
                  pointerEvents: tool === "select" ? "auto" : "none",
                }}
                onPointerDown={(e) => {
                  if (tool !== "select") return;
                  if (
                    (e.target as HTMLElement).closest(
                      "[data-item-control='true']"
                    ) ||
                    isEditing
                  ) {
                    return;
                  }
                  e.stopPropagation();
                  setSelectedItemId(item.id);
                  itemActionRef.current = {
                    mode: "move",
                    item,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    draft: item,
                  };
                }}
                onDoubleClick={(e) => {
                  if (!editableTextItem) return;
                  e.stopPropagation();
                  setSelectedItemId(item.id);
                  setEditingItemId(item.id);
                }}
                className={`absolute select-none ${
                  isSelected
                    ? "ring-2 ring-accent ring-offset-2 rounded-xl"
                    : ""
                }`}
              >
                {/* Floating Item Mini-Toolbar */}
                {isSelected && (
                  <div
                    data-item-control="true"
                    className="no-print absolute -top-11 left-0 flex items-center gap-1 rounded-xl border border-line bg-white px-2 py-1 shadow-lg z-40 whitespace-nowrap"
                  >
                    {editableTextItem && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingItemId(isEditing ? null : item.id)
                        }
                        className="rounded-md px-1.5 py-1 text-[11px] font-medium text-[#1C1B18] hover:bg-stone-100 inline-flex items-center gap-1"
                      >
                        <Edit3 className="h-3 w-3 text-accent" />
                        <span>{isEditing ? "เสร็จ" : "แก้ข้อความ"}</span>
                      </button>
                    )}

                    {(item.type === "sticky" || item.type === "shape") && (
                      <div className="flex items-center gap-1 px-1 border-l border-stone-200">
                        {STICKY_COLORS.slice(0, 5).map((sc) => (
                          <button
                            key={sc.bg}
                            type="button"
                            onClick={() =>
                              onUpdateItem({
                                ...item,
                                bgColor: sc.bg,
                                updatedAt: Date.now(),
                              })
                            }
                            style={{ backgroundColor: sc.bg }}
                            className="h-4 w-4 rounded-full border border-black/15"
                            title={sc.name}
                          />
                        ))}
                      </div>
                    )}

                    {item.type === "table" && item.tableData && (
                      <div className="flex items-center gap-1 px-1 border-l border-stone-200">
                        <button
                          type="button"
                          onClick={() => {
                            const rows = item.tableData!.rows;
                            const cols = Math.max(1, rows[0]?.length || 3);
                            onUpdateItem({
                              ...item,
                              height: item.height + 42,
                              tableData: {
                                ...item.tableData!,
                                rows: [...rows, new Array(cols).fill("")],
                              },
                              updatedAt: Date.now(),
                            });
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 hover:bg-teal-50 inline-flex items-center gap-0.5"
                          title="เพิ่มแถว"
                        >
                          <Rows className="h-3 w-3" />
                          +แถว
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const rows = item.tableData!.rows;
                            if (rows.length <= 2) return;
                            onUpdateItem({
                              ...item,
                              height: Math.max(110, item.height - 42),
                              tableData: {
                                ...item.tableData!,
                                rows: rows.slice(0, -1),
                              },
                              updatedAt: Date.now(),
                            });
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100"
                          title="ลบแถวท้ายสุด"
                        >
                          -แถว
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextRows = item.tableData!.rows.map((r) => [
                              ...r,
                              "",
                            ]);
                            onUpdateItem({
                              ...item,
                              width: Math.min(virtualWidth - item.x, item.width + 110),
                              tableData: { ...item.tableData!, rows: nextRows },
                              updatedAt: Date.now(),
                            });
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-0.5"
                          title="เพิ่มคอลัมน์"
                        >
                          <Columns className="h-3 w-3" />
                          +คอลัมน์
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const rows = item.tableData!.rows;
                            if ((rows[0]?.length || 0) <= 2) return;
                            onUpdateItem({
                              ...item,
                              width: Math.max(200, item.width - 100),
                              tableData: {
                                ...item.tableData!,
                                rows: rows.map((r) => r.slice(0, -1)),
                              },
                              updatedAt: Date.now(),
                            });
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100"
                          title="ลบคอลัมน์ท้ายสุด"
                        >
                          -คอลัมน์
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const csv =
                              "\uFEFF" +
                              item
                                .tableData!.rows.map((row) =>
                                  row
                                    .map(
                                      (cell) =>
                                        `"${String(cell || "").replace(/"/g, '""')}"`
                                    )
                                    .join(",")
                                )
                                .join("\n");
                            downloadTextFile(
                              csv,
                              `${sanitizeFileName(notebook.title)}-table.csv`,
                              "text/csv;charset=utf-8;"
                            );
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
                          title="ส่งออกตารางเป็น CSV"
                        >
                          CSV
                        </button>
                      </div>
                    )}

                    {editableTextItem && (
                      <div className="flex items-center gap-0.5 px-1 border-l border-stone-200">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateItem({
                              ...item,
                              fontSize: Math.max(12, (item.fontSize || 16) - 2),
                              updatedAt: Date.now(),
                            })
                          }
                          className="rounded p-1 text-stone-600 hover:bg-stone-100"
                          title="ลดขนาดตัวอักษร"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateItem({
                              ...item,
                              fontSize: Math.min(36, (item.fontSize || 16) + 2),
                              updatedAt: Date.now(),
                            })
                          }
                          className="rounded p-1 text-stone-600 hover:bg-stone-100"
                          title="เพิ่มขนาดตัวอักษร"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateItem({
                          ...item,
                          zIndex: maxZIndex + 1,
                          updatedAt: Date.now(),
                        })
                      }
                      className="rounded p-1 text-stone-600 hover:bg-stone-100 border-l border-stone-200 pl-1.5"
                      title="ย้ายมาด้านหน้า"
                    >
                      <ArrowUpToLine className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItemId(null);
                        setEditingItemId(null);
                        onDeleteItem(item.id);
                      }}
                      className="rounded p-1 text-rose-600 hover:bg-rose-50"
                      title="ลบชิ้นนี้"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {item.type === "sticker" && (
                  <div className="h-full w-full flex flex-col items-center justify-center">
                    <span
                      style={{
                        fontSize: `${Math.max(
                          36,
                          Math.min(item.width, item.height) * 0.62
                        )}px`,
                      }}
                      className="leading-none drop-shadow-sm"
                    >
                      {item.stickerEmoji || "⭐"}
                    </span>
                    {item.stickerLabel && (
                      <span className="mt-1 rounded-full bg-white border border-stone-200 px-2 py-0.5 text-[11px] font-semibold text-[#1C1B18] shadow-sm">
                        {item.stickerLabel}
                      </span>
                    )}
                  </div>
                )}

                {item.type === "shape" && (
                  <div className="relative h-full w-full flex items-center justify-center p-3">
                    <svg
                      viewBox={`0 0 ${item.width} ${item.height}`}
                      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                    >
                      <path
                        d={getShapeSvgPath(
                          item.shapeKind || "rounded",
                          item.width,
                          item.height,
                          3
                        )}
                        fill={item.bgColor || "#EFFAF8"}
                        stroke={item.color || "#0F766E"}
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                      />
                    </svg>
                    {isEditing ? (
                      <textarea
                        autoFocus
                        data-item-control="true"
                        value={item.text || ""}
                        onChange={(e) =>
                          onUpdateItem({
                            ...item,
                            text: e.target.value,
                            updatedAt: Date.now(),
                          })
                        }
                        onBlur={() => setEditingItemId(null)}
                        placeholder="พิมพ์หัวข้อในกรอบ..."
                        style={{ fontSize: `${item.fontSize || 16}px` }}
                        className="relative z-10 h-full w-full resize-none bg-transparent text-center font-semibold text-[#1C1B18] focus:outline-none p-2"
                      />
                    ) : (
                      <p
                        style={{ fontSize: `${item.fontSize || 16}px` }}
                        className="relative z-10 font-semibold text-[#1C1B18] text-center whitespace-pre-wrap break-words px-2"
                      >
                        {item.text || ""}
                      </p>
                    )}
                  </div>
                )}

                {item.type === "text" && (
                  <div
                    style={{
                      backgroundColor: darkPaper
                        ? "rgba(30, 41, 59, 0.72)"
                        : "rgba(255, 255, 255, 0.85)",
                    }}
                    className={`h-full w-full rounded-xl border border-transparent p-2.5 ${
                      darkPaper
                        ? "hover:border-slate-600"
                        : "hover:border-stone-300"
                    }`}
                  >
                    {isEditing ? (
                      <textarea
                        autoFocus
                        data-item-control="true"
                        value={item.text || ""}
                        onChange={(e) =>
                          onUpdateItem({
                            ...item,
                            text: e.target.value,
                            updatedAt: Date.now(),
                          })
                        }
                        onBlur={() => setEditingItemId(null)}
                        placeholder="พิมพ์ข้อความ..."
                        style={{
                          fontSize: `${item.fontSize || 18}px`,
                          color: darkPaper ? "#F3F4F6" : item.color || "#1C1B18",
                        }}
                        className="h-full w-full resize-none bg-transparent leading-relaxed focus:outline-none"
                      />
                    ) : (
                      <p
                        style={{
                          fontSize: `${item.fontSize || 18}px`,
                          color: darkPaper ? "#F3F4F6" : item.color || "#1C1B18",
                        }}
                        className="leading-relaxed whitespace-pre-wrap break-words"
                      >
                        {item.text || "ดับเบิลคลิกเพื่อพิมพ์ข้อความ..."}
                      </p>
                    )}
                  </div>
                )}

                {(item.type === "sticky" || item.type === "meeting_card") && (
                  <div
                    style={{
                      backgroundColor: item.bgColor || "#FEF9C3",
                    }}
                    className="h-full w-full rounded-2xl border border-black/10 p-4 shadow-sm flex flex-col overflow-hidden"
                  >
                    {item.title && (
                      <h4 className="text-sm font-bold text-[#1C1B18] mb-1.5 border-b border-black/10 pb-1.5 shrink-0">
                        {item.title}
                      </h4>
                    )}
                    {isEditing ? (
                      <textarea
                        autoFocus
                        data-item-control="true"
                        value={item.text || ""}
                        onChange={(e) =>
                          onUpdateItem({
                            ...item,
                            text: e.target.value,
                            updatedAt: Date.now(),
                          })
                        }
                        onBlur={() => setEditingItemId(null)}
                        style={{ fontSize: `${item.fontSize || 15}px` }}
                        className="flex-1 w-full resize-none bg-transparent text-[#1C1B18] leading-relaxed focus:outline-none"
                      />
                    ) : (
                      <div
                        style={{ fontSize: `${item.fontSize || 15}px` }}
                        className="flex-1 overflow-y-auto text-[#1C1B18] leading-relaxed whitespace-pre-wrap break-words"
                      >
                        {item.text || "ดับเบิลคลิกเพื่อเขียนโน้ต..."}
                      </div>
                    )}
                  </div>
                )}

                {item.type === "image" && (
                  <div className="h-full w-full rounded-xl overflow-hidden border border-stone-200 bg-white shadow-sm p-1.5">
                    {item.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.dataUrl}
                        alt={item.fileName || "รูปภาพประกอบโน้ต"}
                        className="h-full w-full object-contain rounded-lg pointer-events-none"
                      />
                    ) : null}
                  </div>
                )}

                {(item.type === "video" || item.type === "audio") && (
                  <MediaItemPlayer item={item} />
                )}

                {item.type === "file" && <FileAttachmentCard item={item} />}

                {item.type === "link" && (
                  <div
                    data-paper-card="true"
                    className="h-full w-full rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-accent">
                        <Globe className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 uppercase">
                            {item.linkProvider === "gdrive"
                              ? "Google Drive"
                              : item.linkProvider === "onedrive"
                                ? "OneDrive"
                                : item.linkProvider === "dropbox"
                                  ? "Dropbox"
                                  : item.linkProvider === "pdf"
                                    ? "PDF"
                                    : "ลิงก์เว็บ"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-bold text-[#1C1B18] truncate">
                          {item.title || "ลิงก์เอกสารวิจัย"}
                        </p>
                        <p className="text-[11px] text-stone-500 truncate">
                          {item.linkUrl}
                        </p>
                      </div>
                    </div>

                    {item.linkUrl && (
                      <a
                        data-item-control="true"
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-accent-dark"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>เปิดดู / ดาวน์โหลดในเบราว์เซอร์</span>
                      </a>
                    )}
                  </div>
                )}

                {item.type === "youtube" && (
                  <div
                    data-paper-card="true"
                    className="h-full w-full rounded-2xl border border-rose-200 bg-white shadow-sm overflow-hidden flex flex-col"
                  >
                    <div className="flex items-center justify-between gap-2 bg-rose-50 border-b border-rose-100 px-3 py-1.5 shrink-0 cursor-move">
                      <span className="text-xs font-bold text-rose-900 truncate">
                        ▶ {item.title || "วิดีโอ YouTube"}
                      </span>
                      {item.linkUrl && (
                        <a
                          data-item-control="true"
                          href={item.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-rose-700 hover:underline shrink-0"
                        >
                          เปิด YouTube
                        </a>
                      )}
                    </div>
                    {item.youtubeId && (
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                          item.youtubeId
                        )}?rel=0${
                          item.youtubeStart ? `&start=${item.youtubeStart}` : ""
                        }`}
                        title={item.title || "YouTube Video"}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full flex-1 border-0 bg-black"
                      />
                    )}
                  </div>
                )}

                {item.type === "table" && item.tableData && (
                  <div
                    data-paper-card="true"
                    className="h-full w-full rounded-xl border border-slate-300 bg-white shadow-sm overflow-auto"
                  >
                    <table className="w-full h-full border-collapse text-xs">
                      <tbody>
                        {item.tableData.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => {
                              const isHeader = rIdx === 0;
                              return (
                                <td
                                  key={cIdx}
                                  style={
                                    isHeader
                                      ? {
                                          backgroundColor:
                                            item.tableData?.headerBg ||
                                            "#0F766E",
                                          color: "#FFFFFF",
                                        }
                                      : undefined
                                  }
                                  className={`border border-slate-200 p-1.5 align-top ${
                                    isHeader
                                      ? "font-bold"
                                      : rIdx % 2 === 1
                                        ? "bg-white text-[#1C1B18]"
                                        : "bg-[#F8F7F4] text-[#1C1B18]"
                                  }`}
                                >
                                  <input
                                    type="text"
                                    data-item-control="true"
                                    value={cell}
                                    readOnly={tool !== "select"}
                                    onChange={(e) => {
                                      const nextRows =
                                        item.tableData!.rows.map((rw, ri) =>
                                          ri === rIdx
                                            ? rw.map((v, ci) =>
                                                ci === cIdx ? e.target.value : v
                                              )
                                            : rw
                                        );
                                      onUpdateItem({
                                        ...item,
                                        tableData: {
                                          ...item.tableData!,
                                          rows: nextRows,
                                        },
                                        updatedAt: Date.now(),
                                      });
                                    }}
                                    placeholder={isHeader ? "หัวข้อ" : "..."}
                                    className={`w-full bg-transparent text-xs focus:outline-none ${
                                      isHeader
                                        ? "text-white placeholder:text-white/60 font-semibold"
                                        : "text-[#1C1B18] placeholder:text-stone-300"
                                    }`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {isSelected && (
                  <div
                    data-item-control="true"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      itemActionRef.current = {
                        mode: "resize",
                        item,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        draft: item,
                      };
                    }}
                    className="no-print absolute -bottom-2 -right-2 h-5 w-5 rounded-full bg-accent border-2 border-white shadow cursor-nwse-resize"
                    title="ลากเพื่อปรับขนาด"
                  />
                )}
              </div>
            );
          })}

          {/* Vector SVG Ink Layer */}
          <svg
            ref={svgExportRef}
            width={virtualWidth}
            height={pageHeight}
            viewBox={`0 0 ${virtualWidth} ${pageHeight}`}
            xmlns="http://www.w3.org/2000/svg"
            className="pointer-events-none absolute inset-0 z-30"
          >
            {visibleStrokes.map((stroke) => (
              <CommittedStrokePath key={stroke.id} stroke={stroke} />
            ))}

            <path
              ref={livePathRef}
              d=""
              fill={color}
              fillOpacity={tool === "highlighter" ? 0.36 : 1}
            />
          </svg>

          {/* Visual Eraser Ring Cursor */}
          {tool === "eraser" && eraserCursor && (
            <div
              data-eraser-ring="true"
              style={{
                left: `${eraserCursor.x - eraserSize}px`,
                top: `${eraserCursor.y - eraserSize}px`,
                width: `${eraserSize * 2}px`,
                height: `${eraserSize * 2}px`,
              }}
              className="pointer-events-none absolute z-40 rounded-full border-2 border-rose-500 bg-rose-500/10"
            />
          )}

          {/* Live Remote Collaborator Cursors */}
          {peers
            .filter((p) => p.x >= 0 && p.y >= 0)
            .map((peer) => (
              <div
                key={peer.peerId}
                style={{
                  transform: `translate(${peer.x}px, ${peer.y}px)`,
                }}
                className="pointer-events-none absolute left-0 top-0 z-40 transition-transform duration-75"
              >
                <div
                  style={{ backgroundColor: peer.color }}
                  className="h-3 w-3 rounded-full ring-2 ring-white shadow"
                />
                <span
                  style={{ backgroundColor: peer.color }}
                  className="mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white shadow whitespace-nowrap"
                >
                  {peer.name}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Bottom Page Actions: Add New Page + Extend Current Page */}
      <div className="no-print mx-auto mt-4 flex max-w-[1280px] flex-wrap items-center justify-center gap-2.5 pb-8">
        <button
          type="button"
          onClick={onAddPage}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-accent-dark transition-colors"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          <span>{isSlide ? "เพิ่มสไลด์หน้าใหม่" : "เพิ่มหน้ากระดาษใหม่"}</span>
        </button>

        {!isSlide && (
          <button
            type="button"
            onClick={onExtendPage}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-paper transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-accent" />
            <span>เพิ่มความยาวหน้านี้ (+1,000 px)</span>
          </button>
        )}
      </div>

      {/* Hold-to-Snap feedback pill */}
      {snappedPill && (
        <div className="no-print fixed top-44 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg">
          <Sparkles className="h-3.5 w-3.5" />
          <span>ดัดเป็น{snappedPill}อัตโนมัติ</span>
        </div>
      )}

      {/* Floating Zoom Pill */}
      <div className="no-print fixed bottom-4 right-4 z-30 inline-flex items-center gap-1 rounded-full border border-line bg-white/95 px-2 py-1 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() =>
            setManualScale(Math.max(0.35, Number((scale - 0.1).toFixed(2))))
          }
          className="rounded-full p-1 text-ink hover:bg-paper"
          title="ย่อหน้ากระดาษ"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="font-mono text-[11px] font-semibold text-ink min-w-[42px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() =>
            setManualScale(Math.min(1.5, Number((scale + 0.1).toFixed(2))))
          }
          className="rounded-full p-1 text-ink hover:bg-paper"
          title="ขยายหน้ากระดาษ"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setManualScale(null)}
          className="rounded-full p-1 text-accent hover:bg-accent-soft"
          title="จัดหน้ากระดาษพอดีจอ"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
