"use client";

import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FolderOpen,
  Home,
  PanelLeftClose,
  Plus,
  Presentation,
  Radio,
  Search,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import type { NotebookFolder, ShootNotebook } from "../../types/notebook";

interface NotebookSidebarProps {
  notebooks: ShootNotebook[];
  folders: NotebookFolder[];
  activeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onGoHome: () => void;
  onSelect: (id: string) => void;
  onCreate: (
    kind: "notebook" | "shortnote" | "slides",
    folderId?: string | null
  ) => void;
  onDelete: (id: string) => void;
  onMoveNotebook: (notebookId: string, folderId: string | null) => void;
  onImportBackup: (file: File) => void;
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotebookSidebar({
  notebooks,
  folders,
  activeId,
  isOpen,
  onClose,
  onGoHome,
  onSelect,
  onCreate,
  onDelete,
  onMoveNotebook,
  onImportBackup,
}: NotebookSidebarProps) {
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const foldersById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders]
  );

  if (!isOpen) {
    return null;
  }

  const filtered = notebooks.filter((nb) => {
    if (folderFilter === "__root__") {
      if (nb.folderId) return false;
    } else if (folderFilter !== "all") {
      if (nb.folderId !== folderFilter) return false;
    }
    if (!query.trim()) return true;
    return nb.title.toLowerCase().includes(query.trim().toLowerCase());
  });

  const activeFolderTarget =
    folderFilter !== "all" && folderFilter !== "__root__" ? folderFilter : null;

  const content = (
    <div className="flex h-full flex-col bg-white border-r border-line">
      <div className="border-b border-line p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink truncate">
              สมุดจด ({notebooks.length})
            </h2>
            <p className="text-[11px] text-muted">
              บันทึกอัตโนมัติในเครื่อง
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                onGoHome();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-[11px] font-semibold text-ink hover:bg-[#efede6]"
              title="กลับไปหน้าแรก (คลังโฟลเดอร์)"
            >
              <Home className="h-3.5 w-3.5 text-accent" />
              <span>หน้าแรก</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-paper text-muted hover:text-ink hover:bg-[#efede6]"
              aria-label="พับเก็บแถบซ้าย"
              title="พับเก็บแถบรายการสมุด"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => {
              onCreate("notebook", activeFolderTarget);
            }}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-accent px-2 py-2 text-[11px] font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>สมุดจด</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCreate("shortnote", activeFolderTarget);
            }}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2 py-2 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
          >
            <Zap className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>Short</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCreate("slides", activeFolderTarget);
            }}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-2 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100 transition-colors"
          >
            <Presentation className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <span>สไลด์</span>
          </button>
        </div>

        {folders.length > 0 && (
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            aria-label="กรองตามโฟลเดอร์"
            className="w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink focus:border-accent focus:outline-none"
          >
            <option value="all">ทุกโฟลเดอร์ ({notebooks.length})</option>
            <option value="__root__">นอกโฟลเดอร์ (หน้าแรก)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                📁 {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {notebooks.length > 3 && (
        <div className="border-b border-line px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาสมุดจด..."
              className="w-full rounded-lg border border-line bg-paper py-1.5 pl-8 pr-2.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-paper text-muted">
              <FolderOpen className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium text-ink">
              {notebooks.length === 0 ? "ยังไม่มีสมุดจด" : "ไม่พบสมุดในตัวกรองนี้"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              กด &quot;+ สมุดจด&quot; หรือ &quot;Short&quot; เพื่อเริ่มเขียนได้เลย
            </p>
          </div>
        ) : (
          filtered.map((nb) => {
            const isActive = nb.id === activeId;
            const visibleItems = nb.items.filter((i) => !i.deleted).length;
            const visibleStrokes = nb.strokes.filter((s) => !s.deleted).length;
            const nbFolder = nb.folderId ? foldersById.get(nb.folderId) : null;

            return (
              <div
                key={nb.id}
                onClick={() => {
                  onSelect(nb.id);
                }}
                className={`group relative rounded-xl border p-2.5 transition-all cursor-pointer ${
                  isActive
                    ? "border-accent bg-accent-soft/70 shadow-sm"
                    : "border-transparent hover:border-line hover:bg-paper"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      nb.kind === "shortnote"
                        ? "bg-amber-50 text-amber-600"
                        : nb.kind === "slides"
                          ? "bg-indigo-50 text-indigo-600"
                          : "bg-teal-50 text-accent"
                    }`}
                  >
                    {nb.kind === "shortnote" ? (
                      <Zap className="h-3.5 w-3.5" />
                    ) : nb.kind === "slides" ? (
                      <Presentation className="h-3.5 w-3.5" />
                    ) : (
                      <BookOpen className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pr-5">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`text-xs font-semibold leading-snug truncate ${
                          isActive ? "text-accent-dark" : "text-ink"
                        }`}
                      >
                        {nb.title}
                      </p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted">
                      <span>{formatShortDate(nb.updatedAt)}</span>
                      {(visibleStrokes > 0 || visibleItems > 0) && (
                        <>
                          <span>·</span>
                          <span>
                            {visibleItems} กล่อง · {visibleStrokes} เส้น
                          </span>
                        </>
                      )}
                    </div>

                    {folders.length > 0 && (
                      <div
                        className="mt-1.5 flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {nbFolder && (
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: nbFolder.color }}
                          />
                        )}
                        <select
                          value={nb.folderId ?? ""}
                          onChange={(e) =>
                            onMoveNotebook(
                              nb.id,
                              e.target.value ? e.target.value : null
                            )
                          }
                          aria-label={`ย้ายโฟลเดอร์ของ ${nb.title}`}
                          className="rounded border border-line bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-ink focus:border-accent focus:outline-none max-w-[165px]"
                        >
                          <option value="">หน้าแรก (นอกโฟลเดอร์)</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              📁 {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {nb.roomId && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        <Radio className="h-2.5 w-2.5" />
                        Live: {nb.roomId}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(nb.id);
                  }}
                  className="absolute right-2 top-2 rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"
                  aria-label="ลบสมุดนี้"
                  title="ลบสมุดนี้"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-line p-3">
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
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6] transition-colors"
        >
          <Upload className="h-3.5 w-3.5 text-accent" />
          นำเข้าไฟล์ .shootnote
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop (>= 1280px): Docked side panel when open */}
      <aside className="no-print hidden xl:block w-[280px] shrink-0 h-full overflow-hidden">
        {content}
      </aside>

      {/* Tablet / iPad & Mobile (< 1280px): Non-crowding overlay drawer */}
      <div className="no-print fixed inset-0 z-50 flex xl:hidden">
        <div
          className="fixed inset-0 bg-black/35 backdrop-blur-[1px]"
          onClick={onClose}
        />
        <div className="relative z-10 h-full w-[290px] max-w-[85vw] shadow-xl">
          {content}
        </div>
      </div>
    </>
  );
}
