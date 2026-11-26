"use client";

import { useRef, useState } from "react";
import {
  BookOpen,
  FolderOpen,
  Plus,
  Radio,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import type { ShootNotebook } from "../../types/notebook";

interface NotebookSidebarProps {
  notebooks: ShootNotebook[];
  activeId: string | null;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSelect: (id: string) => void;
  onCreate: (kind: "notebook" | "shortnote") => void;
  onDelete: (id: string) => void;
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
  activeId,
  isOpenMobile,
  onCloseMobile,
  onSelect,
  onCreate,
  onDelete,
  onImportBackup,
}: NotebookSidebarProps) {
  const [query, setQuery] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = notebooks.filter((nb) => {
    if (!query.trim()) return true;
    return nb.title.toLowerCase().includes(query.trim().toLowerCase());
  });

  const content = (
    <div className="flex h-full flex-col bg-white border-r border-line">
      <div className="border-b border-line p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              สมุดจด ShootNote ({notebooks.length})
            </h2>
            <p className="text-[11px] text-muted">
              บันทึกอัตโนมัติเฉพาะบนเครื่องนี้
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-paper lg:hidden"
            aria-label="ปิดรายการสมุดจด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              onCreate("notebook");
              onCloseMobile();
            }}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-accent px-2.5 py-2 text-xs font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>สมุดจดยาว</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onCreate("shortnote");
              onCloseMobile();
            }}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
          >
            <Zap className="h-3.5 w-3.5 text-amber-600" />
            <span>ShortNote</span>
          </button>
        </div>
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
              {notebooks.length === 0 ? "ยังไม่มีสมุดจด" : "ไม่พบสมุดที่ค้นหา"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              กด &quot;+ สมุดจดยาว&quot; หรือ &quot;ShortNote&quot; เพื่อเริ่มเขียนได้เลย
            </p>
          </div>
        ) : (
          filtered.map((nb) => {
            const isActive = nb.id === activeId;
            const visibleItems = nb.items.filter((i) => !i.deleted).length;
            const visibleStrokes = nb.strokes.filter((s) => !s.deleted).length;

            return (
              <div
                key={nb.id}
                onClick={() => {
                  onSelect(nb.id);
                  onCloseMobile();
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
                        : "bg-teal-50 text-accent"
                    }`}
                  >
                    {nb.kind === "shortnote" ? (
                      <Zap className="h-3.5 w-3.5" />
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
      <aside className="no-print hidden lg:block w-[280px] shrink-0 h-[calc(100vh-61px)] sticky top-[61px]">
        {content}
      </aside>

      {isOpenMobile && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/35 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full w-[290px] max-w-[85vw] shadow-xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
