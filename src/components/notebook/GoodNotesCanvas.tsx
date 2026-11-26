"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpToLine,
  Edit3,
  Maximize2,
  Minus,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  STICKY_COLORS,
  type CanvasItem,
  type InkStroke,
  type NotebookTool,
  type PaperTemplate,
  type PeerPresence,
  type ShootNotebook,
  type StrokePoint,
} from "../../types/notebook";
import { hitTestStroke } from "../../lib/media-utils";
import { strokePointsToSvgPath } from "../../lib/notebook-crdt";
import { getMediaBlob } from "../../lib/storage";

interface GoodNotesCanvasProps {
  notebook: ShootNotebook;
  tool: NotebookTool;
  color: string;
  size: number;
  palmRejection: boolean;
  peers: PeerPresence[];
  svgExportRef: React.RefObject<SVGSVGElement | null>;
  onAddStroke: (stroke: InkStroke) => void;
  onEraseStrokes: (strokeIds: string[]) => void;
  onUpdateItem: (item: CanvasItem) => void;
  onDeleteItem: (itemId: string) => void;
  onUpdateQuickBody: (quickBody: string) => void;
  onExtendPage: () => void;
  onCursorMove: (x: number, y: number) => void;
}

const VIRTUAL_WIDTH = 1000;

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
    <div className="h-full w-full flex flex-col justify-center gap-1.5 rounded-xl border border-line bg-white p-3 shadow-sm">
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

export function GoodNotesCanvas({
  notebook,
  tool,
  color,
  size,
  palmRejection,
  peers,
  svgExportRef,
  onAddStroke,
  onEraseStrokes,
  onUpdateItem,
  onDeleteItem,
  onUpdateQuickBody,
  onExtendPage,
  onCursorMove,
}: GoodNotesCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const [scale, setScale] = useState(1);
  const [manualScale, setManualScale] = useState<number | null>(null);

  // Active ink drawing
  const [livePoints, setLivePoints] = useState<StrokePoint[] | null>(null);
  const [liveStylus, setLiveStylus] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);
  const erasedInDragRef = useRef<Set<string>>(new Set());
  const lastCursorSentRef = useRef(0);

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
      const next = Math.min(1, Number((avail / VIRTUAL_WIDTH).toFixed(3)));
      setScale(next);
    };

    updateFit();
    const ro = new ResizeObserver(updateFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [manualScale]);

  const visibleStrokes = useMemo(
    () => notebook.strokes.filter((s) => !s.deleted),
    [notebook.strokes]
  );

  const visibleItems = useMemo(() => {
    return notebook.items
      .filter((i) => !i.deleted)
      .map((i) => (draftItemOverlay?.id === i.id ? draftItemOverlay : i))
      .sort((a, b) => a.zIndex - b.zIndex);
  }, [notebook.items, draftItemOverlay]);

  const maxZIndex = useMemo(
    () => Math.max(1, ...notebook.items.map((i) => i.zIndex || 1)),
    [notebook.items]
  );

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(VIRTUAL_WIDTH, (clientX - rect.left) / scale)),
      y: Math.max(
        0,
        Math.min(notebook.pageHeight, (clientY - rect.top) / scale)
      ),
    };
  };

  const liveSvgPath = useMemo(() => {
    if (!livePoints || livePoints.length === 0) return "";
    return strokePointsToSvgPath(livePoints, {
      size,
      tool: tool === "highlighter" ? "highlighter" : "pen",
      isStylus: liveStylus,
    });
  }, [livePoints, size, tool, liveStylus]);

  const handleSurfacePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore item controls
    if ((e.target as HTMLElement).closest("[data-canvas-item='true']")) {
      return;
    }

    // Deselect when clicking blank canvas
    setSelectedItemId(null);
    setEditingItemId(null);

    if (tool === "select") return;
    if (palmRejection && e.pointerType !== "pen") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors
    }
    activePointerIdRef.current = e.pointerId;

    const { x, y } = toCanvasCoords(e.clientX, e.clientY);

    if (tool === "eraser") {
      erasedInDragRef.current.clear();
      const hits = visibleStrokes
        .filter((s) => hitTestStroke(s, x, y, 16))
        .map((s) => s.id);
      if (hits.length > 0) {
        hits.forEach((id) => erasedInDragRef.current.add(id));
        onEraseStrokes(hits);
      }
      return;
    }

    const isStylus = e.pointerType === "pen";
    const pressure =
      isStylus && Number.isFinite(e.pressure) && e.pressure > 0
        ? e.pressure
        : 0.5;
    setLiveStylus(isStylus);
    setLivePoints([[x, y, pressure]]);
  };

  const handleSurfacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);

    const now = Date.now();
    if (now - lastCursorSentRef.current > 75) {
      lastCursorSentRef.current = now;
      onCursorMove(x, y);
    }

    // Handle active item move/resize
    if (itemActionRef.current) {
      const act = itemActionRef.current;
      const dx = (e.clientX - act.startClientX) / scale;
      const dy = (e.clientY - act.startClientY) / scale;

      const updated: CanvasItem =
        act.mode === "move"
          ? {
              ...act.item,
              x: Math.max(0, Math.min(VIRTUAL_WIDTH - 40, Math.round(act.item.x + dx))),
              y: Math.max(0, Math.min(notebook.pageHeight - 40, Math.round(act.item.y + dy))),
              updatedAt: Date.now(),
            }
          : {
              ...act.item,
              width: Math.max(64, Math.min(VIRTUAL_WIDTH - act.item.x, Math.round(act.item.width + dx))),
              height: Math.max(48, Math.round(act.item.height + dy)),
              updatedAt: Date.now(),
            };
      act.draft = updated;
      setDraftItemOverlay(updated);
      return;
    }

    if (activePointerIdRef.current !== e.pointerId) return;
    if (tool === "select") return;
    if (palmRejection && e.pointerType !== "pen") return;

    if (tool === "eraser") {
      const hits = visibleStrokes
        .filter(
          (s) =>
            !erasedInDragRef.current.has(s.id) && hitTestStroke(s, x, y, 16)
        )
        .map((s) => s.id);
      if (hits.length > 0) {
        hits.forEach((id) => erasedInDragRef.current.add(id));
        onEraseStrokes(hits);
      }
      return;
    }

    if (!livePoints) return;
    const isStylus = e.pointerType === "pen";
    const pressure =
      isStylus && Number.isFinite(e.pressure) && e.pressure > 0
        ? e.pressure
        : 0.5;
    setLivePoints((prev) => (prev ? [...prev, [x, y, pressure]] : [[x, y, pressure]]));
  };

  const finishPointerInteraction = (e: React.PointerEvent<HTMLDivElement>) => {
    if (itemActionRef.current) {
      const finished = itemActionRef.current.draft;
      itemActionRef.current = null;
      setDraftItemOverlay(null);
      onUpdateItem(finished);
      return;
    }

    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;

    if (tool === "eraser") {
      erasedInDragRef.current.clear();
      return;
    }

    if (livePoints && livePoints.length > 0) {
      const stroke: InkStroke = {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `str-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tool: tool === "highlighter" ? "highlighter" : "pen",
        color,
        size,
        opacity: tool === "highlighter" ? 0.36 : 1,
        isStylus: liveStylus,
        points: livePoints,
        updatedAt: Date.now(),
      };
      setLivePoints(null);
      onAddStroke(stroke);
    } else {
      setLivePoints(null);
    }
  };

  const drawingTouchAction =
    tool === "select" || palmRejection ? "pan-y pinch-zoom" : "none";

  return (
    <div
      ref={viewportRef}
      className="relative flex-1 overflow-auto bg-[#ECEAE2] px-3 py-5 sm:px-6"
    >
      {/* Scaled Wrapper */}
      <div
        className="mx-auto transition-transform duration-100"
        style={{
          width: `${Math.round(VIRTUAL_WIDTH * scale)}px`,
          height: `${Math.round(notebook.pageHeight * scale)}px`,
        }}
      >
        <div
          ref={surfaceRef}
          onPointerDown={handleSurfacePointerDown}
          onPointerMove={handleSurfacePointerMove}
          onPointerUp={finishPointerInteraction}
          onPointerCancel={finishPointerInteraction}
          style={{
            width: `${VIRTUAL_WIDTH}px`,
            height: `${notebook.pageHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            touchAction: drawingTouchAction,
            ...getTemplateStyle(notebook.paperTemplate),
          }}
          className={`relative rounded-2xl border border-[#D8D4C9] shadow-md overflow-hidden ${
            tool === "pen" || tool === "highlighter"
              ? "cursor-crosshair"
              : tool === "eraser"
                ? "cursor-cell"
                : "cursor-default"
          }`}
        >
          {/* ShortNote Rapid Capture Strip */}
          {notebook.kind === "shortnote" && (
            <div
              data-canvas-item="true"
              className="relative z-20 mx-6 mt-6 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm space-y-2"
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
                className="w-full resize-y rounded-xl border border-amber-200 bg-white/95 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {/* Items Layer (Text, Sticky, Stickers, Shapes, Images, Video/Audio Clips, Meeting Cards) */}
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
                style={{
                  left: `${item.x}px`,
                  top: `${item.y}px`,
                  width: `${item.width}px`,
                  height: `${item.height}px`,
                  zIndex: item.zIndex + 10,
                  pointerEvents:
                    tool === "select" || isSelected ? "auto" : "none",
                }}
                onPointerDown={(e) => {
                  if (tool !== "select" && !isSelected) return;
                  if (
                    (e.target as HTMLElement).closest("[data-item-control='true']") ||
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
                {/* Floating Item Mini-Toolbar when selected */}
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
                        className="rounded-md px-1.5 py-1 text-[11px] font-medium text-ink hover:bg-paper inline-flex items-center gap-1"
                      >
                        <Edit3 className="h-3 w-3 text-accent" />
                        <span>{isEditing ? "เสร็จ" : "แก้ข้อความ"}</span>
                      </button>
                    )}

                    {(item.type === "sticky" || item.type === "shape") && (
                      <div className="flex items-center gap-1 px-1 border-l border-line">
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

                    {editableTextItem && (
                      <div className="flex items-center gap-0.5 px-1 border-l border-line">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateItem({
                              ...item,
                              fontSize: Math.max(12, (item.fontSize || 16) - 2),
                              updatedAt: Date.now(),
                            })
                          }
                          className="rounded p-1 text-muted hover:bg-paper hover:text-ink"
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
                          className="rounded p-1 text-muted hover:bg-paper hover:text-ink"
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
                      className="rounded p-1 text-muted hover:bg-paper hover:text-ink border-l border-line pl-1.5"
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

                {/* Item Content Rendering */}
                {item.type === "sticker" && (
                  <div className="h-full w-full flex flex-col items-center justify-center">
                    <span
                      style={{
                        fontSize: `${Math.max(36, Math.min(item.width, item.height) * 0.62)}px`,
                      }}
                      className="leading-none drop-shadow-sm"
                    >
                      {item.stickerEmoji || "⭐"}
                    </span>
                    {item.stickerLabel && (
                      <span className="mt-1 rounded-full bg-white/90 border border-line px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm">
                        {item.stickerLabel}
                      </span>
                    )}
                  </div>
                )}

                {item.type === "shape" && (
                  <div
                    style={{
                      backgroundColor: item.bgColor || "#EFFAF8",
                      borderColor: item.color || "#0F766E",
                      borderRadius:
                        item.shapeKind === "circle"
                          ? "9999px"
                          : item.shapeKind === "rect"
                            ? "4px"
                            : item.shapeKind === "banner"
                              ? "12px"
                              : "18px",
                    }}
                    className={`h-full w-full border-2 flex items-center justify-center p-3 shadow-sm ${
                      item.shapeKind === "banner" ? "border-l-8" : ""
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
                        placeholder="พิมพ์หัวข้อในกรอบ..."
                        style={{ fontSize: `${item.fontSize || 16}px` }}
                        className="h-full w-full resize-none bg-transparent text-center font-semibold text-ink focus:outline-none"
                      />
                    ) : (
                      <p
                        style={{ fontSize: `${item.fontSize || 16}px` }}
                        className="font-semibold text-ink text-center whitespace-pre-wrap break-words"
                      >
                        {item.text || ""}
                      </p>
                    )}
                  </div>
                )}

                {item.type === "text" && (
                  <div className="h-full w-full rounded-xl bg-white/75 border border-transparent hover:border-line/80 p-2.5">
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
                          color: item.color || "#1C1B18",
                        }}
                        className="h-full w-full resize-none bg-transparent leading-relaxed focus:outline-none"
                      />
                    ) : (
                      <p
                        style={{
                          fontSize: `${item.fontSize || 18}px`,
                          color: item.color || "#1C1B18",
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
                      <h4 className="text-sm font-bold text-ink mb-1.5 border-b border-black/10 pb-1.5 shrink-0">
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
                        className="flex-1 w-full resize-none bg-transparent text-ink leading-relaxed focus:outline-none"
                      />
                    ) : (
                      <div
                        style={{ fontSize: `${item.fontSize || 15}px` }}
                        className="flex-1 overflow-y-auto text-ink leading-relaxed whitespace-pre-wrap break-words"
                      >
                        {item.text || "ดับเบิลคลิกเพื่อเขียนโน้ต..."}
                      </div>
                    )}
                  </div>
                )}

                {item.type === "image" && (
                  <div className="h-full w-full rounded-xl overflow-hidden border border-line bg-white shadow-sm p-1.5">
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

                {/* Resize Handle */}
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

          {/* Vector SVG Ink Layer (Apple Pencil & Highlighters) */}
          <svg
            ref={svgExportRef}
            width={VIRTUAL_WIDTH}
            height={notebook.pageHeight}
            viewBox={`0 0 ${VIRTUAL_WIDTH} ${notebook.pageHeight}`}
            xmlns="http://www.w3.org/2000/svg"
            className="pointer-events-none absolute inset-0 z-30"
          >
            {visibleStrokes.map((stroke) => {
              const d = strokePointsToSvgPath(stroke.points, {
                size: stroke.size,
                tool: stroke.tool,
                isStylus: stroke.isStylus,
              });
              if (!d) return null;
              return (
                <path
                  key={stroke.id}
                  d={d}
                  fill={stroke.color}
                  fillOpacity={stroke.opacity}
                />
              );
            })}

            {liveSvgPath && (
              <path
                d={liveSvgPath}
                fill={color}
                fillOpacity={tool === "highlighter" ? 0.36 : 1}
              />
            )}
          </svg>

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

      {/* Extend Long Note Height Button */}
      <div className="no-print mx-auto mt-4 flex max-w-[1000px] items-center justify-center">
        <button
          type="button"
          onClick={onExtendPage}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-paper"
        >
          <Plus className="h-3.5 w-3.5 text-accent" />
          <span>เพิ่มความยาวหน้ากระดาษ (+1,000 px สำหรับจดโน้ตยาว)</span>
        </button>
      </div>

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
