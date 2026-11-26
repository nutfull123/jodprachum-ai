"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  PencilLine,
  Radio,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  GOODNOTES_COLORS,
  HIGHLIGHTER_COLORS,
  isDarkPaperTemplate,
  type CanvasItem,
  type InkStroke,
  type NotebookPage,
  type NotebookTool,
  type PaperTemplate,
  type PeerPresence,
  type ShapeKind,
  type ShootNotebook,
} from "../../types/notebook";
import { compressImageToDataUrl } from "../../lib/media-utils";
import {
  attachNotebookToRoom,
  createEmptyNotebook,
  createGuestRoomNotebook,
  createNotebookPage,
  ensureNotebookPages,
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
import { JoinRoomPromptModal } from "./JoinRoomPromptModal";
import { NotebookSidebar } from "./NotebookSidebar";
import { NotebookToolbar } from "./NotebookToolbar";
import { ShareRoomModal } from "./ShareRoomModal";

interface ShootNoteWorkspaceProps {
  notebooks: ShootNotebook[];
  activeNotebookId: string | null;
  pendingJoinRoomCode?: string;
  onResolvePendingJoinRoom?: () => void;
  sidebarMobileOpen: boolean;
  onCloseSidebarMobile: () => void;
  onSelectNotebook: (id: string) => void;
  onUpsertNotebook: (nb: ShootNotebook) => void;
  onDeleteNotebook: (id: string) => void;
}

export function ShootNoteWorkspace({
  notebooks,
  activeNotebookId,
  pendingJoinRoomCode,
  onResolvePendingJoinRoom,
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

  // Active pages for current notebook
  const activePages = useMemo(
    () => (activeNotebook ? ensureNotebookPages(activeNotebook) : []),
    [activeNotebook]
  );

  const [activePageId, setActivePageId] = useState<string>("page-1");

  const activePageIndex = useMemo(() => {
    const idx = activePages.findIndex((p) => p.id === activePageId);
    return idx >= 0 ? idx : 0;
  }, [activePages, activePageId]);

  const activePage: NotebookPage | null = activePages[activePageIndex] || null;

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
  const [collabName, setCollabName] = useState("");
  const [syncStatus, setSyncStatus] = useState<RoomSyncStatus>("offline");
  const [peers, setPeers] = useState<PeerPresence[]>([]);
  const [savedToast, setSavedToast] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const syncSessionRef = useRef<RoomSyncSession | null>(null);
  const activeNotebookRef = useRef<ShootNotebook | null>(activeNotebook);
  activeNotebookRef.current = activeNotebook;
  const collabNameRef = useRef(collabName);
  collabNameRef.current = collabName;

  useEffect(() => {
    const stored = getDisplayName();
    if (stored) setCollabName(stored);
  }, []);

  // Reset undo/redo and activePageId when switching notebooks
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    if (activeNotebook) {
      const pages = ensureNotebookPages(activeNotebook);
      setActivePageId(pages[0]?.id || "page-1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Connect / disconnect MQTT-WSS + BroadcastChannel room sync when activeNotebook.roomId changes
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
      } else if (delta.type === "page") {
        merged = mergeNotebook(current, {
          ...current,
          pages: [delta.page],
          strokes: [],
          items: [],
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

      activeNotebookRef.current = merged;
      onUpsertNotebook(merged);
      saveNotebook(merged).catch(() => undefined);
    };

    createRoomSyncSession({
      roomId: activeRoomId,
      getDisplayName: () => collabNameRef.current.trim() || "ฉัน",
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
        activeNotebookRef.current = merged;
        onUpsertNotebook(merged);
        saveNotebook(merged).catch(() => undefined);
        const validPages = ensureNotebookPages(merged);
        setActivePageId((prevPageId) =>
          validPages.some((p) => p.id === prevPageId)
            ? prevPageId
            : validPages[0]?.id || "page-1"
        );
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
  }, [activeRoomId, onUpsertNotebook]);

  const handleCreateNotebook = (kind: "notebook" | "shortnote") => {
    const nb = createEmptyNotebook(kind);
    onUpsertNotebook(nb);
    saveNotebook(nb).catch(() => undefined);
    onSelectNotebook(nb.id);
  };

  const getRawPages = (nb: ShootNotebook): NotebookPage[] => {
    return nb.pages && nb.pages.length > 0 ? nb.pages : ensureNotebookPages(nb);
  };

  const handleAddPage = () => {
    if (!activeNotebook || !activePage) return;
    const rawPages = getRawPages(activeNotebook);
    const maxOrder = Math.max(-1, ...rawPages.map((p) => p.order));
    const newPage = createNotebookPage(
      maxOrder + 1,
      activePage.paperTemplate,
      1600
    );
    const next: ShootNotebook = {
      ...activeNotebook,
      pages: [...rawPages, newPage],
      updatedAt: Date.now(),
    };
    commitNotebookUpdate(next, true);
    setActivePageId(newPage.id);
    syncSessionRef.current?.broadcastDelta({ type: "page", page: newPage });
  };

  const handleDeletePage = (pageIdToDelete: string) => {
    if (!activeNotebook || activePages.length <= 1) return;
    const now = Date.now();
    const rawPages = getRawPages(activeNotebook);
    let tombstone: NotebookPage | null = null;
    const nextPages = rawPages.map((p) => {
      if (p.id === pageIdToDelete) {
        tombstone = { ...p, deleted: true, updatedAt: now };
        return tombstone;
      }
      return p;
    });

    const next: ShootNotebook = {
      ...activeNotebook,
      pages: nextPages,
      updatedAt: now,
    };
    commitNotebookUpdate(next, true);
    if (tombstone) {
      syncSessionRef.current?.broadcastDelta({
        type: "page",
        page: tombstone,
      });
    }

    if (activePageId === pageIdToDelete) {
      const remaining = ensureNotebookPages(next);
      setActivePageId(
        remaining[Math.max(0, activePageIndex - 1)]?.id ||
          remaining[0]?.id ||
          "page-1"
      );
    }
  };

  const updateActivePage = (
    patch: Partial<Pick<NotebookPage, "paperTemplate" | "pageHeight">>,
    pushHistory: boolean = true
  ) => {
    if (!activeNotebook || !activePage) return;
    const now = Date.now();
    const rawPages = getRawPages(activeNotebook);
    const updatedPage: NotebookPage = {
      ...activePage,
      ...patch,
      updatedAt: now,
    };
    const nextPages = rawPages.map((p) =>
      p.id === activePage.id ? updatedPage : p
    );

    const next: ShootNotebook = {
      ...activeNotebook,
      pages: nextPages,
      paperTemplate:
        activePageIndex === 0 && patch.paperTemplate
          ? patch.paperTemplate
          : activeNotebook.paperTemplate,
      pageHeight:
        activePageIndex === 0 && patch.pageHeight
          ? patch.pageHeight
          : activeNotebook.pageHeight,
      updatedAt: now,
    };
    commitNotebookUpdate(next, pushHistory);
    syncSessionRef.current?.broadcastDelta({ type: "page", page: updatedPage });
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

  const addCanvasItem = (
    partial: Omit<CanvasItem, "id" | "pageId" | "zIndex" | "updatedAt">
  ) => {
    if (!activeNotebook || !activePage) return;
    const now = Date.now();
    const maxZ = Math.max(
      0,
      ...activeNotebook.items.map((i) => i.zIndex || 0)
    );
    const pageItemCount = activeNotebook.items.filter(
      (i) =>
        !i.deleted &&
        (i.pageId === activePage.id || (!i.pageId && activePageIndex === 0))
    ).length;
    const offset = (pageItemCount % 5) * 26;
    const item: CanvasItem = {
      ...partial,
      id: `item-${now}-${Math.floor(Math.random() * 1000)}`,
      pageId: activePage.id,
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
        y:
          activeNotebook.kind === "shortnote" && activePageIndex === 0
            ? 230
            : 120,
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
      y:
        activeNotebook.kind === "shortnote" && activePageIndex === 0
          ? 230
          : 140,
      width: isVideo ? 380 : 340,
      height: isVideo ? 240 : 96,
      mediaBlobId: mediaId,
      mimeType,
      fileName: file.name,
    });

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
    if (!activeNotebook || !activePage) return;
    const width = 1000;
    const height = activePage.pageHeight || 1600;
    const tpl = activePage.paperTemplate;
    const dark = isDarkPaperTemplate(tpl);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = dark ? "#181B20" : tpl === "cream" ? "#FDF8EC" : "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    if (
      tpl === "lined" ||
      tpl === "cream" ||
      tpl === "cornell" ||
      tpl === "dark_lined"
    ) {
      ctx.strokeStyle = dark
        ? "#2A303B"
        : tpl === "cream"
          ? "#EDE2C8"
          : "#E2E8F0";
      ctx.lineWidth = 1;
      for (let y = 36; y < height; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (tpl === "grid" || tpl === "dark_grid") {
      ctx.strokeStyle = dark ? "#2A303B" : "#E5E7EB";
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

    const pageItems = activeNotebook.items
      .filter(
        (i) =>
          !i.deleted &&
          (i.pageId === activePage.id || (!i.pageId && activePageIndex === 0))
      )
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const item of pageItems) {
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
        ctx.fillStyle =
          item.type === "text" && dark ? "#F3F4F6" : item.color || "#1C1B18";
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

    const pageStrokes = activeNotebook.strokes.filter(
      (st) =>
        !st.deleted &&
        (st.pageId === activePage.id || (!st.pageId && activePageIndex === 0))
    );

    for (const s of pageStrokes) {
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
      a.download = `${sanitizeFileName(activeNotebook.title)}-p${activePageIndex + 1}.png`;
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

  const handleJoinRoom = (
    roomCode: string,
    options?: { mergeCurrentNotebook?: boolean }
  ) => {
    const clean = roomCode.trim().toUpperCase();
    if (!clean) return;

    if (options?.mergeCurrentNotebook && activeNotebook) {
      const attached = attachNotebookToRoom(activeNotebook, clean);
      onUpsertNotebook(attached);
      saveNotebook(attached).catch(() => undefined);
      onSelectNotebook(attached.id);
      setShareModalOpen(false);
      if (typeof window !== "undefined") {
        window.history.replaceState(
          null,
          "",
          `/?room=${encodeURIComponent(clean)}`
        );
      }
      return;
    }

    const existing = notebooks.find((n) => n.roomId === clean);
    if (existing) {
      onSelectNotebook(existing.id);
      setShareModalOpen(false);
      if (typeof window !== "undefined") {
        window.history.replaceState(
          null,
          "",
          `/?room=${encodeURIComponent(clean)}`
        );
      }
      return;
    }
    const joined = createGuestRoomNotebook(clean);
    onUpsertNotebook(joined);
    saveNotebook(joined).catch(() => undefined);
    onSelectNotebook(joined.id);
    setShareModalOpen(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `/?room=${encodeURIComponent(clean)}`
      );
    }
  };

  const handleConfirmPendingJoin = ({
    displayName,
    mergeNotebookId,
  }: {
    displayName: string;
    mergeNotebookId?: string;
  }) => {
    const cleanName = displayName.trim();
    if (!cleanName || !pendingJoinRoomCode) return;

    setCollabName(cleanName);
    collabNameRef.current = cleanName;
    setDisplayName(cleanName);

    const cleanRoom = pendingJoinRoomCode.trim().toUpperCase();
    if (mergeNotebookId) {
      const target = notebooks.find((n) => n.id === mergeNotebookId);
      if (target) {
        const attached = attachNotebookToRoom(target, cleanRoom);
        onUpsertNotebook(attached);
        saveNotebook(attached).catch(() => undefined);
        onSelectNotebook(attached.id);
        onResolvePendingJoinRoom?.();
        return;
      }
    }

    const existing = notebooks.find((n) => n.roomId === cleanRoom);
    if (existing) {
      onSelectNotebook(existing.id);
    } else {
      const joined = createGuestRoomNotebook(cleanRoom);
      onUpsertNotebook(joined);
      saveNotebook(joined).catch(() => undefined);
      onSelectNotebook(joined.id);
    }
    onResolvePendingJoinRoom?.();
  };

  const handleCancelPendingJoin = () => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
    onResolvePendingJoinRoom?.();
  };

  const candidateLocalNotebooks = useMemo(
    () =>
      notebooks.filter(
        (n) =>
          n.metaUpdatedAt > 0 ||
          n.strokes.length > 0 ||
          n.items.length > 0
      ),
    [notebooks]
  );

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
        {!activeNotebook || !activePage ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-2xl border border-line bg-white p-6 text-center shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-ink">
                พร้อมเริ่มสมุดจด ShootNote
              </h2>
              <p className="text-xs text-muted leading-relaxed">
                เลือกสร้างสมุดจดยาวสไตล์ GoodNotes (รองรับ Apple Pencil บน iPad,
                หลายหน้ากระดาษ, สติกเกอร์, แนบภาพ/คลิป) หรือเปิด ShortNote สำหรับจดด่วน
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
                      : syncStatus === "local"
                        ? `ในเครื่อง (${peers.length + 1}) · กำลังเชื่อมเน็ต`
                        : syncStatus === "connecting"
                          ? "กำลังเชื่อมห้อง..."
                          : "ออฟไลน์"}
                  </span>
                )}
                {palmRejection && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-accent-soft border border-accent/25 px-2 py-0.5 font-medium text-accent-dark">
                    ✏️ โหมด Apple Pencil · ใช้นิ้วเลื่อนหน้าได้
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
              paperTemplate={activePage.paperTemplate}
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
              onChangeTemplate={(tpl: PaperTemplate) => {
                updateActivePage({ paperTemplate: tpl }, true);
                if (isDarkPaperTemplate(tpl) && penColor === "#1C1B18") {
                  setPenColor("#FFFFFF");
                } else if (!isDarkPaperTemplate(tpl) && penColor === "#FFFFFF") {
                  setPenColor("#1C1B18");
                }
              }}
              onInsertText={() =>
                addCanvasItem({
                  type: "text",
                  x: 80,
                  y:
                    activeNotebook.kind === "shortnote" && activePageIndex === 0
                      ? 230
                      : 90,
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
                  y:
                    activeNotebook.kind === "shortnote" && activePageIndex === 0
                      ? 230
                      : 110,
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
                  y:
                    activeNotebook.kind === "shortnote" && activePageIndex === 0
                      ? 230
                      : 120,
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
                  y:
                    activeNotebook.kind === "shortnote" && activePageIndex === 0
                      ? 230
                      : 120,
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

            {/* Multi-Page Navigator Strip */}
            <div className="no-print border-b border-line bg-paper px-3 py-1.5 sm:px-5 flex items-center justify-between gap-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={activePageIndex <= 0}
                  onClick={() =>
                    setActivePageId(activePages[activePageIndex - 1].id)
                  }
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-white text-ink hover:bg-paper disabled:opacity-35"
                  aria-label="หน้าก่อนหน้า"
                  title="หน้าก่อนหน้า"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <span className="font-mono text-[11px] font-semibold text-muted px-1 whitespace-nowrap">
                  หน้า {activePageIndex + 1}/{activePages.length}
                </span>

                <button
                  type="button"
                  disabled={activePageIndex >= activePages.length - 1}
                  onClick={() =>
                    setActivePageId(activePages[activePageIndex + 1].id)
                  }
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-white text-ink hover:bg-paper disabled:opacity-35"
                  aria-label="หน้าถัดไป"
                  title="หน้าถัดไป"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto flex-1 py-0.5">
                {activePages.map((pg, idx) => {
                  const isCurrent = pg.id === activePage.id;
                  return (
                    <div
                      key={pg.id}
                      className={`inline-flex items-center rounded-lg border text-xs font-medium shrink-0 transition-colors ${
                        isCurrent
                          ? "border-accent bg-accent text-white shadow-sm"
                          : "border-line bg-white text-ink hover:bg-accent-soft"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActivePageId(pg.id)}
                        className="px-2.5 py-1 whitespace-nowrap"
                      >
                        หน้า {idx + 1}
                      </button>
                      {activePages.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePage(pg.id);
                          }}
                          className={`pr-1.5 pl-0.5 py-1 hover:opacity-80 ${
                            isCurrent
                              ? "text-white/90"
                              : "text-muted hover:text-rose-600"
                          }`}
                          aria-label={`ลบหน้า ${idx + 1}`}
                          title={`ลบหน้า ${idx + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleAddPage}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                <span>เพิ่มหน้ากระดาษ</span>
              </button>
            </div>

            <GoodNotesCanvas
              notebook={activeNotebook}
              activePage={activePage}
              isFirstPage={activePageIndex === 0}
              pageIndex={activePageIndex}
              totalPages={activePages.length}
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
                updateActivePage(
                  { pageHeight: (activePage.pageHeight || 1600) + 1000 },
                  true
                )
              }
              onAddPage={handleAddPage}
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
        activeNotebookTitle={activeNotebook?.title}
        syncStatus={syncStatus}
        peers={peers}
        displayName={collabName}
        onChangeDisplayName={(name) => {
          setCollabName(name);
          collabNameRef.current = name;
          setDisplayName(name);
          syncSessionRef.current?.announcePresence();
        }}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onLeaveRoom={handleLeaveRoom}
        onForceSync={() => syncSessionRef.current?.requestSync()}
        onClose={() => setShareModalOpen(false)}
      />

      <JoinRoomPromptModal
        roomCode={pendingJoinRoomCode || null}
        initialDisplayName={collabName}
        localNotebooks={candidateLocalNotebooks}
        onConfirm={handleConfirmPendingJoin}
        onCancel={handleCancelPendingJoin}
      />
    </div>
  );
}
