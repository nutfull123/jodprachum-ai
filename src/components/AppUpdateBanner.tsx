"use client";

import { RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AppVersionPayload } from "../lib/app-version";

interface AppUpdateBannerProps {
  updateInfo: AppVersionPayload | null;
  isDialogOpen: boolean;
  isUpdating: boolean;
  onApplyUpdate: () => void;
  onSnooze: () => void;
  onReopen: () => void;
}

export function AppUpdateBanner({
  updateInfo,
  isDialogOpen,
  isUpdating,
  onApplyUpdate,
  onSnooze,
  onReopen,
}: AppUpdateBannerProps) {
  if (!updateInfo) return null;

  if (!isDialogOpen) {
    return (
      <button
        type="button"
        onClick={onReopen}
        className="no-print fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-white/95 px-3.5 py-2 text-xs font-semibold text-ink shadow-lg backdrop-blur hover:bg-accent-soft transition-colors"
      >
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        <span>มีอัปเดตใหม่ (v{updateInfo.version}) · กดอัปเดต</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-labelledby="shootnote-update-title"
      className="no-print fixed bottom-16 left-4 right-4 sm:bottom-16 sm:left-auto sm:right-5 sm:w-[400px] z-50 rounded-2xl border border-accent/30 bg-white p-4 shadow-2xl space-y-3"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3
                id="shootnote-update-title"
                className="text-sm font-bold text-ink"
              >
                มีอัปเดตฟีเจอร์ใหม่ของ ShootNote!
              </h3>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-dark">
                v{updateInfo.version}
              </span>
            </div>
            <p className="text-[11px] text-muted">
              พร้อมใช้งานเวอร์ชันล่าสุดบนเครื่องคุณแล้ว
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSnooze}
          disabled={isUpdating}
          aria-label="ไว้ทีหลัง"
          className="rounded-lg p-1 text-muted hover:bg-paper hover:text-ink disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {updateInfo.highlights.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-xs text-ink">
          {updateInfo.highlights.slice(0, 3).map((item, idx) => (
            <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
              <span className="text-accent font-bold">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span>ข้อมูลสมุดจดและประวัติประชุมในเครื่องของคุณจะไม่หาย</span>
      </p>

      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onSnooze}
          disabled={isUpdating}
          className="rounded-xl border border-line bg-paper px-3.5 py-2 text-xs font-medium text-ink hover:bg-[#efede6] disabled:opacity-50"
        >
          ไว้ทีหลัง
        </button>
        <button
          type="button"
          onClick={onApplyUpdate}
          disabled={isUpdating}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-accent-dark disabled:opacity-70 transition-colors"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isUpdating ? "animate-spin" : ""}`}
          />
          <span>{isUpdating ? "กำลังอัปเดต..." : "อัปเดตเลยตอนนี้"}</span>
        </button>
      </div>
    </div>
  );
}
