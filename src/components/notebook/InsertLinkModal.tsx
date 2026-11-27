"use client";

import { useEffect, useState } from "react";
import { Globe, PlaySquare, X, Youtube } from "lucide-react";
import { detectLinkProvider, parseYouTubeUrl } from "../../lib/link-utils";
import type { LinkProvider } from "../../types/notebook";

interface InsertLinkModalProps {
  isOpen: boolean;
  onInsertYouTube: (opts: {
    videoId: string;
    startSeconds: number;
    title: string;
    url: string;
  }) => void;
  onInsertLink: (opts: {
    url: string;
    title: string;
    provider: LinkProvider;
  }) => void;
  onClose: () => void;
}

export function InsertLinkModal({
  isOpen,
  onInsertYouTube,
  onInsertLink,
  onClose,
}: InsertLinkModalProps) {
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      setUrlInput("");
      setTitleInput("");
      setErrorMsg("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const yt = parseYouTubeUrl(urlInput);
  const provider = detectLinkProvider(urlInput);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) {
      setErrorMsg("กรุณาวางลิงก์ YouTube หรือลิงก์เอกสารวิจัย");
      return;
    }

    const normalizedUrl =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : `https://${raw}`;

    if (yt) {
      onInsertYouTube({
        videoId: yt.videoId,
        startSeconds: yt.startSeconds,
        title: titleInput.trim() || `วิดีโอ YouTube (${yt.videoId})`,
        url: normalizedUrl,
      });
      onClose();
      return;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setErrorMsg("รูปแบบลิงก์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
      return;
    }

    const defaultTitle =
      provider === "gdrive"
        ? "ไฟล์ Google Drive"
        : provider === "onedrive"
          ? "ไฟล์ OneDrive"
          : provider === "dropbox"
            ? "ไฟล์ Dropbox"
            : provider === "pdf"
              ? "เอกสาร PDF"
              : "ลิงก์เอกสารวิจัย";

    onInsertLink({
      url: normalizedUrl,
      title: titleInput.trim() || defaultTitle,
      provider,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="insert-link-modal-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <PlaySquare className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="insert-link-modal-title"
                className="text-base font-semibold text-ink"
              >
                แนบหน้าจอ YouTube หรือลิงก์ไฟล์วิจัย
              </h2>
              <p className="text-xs text-muted">
                กดเปิดดูคลิป YouTube ในสมุดได้ทันที หรือวางลิงก์ Drive / OneDrive / PDF
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="rounded-lg p-1.5 text-muted hover:bg-paper hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label
              htmlFor="insert-link-url-input"
              className="block text-xs font-semibold text-ink mb-1.5"
            >
              วางลิงก์ (URL)
            </label>
            <input
              id="insert-link-url-input"
              type="text"
              autoFocus
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              placeholder="https://youtu.be/... หรือ https://drive.google.com/..."
              className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:bg-white focus:outline-none"
            />
            {errorMsg && (
              <p className="mt-1.5 text-xs font-medium text-rose-600">
                {errorMsg}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="insert-link-title-input"
              className="block text-xs font-semibold text-ink mb-1.5"
            >
              ชื่อการ์ดบนสมุด (ไม่บังคับ)
            </label>
            <input
              id="insert-link-title-input"
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder={
                yt
                  ? "เช่น เลกเชอร์สถิติวิจัย บทที่ 3"
                  : "เช่น เปเปอร์อ้างอิง / ชุดข้อมูลดิบ Google Drive"
              }
              className="w-full rounded-xl border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-accent focus:bg-white focus:outline-none"
            />
          </div>

          {urlInput.trim() && (
            <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5 flex items-center gap-2 text-xs text-ink">
              {yt ? (
                <>
                  <Youtube className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>
                    ตรวจพบวิดีโอ YouTube รหัส{" "}
                    <code className="font-mono font-semibold">{yt.videoId}</code>
                    {yt.startSeconds > 0 ? ` (เริ่มนาที ${yt.startSeconds}s)` : ""}
                  </span>
                </>
              ) : (
                <>
                  <Globe className="h-4 w-4 text-accent shrink-0" />
                  <span>
                    จะสร้างการ์ดลิงก์เปิดดู/ดาวน์โหลด ({provider.toUpperCase()}) —
                    ไม่กินพื้นที่เก็บไฟล์
                  </span>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line bg-paper px-4 py-2 text-xs font-medium text-ink hover:bg-[#efede6]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark shadow-sm"
            >
              {yt ? "วางจอ YouTube ลงสมุด" : "วางการ์ดลิงก์ลงสมุด"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
