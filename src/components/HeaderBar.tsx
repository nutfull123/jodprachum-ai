"use client";

import {
  KeyRound,
  Menu,
  Mic,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";

interface HeaderBarProps {
  hasServerKey: boolean;
  hasUserKey: boolean;
  isStandalone: boolean;
  onToggleSidebar: () => void;
  onNewMeeting: () => void;
  onLoadSample: () => void;
  onOpenApiModal: () => void;
  onOpenInstallModal: () => void;
}

export function HeaderBar({
  hasServerKey,
  hasUserKey,
  isStandalone,
  onToggleSidebar,
  onNewMeeting,
  onLoadSample,
  onOpenApiModal,
  onOpenInstallModal,
}: HeaderBarProps) {
  const aiReady = hasUserKey || hasServerKey;

  return (
    <header className="no-print safe-top-header sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-3 py-3 sm:px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper text-ink hover:bg-[#efede6] lg:hidden"
            aria-label="เปิดรายการประวัติประชุม"
          >
            <Menu className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onNewMeeting}
            className="flex items-center gap-2 text-left group min-w-0"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm group-hover:bg-accent-dark transition-colors">
              <Mic className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm sm:text-base tracking-tight text-ink truncate">
                  จดประชุม AI
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                  <ShieldCheck className="h-3 w-3" />
                  เก็บแยกเฉพาะเครื่องคุณ
                </span>
              </div>
              <p className="hidden md:block text-xs text-muted truncate">
                ถอดเสียง · สรุปแยกหัวข้อ · บอร์ดงาน · Mind Map
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onLoadSample}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6] transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            ดูตัวอย่างสรุปประชุม
          </button>

          {!isStandalone && (
            <button
              type="button"
              onClick={onOpenInstallModal}
              className="inline-flex h-8 sm:h-auto items-center justify-center gap-1 rounded-lg border border-line bg-paper px-2 sm:px-3 sm:py-1.5 text-xs font-medium text-ink hover:bg-[#efede6] transition-colors"
              title="เพิ่มเว็บแอปลงหน้าจอมือถือ"
              aria-label="เพิ่มเว็บแอปลงหน้าจอมือถือ"
            >
              <Smartphone className="h-3.5 w-3.5 text-accent" />
              <span className="hidden sm:inline">เพิ่มลงมือถือ</span>
            </button>
          )}

          <button
            type="button"
            onClick={onNewMeeting}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 sm:px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">ประชุมใหม่</span>
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
                ? "ใช้คีย์ส่วนตัวของคุณ"
                : hasServerKey
                  ? "คีย์กลางพร้อมใช้"
                  : "ตั้งค่าคีย์ AI ฟรี"}
            </span>
            <span className="sm:hidden">คีย์ AI</span>
          </button>
        </div>
      </div>
    </header>
  );
}
