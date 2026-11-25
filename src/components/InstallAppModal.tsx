"use client";

import {
  CheckCircle2,
  Download,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from "lucide-react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallAppModalProps {
  isOpen: boolean;
  canPromptInstall: boolean;
  onPromptInstall: () => void;
  onClose: () => void;
}

export function InstallAppModal({
  isOpen,
  canPromptInstall,
  onPromptInstall,
  onClose,
}: InstallAppModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-app-modal-title"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-white shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="install-app-modal-title"
                className="text-base font-semibold text-ink"
              >
                เพิ่มเว็บแอปลงหน้าจอมือถือ
              </h2>
              <p className="text-xs text-muted">
                เปิดใช้งานแบบเต็มจอเหมือนแอปจริง ไม่ต้องเข้าผ่านเบราว์เซอร์ทุกครั้ง
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
          {canPromptInstall && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>เบราว์เซอร์ของคุณรองรับการติดตั้งอัตโนมัติในคลิกเดียว</span>
              </div>
              <button
                type="button"
                onClick={onPromptInstall}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm"
              >
                <Download className="h-4 w-4" />
                <span>กดติดตั้งแอปลงเครื่องทันที</span>
              </button>
            </div>
          )}

          {/* iPhone / iPad Safari */}
          <div className="rounded-xl border border-line bg-paper p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink">
                สำหรับ iPhone / iPad (เปิดด้วย Safari)
              </h3>
              <span className="rounded-full bg-white border border-line px-2 py-0.5 text-[10px] font-medium text-muted">
                iOS Safari
              </span>
            </div>
            <ol className="space-y-2 text-xs text-ink/90 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                  1
                </span>
                <span>
                  กดปุ่ม{" "}
                  <strong className="inline-flex items-center gap-1 rounded bg-white border border-line px-1.5 py-0.5 font-medium">
                    <Share className="h-3 w-3 text-accent" /> แชร์ (Share)
                  </strong>{" "}
                  ตรงแถบด้านล่างหน้าจอ Safari
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                  2
                </span>
                <span>
                  เลื่อนรายการลงแล้วแตะ{" "}
                  <strong className="inline-flex items-center gap-1 rounded bg-white border border-line px-1.5 py-0.5 font-medium">
                    <PlusSquare className="h-3 w-3 text-accent" /> เพิ่มไปยังหน้าจอโฮม
                  </strong>{" "}
                  (Add to Home Screen)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                  3
                </span>
                <span>
                  กดปุ่ม <strong>เพิ่ม (Add)</strong> มุมขวาบน ก็จะได้ไอคอน{" "}
                  <strong>จดประชุม AI</strong> บนหน้าจอมือถือทันที
                </span>
              </li>
            </ol>
          </div>

          {/* Android Chrome */}
          <div className="rounded-xl border border-line bg-paper p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink">
                สำหรับ Android (เปิดด้วย Chrome)
              </h3>
              <span className="rounded-full bg-white border border-line px-2 py-0.5 text-[10px] font-medium text-muted">
                Android Chrome
              </span>
            </div>
            <ol className="space-y-2 text-xs text-ink/90 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
                  1
                </span>
                <span>
                  แตะปุ่มเมนู{" "}
                  <strong className="inline-flex items-center gap-0.5 rounded bg-white border border-line px-1.5 py-0.5 font-medium">
                    <MoreVertical className="h-3 w-3" /> จุดสามจุด
                  </strong>{" "}
                  มุมขวาบนของ Chrome
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
                  2
                </span>
                <span>
                  เลือก <strong>&quot;ติดตั้งแอป&quot;</strong> (Install app) หรือ{" "}
                  <strong>&quot;เพิ่มลงในหน้าจอหลัก&quot;</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
                  3
                </span>
                <span>กดยืนยันการติดตั้ง ไอคอนแอปจะปรากฏในหน้าหลักอัตโนมัติ</span>
              </li>
            </ol>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line bg-white px-4 py-2 text-xs font-medium text-ink hover:bg-paper"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
