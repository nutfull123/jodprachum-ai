"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FileUp,
  ImagePlus,
  LayoutTemplate,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  CustomPaperTemplate,
  PageOrientation,
} from "../../types/notebook";
import { compressImageToDataUrl } from "../../lib/media-utils";
import { renderPdfFirstPageToDataUrl } from "../../lib/pdf-import";

interface CustomTemplateModalProps {
  isOpen: boolean;
  customTemplates: CustomPaperTemplate[];
  onSaveTemplate: (tpl: CustomPaperTemplate) => void;
  onApplyTemplateToPage: (tpl: CustomPaperTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onClose: () => void;
}

type DesignerPattern =
  | "lined"
  | "grid"
  | "dotted"
  | "cornell"
  | "two_col"
  | "checklist";

function renderPatternDataUrl(opts: {
  bgColor: string;
  lineColor: string;
  pattern: DesignerPattern;
  spacing: number;
  orientation: PageOrientation;
  hasHeaderBand: boolean;
}): { dataUrl: string; width: number; height: number } {
  const width = opts.orientation === "landscape" ? 1414 : 1000;
  const height = opts.orientation === "landscape" ? 1000 : 1414;
  if (typeof document === "undefined") {
    return { dataUrl: "", width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", width, height };

  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, width, height);

  let topStart = 40;
  if (opts.hasHeaderBand) {
    ctx.fillStyle = opts.lineColor;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(0, 0, width, 110);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 110);
    ctx.lineTo(width, 110);
    ctx.stroke();
    topStart = 136;
  }

  const gap = Math.max(20, Math.min(80, opts.spacing));

  if (opts.pattern === "lined" || opts.pattern === "cornell") {
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = 1.2;
    for (let y = topStart; y < height - 24; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    const marginX = opts.pattern === "cornell" ? Math.round(width * 0.24) : 84;
    ctx.strokeStyle = "#F43F5E";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(marginX, 0);
    ctx.lineTo(marginX, height);
    ctx.stroke();
  } else if (opts.pattern === "grid") {
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = 1;
    for (let x = gap; x < width; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = topStart; y < height; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (opts.pattern === "dotted") {
    ctx.fillStyle = opts.lineColor;
    for (let x = gap; x < width - 12; x += gap) {
      for (let y = topStart; y < height - 12; y += gap) {
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (opts.pattern === "two_col") {
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = 1.1;
    for (let y = topStart; y < height - 24; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, topStart - 16);
    ctx.lineTo(width / 2, height - 24);
    ctx.stroke();
  } else if (opts.pattern === "checklist") {
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = 1.2;
    for (let y = topStart; y < height - 24; y += gap) {
      ctx.strokeRect(48, y - 16, 16, 16);
      ctx.beginPath();
      ctx.moveTo(76, y);
      ctx.lineTo(width - 40, y);
      ctx.stroke();
    }
  }

  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

export function CustomTemplateModal({
  isOpen,
  customTemplates,
  onSaveTemplate,
  onApplyTemplateToPage,
  onDeleteTemplate,
  onClose,
}: CustomTemplateModalProps) {
  const [tab, setTab] = useState<"design" | "upload">("design");
  const [nameInput, setNameInput] = useState("เทมเพลตของฉัน");
  const [orientation, setOrientation] = useState<PageOrientation>("portrait");

  // Designer state
  const [bgColor, setBgColor] = useState("#FFFDF7");
  const [lineColor, setLineColor] = useState("#CBD5E1");
  const [pattern, setPattern] = useState<DesignerPattern>("lined");
  const [spacing, setSpacing] = useState(36);
  const [hasHeaderBand, setHasHeaderBand] = useState(true);

  // Upload state
  const [uploadedPreview, setUploadedPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    orientation: PageOrientation;
  } | null>(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setErrorMsg(null);
    }
  }, [isOpen]);

  const designPreview = useMemo(() => {
    if (!isOpen || tab !== "design") return null;
    return renderPatternDataUrl({
      bgColor,
      lineColor,
      pattern,
      spacing,
      orientation,
      hasHeaderBand,
    });
  }, [isOpen, tab, bgColor, lineColor, pattern, spacing, orientation, hasHeaderBand]);

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    setErrorMsg(null);
    setLoadingUpload(true);
    try {
      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        const res = await renderPdfFirstPageToDataUrl(file);
        setUploadedPreview(res);
        setOrientation(res.orientation);
        if (!nameInput || nameInput === "เทมเพลตของฉัน") {
          setNameInput(file.name.replace(/\.pdf$/i, ""));
        }
      } else {
        const img = await compressImageToDataUrl(file, 1600, 0.9);
        const ori: PageOrientation =
          img.width > img.height ? "landscape" : "portrait";
        setUploadedPreview({
          dataUrl: img.dataUrl,
          width: img.width,
          height: img.height,
          orientation: ori,
        });
        setOrientation(ori);
        if (!nameInput || nameInput === "เทมเพลตของฉัน") {
          setNameInput(file.name.replace(/\.[^.]+$/, ""));
        }
      }
    } catch {
      setErrorMsg("ไม่สามารถอ่านไฟล์นี้ได้ กรุณาเลือกไฟล์รูปภาพหรือ PDF");
    } finally {
      setLoadingUpload(false);
    }
  };

  const handleSaveAndApply = (applyNow: boolean) => {
    const cleanName = nameInput.trim() || "เทมเพลตกระดาษของฉัน";
    const source = tab === "upload" ? uploadedPreview : designPreview;
    if (!source || !source.dataUrl) {
      setErrorMsg("กรุณาเลือกไฟล์หรือออกแบบกระดาษก่อนบันทึก");
      return;
    }
    const now = Date.now();
    const tpl: CustomPaperTemplate = {
      id: `ctpl-${now}-${Math.floor(Math.random() * 1000)}`,
      name: cleanName,
      dataUrl: source.dataUrl,
      width: source.width,
      height: source.height,
      defaultOrientation: orientation,
      createdAt: now,
    };
    onSaveTemplate(tpl);
    if (applyNow) {
      onApplyTemplateToPage(tpl);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="จัดการและสร้างเทมเพลตสมุดเอง"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">
                สร้างและจัดการเทมเพลตสมุดเอง
              </h3>
              <p className="text-xs text-muted">
                ออกแบบลายกระดาษเอง หรืออัปโหลดรูปภาพ / หน้า PDF มาเป็นกระดาษเขียนประจำของคุณ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-paper"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex rounded-xl border border-line bg-paper p-1">
          <button
            type="button"
            onClick={() => setTab("design")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "design"
                ? "bg-white text-accent-dark shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>ออกแบบลายกระดาษเอง</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "upload"
                ? "bg-white text-accent-dark shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            <FileUp className="h-3.5 w-3.5" />
            <span>อัปโหลดรูปภาพ / หน้า PDF</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Controls Column */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">
                ชื่อเทมเพลต
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="เช่น ตารางแพลนเนอร์รายสัปดาห์..."
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">
                การวางหน้ากระดาษ
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["portrait", "แนวตั้ง (Portrait)"],
                    ["landscape", "แนวนอน (Landscape)"],
                  ] as Array<[PageOrientation, string]>
                ).map(([ori, label]) => (
                  <button
                    key={ori}
                    type="button"
                    onClick={() => setOrientation(ori)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      orientation === ori
                        ? "border-accent bg-accent-soft text-accent-dark"
                        : "border-line bg-paper text-ink hover:bg-[#efede6]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === "design" ? (
              <>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-ink">
                    รูปแบบเส้น / ตาราง
                  </label>
                  <select
                    value={pattern}
                    onChange={(e) =>
                      setPattern(e.target.value as DesignerPattern)
                    }
                    className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs font-medium text-ink focus:border-accent focus:outline-none"
                  >
                    <option value="lined">กระดาษมีเส้น + เส้นคั่นหน้า</option>
                    <option value="grid">ตารางกริด</option>
                    <option value="dotted">จุดไข่ปลา (Bullet Journal)</option>
                    <option value="cornell">Cornell Note (จดเลกเชอร์)</option>
                    <option value="two_col">แบ่ง 2 คอลัมน์มีเส้น</option>
                    <option value="checklist">รายการ Checklist มีเส้น</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-ink">
                      สีพื้นกระดาษ
                    </label>
                    <div className="flex items-center gap-1.5">
                      {["#FFFFFF", "#FFFDF7", "#F0FDF4", "#F8FAFC", "#181B20"].map(
                        (c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setBgColor(c);
                              if (c === "#181B20") setLineColor("#334155");
                              else if (lineColor === "#334155")
                                setLineColor("#CBD5E1");
                            }}
                            style={{ backgroundColor: c }}
                            className={`h-6 w-6 rounded-full border ${
                              bgColor === c
                                ? "ring-2 ring-accent scale-110"
                                : "border-line"
                            }`}
                          />
                        )
                      )}
                      <input
                        type="color"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="h-6 w-7 rounded border border-line bg-transparent cursor-pointer"
                        aria-label="เลือกสีพื้นเอง"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-ink">
                      สีเส้น / จุด
                    </label>
                    <div className="flex items-center gap-1.5">
                      {["#CBD5E1", "#93C5FD", "#FCA5A5", "#A7F3D0", "#334155"].map(
                        (c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setLineColor(c)}
                            style={{ backgroundColor: c }}
                            className={`h-6 w-6 rounded-full border ${
                              lineColor === c
                                ? "ring-2 ring-accent scale-110"
                                : "border-line"
                            }`}
                          />
                        )
                      )}
                      <input
                        type="color"
                        value={lineColor}
                        onChange={(e) => setLineColor(e.target.value)}
                        className="h-6 w-7 rounded border border-line bg-transparent cursor-pointer"
                        aria-label="เลือกสีเส้นเอง"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink">
                    <span>ระยะห่างเส้น / ช่อง</span>
                    <span className="font-mono text-muted">{spacing} px</span>
                  </div>
                  <input
                    type="range"
                    min={22}
                    max={64}
                    step={2}
                    value={spacing}
                    onChange={(e) => setSpacing(Number(e.target.value))}
                    className="w-full accent-teal-700"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-medium text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasHeaderBand}
                    onChange={(e) => setHasHeaderBand(e.target.checked)}
                    className="rounded border-line text-accent"
                  />
                  <span>เพิ่มแถบหัวข้อด้านบนกระดาษ</span>
                </label>
              </>
            ) : (
              <div className="space-y-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileChange(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={loadingUpload}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-paper p-6 text-center hover:border-accent transition-colors"
                >
                  <ImagePlus className="h-7 w-7 text-accent" />
                  <span className="text-xs font-semibold text-ink">
                    {loadingUpload
                      ? "กำลังประมวลผลไฟล์..."
                      : "คลิกเลือกไฟล์รูปภาพ (PNG/JPG) หรือไฟล์ PDF (ใช้หน้าแรก)"}
                  </span>
                </button>
              </div>
            )}

            {errorMsg && (
              <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                {errorMsg}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleSaveAndApply(true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark shadow-sm"
              >
                <Check className="h-3.5 w-3.5" />
                <span>บันทึกและใช้กับหน้านี้ทันที</span>
              </button>
              <button
                type="button"
                onClick={() => handleSaveAndApply(false)}
                className="rounded-xl border border-line bg-paper px-3 py-2 text-xs font-medium text-ink hover:bg-[#efede6]"
              >
                บันทึกเก็บไว้ก่อน
              </button>
            </div>
          </div>

          {/* Live Preview */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-[#ECEAE2] p-4 min-h-[260px]">
            {(tab === "upload" ? uploadedPreview?.dataUrl : designPreview?.dataUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  (tab === "upload"
                    ? uploadedPreview?.dataUrl
                    : designPreview?.dataUrl) || ""
                }
                alt="ตัวอย่างเทมเพลตกระดาษ"
                className="max-h-64 w-auto rounded-lg border border-black/15 shadow-md bg-white object-contain"
              />
            ) : (
              <p className="text-xs text-muted text-center">
                ตัวอย่างเทมเพลตจะแสดงที่นี่
              </p>
            )}
          </div>
        </div>

        {/* Saved Custom Templates Gallery */}
        <div className="border-t border-line pt-4 space-y-2.5">
          <h4 className="text-xs font-bold text-ink">
            เทมเพลตที่บันทึกไว้ ({customTemplates.length})
          </h4>
          {customTemplates.length === 0 ? (
            <p className="text-xs text-muted">
              ยังไม่มีเทมเพลตที่บันทึกไว้ ลองออกแบบหรืออัปโหลดด้านบนได้เลย
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {customTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-line bg-paper p-2 flex flex-col gap-2"
                >
                  <div className="h-24 rounded-lg border border-line bg-white overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tpl.dataUrl}
                      alt={tpl.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <p className="text-xs font-semibold text-ink truncate">
                    {tpl.name}
                  </p>
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onApplyTemplateToPage(tpl);
                        onClose();
                      }}
                      className="flex-1 rounded-lg bg-accent px-2 py-1 text-[11px] font-semibold text-white hover:bg-accent-dark"
                    >
                      ใช้กับหน้านี้
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTemplate(tpl.id)}
                      className="rounded-lg p-1 text-muted hover:bg-rose-50 hover:text-rose-600"
                      title="ลบเทมเพลต"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
