"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  LogOut,
  Radio,
  RefreshCw,
  User,
  Users,
  X,
} from "lucide-react";
import type { PeerPresence } from "../../types/notebook";
import type { RoomSyncStatus } from "../../lib/realtime-sync";

interface ShareRoomModalProps {
  isOpen: boolean;
  roomId?: string;
  syncStatus: RoomSyncStatus;
  peers: PeerPresence[];
  displayName: string;
  onChangeDisplayName: (name: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: (roomCodeOrUrl: string) => void;
  onLeaveRoom: () => void;
  onForceSync?: () => void;
  onClose: () => void;
}

export function ShareRoomModal({
  isOpen,
  roomId,
  syncStatus,
  peers,
  displayName,
  onChangeDisplayName,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onForceSync,
  onClose,
}: ShareRoomModalProps) {
  const [nameInput, setNameInput] = useState(displayName);
  const [joinInput, setJoinInput] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [syncRequested, setSyncRequested] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNameInput(displayName);
      setJoinInput("");
    }
  }, [isOpen, displayName]);

  if (!isOpen) return null;

  const shareUrl =
    typeof window !== "undefined" && roomId
      ? `${window.location.origin}/?room=${encodeURIComponent(roomId)}`
      : "";

  const handleCopyInvite = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const el = document.createElement("textarea");
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinInput.trim();
    if (!raw) return;
    onChangeDisplayName(nameInput.trim() || "ฉัน");

    // Extract ?room=... if user pasted a full URL
    let extracted = raw;
    try {
      if (raw.startsWith("http")) {
        const parsed = new URL(raw);
        extracted = parsed.searchParams.get("room") || raw;
      }
    } catch {
      // Keep raw room code
    }
    onJoinRoom(extracted.trim().toUpperCase());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-room-modal-title"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-white shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="share-room-modal-title"
                className="text-base font-semibold text-ink"
              >
                แชร์งานทำร่วมกันแบบเรียลไทม์ (ฟรี 100%)
              </h2>
              <p className="text-xs text-muted">
                ส่งลิงก์ให้เพื่อนเปิดพร้อมกัน เขียนปากกา/แปะโน้ตเห็นสดๆ และเซฟลงเครื่องแต่ละคน
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-paper hover:text-ink"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Display Name */}
          <div>
            <label
              htmlFor="collab-display-name"
              className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1.5"
            >
              <User className="h-3.5 w-3.5 text-accent" />
              ชื่อของคุณ (เพื่อนจะเห็นบนเคอร์เซอร์ตอนเขียนร่วมกัน)
            </label>
            <div className="flex gap-2">
              <input
                id="collab-display-name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => onChangeDisplayName(nameInput.trim() || "ฉัน")}
                placeholder="เช่น พลอย, ต้น, นัท"
                className="flex-1 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-accent focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {roomId ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-emerald-600 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-900">
                    {syncStatus === "connected"
                      ? `เชื่อมต่อซิงก์สดแล้ว (${peers.length + 1} คนในห้อง)`
                      : syncStatus === "local"
                        ? "ซิงก์ในเครื่องพร้อมแล้ว · กำลังเชื่อมเครือข่ายเพื่อน..."
                        : syncStatus === "connecting"
                          ? "กำลังเชื่อมต่อเครือข่ายซิงก์สด..."
                          : "ออฟไลน์ · บันทึกในเครื่องอัตโนมัติ"}
                  </span>
                </div>
                <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800">
                  {roomId}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-[11px] text-ink"
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>คัดลอกแล้ว</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>คัดลอกลิงก์เชิญ</span>
                    </>
                  )}
                </button>
              </div>

              {peers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-emerald-900">เพื่อนที่กำลังดูอยู่:</span>
                  {peers.map((p) => (
                    <span
                      key={p.peerId}
                      style={{ borderColor: p.color }}
                      className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium text-ink"
                    >
                      <span
                        style={{ backgroundColor: p.color }}
                        className="h-2 w-2 rounded-full"
                      />
                      {p.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {onForceSync && (
                  <button
                    type="button"
                    onClick={() => {
                      onForceSync();
                      setSyncRequested(true);
                      setTimeout(() => setSyncRequested(false), 1800);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${syncRequested ? "animate-spin" : ""}`}
                    />
                    <span>
                      {syncRequested ? "ส่งคำขอซิงก์แล้ว" : "ซิงก์ข้อมูลล่าสุด"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  ปิดการแชร์ห้องนี้ (เก็บสำเนาไว้ในเครื่อง)
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-paper p-4 space-y-2.5">
                <p className="text-xs font-semibold text-ink">
                  เปิดห้องแชร์จากสมุดหน้านี้
                </p>
                <p className="text-xs text-muted leading-relaxed">
                  ระบบจะสร้างรหัสห้องและลิงก์เฉพาะสำหรับสมุดเล่มนี้ ให้เพื่อนเปิดบน iPad, มือถือ หรือคอม แล้วเขียนเติมตกแต่งไปพร้อมกันได้ทันที
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onChangeDisplayName(nameInput.trim() || "ฉัน");
                    onCreateRoom();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
                >
                  <Link2 className="h-4 w-4" />
                  <span>สร้างห้องแชร์สด (Live Room)</span>
                </button>
              </div>

              <form
                onSubmit={handleJoinSubmit}
                className="rounded-xl border border-line bg-paper p-4 space-y-2.5"
              >
                <p className="text-xs font-semibold text-ink">
                  หรือเข้าร่วมห้องของเพื่อน
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                    placeholder="วางรหัสห้อง (เช่น SN-A4K9M2) หรือลิงก์"
                    className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-black"
                  >
                    เข้าห้อง
                  </button>
                </div>
              </form>
            </div>
          )}

          <p className="text-[11px] text-muted leading-relaxed">
            หมายเหตุ: การซิงก์สดเชื่อมห้องผ่านเครือข่ายเรียลไทม์ (รองรับทั้ง iPad, มือถือ และคอมข้ามเน็ต) โดยทุกเครื่องจะบันทึกสมุดเก็บไว้ในเครื่องตัวเองอัตโนมัติ หรือส่งออกไฟล์ <code>.shootnote</code> ไว้สำรองได้ครับ
          </p>
        </div>
      </div>
    </div>
  );
}
