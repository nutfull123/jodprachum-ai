"use client";

import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  FilePlus,
  Folder,
  FolderInput,
  FolderPlus,
  Home,
  Pencil,
  Plus,
  Presentation,
  Radio,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  FOLDER_COLORS,
  isDarkPaperTemplate,
  type NotebookFolder,
  type PaperTemplate,
  type ShootNotebook,
} from "../../types/notebook";
import {
  countNotebooksInFolder,
  createFolder,
  getFolderBreadcrumbs,
} from "../../lib/folder-utils";
import { ensureNotebookPages } from "../../lib/notebook-crdt";

interface NotebookHomeViewProps {
  notebooks: ShootNotebook[];
  folders: NotebookFolder[];
  currentFolderId: string | null;
  isImportingPdf?: boolean;
  onChangeCurrentFolder: (folderId: string | null) => void;
  onOpenNotebook: (notebookId: string) => void;
  onCreateNotebook: (
    kind: "notebook" | "shortnote" | "slides",
    folderId?: string | null
  ) => void;
  onDeleteNotebook: (notebookId: string) => void;
  onImportBackup: (file: File) => void;
  onImportPdfNotebook: (file: File, folderId?: string | null) => void;
  onSaveFolder: (folder: NotebookFolder) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveNotebook: (notebookId: string, targetFolderId: string | null) => void;
}

type KindFilter = "all" | "notebook" | "shortnote" | "slides";
type SortBy = "updated" | "title" | "oldest";

function formatShortDate(ms: number): string {
  if (!ms) return "เพิ่งสร้าง";
  return new Date(ms).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPreviewCoverStyle(
  tpl: PaperTemplate,
  kind: ShootNotebook["kind"]
): React.CSSProperties {
  if (kind === "slides") {
    return {
      background:
        "linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 55%, #EFFAF8 100%)",
    };
  }
  if (isDarkPaperTemplate(tpl)) {
    return {
      backgroundColor: "#181B20",
      backgroundImage:
        tpl === "dark_grid"
          ? "linear-gradient(to right, #2A303B 1px, transparent 1px), linear-gradient(to bottom, #2A303B 1px, transparent 1px)"
          : tpl === "dark_dotted"
            ? "radial-gradient(#3B4252 1.2px, transparent 1.2px)"
            : "repeating-linear-gradient(to bottom, transparent 0px, transparent 17px, #2A303B 17px, #2A303B 18px)",
      backgroundSize: tpl === "dark_grid" || tpl === "dark_dotted" ? "16px 16px" : undefined,
    };
  }
  if (tpl === "cream") {
    return {
      backgroundColor: "#FDF8EC",
      backgroundImage:
        "repeating-linear-gradient(to bottom, transparent 0px, transparent 17px, #EDE2C8 17px, #EDE2C8 18px)",
    };
  }
  if (tpl === "grid") {
    return {
      backgroundColor: "#FFFFFF",
      backgroundImage:
        "linear-gradient(to right, #E5E7EB 1px, transparent 1px), linear-gradient(to bottom, #E5E7EB 1px, transparent 1px)",
      backgroundSize: "16px 16px",
    };
  }
  if (tpl === "dotted") {
    return {
      backgroundColor: "#FFFFFF",
      backgroundImage: "radial-gradient(#CBD5E1 1.2px, transparent 1.2px)",
      backgroundSize: "14px 14px",
    };
  }
  if (tpl === "blank") {
    return { backgroundColor: "#FFFFFF" };
  }
  return {
    backgroundColor: "#FFFFFF",
    backgroundImage:
      "linear-gradient(90deg, transparent 26px, #FCA5A5 26px, #FCA5A5 27px, transparent 27px), repeating-linear-gradient(to bottom, transparent 0px, transparent 17px, #E2E8F0 17px, #E2E8F0 18px)",
  };
}

export function NotebookHomeView({
  notebooks,
  folders,
  currentFolderId,
  isImportingPdf = false,
  onChangeCurrentFolder,
  onOpenNotebook,
  onCreateNotebook,
  onDeleteNotebook,
  onImportBackup,
  onImportPdfNotebook,
  onSaveFolder,
  onDeleteFolder,
  onMoveNotebook,
}: NotebookHomeViewProps) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("updated");

  // Drag-and-drop state
  const [draggingNotebookId, setDraggingNotebookId] = useState<string | null>(
    null
  );
  const [dragOverTarget, setDragOverTarget] = useState<string | "root" | null>(
    null
  );

  // Folder Create/Edit Modal
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NotebookFolder | null>(
    null
  );
  const [folderNameInput, setFolderNameInput] = useState("");
  const [folderColorInput, setFolderColorInput] = useState<string>(
    FOLDER_COLORS[0].hex
  );

  // Move Notebook Modal
  const [movingNotebook, setMovingNotebook] = useState<ShootNotebook | null>(
    null
  );

  // Status feedback toast
  const [toast, setToast] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const pdfImportRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3000);
  };

  const breadcrumbs = useMemo(
    () => getFolderBreadcrumbs(folders, currentFolderId),
    [folders, currentFolderId]
  );

  const activeFolder =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : null;

  const foldersById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders]
  );

  const isSearching = query.trim().length > 0;

  const visibleFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = isSearching
      ? folders.filter((f) => f.name.toLowerCase().includes(q))
      : folders.filter((f) => (f.parentId ?? null) === currentFolderId);
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [folders, currentFolderId, isSearching, query]);

  const visibleNotebooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = notebooks.filter((nb) => {
      if (kindFilter !== "all" && nb.kind !== kindFilter) return false;
      if (isSearching) {
        return nb.title.toLowerCase().includes(q);
      }
      return (nb.folderId ?? null) === currentFolderId;
    });

    return list.slice().sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title, "th");
      if (sortBy === "oldest") return a.createdAt - b.createdAt;
      return b.updatedAt - a.updatedAt;
    });
  }, [notebooks, kindFilter, isSearching, query, currentFolderId, sortBy]);

  const openCreateFolderModal = () => {
    setEditingFolder(null);
    setFolderNameInput("");
    setFolderColorInput(FOLDER_COLORS[0].hex);
    setFolderModalOpen(true);
  };

  const openEditFolderModal = (folder: NotebookFolder) => {
    setEditingFolder(folder);
    setFolderNameInput(folder.name);
    setFolderColorInput(folder.color || FOLDER_COLORS[0].hex);
    setFolderModalOpen(true);
  };

  const handleSubmitFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = folderNameInput.trim();
    if (!cleanName) return;

    if (editingFolder) {
      const updated: NotebookFolder = {
        ...editingFolder,
        name: cleanName,
        color: folderColorInput,
        updatedAt: Date.now(),
      };
      onSaveFolder(updated);
      showToast(`อัปเดตโฟลเดอร์ "${cleanName}" แล้ว`);
    } else {
      const created = createFolder(
        cleanName,
        folderColorInput,
        currentFolderId
      );
      onSaveFolder(created);
      showToast(`สร้างโฟลเดอร์ "${created.name}" แล้ว`);
    }
    setFolderModalOpen(false);
  };

  const handlePerformMove = (
    notebook: ShootNotebook,
    targetFolderId: string | null
  ) => {
    if ((notebook.folderId ?? null) === targetFolderId) {
      setMovingNotebook(null);
      return;
    }
    onMoveNotebook(notebook.id, targetFolderId);
    const destName = targetFolderId
      ? foldersById.get(targetFolderId)?.name || "โฟลเดอร์"
      : "หน้าแรก (นอกโฟลเดอร์)";
    showToast(`ย้าย "${notebook.title}" ไปยัง "${destName}" แล้ว`);
    setMovingNotebook(null);
  };

  const handleDropOnTarget = (targetFolderId: string | null) => {
    setDragOverTarget(null);
    if (!draggingNotebookId) return;
    const nb = notebooks.find((n) => n.id === draggingNotebookId);
    setDraggingNotebookId(null);
    if (nb) {
      handlePerformMove(nb, targetFolderId);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[1360px] px-4 py-5 sm:px-6 lg:px-8 space-y-6">
        {/* Library Hero Header + Quick Create */}
        <div className="rounded-2xl border border-line bg-white p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              {/* Breadcrumb Trail (also acts as Drop Targets to move files out of subfolders) */}
              <nav
                aria-label="เส้นทางโฟลเดอร์"
                className="flex flex-wrap items-center gap-1 text-xs"
              >
                <button
                  type="button"
                  onClick={() => onChangeCurrentFolder(null)}
                  onDragOver={(e) => {
                    if (!draggingNotebookId) return;
                    e.preventDefault();
                    setDragOverTarget("root");
                  }}
                  onDragLeave={() => {
                    if (dragOverTarget === "root") setDragOverTarget(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnTarget(null);
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium transition-colors ${
                    dragOverTarget === "root"
                      ? "bg-accent text-white ring-2 ring-accent/40"
                      : currentFolderId === null
                        ? "bg-accent-soft text-accent-dark"
                        : "text-muted hover:bg-paper hover:text-ink"
                  }`}
                >
                  <Home className="h-3.5 w-3.5" />
                  <span>หน้าแรก</span>
                </button>

                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  const isOver = dragOverTarget === crumb.id;
                  return (
                    <div
                      key={crumb.id}
                      className="inline-flex items-center gap-1"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-muted" />
                      <button
                        type="button"
                        onClick={() => onChangeCurrentFolder(crumb.id)}
                        onDragOver={(e) => {
                          if (!draggingNotebookId) return;
                          e.preventDefault();
                          setDragOverTarget(crumb.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverTarget === crumb.id)
                            setDragOverTarget(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDropOnTarget(crumb.id);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-colors ${
                          isOver
                            ? "bg-accent text-white ring-2 ring-accent/40"
                            : isLast
                              ? "bg-accent-soft text-accent-dark"
                              : "text-muted hover:bg-paper hover:text-ink"
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: crumb.color }}
                        />
                        <span className="truncate max-w-[160px]">
                          {crumb.name}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </nav>

              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg sm:text-xl font-bold text-ink truncate">
                  {activeFolder ? activeFolder.name : "คลังสมุดจด ShootNote"}
                </h1>
                <span className="rounded-full bg-paper border border-line px-2.5 py-0.5 text-[11px] font-medium text-muted">
                  {folders.length} โฟลเดอร์ · {notebooks.length} สมุด
                </span>
                {toast && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    <Check className="h-3 w-3" />
                    {toast}
                  </span>
                )}
              </div>
            </div>

            {/* Primary Create & Import Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openCreateFolderModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-[#efede6] transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5 text-accent" />
                <span>+ โฟลเดอร์ใหม่</span>
              </button>

              <button
                type="button"
                onClick={() => onCreateNotebook("notebook", currentFolderId)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ สมุดจด</span>
              </button>

              <button
                type="button"
                onClick={() => onCreateNotebook("shortnote", currentFolderId)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
              >
                <Zap className="h-3.5 w-3.5 text-amber-600" />
                <span>ShortNote</span>
              </button>

              <button
                type="button"
                onClick={() => onCreateNotebook("slides", currentFolderId)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 transition-colors"
              >
                <Presentation className="h-3.5 w-3.5 text-indigo-600" />
                <span>สไลด์ 16:9</span>
              </button>

              <input
                ref={pdfImportRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportPdfNotebook(f, currentFolderId);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={isImportingPdf}
                onClick={() => pdfImportRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 transition-colors disabled:opacity-50"
                title="นำเข้าไฟล์ PDF เพื่อเขียนโน้ตและส่งออกเป็น PDF ได้ทันที"
              >
                <FilePlus className="h-3.5 w-3.5 text-sky-600" />
                <span>{isImportingPdf ? "กำลังนำเข้า PDF..." : "นำเข้า PDF"}</span>
              </button>

              <input
                ref={importInputRef}
                type="file"
                accept=".json,.shootnote.json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportBackup(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-medium text-ink hover:bg-[#efede6] transition-colors"
                title="นำเข้าไฟล์สำรอง .shootnote"
              >
                <Upload className="h-3.5 w-3.5 text-accent" />
                <span className="hidden sm:inline">นำเข้า .shootnote</span>
              </button>
            </div>
          </div>

          {/* Search, Filter & Sort Strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-line/70">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาสมุดจดหรือโฟลเดอร์..."
                className="w-full rounded-xl border border-line bg-paper py-1.5 pl-8 pr-8 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-2 text-muted hover:text-ink"
                  aria-label="ล้างคำค้นหา"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-xl border border-line bg-paper p-0.5">
                {(
                  [
                    ["all", "ทั้งหมด"],
                    ["notebook", "สมุดจด"],
                    ["shortnote", "ShortNote"],
                    ["slides", "สไลด์ 16:9"],
                  ] as Array<[KindFilter, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setKindFilter(id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      kindFilter === id
                        ? "bg-white text-ink shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                aria-label="เรียงลำดับสมุด"
                className="rounded-xl border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink focus:border-accent focus:outline-none"
              >
                <option value="updated">แก้ไขล่าสุด</option>
                <option value="title">เรียงตามชื่อ ก-ฮ</option>
                <option value="oldest">สร้างเก่าสุดก่อน</option>
              </select>
            </div>
          </div>
        </div>

        {/* Drag Hint Banner */}
        {draggingNotebookId && (
          <div className="rounded-xl border border-accent bg-accent-soft px-4 py-2 text-xs font-medium text-accent-dark flex items-center gap-2">
            <FolderInput className="h-4 w-4 shrink-0" />
            <span>
              ลากไปวางบนโฟลเดอร์ หรือวางบนแถบเส้นทางด้านบน เพื่อย้ายสมุดเข้าโฟลเดอร์นั้นทันที
            </span>
          </div>
        )}

        {/* Folders Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
              {isSearching
                ? `โฟลเดอร์ที่พบ (${visibleFolders.length})`
                : activeFolder
                  ? `โฟลเดอร์ย่อย (${visibleFolders.length})`
                  : `โฟลเดอร์ทั้งหมด (${visibleFolders.length})`}
            </h2>
            {!isSearching && (
              <span className="text-[11px] text-muted hidden sm:inline">
                เคล็ดลับ: ลากการ์ดสมุดมาวางบนโฟลเดอร์เพื่อย้ายได้ทันที หรือกดปุ่ม &ldquo;ย้ายโฟลเดอร์&rdquo;
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {visibleFolders.map((folder) => {
              const count = countNotebooksInFolder(
                notebooks,
                folders,
                folder.id
              );
              const isDropActive = dragOverTarget === folder.id;

              return (
                <div
                  key={folder.id}
                  onClick={() => onChangeCurrentFolder(folder.id)}
                  onDragOver={(e) => {
                    if (!draggingNotebookId) return;
                    e.preventDefault();
                    setDragOverTarget(folder.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverTarget === folder.id) setDragOverTarget(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnTarget(folder.id);
                  }}
                  className={`group relative cursor-pointer rounded-2xl border bg-white p-3.5 transition-all shadow-sm hover:shadow-md ${
                    isDropActive
                      ? "border-accent ring-2 ring-accent/40 scale-[1.02]"
                      : "border-line hover:border-accent/50"
                  }`}
                >
                  {/* GoodNotes-style colored top folder tab */}
                  <div
                    className="h-2 w-14 rounded-full mb-2.5"
                    style={{ backgroundColor: folder.color }}
                  />

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                        style={{ backgroundColor: folder.color }}
                      >
                        <Folder className="h-5 w-5 fill-current/20" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-ink truncate">
                          {folder.name}
                        </p>
                        <p className="text-[11px] text-muted">
                          {isDropActive
                            ? "วางเพื่อย้ายเข้าโฟลเดอร์นี้"
                            : `${count} สมุด`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Edit / Delete Buttons */}
                  <div className="mt-2.5 pt-2 border-t border-line/60 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditFolderModal(folder);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted hover:bg-paper hover:text-ink"
                      title="แก้ไขชื่อ / สีโฟลเดอร์"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(folder.id);
                        showToast(
                          `ลบโฟลเดอร์ "${folder.name}" แล้ว (สมุดข้างในยังคงอยู่ปลอดภัย)`
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted hover:bg-rose-50 hover:text-rose-600"
                      title="ลบโฟลเดอร์ (ไม่ลบสมุดข้างใน)"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>ลบ</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {!isSearching && (
              <button
                type="button"
                onClick={openCreateFolderModal}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-white/60 p-4 text-center text-muted hover:border-accent hover:text-accent transition-colors min-h-[118px]"
              >
                <FolderPlus className="h-6 w-6" />
                <span className="text-xs font-semibold">+ สร้างโฟลเดอร์ใหม่</span>
              </button>
            )}
          </div>
        </section>

        {/* Notebooks Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
              {isSearching
                ? `สมุดที่พบ (${visibleNotebooks.length})`
                : activeFolder
                  ? `สมุดในโฟลเดอร์ "${activeFolder.name}" (${visibleNotebooks.length})`
                  : `สมุดจดทั้งหมดในหน้านี้ (${visibleNotebooks.length})`}
            </h2>
          </div>

          {visibleNotebooks.length === 0 ? (
            <div className="rounded-2xl border border-line bg-white p-10 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-paper text-muted">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink">
                  {isSearching
                    ? "ไม่พบสมุดที่ตรงกับคำค้นหา"
                    : activeFolder
                      ? `ยังไม่มีสมุดในโฟลเดอร์ "${activeFolder.name}"`
                      : "ยังไม่มีสมุดในหน้าแรก"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  สร้างสมุดใหม่ในโฟลเดอร์นี้ หรือกดปุ่ม &ldquo;ย้ายโฟลเดอร์&rdquo; จากสมุดเล่มอื่นเพื่อนำมาจัดเก็บที่นี่ได้
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onCreateNotebook("notebook", currentFolderId)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>สร้างสมุดจดที่นี่</span>
                </button>
                {activeFolder && (
                  <button
                    type="button"
                    onClick={() => onChangeCurrentFolder(null)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper px-4 py-2 text-xs font-medium text-ink hover:bg-[#efede6]"
                  >
                    <Home className="h-3.5 w-3.5" />
                    <span>กลับหน้าแรก</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleNotebooks.map((nb) => {
                const pages = ensureNotebookPages(nb);
                const visibleItems = nb.items.filter((i) => !i.deleted).length;
                const visibleStrokes = nb.strokes.filter(
                  (s) => !s.deleted
                ).length;
                const nbFolder = nb.folderId
                  ? foldersById.get(nb.folderId) || null
                  : null;
                const firstPageTpl = pages[0]?.paperTemplate || nb.paperTemplate;
                const darkPreview =
                  nb.kind !== "slides" && isDarkPaperTemplate(firstPageTpl);

                return (
                  <div
                    key={nb.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", nb.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingNotebookId(nb.id);
                    }}
                    onDragEnd={() => {
                      setDraggingNotebookId(null);
                      setDragOverTarget(null);
                    }}
                    onClick={() => onOpenNotebook(nb.id)}
                    className={`group cursor-pointer rounded-2xl border border-line bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-accent/60 transition-all flex flex-col ${
                      draggingNotebookId === nb.id ? "opacity-60 scale-[0.98]" : ""
                    }`}
                  >
                    {/* Miniature Cover / Paper Preview */}
                    <div
                      data-paper-surface="true"
                      data-dark-paper={darkPreview ? "true" : "false"}
                      style={getPreviewCoverStyle(firstPageTpl, nb.kind)}
                      className="relative h-32 border-b border-line/80 p-3 flex flex-col justify-between overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold shadow-sm ${
                            nb.kind === "shortnote"
                              ? "bg-amber-100 text-amber-900"
                              : nb.kind === "slides"
                                ? "bg-indigo-100 text-indigo-900"
                                : "bg-teal-100 text-teal-900"
                          }`}
                        >
                          {nb.kind === "shortnote" ? (
                            <Zap className="h-3 w-3" />
                          ) : nb.kind === "slides" ? (
                            <Presentation className="h-3 w-3" />
                          ) : (
                            <BookOpen className="h-3 w-3" />
                          )}
                          <span>
                            {nb.kind === "shortnote"
                              ? "ShortNote"
                              : nb.kind === "slides"
                                ? "สไลด์ 16:9"
                                : "สมุดจด"}
                          </span>
                        </span>

                        {nb.roomId && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                            <Radio className="h-2.5 w-2.5" />
                            <span>{nb.roomId}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-end justify-between gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm ${
                            darkPreview
                              ? "bg-black/45 text-gray-200"
                              : "bg-white/90 text-stone-700 border border-stone-200/70"
                          }`}
                        >
                          {pages.length}{" "}
                          {nb.kind === "slides" ? "สไลด์" : "หน้า"} ·{" "}
                          {visibleItems} กล่อง · {visibleStrokes} เส้น
                        </span>
                      </div>
                    </div>

                    {/* Metadata + Touch/Click Action Buttons */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                      <div>
                        <h3 className="text-sm font-bold text-ink line-clamp-1 group-hover:text-accent-dark transition-colors">
                          {nb.title}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span>อัปเดต {formatShortDate(nb.updatedAt)}</span>
                          {nbFolder && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-paper border border-line px-2 py-0.5 text-[10px] font-medium text-ink">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: nbFolder.color }}
                              />
                              <span className="truncate max-w-[100px]">
                                {nbFolder.name}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-line/60 flex items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMovingNotebook(nb);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-[#efede6] transition-colors"
                          title="ย้ายสมุดนี้ไปยังโฟลเดอร์อื่น"
                        >
                          <FolderInput className="h-3 w-3 text-accent" />
                          <span>ย้ายโฟลเดอร์</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNotebook(nb.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          aria-label={`ลบสมุด ${nb.title}`}
                          title="ลบสมุดนี้"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>ลบ</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Create / Edit Folder Modal */}
      {folderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs"
          onClick={() => setFolderModalOpen(false)}
        >
          <form
            onSubmit={handleSubmitFolder}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">
                {editingFolder ? "แก้ไขโฟลเดอร์" : "สร้างโฟลเดอร์ใหม่"}
              </h3>
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-paper"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink">
                ชื่อโฟลเดอร์
              </label>
              <input
                type="text"
                autoFocus
                required
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                placeholder="เช่น งานวิจัย, ประชุมทีม, วิชาเคมี..."
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink">
                สีโฟลเดอร์
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setFolderColorInput(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    aria-label={`เลือกสี ${c.name}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform ${
                      folderColorInput.toLowerCase() === c.hex.toLowerCase()
                        ? "border-ink scale-110 ring-2 ring-accent/40"
                        : "border-white/70 hover:scale-105"
                    }`}
                  >
                    {folderColorInput.toLowerCase() === c.hex.toLowerCase() && (
                      <Check className="h-4 w-4 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="rounded-xl border border-line bg-paper px-4 py-2 text-xs font-medium text-ink hover:bg-[#efede6]"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark shadow-sm"
              >
                {editingFolder ? "บันทึกการแก้ไข" : "สร้างโฟลเดอร์"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move Notebook Between Folders Modal */}
      {movingNotebook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs"
          onClick={() => setMovingNotebook(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-ink">
                  ย้ายสมุดไปยังโฟลเดอร์
                </h3>
                <p className="text-xs text-muted truncate mt-0.5">
                  สมุด: {movingNotebook.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovingNotebook(null)}
                className="rounded-lg p-1 text-muted hover:bg-paper"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              <button
                type="button"
                onClick={() => handlePerformMove(movingNotebook, null)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  (movingNotebook.folderId ?? null) === null
                    ? "border-accent bg-accent-soft text-accent-dark"
                    : "border-line bg-paper text-ink hover:bg-[#efede6]"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Home className="h-4 w-4 text-accent" />
                  <span>หน้าแรก (นอกโฟลเดอร์)</span>
                </span>
                {(movingNotebook.folderId ?? null) === null && (
                  <Check className="h-4 w-4" />
                )}
              </button>

              {folders.map((folder) => {
                const isCurrent = movingNotebook.folderId === folder.id;
                const pathNames = getFolderBreadcrumbs(folders, folder.id)
                  .map((f) => f.name)
                  .join(" / ");
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => handlePerformMove(movingNotebook, folder.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                      isCurrent
                        ? "border-accent bg-accent-soft text-accent-dark"
                        : "border-line bg-white text-ink hover:bg-paper"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="truncate">{pathNames}</span>
                    </span>
                    {isCurrent && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}

              {folders.length === 0 && (
                <p className="py-4 text-center text-xs text-muted">
                  ยังไม่มีโฟลเดอร์ กด &ldquo;+ โฟลเดอร์ใหม่&rdquo; เพื่อสร้างก่อนได้เลย
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
