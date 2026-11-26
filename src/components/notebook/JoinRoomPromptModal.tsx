"use client";

import { useEffect, useState } from "react";
import { GitMerge, Sparkles, User, Users, X } from "lucide-react";
import type { ShootNotebook } from "../../types/notebook";

interface JoinRoomPromptModalProps {
  roomCode: string | null;
  initialDisplayName: string;
  localNotebooks: ShootNotebook[];
  onConfirm: (opts: { displayName: string; mergeNotebookId?: string }) => void;
  onCancel: () => void;
}

export function JoinRoomPromptModal({
  roomCode,
  initialDisplayName,
  localNotebooks,
  onConfirm,
  onCancel,
}: JoinRoomPromptModalProps) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"fresh" | "merge">("fresh");
  const [selectedNotebookId, setSelectedNotebookId] = useState("");
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    if (!roomCode) return;
    const cleanInit =
      initialDisplayName && initialDisplayName.trim() !== "ฉัน"
        ? initialDisplayName.trim()
        : "";
    setName(cleanInit);
    setNameError("");
    setMode("fresh");
    setSelectedNotebookId(localNotebooks[0]?.id || "");
  }, [roomCode, initialDisplayName, localNotebooks]);

  if (!roomCode) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("กรุณากรอกชื่อของคุณก่อนเข้าห้อง");
      return;
    }
    onConfirm({
      displayName: trimmed,
      mergeNotebookId:
        mode === "merge" && selectedNotebookId ? selectedNotebookId : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={onCancel}
      />

      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-room-prompt-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="join-room-prompt-title"
                  className="text-base font-semibold text-ink"
                >
                  เข้าร่วมห้องแชร์สด
                </h2>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800">
                  {roomCode}
                </span>
              </div>
              <p className="text-xs text-muted">
                ตั้งชื่อที่จะให้เพื่อนเห็นในห้องก่อนเริ่มทำงานร่วมกัน
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="ยกเลิก"
            className="rounded-lg p-1.5 text-muted hover:bg-paper hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label
              htmlFor="join-room-name-input"
              className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1.5"
            >
              <User className="h-3.5 w-3.5 text-accent" />
              ชื่อของคุณ (จำเป็นต้องกรอก)
            </label>
            <input
              id="join-room-name-input"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError("");
              }}
              placeholder="กรอกชื่อของคุณ เช่น พลอย, ต้น, นัท"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink focus:outline-none ${
                nameError
                  ? "border-rose-400 bg-rose-50/40 focus:border-rose-500"
                  : "border-line bg-paper focus:border-accent focus:bg-white"
              }`}
            />
            {nameError && (
              <p className="mt-1.5 text-xs font-medium text-rose-600">
                {nameError}
              </p>
            )}
          </div>

          {localNotebooks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink">
                เลือกวิธีจัดการข้อมูลสมุดเมื่อเข้าห้อง
              </p>

              <label
                className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                  mode === "fresh"
                    ? "border-accent bg-accent-soft/60"
                    : "border-line bg-paper hover:bg-[#efede6]"
                }`}
              >
                <input
                  type="radio"
                  name="join-room-mode"
                  checked={mode === "fresh"}
                  onChange={() => setMode("fresh")}
                  className="mt-0.5 accent-teal-700"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    <span>เข้าห้องใหม่ (ดึงข้อมูลจากห้องเพื่อน)</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed mt-0.5">
                    รับหน้ากระดาษและงานทั้งหมดจากห้องเพื่อนโดยไม่ปนกับสมุดอื่น
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                  mode === "merge"
                    ? "border-accent bg-accent-soft/60"
                    : "border-line bg-paper hover:bg-[#efede6]"
                }`}
              >
                <input
                  type="radio"
                  name="join-room-mode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                  className="mt-0.5 accent-teal-700"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <GitMerge className="h-3.5 w-3.5 text-accent" />
                    <span>รวมสมุดที่แยกทำไว้ในเครื่องเข้าห้องนี้ด้วย</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    ลายเส้น โพสต์อิท และหน้ากระดาษที่แยกทำไว้จะถูกรวมกับเพื่อนอัตโนมัติ (ไม่ทับกัน)
                  </p>
                  {mode === "merge" && (
                    <select
                      aria-label="เลือกสมุดที่ต้องการรวมเข้าห้อง"
                      value={selectedNotebookId}
                      onChange={(e) => setSelectedNotebookId(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                    >
                      {localNotebooks.map((nb) => (
                        <option key={nb.id} value={nb.id}>
                          {nb.title} ({nb.strokes.filter((s) => !s.deleted).length} เส้น ·{" "}
                          {nb.items.filter((i) => !i.deleted).length} การ์ด)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-line bg-paper px-4 py-2 text-xs font-medium text-ink hover:bg-[#efede6]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark shadow-sm transition-colors"
            >
              เข้าห้องแชร์สด
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
