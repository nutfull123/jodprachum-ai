"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  PencilLine,
  Radio,
  ShieldCheck,
} from "lucide-react";
import {
  GOODNOTES_COLORS,
  HIGHLIGHTER_COLORS,
  type CanvasItem,
  type InkStroke,
  type NotebookTool,
  type PaperTemplate,
  type PeerPresence,
  type ShapeKind,
  type ShootNotebook,
} from "../../types/notebook";
import {
  compressImageToDataUrl,
  blobToBase64,
  base64ToBlob,
} from "../../lib/media-utils";
import {
  createEmptyNotebook,
  generateRoomCode,
  mergeNotebook,
  strokePointsToSvgPath,
} from "../../lib/notebook-crdt";
import {
  createRoomSyncSession,
  type NotebookDelta,
  type RoomSyncSession,
  type RoomSyncStatus,
} from "../../lib/realtime-sync";
import {
  getDisplayName,
  saveMediaBlob,
  saveNotebook,
  setDisplayName,
} from "../../lib/storage";
import { downloadTextFile, sanitizeFileName } from "../../lib/export-utils";
import { GoodNotesCanvas } from "./GoodNotesCanvas";
import { NotebookSidebar } from "./NotebookSidebar";
import { NotebookToolbar } from "./NotebookToolbar";
import { ShareRoomModal } from "./ShareRoomModal";

interface ShootNoteWorkspaceProps {
  notebooks: ShootNotebook[];
  activeNotebookId: string | null;
  initialRoomCode?: string;
  sidebarMobileOpen: boolean;
  onCloseSidebarMobile: () => void;
  onSelectNotebook: (id: string) => void;
  onUpsertNotebook: (nb: ShootNotebook) => void;
  onDeleteNotebook: (id: string) => void;
}

export function ShootNoteWorkspace({
  notebooks,
  activeNotebookId,
  initialRoomCode,
  sidebarMobileOpen,
  onCloseSidebarMobile,
  onSelectNotebook,
  onUpsertNotebook,
  onDeleteNotebook,
}: ShootNoteWorkspaceProps) {
  const activeNotebook = useMemo(
    () => notebooks.find((n) => n.id === activeNotebookId) || null,
    [notebooks, activeNotebookId]
  );

  // Tool state
  const [tool, setTool] = useState<NotebookTool>("pen");
  const [penColor, setPenColor] = useState<string>(GOODNOTES_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState<string>(
    HIGHLIGHTER_COLORS[0]
  );
  const [penSize, setPenSize] = useState<number>(6);
  const [highlightSize, setHighlightSize] = useState<number>(22);
  const [palmRejection, setPalmRejection] = useState<boolean>(false);

  // Undo/Redo snapshots per notebook edit session
  const [undoStack, setUndoStack] = useState<ShootNotebook[]>([]);
  const [redoStack, setRedoStack] = useState<ShootNotebook[]>([]);

  // Live Share / P2P Room state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [collabName, setCollabName] = useState("ฉัน");
  const [syncStatus, setSyncStatus] = useState<RoomSyncStatus>("offline");
  const [peers, setPeers] = useState<PeerPresence[]>([]);
  const [savedToast, setSavedToast] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const syncSessionRef = useRef<RoomSyncSession | null>(null);
  const activeNotebookRef = useRef<ShootNotebook | null>(activeNotebook);
  activeNotebookRef.current = activeNotebook;

  useEffect(() => {
    const stored = getDisplayName();
    if (stored) setCollabName(stored);
  }, []);

  // Reset undo/redo when switching notebooks
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [activeNotebookId]);

  const commitNotebookUpdate = useCallback(
    (next: ShootNotebook, pushHistory: boolean = true) => {
      if (pushHistory && activeNotebookRef.current) {
        const prevSnap = activeNotebookRef.current;
        setUndoStack((u) => [...u.slice(-24), prevSnap]);
        setRedoStack([]);
      }
      onUpsertNotebook(next);
      saveNotebook(next)
        .then(() => {
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 1200);
        })
        .catch(() => undefined);
    },
    [onUpsertNotebook]
  );

  // Handle incoming ?room= code from invite link
  useEffect(() => {
    if (!initialRoomCode) return;
    const existingWithRoom = notebooks.find(
      (n) => n.roomId === initialRoomCode
    );
    if (existingWithRoom) {
      onSelectNotebook(existingWithRoom.id);
      return;
    }

    const joinedNb: ShootNotebook = {
      ...createEmptyNotebook("notebook", `ห้องแชร์ ${initialRoomCode}`),
      roomId: initialRoomCode,
    };
    onUpsertNotebook(joinedNb);
    saveNotebook(joinedNb).catch(() => undefined);
    onSelectNotebook(joinedNb.id);
    // Only trigger when initialRoomCode appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomCode]);

  // Connect / disconnect P2P + BroadcastChannel room sync when activeNotebook.roomId changes
  const activeRoomId = activeNotebook?.roomId;

  useEffect(() => {
    if (!activeRoomId) {
      syncSessionRef.current?.leave();
      syncSessionRef.current = null;
      setPeers([]);
      setSyncStatus("offline");
      return;
    }

    let cancelled = false;

    const applyRemoteDelta = (delta: NotebookDelta) => {
      const current = activeNotebookRef.current;
      if (!current || current.roomId !== activeRoomId) return;

      let merged: ShootNotebook = current;
      if (delta.type === "stroke") {
        merged = mergeNotebook(current, {
          ...current,
          strokes: [delta.stroke],
          items: [],
        });
      } else if (delta.type === "item") {
        merged = mergeNotebook(current, {
          ...current,
          strokes: [],
          items: [delta.item],
        });
      } else if (delta.type === "meta") {
        merged = mergeNotebook(current, {
          ...current,
          title: delta.title,
          paperTemplate: delta.paperTemplate,
          pageHeight: delta.pageHeight,
          quickBody: delta.quickBody,
          metaUpdatedAt: delta.metaUpdatedAt,
          strokes: [],
          items: [],
        });
      }

      onUpsertNotebook(merged);
      saveNotebook(merged).catch(() => undefined);
    };

    createRoomSyncSession({
      roomId: activeRoomId,
      displayName: collabName || "ฉัน",
      getCurrentNotebook: () => activeNotebookRef.current,
      onFullState: (remoteNb) => {
        if (cancelled) return;
        const current = activeNotebookRef.current;
        if (!current) return;
        const merged = mergeNotebook(current, {
          ...remoteNb,
          id: current.id,
          roomId: activeRoomId,
        });
        onUpsertNotebook(merged);
        saveNotebook(merged).catch(() => undefined);
      },
      onDelta: (delta) => {
        if (cancelled) return;
        applyRemoteDelta(delta);
      },
      onMediaBlob: (mediaId, blob, mimeType, fileName) => {
        if (cancelled) return;
        saveMediaBlob(mediaId, blob, mimeType, fileName).catch(() => undefined);
      },
      onPeersChange: (nextPeers) => {
        if (!cancelled) setPeers(nextPeers);
      },
      onStatusChange: (status) => {
        if (!cancelled) setSyncStatus(status);
      },
    }).then((session) => {
      if (cancelled) {
        session.leave();
      } else {
        syncSessionRef.current = session;
      }
    });

    return () => {
      cancelled = true;
      syncSessionRef.current?.leave();
      syncSessionRef.current = null;
    };
  }, [activeRoomId, collabName, onUpsertNotebook]);

  const handleCreateNotebook = (kind: "notebook" | "shortnote") => {
    const nb = createEmptyNotebook(kind);
    onUpsertNotebook(nb);
    saveNotebook(nb).catch(() => undefined);
    onSelectNotebook(nb.id);
  };

  const handleAddStroke = (stroke: InkStroke) => {
    if (!activeNotebook) return;
    const next: ShootNotebook = {
      ...activeNotebook,
      strokes: [...activeNotebook.strokes, stroke],
      updatedAt: Date.now(),
    };
    commitNotebookUpdate(next, true);
    syncSessionRef.current?.broadcastDelta({ type: "stroke", stroke });
  };

  const handleEraseStrokes = (strokeIds: string[]) => {
    if (!activeNotebook || strokeIds.length === 0) return;
    const idSet = new Set(strokeIds);
    const now = Date.now();
    const updatedStrokes: InkStroke[] = [];
    const changed: InkStroke[] = [];

    for (const s of activeNotebook.strokes) {
      if (idSet.has(s.id) && !s.deleted) {
        const tombstone: InkStroke = { ...s, deleted: true, updatedAt: now };
        updatedStrokes.push(tombstone);
        changed.push(tombstone);
      } else {
        updatedStrokes.push(s);
      }
    }

    if (changed.length === 0) return;
    const next: ShootNotebook = {
      ...activeNotebook,
      strokes: updatedStrokes,
      updatedAt: now,
    };
    commitNotebookUpdate(next, true);
    changed.forEach((stroke) =>
      syncSessionRef.current?.broadcastDelta({ type: "stroke", stroke })
    );
  };

  const addCanvasItem = (partial: Omit<CanvasItem, "id" | "zIndex" | "updatedAt">) => {
    if (!activeNotebook) return;
    const now = Date.now();
    const maxZ = Math.max(
      0,
      ...activeNotebook.items.map((i) => i.zIndex || 0)
    );
    const offset = (activeNotebook.items.length % 5) * 26;
    const item: CanvasItem = {
      ...partial,
      id: `item-${now}-${Math.floor(Math.random() * 1000)}`,
      x: Math.min(720, partial.x + offset),
      y: partial.y + offset,
      zIndex: maxZ + 1,
      updatedAt: now,
    };
    const next: ShootNotebook = {
      ...activeNotebook,
      items: [...activeNotebook.items, item],
      updatedAt: now,
    };
    setTool("select");
    commitNotebookUpdate(next, true);
    syncSessionRef.current?.broadcastDelta({ type: "item", item });
  };

  const handleUpdateItem = (item: CanvasItem) => {
    if (!activeNotebook) return;
    const now = Date.now();
    const next: ShootNotebook = {
      ...activeNotebook,
      items: activeNotebook.items.map((i) => (i.id === item.id ? item : i)),
      updatedAt: now,
    };
    commitNotebookUpdate(next, true);
    syncSessionRef.current?.broadcastDelta({ type: "item", item });
  };

  const handleDeleteItem = (itemId: string) => {
    if (!activeNotebook) return;
    const now = Date.now();
    let deletedItem: CanvasItem | null = null;
    const nextItems = activeNotebook.items.map((i) => {
      if (i.id === itemId) {
        deletedItem = { ...i, deleted: true, updatedAt: now };
        return deletedItem;
      }
      return i;
    });
    const next: ShootNotebook = {
      ...activeNotebook,
      items: nextItems,
      updatedAt: now,
    };
    commitNotebookUpdate(next, true);
    if (deletedItem) {
      syncSessionRef.current?.broadcastDelta({
        type: "item",
        item: deletedItem,
      });
    }
  };

  const updateMeta = (
    patch: Partial<
      Pick<ShootNotebook, "title" | "paperTemplate" | "pageHeight" | "quickBody">
    >,
    pushHistory: boolean = false
  ) => {
    if (!activeNotebook) return;
    const now = Date.now();
    const next: ShootNotebook = {
      ...activeNotebook,
      ...patch,
      metaUpdatedAt: now,
      updatedAt: now,
    };
    commitNotebookUpdate(next, pushHistory);
    syncSessionRef.current?.broadcastDelta({
      type: "meta",
      title: next.title,
      paperTemplate: next.paperTemplate,
      pageHeight: next.pageHeight,
      quickBody: next.quickBody,
      metaUpdatedAt: now,
    });
  };

  const handleUploadImage = async (file: File) => {
    if (!activeNotebook) return;
    try {
      const { dataUrl, width, height } = await compressImageToDataUrl(file);
      const ratio = Math.min(380 / width, 380 / height, 1);
      addCanvasItem({
        type: "image",
        x: 90,
        y: activeNotebook.kind === "shortnote" ? 230 : 120,
        width: Math.max(140, Math.round(width * ratio)),
        height: Math.max(120, Math.round(height * ratio)),
        dataUrl,
        fileName: file.name,
        mimeType: file.type,
      });
    } catch {
      // Ignore unreadable image
    }
  };

  const handleUploadMedia = async (file: File) => {
    if (!activeNotebook) return;
    const mediaId = `media-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const isVideo = file.type.startsWith("video/");
    const mimeType = file.type || (isVideo ? "video/mp4" : "audio/mpeg");

    await saveMediaBlob(mediaId, file, mimeType, file.name).catch(() => undefined);
    addCanvasItem({
      type: isVideo ? "video" : "audio",
      x: 90,
      y: activeNotebook.kind === "shortnote" ? 230 : 140,
      width: isVideo ? 380 : 340,
      height: isVideo ? 240 : 96,
      mediaBlobId: mediaId,
      mimeType,
      fileName: file.name,
    });

    // Sync clip to live room peers if <= 10MB
    syncSessionRef.current
      ?.broadcastMediaBlob(mediaId, file, mimeType, file.name)
      .catch(() => undefined);
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || !activeNotebook) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, activeNotebook]);
    onUpsertNotebook(prev);
    saveNotebook(prev).catch(() => undefined);
    syncSessionRef.current?.broadcastFullState(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !activeNotebook) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, activeNotebook]);
    onUpsertNotebook(next);
    saveNotebook(next).catch(() => undefined);
    syncSessionRef.current?.broadcastFullState(next);
  };

  const handleExportPng = () => {
    if (!activeNotebook) return;
    const width = 1000;
    const height = activeNotebook.pageHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Paper background
    ctx.fillStyle =
      activeNotebook.paperTemplate === "cream" ? "#FDF8EC" : "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    if (
      activeNotebook.paperTemplate === "lined" ||
      activeNotebook.paperTemplate === "cream" ||
      activeNotebook.paperTemplate === "cornell"
    ) {
      ctx.strokeStyle =
        activeNotebook.paperTemplate === "cream" ? "#EDE2C8" : "#E2E8F0";
      ctx.lineWidth = 1;
      for (let y = 36; y < height; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (activeNotebook.paperTemplate === "grid") {
      ctx.strokeStyle = "#E5E7EB";
      ctx.lineWidth = 1;
      for (let x = 28; x < width; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 28; y < height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // 2. Render basic item cards & text
    for (const item of activeNotebook.items
      .filter((i) => !i.deleted)
      .sort((a, b) => a.zIndex - b.zIndex)) {
      if (
        item.type === "sticky" ||
        item.type === "meeting_card" ||
        item.type === "shape"
      ) {
        ctx.fillStyle = item.bgColor || "#FEF9C3";
        ctx.strokeStyle = item.color || "#D6D3C9";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(item.x, item.y, item.width, item.height, 14);
        ctx.fill();
        ctx.stroke();
      }

      if (item.type === "sticker") {
        ctx.font = "48px sans-serif";
        ctx.fillText(item.stickerEmoji || "⭐", item.x + 18, item.y + 56);
      } else if (item.title || item.text) {
        ctx.fillStyle = item.color || "#1C1B18";
        ctx.font = `600 ${item.fontSize || 15}px "IBM Plex Sans Thai", sans-serif`;
        const textBlock = [item.title, item.text].filter(Boolean).join("\n");
        const lines = textBlock.split("\n");
        lines.slice(0, 14).forEach((ln, idx) => {
          ctx.fillText(
            ln.slice(0, 72),
            item.x + 14,
            item.y + 26 + idx * 22,
            item.width - 28
          );
        });
      }
    }

    // 3. Render ink strokes onto canvas
    for (const s of activeNotebook.strokes.filter((st) => !st.deleted)) {
      const pathStr = strokePointsToSvgPath(s.points, {
        size: s.size,
        tool: s.tool,
        isStylus: s.isStylus,
      });
      if (!pathStr) continue;
      ctx.save();
      ctx.globalAlpha = s.opacity;
      ctx.fillStyle = s.color;
      ctx.fill(new Path2D(pathStr));
      ctx.restore();
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFileName(activeNotebook.title)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  const handleExportJson = async () => {
    if (!activeNotebook) return;
    const payload = JSON.stringify(
      { format: "shootnote-v1", notebook: activeNotebook },
      null,
      2
    );
    downloadTextFile(
      payload,
      `${sanitizeFileName(activeNotebook.title)}.shootnote.json`,
      "application/json;charset=utf-8;"
    );
  };

  const handleImportBackup = async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as {
        format?: string;
        notebook?: ShootNotebook;
      };
      const nb = parsed.notebook || (parsed as unknown as ShootNotebook);
      if (!nb || !Array.isArray(nb.strokes) || !Array.isArray(nb.items)) {
        return;
      }
      const imported: ShootNotebook = {
        ...nb,
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `nb-${Date.now()}`,
        roomId: undefined,
        updatedAt: Date.now(),
      };
      onUpsertNotebook(imported);
      await saveNotebook(imported);
      onSelectNotebook(imported.id);
    } catch {
      // Ignore invalid JSON
    }
  };

  const handleCreateRoom = () => {
    if (!activeNotebook) return;
    const code = generateRoomCode();
    const updated: ShootNotebook = {
      ...activeNotebook,
      roomId: code,
      updatedAt: Date.now(),
    };
    onUpsertNotebook(updated);
    saveNotebook(updated).catch(() => undefined);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/?room=${encodeURIComponent(code)}`);
    }
  };

  const handleJoinRoom = (roomCode: string) => {
    const clean = roomCode.trim().toUpperCase();
    if (!clean) return;
    const existing = notebooks.find((n) => n.roomId === clean);
    if (existing) {
      onSelectNotebook(existing.id);
      return;
    }
    const joined: ShootNotebook = {
      ...createEmptyNotebook("notebook", `ห้องแชร์ ${clean}`),
      roomId: clean,
    };
    onUpsertNotebook(joined);
    saveNotebook(joined).catch(() => undefined);
    onSelectNotebook(joined.id);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `/?room=${encodeURIComponent(clean)}`
      );
    }
  };

  const handleLeaveRoom = () => {
    if (!activeNotebook) return;
    const updated: ShootNotebook = {
      ...activeNotebook,
      roomId: undefined,
      updatedAt: Date.now(),
    };
    onUpsertNotebook(updated);
    saveNotebook(updated).catch(() => undefined);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
  };

  const activeColor = tool === "highlighter" ? highlightColor : penColor;
  const activeSize = tool === "highlighter" ? highlightSize : penSize;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1">
      <NotebookSidebar
        notebooks={notebooks}
        activeId={activeNotebookId}
        isOpenMobile={sidebarMobileOpen}
        onCloseMobile={onCloseSidebarMobile}
        onSelect={onSelectNotebook}
        onCreate={handleCreateNotebook}
        onDelete={onDeleteNotebook}
        onImportBackup={handleImportBackup}
      />

      <main className="flex-1 min-w-0 flex flex-col bg-[#ECEAE2]">
        {!activeNotebook ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-2xl border border-line bg-white p-6 text-center shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-ink">
                พร้อมเริ่มสมุดจด ShootNote
              </h2>
              <p className="text-xs text-muted leading-relaxed">
                เลือกสร้างสมุดจดยาวสไตล์ GoodNotes (รองรับ Apple Pencil บน iPad,
                สติกเกอร์, แนบภาพ/คลิป) หรือเปิด ShortNote สำหรับจดด่วน
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCreateNotebook("notebook")}
                  className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:bg-accent-dark"
                >
                  + สมุดจดยาว (GoodNotes)
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateNotebook("shortnote")}
                  className="flex-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  ⚡ ShootNote สั้น
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Notebook Title & Sync Status Strip */}
            <div className="no-print border-b border-line bg-white px-3 py-2 sm:px-5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <PencilLine className="h-4 w-4 text-accent shrink-0" />
                <input
                  type="text"
                  value={activeNotebook.title}
                  onChange={(e) => updateMeta({ title: e.target.value })}
                  aria-label="ชื่อสมุดจด"
                  className="min-w-[140px] flex-1 bg-transparent text-sm sm:text-base font-bold text-ink focus:outline-none focus:bg-paper rounded px-1.5 py-0.5"
                />
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted shrink-0">
                {activeNotebook.roomId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-medium text-emerald-700">
                    <Radio className="h-3 w-3 animate-pulse" />
                    {syncStatus === "connected"
                      ? `Live (${peers.length + 1})`
                      : "กำลังเชื่อมห้อง..."}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  {savedToast ? (
                    <>
                      <Check className="h-3 w-3" />
                      บันทึกในเครื่องแล้ว
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3 w-3" />
                      เก็บในเครื่องอัตโนมัติ
                    </>
                  )}
                </span>
              </div>
            </div>

            <NotebookToolbar
              tool={tool}
              color={activeColor}
              size={activeSize}
              palmRejection={palmRejection}
              paperTemplate={activeNotebook.paperTemplate}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              roomId={activeNotebook.roomId}
              peerCount={peers.length}
              onSelectTool={setTool}
              onChangeColor={(c) => {
                if (tool === "highlighter") setHighlightColor(c);
                else setPenColor(c);
              }}
              onChangeSize={(s) => {
                if (tool === "highlighter") setHighlightSize(s);
                else setPenSize(s);
              }}
              onTogglePalmRejection={() => setPalmRejection((v) => !v)}
              onChangeTemplate={(tpl: PaperTemplate) =>
                updateMeta({ paperTemplate: tpl }, true)
              }
              onInsertText={() =>
                addCanvasItem({
                  type: "text",
                  x: 80,
                  y: activeNotebook.kind === "shortnote" ? 230 : 90,
                  width: 320,
                  height: 110,
                  text: "พิมพ์ข้อความที่นี่...",
                  color: "#1C1B18",
                  fontSize: 18,
                })
              }
              onInsertSticky={() =>
                addCanvasItem({
                  type: "sticky",
                  x: 100,
                  y: activeNotebook.kind === "shortnote" ? 230 : 110,
                  width: 280,
                  height: 220,
                  title: "โน้ตย่อ",
                  text: "",
                  bgColor: "#FEF9C3",
                  color: "#1C1B18",
                  fontSize: 15,
                })
              }
              onInsertSticker={(emoji, label) =>
                addCanvasItem({
                  type: "sticker",
                  x: 140,
                  y: activeNotebook.kind === "shortnote" ? 230 : 120,
                  width: 110,
                  height: 110,
                  stickerEmoji: emoji,
                  stickerLabel: label,
                })
              }
              onInsertShape={(shapeKind: ShapeKind) =>
                addCanvasItem({
                  type: "shape",
                  x: 110,
                  y: activeNotebook.kind === "shortnote" ? 230 : 120,
                  width: shapeKind === "circle" ? 180 : 320,
                  height: shapeKind === "banner" ? 80 : 160,
                  shapeKind,
                  text: shapeKind === "banner" ? "หัวข้อสำคัญ" : "",
                  bgColor: "#EFFAF8",
                  color: "#0F766E",
                  fontSize: 16,
                })
              }
              onUploadImage={handleUploadImage}
              onUploadMedia={handleUploadMedia}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onExportPng={handleExportPng}
              onExportJson={handleExportJson}
              onOpenShareModal={() => setShareModalOpen(true)}
            />

            <GoodNotesCanvas
              notebook={activeNotebook}
              tool={tool}
              color={activeColor}
              size={activeSize}
              palmRejection={palmRejection}
              peers={peers}
              svgExportRef={svgRef}
              onAddStroke={handleAddStroke}
              onEraseStrokes={handleEraseStrokes}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onUpdateQuickBody={(quickBody) => updateMeta({ quickBody })}
              onExtendPage={() =>
                updateMeta(
                  { pageHeight: activeNotebook.pageHeight + 1000 },
                  true
                )
              }
              onCursorMove={(x, y) =>
                syncSessionRef.current?.broadcastCursor(x, y, tool)
              }
            />
          </>
        )}
      </main>

      <ShareRoomModal
        isOpen={shareModalOpen}
        roomId={activeNotebook?.roomId}
        syncStatus={syncStatus}
        peers={peers}
        displayName={collabName}
        onChangeDisplayName={(name) => {
          setCollabName(name);
          setDisplayName(name);
        }}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onLeaveRoom={handleLeaveRoom}
        onClose={() => setShareModalOpen(false)}
      />
    </div>
  );
}
