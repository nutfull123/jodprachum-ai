"use client";

import {
  BookOpen,
  KeyRound,
  Menu,
  Mic,
  Moon,
  PenTool,
  Plus,
  Smartphone,
  Sparkles,
  Sun,
} from "lucide-react";

export type WorkspaceMode = "notebook" | "meeting";

interface HeaderBarProps {
  workspaceMode: WorkspaceMode;
  theme: "light" | "dark";
  hasServerKey: boolean;
  hasUserKey: boolean;
  isStandalone: boolean;
  onChangeWorkspace: (mode: WorkspaceMode) => void;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onNewAction: () => void;
  onLoadSample: () => void;
  onOpenApiModal: () => void;
  onOpenInstallModal: () => void;
}

export function HeaderBar({
  workspaceMode,
  theme,
  hasServerKey,
  hasUserKey,
  isStandalone,
  onChangeWorkspace,
  onToggleTheme,
  onToggleSidebar,
  onNewAction,
  onLoadSample,
  onOpenApiModal,
  onOpenInstallModal,
}: HeaderBarProps) {
  const aiReady = hasUserKey || hasServerKey;

  return (
    <header className="no-print safe-top-header sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-3 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper text-ink hover:bg-[#efede6] lg:hidden"
            aria-label="เปิดแถบรายการ"
          >
            <Menu className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onChangeWorkspace("notebook")}
            className="flex items-center gap-2 text-left group shrink-0"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm group-hover:bg-accent-dark transition-colors">
              <PenTool className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-ink block whitespace-nowrap">
                ShootNote
              </span>
              <p className="hidden xl:block text-[11px] text-muted whitespace-nowrap">
                GoodNotes Canvas · ShortNote · ถอดเสียง AI
              </p>
            </div>
          </button>

          {/* Desktop Workspace Switcher */}
          <div className="hidden lg:inline-flex items-center rounded-xl bg-paper p-1 border border-line ml-2 shrink-0">
            <button
              type="button"
              onClick={() => onChangeWorkspace("notebook")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                workspaceMode === "notebook"
                  ? "bg-white text-accent-dark shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>สมุดจด ShootNote</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeWorkspace("meeting")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                workspaceMode === "meeting"
                  ? "bg-white text-accent-dark shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              <span>ถอดเสียงประชุม AI</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {workspaceMode === "meeting" && (
            <button
              type="button"
              onClick={onLoadSample}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6] transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              ดูตัวอย่างประชุม
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex h-8 sm:h-auto items-center justify-center gap-1 rounded-lg border border-line bg-paper px-2 sm:px-2.5 sm:py-1.5 text-xs font-medium text-ink hover:bg-[#efede6] transition-colors"
            title={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
            aria-label="เปลี่ยนธีมสว่าง/มืด"
          >
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-ink" />
            )}
            <span className="hidden sm:inline">
              {theme === "dark" ? "สว่าง" : "มืด"}
            </span>
          </button>

          {!isStandalone && (
            <button
              type="button"
              onClick={onOpenInstallModal}
              className="inline-flex h-8 sm:h-auto items-center justify-center gap-1 rounded-lg border border-line bg-paper px-2 sm:px-3 sm:py-1.5 text-xs font-medium text-ink hover:bg-[#efede6] transition-colors"
              title="เพิ่ม ShootNote ลงหน้าจอมือถือ / iPad"
              aria-label="เพิ่ม ShootNote ลงหน้าจอมือถือ"
            >
              <Smartphone className="h-3.5 w-3.5 text-accent" />
              <span className="hidden sm:inline">เพิ่มลงมือถือ</span>
            </button>
          )}

          <button
            type="button"
            onClick={onNewAction}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {workspaceMode === "notebook" ? "สร้างสมุดใหม่" : "ประชุมใหม่"}
            </span>
            <span className="sm:hidden">ใหม่</span>
          </button>

          <button
            type="button"
            onClick={onOpenApiModal}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
              aiReady
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {hasUserKey
                ? "คีย์ AI พร้อม"
                : hasServerKey
                  ? "คีย์กลางพร้อม"
                  : "ตั้งค่าคีย์ AI ฟรี"}
            </span>
            <span className="sm:hidden">คีย์ AI</span>
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Compact Workspace Switcher */}
      <div className="lg:hidden border-t border-line bg-paper/80 px-3 py-1.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onChangeWorkspace("notebook")}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
            workspaceMode === "notebook"
              ? "bg-white text-accent-dark shadow-sm border border-line"
              : "text-muted"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>สมุดจด ShootNote</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeWorkspace("meeting")}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
            workspaceMode === "meeting"
              ? "bg-white text-accent-dark shadow-sm border border-line"
              : "text-muted"
          }`}
        >
          <Mic className="h-3.5 w-3.5" />
          <span>ถอดเสียงประชุม AI</span>
        </button>
      </div>
    </header>
  );
}
