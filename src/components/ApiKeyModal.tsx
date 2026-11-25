"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  hasServerKey: boolean;
  requiresPasscode: boolean;
  currentApiKey: string;
  currentPasscode: string;
  onClose: () => void;
  onSave: (apiKey: string, passcode: string) => void;
}

export function ApiKeyModal({
  isOpen,
  hasServerKey,
  requiresPasscode,
  currentApiKey,
  currentPasscode,
  onClose,
  onSave,
}: ApiKeyModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState(currentApiKey);
  const [passcodeInput, setPasscodeInput] = useState(currentPasscode);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(currentApiKey);
      setPasscodeInput(currentPasscode);
    }
  }, [isOpen, currentApiKey, currentPasscode]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(apiKeyInput.trim(), passcodeInput.trim());
    onClose();
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
        aria-labelledby="api-key-modal-title"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-white shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="api-key-modal-title"
                className="text-base font-semibold text-ink"
              >
                ตั้งค่า Gemini API Key (ใช้งานฟรี)
              </h2>
              <p className="text-xs text-muted">
                เก็บคีย์ไว้เฉพาะบนเบราว์เซอร์ของคุณเอง ไม่ปะปนกับคนอื่น
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

        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {hasServerKey && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  เซิร์ฟเวอร์นี้มีคีย์กลางเปิดให้ใช้งานอยู่แล้ว
                </p>
                <p className="mt-0.5 text-emerald-800/90">
                  คุณสามารถใช้งานได้ทันที หรือกรอกคีย์ฟรีส่วนตัวของคุณด้านล่างเพื่อแยกโควตาไม่แย่งกับคนอื่น
                </p>
              </div>
            </div>
          )}

          {requiresPasscode && !apiKeyInput.trim() && (
            <div>
              <label
                htmlFor="passcode-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1.5"
              >
                <Lock className="h-3.5 w-3.5 text-muted" />
                รหัสผ่านเข้าใช้คีย์กลาง (Passcode)
              </label>
              <input
                id="passcode-input"
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder="กรอกรหัสผ่านที่ได้จากผู้ดูแลระบบ"
                className="w-full rounded-xl border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-accent focus:bg-white focus:outline-none"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="gemini-key-input"
                className="text-xs font-semibold text-ink"
              >
                Gemini API Key ส่วนตัว (แนะนำ — แยกโควตาฟรีของคุณเอง)
              </label>
              {apiKeyInput && (
                <button
                  type="button"
                  onClick={() => setApiKeyInput("")}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline"
                >
                  <Trash2 className="h-3 w-3" />
                  ล้างคีย์
                </button>
              )}
            </div>
            <input
              id="gemini-key-input"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 font-mono text-xs text-ink focus:border-accent focus:bg-white focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-line bg-paper p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink">
                วิธีขอคีย์ฟรีจาก Google ใน 1 นาที (ไม่ต้องผูกบัตรเครดิต)
              </p>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-white border border-line px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent-soft"
              >
                เปิด Google AI Studio
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted leading-relaxed">
              <li>
                เข้าเว็บ{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline font-medium"
                >
                  aistudio.google.com/apikey
                </a>{" "}
                แล้วล็อกอินด้วยบัญชี Gmail ทั่วไป
              </li>
              <li>
                กดปุ่ม <strong className="text-ink">Create API key</strong>{" "}
                (สร้างคีย์ในโปรเจกต์ใหม่ได้ทันที)
              </li>
              <li>
                คัดลอกรหัสที่ขึ้นต้นด้วย{" "}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] border border-line">
                  AIza...
                </code>{" "}
                มาวางในช่องด้านบนแล้วกดบันทึก
              </li>
            </ol>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted">
            <ShieldCheck className="h-4 w-4 text-accent shrink-0" />
            <span>
              คีย์นี้ถูกบันทึกเฉพาะใน localStorage ของเครื่องคุณ และส่งใช้เฉพาะตอนวิเคราะห์เสียงของคุณเท่านั้น
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line bg-white px-4 py-2 text-xs font-medium text-ink hover:bg-paper"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-white hover:bg-accent-dark transition-colors"
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
