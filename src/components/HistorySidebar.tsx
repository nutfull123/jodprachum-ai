"use client";

import { useState } from "react";
import {
  CheckCircle2,
  FileAudio,
  FolderOpen,
  Mic,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { SavedMeeting } from "../types/meeting";

interface HistorySidebarProps {
  meetings: SavedMeeting[];
  activeId: string | null;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

function formatShortThaiDate(ms: number): string {
  return new Date(ms).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistorySidebar({
  meetings,
  activeId,
  isOpenMobile,
  onCloseMobile,
  onSelect,
  onDelete,
  onClearAll,
}: HistorySidebarProps) {
  const [query, setQuery] = useState("");
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const filtered = meetings.filter((m) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      m.analysis.meetingTitle.toLowerCase().includes(q) ||
      m.fileName.toLowerCase().includes(q)
    );
  });

  const content = (
    <div className="flex h-full flex-col bg-white border-r border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            ประวัติประชุมของคุณ ({meetings.length})
          </h2>
          <p className="text-[11px] text-muted">
            บันทึกเฉพาะในเบราว์เซอร์เครื่องนี้เท่านั้น
          </p>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-paper lg:hidden"
          aria-label="ปิดแถบประวัติ"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {meetings.length > 3 && (
        <div className="border-b border-line px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อประชุม..."
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
              {meetings.length === 0
                ? "ยังไม่มีประวัติการประชุม"
                : "ไม่พบรายการที่ค้นหา"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {meetings.length === 0
                ? "โยนไฟล์เสียงหรือกดอัดเสียงเพื่อสร้างสรุปแรกได้เลย"
                : "ลองเปลี่ยนคำค้นหา"}
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const isActive = item.id === activeId;
            const totalTasks = item.analysis.tasks.length;
            const doneTasks = item.analysis.tasks.filter(
              (t) => t.status === "done"
            ).length;

            return (
              <div
                key={item.id}
                className={`group relative rounded-xl border p-2.5 transition-all cursor-pointer ${
                  isActive
                    ? "border-accent bg-accent-soft/70 shadow-sm"
                    : "border-transparent hover:border-line hover:bg-paper"
                }`}
                onClick={() => {
                  onSelect(item.id);
                  onCloseMobile();
                }}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      item.sourceType === "record"
                        ? "bg-rose-50 text-rose-600"
                        : item.sourceType === "demo"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-teal-50 text-accent"
                    }`}
                  >
                    {item.sourceType === "record" ? (
                      <Mic className="h-3.5 w-3.5" />
                    ) : item.sourceType === "demo" ? (
                      <Sparkles className="h-3.5 w-3.5" />
                    ) : (
                      <FileAudio className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pr-5">
                    <p
                      className={`text-xs font-semibold leading-snug line-clamp-2 ${
                        isActive ? "text-accent-dark" : "text-ink"
                      }`}
                    >
                      {item.analysis.meetingTitle}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      <span>{formatShortThaiDate(item.createdAt)}</span>
                      <span>·</span>
                      <span>{item.analysis.topics.length} หัวข้อ</span>
                      {totalTasks > 0 && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5 font-medium text-ink/80">
                            <CheckCircle2 className="h-3 w-3 text-accent" />
                            {doneTasks}/{totalTasks}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="absolute right-2 top-2 rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"
                  aria-label="ลบรายการนี้"
                  title="ลบรายการนี้"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {meetings.length > 0 && (
        <div className="border-t border-line p-3">
          {!confirmClearAll ? (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-muted hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              ล้างประวัติทั้งหมดในเครื่อง
            </button>
          ) : (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-center">
              <p className="text-[11px] font-medium text-rose-800">
                ยืนยันลบทั้งหมดในเครื่องนี้?
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmClearAll(false);
                  }}
                  className="flex-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-700"
                >
                  ลบเลย
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="flex-1 rounded-md border border-line bg-white px-2 py-1 text-[11px] font-medium text-ink hover:bg-paper"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
