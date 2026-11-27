"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  Eraser,
  FilePlus2,
  Highlighter,
  Home,
  MousePointer2,
  PanelLeft,
  PanelLeftClose,
  PencilLine,
  PenTool,
  Radio,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import {
  GOODNOTES_COLORS,
  HIGHLIGHTER_COLORS,
  SHAPE_CATALOG,
  SLIDE_HEIGHT,
  isDarkPaperTemplate,
  type CanvasItem,
  type CustomPaperTemplate,
  type EraserMode,
  type InkStroke,
  type LinkProvider,
  type NotebookFolder,
  type NotebookPage,
  type NotebookTool,
  type PaperSize,
  type PaperTemplate,
  type PeerPresence,
  type ShapeKind,
  type ShootNotebook,
} from "../../types/notebook";
import { applyPartialEraseAlongSegment } from "../../lib/eraser-utils";
import { formatFileSize } from "../../lib/link-utils";
import {
  compressFileLosslessIfBeneficial,
  compressImageToDataUrl,
} from "../../lib/media-utils";
import {
  attachNotebookToRoom,
  createEmptyNotebook,
  createGuestRoomNotebook,
  createNotebookPage,
  createSlideLayoutItems,
  ensureNotebookPages,
  generateRoomCode,
  mergeNotebook,
  type SlideLayoutPreset,
} from "../../lib/notebook-crdt";
import {
  getDimensionsForPaperSize,
  resolvePageDimensions,
} from "../../lib/paper-utils";
import { importPdfFileToPages } from "../../lib/pdf-import";
import {
  createRoomSyncSession,
  type NotebookDelta,
  type RoomSyncSession,
  type RoomSyncStatus,
} from "../../lib/realtime-sync";
import {
  exportNotebookToPdf,
  exportNotebookToPptx,
  renderNotebookPageToCanvas,
} from "../../lib/slide-export";
import {
  getDisplayName,
  saveMediaBlob,
  saveNotebook,
  setDisplayName,
} from "../../lib/storage";
import { downloadTextFile, sanitizeFileName } from "../../lib/export-utils";
import { CustomTemplateModal } from "./CustomTemplateModal";
import { GoodNotesCanvas } from "./GoodNotesCanvas";
import { InsertLinkModal } from "./InsertLinkModal";
import { JoinRoomPromptModal } from "./JoinRoomPromptModal";
import { MathCalculatorPanel } from "./MathCalculatorPanel";
import { NotebookHomeView } from "./NotebookHomeView";
import { NotebookSidebar } from "./NotebookSidebar";
import { NotebookToolbar } from "./NotebookToolbar";
import { ShareRoomModal } from "./ShareRoomModal";
import { SlidePresenterModal } from "./SlidePresenterModal";

interface ShootNoteWorkspaceProps {
  notebooks: ShootNotebook[];
  folders: NotebookFolder[];
  customTemplates: CustomPaperTemplate[];
  activeNotebookId: string | null;
  currentFolderId: string | null;
  notebookView: "home" | "editor";
  topChromeCollapsed: boolean;
  pendingJoinRoomCode?: string;
  onResolvePendingJoinRoom?: () => void;
  hasCloudRooms?: boolean;
  hasCloudFiles?: boolean;
  apiKey?: string;
  passcode?: string;
  onOpenApiModal: () => void;
  sidebarMobileOpen: boolean;
  onCloseSidebarMobile: () => void;
  onSelectNotebook: (id: string) => void;
  onChangeView: (view: "home" | "editor") => void;
  onChangeCurrentFolder: (folderId: string | null) => void;
  onToggleTopChrome: () => void;
  onUpsertNotebook: (nb: ShootNotebook) => void;
  onDeleteNotebook: (id: string) => void;
  onSaveFolder: (folder: NotebookFolder) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveNotebook: (notebookId: string, targetFolderId: string | null) => void;
  onSaveCustomTemplate: (tpl: CustomPaperTemplate) => void;
  onDeleteCustomTemplate: (id: string) => void;
}

export function ShootNoteWorkspace({
  notebooks,
  folders,
  customTemplates,
  activeNotebookId,
  currentFolderId,
  notebookView,
  topChromeCollapsed,
  pendingJoinRoomCode,
  onResolvePendingJoinRoom,
  hasCloudRooms = false,
  hasCloudFiles = false,
  apiKey,
  passcode,
  onOpenApiModal,
  sidebarMobileOpen,
  onCloseSidebarMobile,
  onSelectNotebook,
  onChangeView,
  onChangeCurrentFolder,
  onToggleTopChrome,
  onUpsertNotebook,
  onDeleteNotebook,
  onSaveFolder,
  onDeleteFolder,
  onMoveNotebook,
  onSaveCustomTemplate,
  onDeleteCustomTemplate,
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
  const activePageDims = useMemo(
    () => resolvePageDimensions(activePage),
    [activePage]
  );

  // Tool state
  const [tool, setTool] = useState<NotebookTool>("pen");
  const [penColor, setPenColor] = useState<string>(GOODNOTES_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState<string>(
    HIGHLIGHTER_COLORS[0]
  );
  const [penSize, setPenSize] = useState<number>(6);
  const [highlightSize, setHighlightSize] = useState<number>(22);
  const [fingerDrawEnabled, setFingerDrawEnabled] = useState<boolean>(false);
  const [stylusDetected, setStylusDetected] = useState<boolean>(false);
  const [eraserMode, setEraserMode] = useState<EraserMode>("partial");
  const [eraserSize, setEraserSize] = useState<number>(20);
  const [autoShape, setAutoShape] = useState<boolean>(true);
  const [calcOpen, setCalcOpen] = useState<boolean>(false);
  const [linkModalOpen, setLinkModalOpen] = useState<boolean>(false);
  const [customTemplateModalOpen, setCustomTemplateModalOpen] =
    useState<boolean>(false);
  const [presenterOpen, setPresenterOpen] = useState<boolean>(false);
  const [slideLayoutMenuOpen, setSlideLayoutMenuOpen] = useState<boolean>(false);
  const [isImportingPdf, setIsImportingPdf] = useState<boolean>(false);

  const eraserUndoBaseRef = useRef<ShootNotebook | null>(null);
  const eraserSessionPushedRef = useRef<boolean>(false);

  // Undo/Redo snapshots per notebook edit session
  const [undoStack, setUndoStack] = useState<ShootNotebook[]>([]);
  const [redoStack, setRedoStack] = useState<ShootNotebook[]>([]);

  // Live Share / Cloud Room state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [collabName, setCollabName] = useState("");
  const [syncStatus, setSyncStatus] = useState<RoomSyncStatus>("offline");
  const [cloudActive, setCloudActive] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [peers, setPeers] = useState<PeerPresence[]>([]);
  const [savedToast, setSavedToast] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);

  useEffect(() => {
    if (sidebarMobileOpen) {
      setLeftSidebarOpen(true);
    }
  }, [sidebarMobileOpen]);

  const showNotice = useCallback((msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => {
      setStatusNotice((curr) => (curr === msg ? null : curr));
    }, 3500);
  }, []);

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
      onCloudStatusChange: (active) => {
        if (!cancelled) setCloudActive(active);
      },
      onPinRequired: () => {
        if (!cancelled) {
          setPinRequired(true);
          setShareModalOpen(true);
        }
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
      setCloudActive(false);
      setPinRequired(false);
      syncSessionRef.current?.leave();
      syncSessionRef.current = null;
    };
  }, [activeRoomId, onUpsertNotebook]);

  const handleCreateNotebook = (
    kind: "notebook" | "shortnote" | "slides",
    folderId?: string | null
  ) => {
    const targetFolder =
      folderId !== undefined ? folderId : currentFolderId ?? null;
    const nb = createEmptyNotebook(kind, undefined, targetFolder);
    onUpsertNotebook(nb);
    saveNotebook(nb).catch(() => undefined);
    onSelectNotebook(nb.id);
  };

  const getRawPages = (nb: ShootNotebook): NotebookPage[] => {
    return nb.pages && nb.pages.length > 0 ? nb.pages : ensureNotebookPages(nb);
  };

  const handleAddPage = (slideLayout?: SlideLayoutPreset) => {
    if (!activeNotebook || !activePage) return;
    const rawPages = getRawPages(activeNotebook);
    const maxOrder = Math.max(-1, ...rawPages.map((p) => p.order));
    const isSlides =
      activeNotebook.kind === "slides" ||
      activePageDims.paperSize === "slide16x9";
    const newPage = createNotebookPage(
      maxOrder + 1,
      activePage.paperTemplate,
      isSlides ? SLIDE_HEIGHT : activePageDims.height,
      undefined,
      activePageDims.orientation === "landscape" || isSlides
        ? "slide16x9"
        : "portrait",
      {
        pageWidth: activePageDims.width,
        paperSize: activePageDims.paperSize,
        orientation: activePageDims.orientation,
        customTemplateId: activePage.customTemplateId,
        backgroundImageDataUrl: activePage.backgroundImageDataUrl,
      }
    );
    const layoutItems =
      isSlides && slideLayout
        ? createSlideLayoutItems(slideLayout, newPage.id)
        : [];
    const next: ShootNotebook = {
      ...activeNotebook,
      pages: [...rawPages, newPage],
      items: [...activeNotebook.items, ...layoutItems],
      updatedAt: Date.now(),
    };
    commitNotebookUpdate(next, true);
    setActivePageId(newPage.id);
    setSlideLayoutMenuOpen(false);
    syncSessionRef.current?.broadcastDelta({ type: "page", page: newPage });
    layoutItems.forEach((item) =>
      syncSessionRef.current?.broadcastDelta({ type: "item", item })
    );
  };

  const handleMoveActivePage = (direction: -1 | 1) => {
    if (!activeNotebook || !activePage) return;
    const targetIdx = activePageIndex + direction;
    if (targetIdx < 0 || targetIdx >= activePages.length) return;

    const currentPg = activePages[activePageIndex];
    const swapPg = activePages[targetIdx];
    const now = Date.now();

    const updatedCurrent: NotebookPage = {
      ...currentPg,
      order: swapPg.order,
      updatedAt: now,
    };
    const updatedSwap: NotebookPage = {
      ...swapPg,
      order: currentPg.order,
      updatedAt: now,
    };

    const rawPages = getRawPages(activeNotebook);
    const nextPages = rawPages.map((p) =>
      p.id === updatedCurrent.id
        ? updatedCurrent
        : p.id === updatedSwap.id
          ? updatedSwap
          : p
    );

    const next: ShootNotebook = {
      ...activeNotebook,
      pages: nextPages,
      updatedAt: now,
    };
    commitNotebookUpdate(next, true);
    syncSessionRef.current?.broadcastDelta({
      type: "page",
      page: updatedCurrent,
    });
    syncSessionRef.current?.broadcastDelta({ type: "page", page: updatedSwap });
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
    patch: Partial<
      Pick<
        NotebookPage,
        | "paperTemplate"
        | "pageWidth"
        | "pageHeight"
        | "paperSize"
        | "orientation"
        | "aspect"
        | "customTemplateId"
        | "backgroundImageDataUrl"
        | "backgroundImageBlobId"
      >
    >,
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

  const handleChangePaperSize = (nextSize: PaperSize) => {
    if (!activePage || !activeNotebook) return;
    const dims = getDimensionsForPaperSize(nextSize, activePageDims.orientation);
    updateActivePage(
      {
        paperSize: nextSize,
        pageWidth: dims.width,
        pageHeight: dims.height,
        aspect:
          nextSize === "slide16x9" || activeNotebook.kind === "slides"
            ? "slide16x9"
            : "portrait",
      },
      true
    );
  };

  const handleToggleOrientation = () => {
    if (!activePage || !activeNotebook) return;
    const nextOrientation =
      activePageDims.orientation === "landscape" ? "portrait" : "landscape";
    const swappedW =
      nextOrientation === "landscape"
        ? Math.max(activePageDims.width, activePageDims.height)
        : Math.min(activePageDims.width, activePageDims.height);
    const swappedH =
      nextOrientation === "landscape"
        ? Math.min(activePageDims.width, activePageDims.height)
        : Math.max(activePageDims.width, activePageDims.height);

    updateActivePage(
      {
        orientation: nextOrientation,
        pageWidth: swappedW,
        pageHeight: swappedH,
        aspect:
          activePageDims.paperSize === "slide16x9" ||
          activeNotebook.kind === "slides"
            ? "slide16x9"
            : "portrait",
      },
      true
    );
  };

  const handleApplyCustomTemplate = (tpl: CustomPaperTemplate) => {
    if (!activePage || !activeNotebook) return;
    updateActivePage(
      {
        paperTemplate: "blank",
        customTemplateId: tpl.id,
        backgroundImageDataUrl: tpl.dataUrl,
        backgroundImageBlobId: undefined,
        orientation: tpl.defaultOrientation,
        pageWidth: tpl.width,
        pageHeight: tpl.height,
        aspect: activeNotebook.kind === "slides" ? "slide16x9" : "portrait",
      },
      true
    );
    showNotice(`ใช้เทมเพลต "${tpl.name}" กับหน้านี้แล้ว`);
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

  const handleBeginEraserSession = () => {
    eraserUndoBaseRef.current = activeNotebookRef.current;
    eraserSessionPushedRef.current = false;
  };

  const ensureEraserSessionUndoSnapshot = () => {
    if (!eraserSessionPushedRef.current && eraserUndoBaseRef.current) {
      setUndoStack((u) => [...u.slice(-24), eraserUndoBaseRef.current!]);
      setRedoStack([]);
      eraserSessionPushedRef.current = true;
    }
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
    ensureEraserSessionUndoSnapshot();
    const next: ShootNotebook = {
      ...activeNotebook,
      strokes: updatedStrokes,
      updatedAt: now,
    };
    commitNotebookUpdate(next, false);
    changed.forEach((stroke) =>
      syncSessionRef.current?.broadcastDelta({ type: "stroke", stroke })
    );
  };

  const handlePartialErase = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    radius: number
  ) => {
    const current = activeNotebookRef.current;
    if (!current || !activePage) return;

    const now = Date.now();
    const res = applyPartialEraseAlongSegment(
      current.strokes,
      activePage.id,
      activePageIndex === 0,
      x0,
      y0,
      x1,
      y1,
      radius,
      now
    );

    if (!res.anyChanged) return;
    ensureEraserSessionUndoSnapshot();

    const next: ShootNotebook = {
      ...current,
      strokes: res.strokes,
      updatedAt: now,
    };
    activeNotebookRef.current = next;
    commitNotebookUpdate(next, false);

    res.erasedTombstones.forEach((stroke) =>
      syncSessionRef.current?.broadcastDelta({ type: "stroke", stroke })
    );
    res.addedFragments.forEach((stroke) =>
      syncSessionRef.current?.broadcastDelta({ type: "stroke", stroke })
    );
  };

  const handleImportPdfAsNotebook = async (
    file: File,
    folderId?: string | null
  ) => {
    setIsImportingPdf(true);
    try {
      const importedPages = await importPdfFileToPages(file);
      if (importedPages.length === 0) {
        showNotice("ไม่พบหน้าเอกสารในไฟล์ PDF นี้");
        return;
      }

      await Promise.all(
        importedPages.map((p) =>
          saveMediaBlob(p.blobId, p.blob, p.mimeType, p.fileName).catch(
            () => undefined
          )
        )
      );

      const now = Date.now();
      const firstPage = importedPages[0].page;
      const newNb: ShootNotebook = {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `nb-pdf-${now}`,
        kind: "notebook",
        title: file.name.replace(/\.pdf$/i, "") || "เอกสาร PDF",
        folderId: folderId ?? currentFolderId ?? null,
        paperTemplate: "blank",
        pageHeight: firstPage.pageHeight,
        pages: importedPages.map((p) => p.page),
        strokes: [],
        items: [],
        metaUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      onUpsertNotebook(newNb);
      await saveNotebook(newNb).catch(() => undefined);
      onSelectNotebook(newNb.id);
      setActivePageId(firstPage.id);
      showNotice(`นำเข้า PDF "${newNb.title}" (${importedPages.length} หน้า) แล้ว`);
    } catch {
      showNotice("ไม่สามารถอ่านไฟล์ PDF นี้ได้");
    } finally {
      setIsImportingPdf(false);
    }
  };

  const handleAppendPdfToActiveNotebook = async (file: File) => {
    if (!activeNotebook) return;
    setIsImportingPdf(true);
    try {
      const rawPages = getRawPages(activeNotebook);
      const maxOrder = Math.max(-1, ...rawPages.map((p) => p.order));
      const importedPages = await importPdfFileToPages(file, {
        startOrder: maxOrder + 1,
      });
      if (importedPages.length === 0) {
        showNotice("ไม่พบหน้าเอกสารในไฟล์ PDF นี้");
        return;
      }

      await Promise.all(
        importedPages.map((p) =>
          saveMediaBlob(p.blobId, p.blob, p.mimeType, p.fileName).catch(
            () => undefined
          )
        )
      );

      const newPages = importedPages.map((p) => p.page);
      const next: ShootNotebook = {
        ...activeNotebook,
        pages: [...rawPages, ...newPages],
        updatedAt: Date.now(),
      };
      commitNotebookUpdate(next, true);
      setActivePageId(newPages[0].id);
      newPages.forEach((page) =>
        syncSessionRef.current?.broadcastDelta({ type: "page", page })
      );
      showNotice(`เพิ่มหน้าจาก PDF "${file.name}" (${newPages.length} หน้า) แล้ว`);
    } catch {
      showNotice("ไม่สามารถอ่านไฟล์ PDF นี้ได้");
    } finally {
      setIsImportingPdf(false);
    }
  };

  const addCanvasItem = (
    partial: Omit<CanvasItem, "id" | "pageId" | "zIndex" | "updatedAt">
  ) => {
    const base = activeNotebookRef.current || activeNotebook;
    if (!base || !activePage) return;
    const now = Date.now();
    const maxZ = Math.max(0, ...base.items.map((i) => i.zIndex || 0));
    const pageItemCount = base.items.filter(
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
      ...base,
      items: [...base.items, item],
      updatedAt: now,
    };
    activeNotebookRef.current = next;
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
      const res = await compressImageToDataUrl(file, 2048, 0.88);
      const ratio = Math.min(420 / res.width, 420 / res.height, 1);
      addCanvasItem({
        type: "image",
        x: 90,
        y:
          activeNotebook.kind === "shortnote" && activePageIndex === 0
            ? 230
            : 120,
        width: Math.max(140, Math.round(res.width * ratio)),
        height: Math.max(120, Math.round(res.height * ratio)),
        dataUrl: res.dataUrl,
        fileName: file.name,
        fileSize: res.compressedBytes,
        mimeType: res.mimeType,
      });
      if (res.savedPercent > 0) {
        showNotice(
          `บีบอัดรูปอัตโนมัติ -${res.savedPercent}% (${formatFileSize(res.originalBytes)} → ${formatFileSize(res.compressedBytes)}) คมชัดสูงสุด 2048px`
        );
      }
    } catch {
      showNotice("ไม่สามารถอ่านไฟล์รูปภาพนี้ได้");
    }
  };

  const handleUploadDocument = async (file: File) => {
    if (!activeNotebook) return;
    try {
      const prepared = await compressFileLosslessIfBeneficial(file);
      let cloudUrl: string | undefined;

      if (hasCloudFiles && prepared.blob.size <= 4.4 * 1024 * 1024) {
        const form = new FormData();
        const uploadFile = new File([prepared.blob], prepared.fileName, {
          type: prepared.mimeType,
        });
        form.append("file", uploadFile);
        const upRes = await fetch("/api/files/upload", {
          method: "POST",
          body: form,
        }).catch(() => null);
        if (upRes?.ok) {
          const upJson = (await upRes.json()) as {
            configured?: boolean;
            url?: string;
            downloadUrl?: string;
          };
          if (upJson.configured && upJson.url) {
            cloudUrl = upJson.url;
          }
        }
      }

      const mediaId = `file-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      if (!cloudUrl) {
        await saveMediaBlob(
          mediaId,
          prepared.blob,
          prepared.mimeType,
          prepared.fileName
        ).catch(() => undefined);
      }

      addCanvasItem({
        type: "file",
        x: 90,
        y:
          activeNotebook.kind === "shortnote" && activePageIndex === 0
            ? 230
            : 130,
        width: 340,
        height: 112,
        title: prepared.fileName,
        fileName: prepared.fileName,
        fileSize: prepared.finalBytes,
        fileUrl: cloudUrl,
        mediaBlobId: cloudUrl ? undefined : mediaId,
        mimeType: prepared.mimeType,
      });

      if (!cloudUrl) {
        syncSessionRef.current
          ?.broadcastMediaBlob(
            mediaId,
            prepared.blob,
            prepared.mimeType,
            prepared.fileName
          )
          .catch(() => undefined);
      }

      showNotice(
        cloudUrl
          ? `อัปโหลดไฟล์ "${prepared.fileName}" ขึ้นคลาวด์แล้ว`
          : prepared.compressed
            ? `แนบไฟล์ "${prepared.fileName}" (บีบอัด lossless ประหยัดพื้นที่)`
            : `แนบไฟล์ "${prepared.fileName}" ลงสมุดแล้ว`
      );
    } catch {
      showNotice("เกิดข้อผิดพลาดระหว่างแนบไฟล์");
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
      fileSize: file.size,
    });

    syncSessionRef.current
      ?.broadcastMediaBlob(mediaId, file, mimeType, file.name)
      .catch(() => undefined);
  };

  const handleExportPng = async () => {
    if (!activeNotebook || !activePage) return;
    const canvas = await renderNotebookPageToCanvas(
      activeNotebook,
      activePage,
      activePageIndex,
      customTemplates
    );
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

  const handleExportPdf = async () => {
    if (!activeNotebook) return;
    showNotice("กำลังสร้างไฟล์ PDF ทุกหน้า...");
    await exportNotebookToPdf(activeNotebook, customTemplates)
      .then(() => showNotice("ส่งออก PDF เรียบร้อยแล้ว"))
      .catch(() => showNotice("ส่งออก PDF ไม่สำเร็จ"));
  };

  const handleExportPptx = async () => {
    if (!activeNotebook) return;
    showNotice("กำลังสร้างไฟล์ PowerPoint (.pptx)...");
    await exportNotebookToPptx(activeNotebook, customTemplates).catch(() =>
      showNotice("ส่งออก PowerPoint ไม่สำเร็จ")
    );
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

  if (notebookView === "home") {
    return (
      <div className="flex w-full flex-1 min-h-0 flex-col overflow-hidden">
        <NotebookHomeView
          notebooks={notebooks}
          folders={folders}
          currentFolderId={currentFolderId}
          isImportingPdf={isImportingPdf}
          onChangeCurrentFolder={onChangeCurrentFolder}
          onOpenNotebook={(id) => {
            setLeftSidebarOpen(false);
            onCloseSidebarMobile();
            onSelectNotebook(id);
          }}
          onCreateNotebook={handleCreateNotebook}
          onDeleteNotebook={onDeleteNotebook}
          onImportBackup={handleImportBackup}
          onImportPdfNotebook={handleImportPdfAsNotebook}
          onSaveFolder={onSaveFolder}
          onDeleteFolder={onDeleteFolder}
          onMoveNotebook={onMoveNotebook}
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

  return (
    <div className="relative flex w-full flex-1 min-h-0 overflow-hidden">
      <NotebookSidebar
        notebooks={notebooks}
        folders={folders}
        activeId={activeNotebookId}
        isOpen={leftSidebarOpen}
        onClose={() => {
          setLeftSidebarOpen(false);
          onCloseSidebarMobile();
        }}
        onGoHome={() => {
          setLeftSidebarOpen(false);
          onCloseSidebarMobile();
          onChangeView("home");
        }}
        onSelect={(id) => {
          onSelectNotebook(id);
          if (typeof window !== "undefined" && window.innerWidth < 1280) {
            setLeftSidebarOpen(false);
            onCloseSidebarMobile();
          }
        }}
        onCreate={handleCreateNotebook}
        onDelete={onDeleteNotebook}
        onMoveNotebook={onMoveNotebook}
        onImportBackup={handleImportBackup}
      />

      <main className="relative flex-1 min-w-0 min-h-0 flex flex-col bg-[#ECEAE2] overflow-hidden">
        {!activeNotebook || !activePage ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-2xl border border-line bg-white p-6 text-center shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-ink">
                พร้อมเริ่มสมุดจด ShootNote
              </h2>
              <p className="text-xs text-muted leading-relaxed">
                เลือกสร้างสมุดจดยาวสไตล์ GoodNotes (รองรับ Apple Pencil บน iPad,
                หลายหน้ากระดาษ, ตาราง, สติกเกอร์, แนบไฟล์/YouTube) หรือสร้างสไลด์ 16:9
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCreateNotebook("notebook")}
                  className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:bg-accent-dark"
                >
                  + สมุดจดยาว
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateNotebook("shortnote")}
                  className="flex-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  ⚡ ShortNote
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateNotebook("slides")}
                  className="flex-1 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                >
                  สไลด์ 16:9
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChangeView("home")}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-4 py-2 text-xs font-medium text-ink hover:bg-[#efede6]"
              >
                <Home className="h-3.5 w-3.5 text-accent" />
                <span>กลับหน้าแรก (คลังโฟลเดอร์)</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {!topChromeCollapsed ? (
              <>
                {/* Notebook Title & Sync Status Strip (pinned) */}
                <div className="no-print shrink-0 border-b border-line bg-white px-3 py-2 sm:px-5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => {
                        setLeftSidebarOpen(false);
                        onCloseSidebarMobile();
                        onChangeView("home");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs font-semibold text-ink hover:bg-[#efede6] shrink-0"
                      title="กลับหน้าแรก (คลังโฟลเดอร์)"
                    >
                      <Home className="h-3.5 w-3.5 text-accent" />
                      <span className="hidden sm:inline">หน้าแรก</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setLeftSidebarOpen((v) => !v)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold shrink-0 transition-colors ${
                        leftSidebarOpen
                          ? "border-accent bg-accent-soft text-accent-dark"
                          : "border-line bg-paper text-ink hover:bg-[#efede6]"
                      }`}
                      title={
                        leftSidebarOpen
                          ? "พับเก็บแถบสมุดด้านซ้าย"
                          : "เปิดแถบรายการสมุดด้านซ้าย"
                      }
                    >
                      {leftSidebarOpen ? (
                        <PanelLeftClose className="h-3.5 w-3.5" />
                      ) : (
                        <PanelLeft className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden md:inline">แถบสมุด</span>
                    </button>

                    <PencilLine className="h-4 w-4 text-accent shrink-0 hidden sm:block" />
                    <input
                      type="text"
                      value={activeNotebook.title}
                      onChange={(e) => updateMeta({ title: e.target.value })}
                      aria-label="ชื่อสมุดจด"
                      className="min-w-[120px] flex-1 bg-transparent text-sm sm:text-base font-bold text-ink focus:outline-none focus:bg-paper rounded px-1.5 py-0.5"
                    />

                    {folders.length > 0 && (
                      <select
                        value={activeNotebook.folderId ?? ""}
                        onChange={(e) =>
                          onMoveNotebook(
                            activeNotebook.id,
                            e.target.value ? e.target.value : null
                          )
                        }
                        aria-label="โฟลเดอร์ของสมุดนี้"
                        title="ย้ายโฟลเดอร์"
                        className="hidden sm:inline-block rounded-lg border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink focus:border-accent focus:outline-none max-w-[150px]"
                      >
                        <option value="">หน้าแรก</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            📁 {f.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] text-muted shrink-0">
                    {statusNotice && (
                      <span className="inline-flex items-center rounded-full bg-sky-50 border border-sky-200 px-2.5 py-0.5 font-medium text-sky-800">
                        {statusNotice}
                      </span>
                    )}
                    {activeNotebook.roomId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-medium text-emerald-700">
                        <Radio className="h-3 w-3 animate-pulse" />
                        {syncStatus === "connected"
                          ? `${cloudActive ? "Cloud" : "Live"} (${peers.length + 1})`
                          : syncStatus === "local"
                            ? `ในเครื่อง (${peers.length + 1}) · กำลังเชื่อมเน็ต`
                            : syncStatus === "connecting"
                              ? "กำลังเชื่อมห้อง..."
                              : "ออฟไลน์"}
                      </span>
                    )}
                    {!fingerDrawEnabled && (
                      <span className="hidden lg:inline-flex items-center gap-1 rounded-full bg-accent-soft border border-accent/25 px-2 py-0.5 font-medium text-accent-dark">
                        ✏️ {stylusDetected ? "Apple Pencil · " : ""}1 นิ้วเลื่อน · 2 นิ้วซูม
                      </span>
                    )}
                    <span className="hidden md:inline-flex items-center gap-1 text-emerald-700 font-medium">
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
                    <button
                      type="button"
                      onClick={onToggleTopChrome}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-[11px] font-semibold text-ink hover:bg-[#efede6]"
                      title="พับแถบด้านบนทั้งหมดเพื่อขยายพื้นที่กระดาษเขียน"
                    >
                      <ChevronsUp className="h-3.5 w-3.5 text-accent" />
                      <span>พับด้านบน</span>
                    </button>
                  </div>
                </div>

                <NotebookToolbar
                  tool={tool}
                  color={activeColor}
                  size={activeSize}
                  fingerDrawEnabled={fingerDrawEnabled}
                  stylusDetected={stylusDetected}
                  eraserMode={eraserMode}
                  eraserSize={eraserSize}
                  autoShape={autoShape}
                  calcOpen={calcOpen}
                  paperTemplate={activePage.paperTemplate}
                  customTemplateId={activePage.customTemplateId}
                  customTemplates={customTemplates}
                  paperSize={activePageDims.paperSize}
                  orientation={activePageDims.orientation}
                  canUndo={undoStack.length > 0}
                  canRedo={redoStack.length > 0}
                  roomId={activeNotebook.roomId}
                  peerCount={peers.length}
                  isImportingPdf={isImportingPdf}
                  onSelectTool={setTool}
                  onChangeColor={(c) => {
                    if (tool === "highlighter") setHighlightColor(c);
                    else setPenColor(c);
                  }}
                  onChangeSize={(s) => {
                    if (tool === "highlighter") setHighlightSize(s);
                    else setPenSize(s);
                  }}
                  onToggleFingerDraw={() => setFingerDrawEnabled((v) => !v)}
                  onChangeEraserMode={setEraserMode}
                  onChangeEraserSize={setEraserSize}
                  onToggleAutoShape={() => setAutoShape((v) => !v)}
                  onToggleCalc={() => setCalcOpen((v) => !v)}
                  onChangeTemplate={(tpl: PaperTemplate) => {
                    updateActivePage(
                      {
                        paperTemplate: tpl,
                        customTemplateId: undefined,
                        backgroundImageDataUrl: undefined,
                      },
                      true
                    );
                    if (isDarkPaperTemplate(tpl) && penColor === "#1C1B18") {
                      setPenColor("#FFFFFF");
                    } else if (
                      !isDarkPaperTemplate(tpl) &&
                      penColor === "#FFFFFF"
                    ) {
                      setPenColor("#1C1B18");
                    }
                  }}
                  onSelectCustomTemplate={handleApplyCustomTemplate}
                  onOpenCustomTemplateModal={() =>
                    setCustomTemplateModalOpen(true)
                  }
                  onChangePaperSize={handleChangePaperSize}
                  onToggleOrientation={handleToggleOrientation}
                  onInsertText={() =>
                    addCanvasItem({
                      type: "text",
                      x: 80,
                      y:
                        activeNotebook.kind === "shortnote" &&
                        activePageIndex === 0
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
                        activeNotebook.kind === "shortnote" &&
                        activePageIndex === 0
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
                  onInsertTable={(rows, cols) => {
                    const grid: string[][] = Array.from(
                      { length: rows },
                      (_, ri) =>
                        Array.from({ length: cols }, (_, ci) =>
                          ri === 0 ? `หัวข้อ ${ci + 1}` : ""
                        )
                    );
                    addCanvasItem({
                      type: "table",
                      x: 80,
                      y:
                        activeNotebook.kind === "shortnote" &&
                        activePageIndex === 0
                          ? 230
                          : 110,
                      width: Math.min(860, cols * 160),
                      height: rows * 52,
                      tableData: { rows: grid, headerBg: "#0F766E" },
                    });
                  }}
                  onInsertSticker={(emoji, label) =>
                    addCanvasItem({
                      type: "sticker",
                      x: 140,
                      y:
                        activeNotebook.kind === "shortnote" &&
                        activePageIndex === 0
                          ? 230
                          : 120,
                      width: 110,
                      height: 110,
                      stickerEmoji: emoji,
                      stickerLabel: label,
                    })
                  }
                  onInsertShape={(shapeKind: ShapeKind) => {
                    const spec = SHAPE_CATALOG.find(
                      (s) => s.kind === shapeKind
                    );
                    addCanvasItem({
                      type: "shape",
                      x: 110,
                      y:
                        activeNotebook.kind === "shortnote" &&
                        activePageIndex === 0
                          ? 230
                          : 120,
                      width: spec?.defaultWidth ?? 240,
                      height: spec?.defaultHeight ?? 150,
                      shapeKind,
                      text: spec?.defaultText ?? "",
                      bgColor: "#EFFAF8",
                      color: "#0F766E",
                      fontSize: 16,
                    });
                  }}
                  onOpenInsertLink={() => setLinkModalOpen(true)}
                  onOpenPresenter={() => setPresenterOpen(true)}
                  onUploadImage={handleUploadImage}
                  onUploadMedia={handleUploadMedia}
                  onUploadDocument={handleUploadDocument}
                  onImportPdf={handleAppendPdfToActiveNotebook}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onExportPng={handleExportPng}
                  onExportPdf={handleExportPdf}
                  onExportPptx={handleExportPptx}
                  onExportJson={handleExportJson}
                  onOpenShareModal={() => setShareModalOpen(true)}
                  onToggleTopChrome={onToggleTopChrome}
                />

                {/* Multi-Page Navigator Strip (pinned) */}
                <div
                  data-page-navigator="true"
                  className="no-print shrink-0 border-b border-line bg-paper px-3 py-1.5 sm:px-5 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-1 shrink-0">
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
                      {activePage.aspect === "slide16x9" ? "สไลด์" : "หน้า"}{" "}
                      {activePageIndex + 1}/{activePages.length}
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

                    {activePages.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleMoveActivePage(
                            activePageIndex < activePages.length - 1 ? 1 : -1
                          )
                        }
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-white px-2 text-[11px] font-medium text-ink hover:bg-paper"
                        title="สลับลำดับหน้านี้"
                      >
                        <ArrowLeftRight className="h-3 w-3 text-accent" />
                        <span className="hidden md:inline">สลับหน้า</span>
                      </button>
                    )}
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
                            {pg.aspect === "slide16x9" ? "สไลด์" : "หน้า"}{" "}
                            {idx + 1}
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

                  {activePage.aspect === "slide16x9" ||
                  activeNotebook.kind === "slides" ? (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setSlideLayoutMenuOpen((v) => !v)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                        <span>เพิ่มสไลด์</span>
                      </button>
                      {slideLayoutMenuOpen && (
                        <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-line bg-white p-1.5 shadow-lg z-30 space-y-1">
                          {(
                            [
                              ["content", "สไลด์หัวข้อ + เนื้อหา"],
                              ["two_col", "สไลด์เปรียบเทียบ 2 คอลัมน์"],
                              ["table_chart", "สไลด์ตาราง + สรุปผล"],
                              ["cover", "สไลด์หน้าปก"],
                            ] as Array<[SlideLayoutPreset, string]>
                          ).map(([preset, label]) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleAddPage(preset)}
                              className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-ink hover:bg-paper"
                            >
                              {label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddPage()}
                            className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-muted hover:bg-paper"
                          >
                            สไลด์หน้าว่าง
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAddPage()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      <span>เพิ่มหน้ากระดาษ</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Compact Floating Pill when Top Chrome is Collapsed (Full Wide Canvas) */
              <div
                data-collapsed-top-pill="true"
                className="no-print absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full border border-line bg-white/95 backdrop-blur px-2.5 py-1 shadow-lg max-w-[96vw] overflow-x-auto"
              >
                <button
                  type="button"
                  data-expand-top-chrome="true"
                  onClick={onToggleTopChrome}
                  className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-dark shrink-0 shadow-sm"
                  title="แสดงแถบเครื่องมือและเมนูด้านบน"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>แสดงแถบด้านบน</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLeftSidebarOpen((v) => !v)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-ink hover:bg-[#efede6] shrink-0"
                  title="เปิด/พับแถบสมุดด้านซ้าย"
                  aria-label="เปิดแถบสมุด"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLeftSidebarOpen(false);
                    onCloseSidebarMobile();
                    onChangeView("home");
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-ink hover:bg-[#efede6] shrink-0"
                  title="กลับหน้าแรก"
                  aria-label="กลับหน้าแรก"
                >
                  <Home className="h-3.5 w-3.5" />
                </button>

                <div className="h-4 w-px bg-line mx-0.5 shrink-0" />

                <button
                  type="button"
                  onClick={() => setTool("select")}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                    tool === "select"
                      ? "bg-ink text-white"
                      : "text-muted hover:bg-paper"
                  }`}
                  title="เลือก/ย้าย"
                  aria-label="เลือก"
                >
                  <MousePointer2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setTool("pen")}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                    tool === "pen"
                      ? "bg-accent text-white"
                      : "text-muted hover:bg-paper"
                  }`}
                  title="ปากกา"
                  aria-label="ปากกา"
                >
                  <PenTool className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setTool("highlighter")}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                    tool === "highlighter"
                      ? "bg-amber-400 text-ink"
                      : "text-muted hover:bg-paper"
                  }`}
                  title="ไฮไลต์"
                  aria-label="ไฮไลต์"
                >
                  <Highlighter className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setTool("eraser")}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                    tool === "eraser"
                      ? "bg-rose-600 text-white"
                      : "text-muted hover:bg-paper"
                  }`}
                  title="ยางลบ"
                  aria-label="ยางลบ"
                >
                  <Eraser className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={undoStack.length === 0}
                  onClick={handleUndo}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-paper disabled:opacity-35 shrink-0"
                  title="ย้อนกลับ"
                  aria-label="ย้อนกลับ"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>

                {activePages.length > 1 && (
                  <>
                    <div className="h-4 w-px bg-line mx-0.5 shrink-0" />
                    <button
                      type="button"
                      disabled={activePageIndex <= 0}
                      onClick={() =>
                        setActivePageId(activePages[activePageIndex - 1].id)
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-paper disabled:opacity-35 shrink-0"
                      title="หน้าก่อนหน้า"
                      aria-label="หน้าก่อนหน้า"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="font-mono text-[11px] font-semibold text-muted px-0.5 whitespace-nowrap">
                      {activePageIndex + 1}/{activePages.length}
                    </span>
                    <button
                      type="button"
                      disabled={activePageIndex >= activePages.length - 1}
                      onClick={() =>
                        setActivePageId(activePages[activePageIndex + 1].id)
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-paper disabled:opacity-35 shrink-0"
                      title="หน้าถัดไป"
                      aria-label="หน้าถัดไป"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}

            <GoodNotesCanvas
              notebook={activeNotebook}
              activePage={activePage}
              isFirstPage={activePageIndex === 0}
              pageIndex={activePageIndex}
              totalPages={activePages.length}
              tool={tool}
              color={activeColor}
              size={activeSize}
              fingerDrawEnabled={fingerDrawEnabled}
              eraserMode={eraserMode}
              eraserSize={eraserSize}
              customTemplates={customTemplates}
              autoShape={autoShape}
              peers={peers}
              svgExportRef={svgRef}
              onStylusDetected={() => setStylusDetected(true)}
              onAddStroke={handleAddStroke}
              onEraseStrokes={handleEraseStrokes}
              onBeginEraserSession={handleBeginEraserSession}
              onPartialErase={handlePartialErase}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onUpdateQuickBody={(quickBody) => updateMeta({ quickBody })}
              onExtendPage={() =>
                updateActivePage(
                  { pageHeight: (activePageDims.height || 1600) + 1000 },
                  true
                )
              }
              onAddPage={() =>
                handleAddPage(
                  activePageDims.paperSize === "slide16x9"
                    ? "content"
                    : undefined
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
        activeNotebookTitle={activeNotebook?.title}
        syncStatus={syncStatus}
        cloudConfigured={hasCloudRooms}
        cloudActive={cloudActive}
        pinRequired={pinRequired}
        roomPinProtected={activeNotebook?.roomPinProtected}
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
        onSubmitRoomPin={(pin) => {
          setPinRequired(false);
          syncSessionRef.current?.setRoomPin(pin);
        }}
        onSetCloudRoomPin={async (newPin) => {
          if (!syncSessionRef.current) return false;
          return syncSessionRef.current.updateCloudRoomPin(newPin);
        }}
        onClose={() => setShareModalOpen(false)}
      />

      <JoinRoomPromptModal
        roomCode={pendingJoinRoomCode || null}
        initialDisplayName={collabName}
        localNotebooks={candidateLocalNotebooks}
        onConfirm={handleConfirmPendingJoin}
        onCancel={handleCancelPendingJoin}
      />

      <InsertLinkModal
        isOpen={linkModalOpen}
        onInsertYouTube={({ videoId, startSeconds, title, url }) =>
          addCanvasItem({
            type: "youtube",
            x: 80,
            y:
              activeNotebook?.kind === "shortnote" && activePageIndex === 0
                ? 230
                : 110,
            width: 480,
            height: 310,
            title,
            linkUrl: url,
            youtubeId: videoId,
            youtubeStart: startSeconds,
          })
        }
        onInsertLink={({
          url,
          title,
          provider,
        }: {
          url: string;
          title: string;
          provider: LinkProvider;
        }) =>
          addCanvasItem({
            type: "link",
            x: 80,
            y:
              activeNotebook?.kind === "shortnote" && activePageIndex === 0
                ? 230
                : 110,
            width: 340,
            height: 118,
            title,
            linkUrl: url,
            linkProvider: provider,
          })
        }
        onClose={() => setLinkModalOpen(false)}
      />

      <MathCalculatorPanel
        isOpen={calcOpen}
        apiKey={apiKey}
        passcode={passcode}
        onOpenApiModal={onOpenApiModal}
        onInsertResult={(text) => {
          const lineCount = text.split("\n").length;
          addCanvasItem({
            type: "text",
            x: 90,
            y:
              activeNotebook?.kind === "shortnote" && activePageIndex === 0
                ? 230
                : 120,
            width: 420,
            height: Math.max(96, lineCount * 28 + 36),
            text,
            color: "#0F766E",
            fontSize: 18,
          });
        }}
        onInsertEquationImage={(dataUrl, width, height, solutionText) => {
          const startY =
            activeNotebook?.kind === "shortnote" && activePageIndex === 0
              ? 230
              : 120;
          addCanvasItem({
            type: "image",
            x: 90,
            y: startY,
            width,
            height,
            dataUrl,
            fileName: "equation.png",
            mimeType: "image/png",
          });
          if (solutionText) {
            const lineCount = solutionText.split("\n").length;
            addCanvasItem({
              type: "text",
              x: 90,
              y: startY + height + 18,
              width: 420,
              height: Math.max(96, lineCount * 28 + 36),
              text: solutionText,
              color: "#0F766E",
              fontSize: 18,
            });
          }
        }}
        onClose={() => setCalcOpen(false)}
      />

      <CustomTemplateModal
        isOpen={customTemplateModalOpen}
        customTemplates={customTemplates}
        onSaveTemplate={onSaveCustomTemplate}
        onApplyTemplateToPage={handleApplyCustomTemplate}
        onDeleteTemplate={onDeleteCustomTemplate}
        onClose={() => setCustomTemplateModalOpen(false)}
      />

      {activeNotebook && (
        <SlidePresenterModal
          isOpen={presenterOpen}
          notebook={activeNotebook}
          customTemplates={customTemplates}
          initialPageIndex={activePageIndex}
          onClose={() => setPresenterOpen(false)}
        />
      )}
    </div>
  );
}
