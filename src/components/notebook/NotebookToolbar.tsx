"use client";

import { useRef, useState } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  Eraser,
  FileUp,
  Film,
  Highlighter,
  ImagePlus,
  MousePointer2,
  Pencil,
  PenTool,
  Play,
  PlaySquare,
  Redo2,
  Shapes,
  Smile,
  Sparkles,
  StickyNote,
  Table2,
  Type,
  Undo2,
  Users,
} from "lucide-react";
import {
  GOODNOTES_COLORS,
  HIGHLIGHTER_COLORS,
  PAPER_TEMPLATES,
  STICKER_PACK,
  type NotebookTool,
  type PaperTemplate,
  type ShapeKind,
} from "../../types/notebook";

interface NotebookToolbarProps {
  tool: NotebookTool;
  color: string;
  size: number;
  palmRejection: boolean;
  autoShape: boolean;
  calcOpen: boolean;
  paperTemplate: PaperTemplate;
  canUndo: boolean;
  canRedo: boolean;
  roomId?: string;
  peerCount: number;
  onSelectTool: (tool: NotebookTool) => void;
  onChangeColor: (color: string) => void;
  onChangeSize: (size: number) => void;
  onTogglePalmRejection: () => void;
  onToggleAutoShape: () => void;
  onToggleCalc: () => void;
  onChangeTemplate: (tpl: PaperTemplate) => void;
  onInsertText: () => void;
  onInsertSticky: () => void;
  onInsertSticker: (emoji: string, label: string) => void;
  onInsertShape: (kind: ShapeKind) => void;
  onInsertTable: (rows: number, cols: number) => void;
  onOpenInsertLink: () => void;
  onOpenPresenter: () => void;
  onUploadImage: (file: File) => void;
  onUploadMedia: (file: File) => void;
  onUploadDocument: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportPptx: () => void;
  onExportJson: () => void;
  onOpenShareModal: () => void;
}

const PEN_SIZES = [
  { label: "S", value: 3 },
  { label: "M", value: 6 },
  { label: "L", value: 11 },
  { label: "XL", value: 18 },
] as const;

const HIGHLIGHTER_SIZES = [
  { label: "S", value: 14 },
  { label: "M", value: 22 },
  { label: "L", value: 32 },
  { label: "XL", value: 44 },
] as const;

export function NotebookToolbar({
  tool,
  color,
  size,
  palmRejection,
  autoShape,
  calcOpen,
  paperTemplate,
  canUndo,
  canRedo,
  roomId,
  peerCount,
  onSelectTool,
  onChangeColor,
  onChangeSize,
  onTogglePalmRejection,
  onToggleAutoShape,
  onToggleCalc,
  onChangeTemplate,
  onInsertText,
  onInsertSticky,
  onInsertSticker,
  onInsertShape,
  onInsertTable,
  onOpenInsertLink,
  onOpenPresenter,
  onUploadImage,
  onUploadMedia,
  onUploadDocument,
  onUndo,
  onRedo,
  onExportPng,
  onExportPdf,
  onExportPptx,
  onExportJson,
  onOpenShareModal,
}: NotebookToolbarProps) {
  const [stickerMenuOpen, setStickerMenuOpen] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [row2Collapsed, setRow2Collapsed] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const palette =
    tool === "highlighter" ? HIGHLIGHTER_COLORS : GOODNOTES_COLORS;
  const sizePresets = tool === "highlighter" ? HIGHLIGHTER_SIZES : PEN_SIZES;

  const closeAllMenus = () => {
    setStickerMenuOpen(false);
    setShapeMenuOpen(false);
    setTableMenuOpen(false);
    setExportMenuOpen(false);
  };

  return (
    <div
      data-notebook-toolbar="true"
      className="no-print shrink-0 z-20 border-b border-line bg-white/95 backdrop-blur px-3 py-2 sm:px-5 space-y-2 shadow-sm"
    >
      {/* Row 1: Always-pinned Primary Drawing Tools, Snap, Calc, Undo/Redo, Present & Share */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-xl bg-paper p-1 border border-line">
            <button
              type="button"
              onClick={() => onSelectTool("select")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                tool === "select"
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
              title="เลือก/ย้าย/พิมพ์ข้อความ"
            >
              <MousePointer2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">เลือก</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTool("pen")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                tool === "pen"
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
              title="ปากกาเขียน (รองรับแรงกด Apple Pencil)"
            >
              <PenTool className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ปากกา</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTool("highlighter")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                tool === "highlighter"
                  ? "bg-amber-400 text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
              title="ปากกาไฮไลต์"
            >
              <Highlighter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ไฮไลต์</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTool("eraser")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                tool === "eraser"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
              title="ยางลบเส้น"
            >
              <Eraser className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ยางลบ</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onTogglePalmRejection}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              palmRejection
                ? "border-accent bg-accent-soft text-accent-dark"
                : "border-line bg-paper text-muted hover:text-ink"
            }`}
            title="เปิดเมื่อใช้ Apple Pencil บน iPad เพื่อกันมือโดนและใช้นิ้วเลื่อนหน้าได้"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {palmRejection ? "ปากกา iPad: เปิด" : "ปากกา iPad"}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleAutoShape}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              autoShape
                ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                : "border-line bg-paper text-muted hover:text-ink"
            }`}
            title="ลากเส้นแล้วค้างปลายปากกาเพื่อแปลงเป็นเส้นตรง/ลูกศร/วงกลม/สี่เหลี่ยมอัตโนมัติ"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden md:inline">
              {autoShape ? "ดัดทรง: เปิด" : "ดัดทรง"}
            </span>
          </button>

          {(tool === "pen" || tool === "highlighter") && (
            <div className="flex items-center gap-1 rounded-xl border border-line bg-paper px-2 py-1">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChangeColor(c)}
                  style={{ backgroundColor: c }}
                  className={`h-5 w-5 rounded-full border transition-transform ${
                    color.toLowerCase() === c.toLowerCase()
                      ? "scale-110 ring-2 ring-accent ring-offset-1 border-white"
                      : "border-black/15 hover:scale-105"
                  }`}
                  aria-label={`เลือกสี ${c}`}
                />
              ))}
              <label
                className="relative ml-0.5 flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-line bg-white text-[10px] font-bold text-muted"
                title="เลือกสีอิสระ"
              >
                +
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onChangeColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="เลือกสีปากกาเอง"
                />
              </label>
            </div>
          )}

          {(tool === "pen" || tool === "highlighter") && (
            <div className="inline-flex items-center rounded-xl border border-line bg-paper p-0.5">
              {sizePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChangeSize(preset.value)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    size === preset.value
                      ? "bg-white text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-xl border border-line bg-paper p-0.5">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              className="rounded-lg p-1.5 text-ink hover:bg-white disabled:opacity-35"
              title="ย้อนกลับ (Undo)"
              aria-label="ย้อนกลับ"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              className="rounded-lg p-1.5 text-ink hover:bg-white disabled:opacity-35"
              title="ทำซ้ำ (Redo)"
              aria-label="ทำซ้ำ"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleCalc}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              calcOpen
                ? "border-accent bg-accent text-white shadow-sm"
                : "border-line bg-paper text-ink hover:bg-[#efede6]"
            }`}
            title="เปิดเครื่องคิดเลขวิทยาศาสตร์ / เขียนสมการด้วยปากกา"
          >
            <Calculator className="h-3.5 w-3.5" />
            <span className="hidden md:inline">คิดเลขวิทย์</span>
          </button>

          <button
            type="button"
            onClick={onOpenPresenter}
            className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 transition-colors"
            title="นำเสนอเต็มจอ (Present Mode)"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span className="hidden sm:inline">นำเสนอ</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const next = !exportMenuOpen;
                closeAllMenus();
                setExportMenuOpen(next);
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6]"
            >
              <Download className="h-3.5 w-3.5 text-accent" />
              <span className="hidden sm:inline">ส่งออก</span>
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-line bg-white p-1.5 shadow-lg z-30">
                <button
                  type="button"
                  onClick={() => {
                    closeAllMenus();
                    onExportPng();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink hover:bg-paper"
                >
                  บันทึกรูปหน้านี้ (.png)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeAllMenus();
                    onExportPdf();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink hover:bg-paper"
                >
                  ส่งออกทุกหน้าเป็น PDF (.pdf)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeAllMenus();
                    onExportPptx();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink hover:bg-paper"
                >
                  ส่งออกสไลด์ PowerPoint (.pptx)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeAllMenus();
                    onExportJson();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink hover:bg-paper"
                >
                  สำรองไฟล์สมุด (.shootnote)
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenShareModal}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors shadow-sm ${
              roomId
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-ink text-white hover:bg-black"
            }`}
          >
            {roomId ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-200 animate-pulse" />
                <span>Live · {peerCount + 1}</span>
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5" />
                <span>แชร์ทำร่วมกัน</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setRow2Collapsed((v) => !v)}
            className="inline-flex items-center justify-center rounded-xl border border-line bg-paper p-1.5 text-muted hover:text-ink"
            title={row2Collapsed ? "แสดงแถบแทรกเครื่องมือ" : "ซ่อนแถบแทรกเพื่อขยายพื้นที่เขียน"}
            aria-label={row2Collapsed ? "แสดงแถบแทรก" : "ซ่อนแถบแทรก"}
          >
            {row2Collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Insert Items, Tables, Files, YouTube/Links, Decorations & Paper Template */}
      {!row2Collapsed && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-line/70">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onInsertText}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#efede6]"
            >
              <Type className="h-3.5 w-3.5 text-accent" />
              <span>ข้อความ</span>
            </button>

            <button
              type="button"
              onClick={onInsertSticky}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              <StickyNote className="h-3.5 w-3.5 text-amber-600" />
              <span>โพสต์อิท</span>
            </button>

            {/* Table Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !tableMenuOpen;
                  closeAllMenus();
                  setTableMenuOpen(next);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#efede6]"
              >
                <Table2 className="h-3.5 w-3.5 text-teal-600" />
                <span>ตาราง</span>
              </button>
              {tableMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-44 rounded-xl border border-line bg-white p-1.5 shadow-lg z-30 space-y-1">
                  {(
                    [
                      [3, 3, "ตาราง 3 × 3 (ทั่วไป)"],
                      [4, 3, "ตาราง 4 แถว × 3 คอลัมน์"],
                      [5, 4, "ตาราง 5 แถว × 4 คอลัมน์"],
                    ] as Array<[number, number, string]>
                  ).map(([r, c, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        onInsertTable(r, c);
                        closeAllMenus();
                      }}
                      className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-ink hover:bg-paper"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sticker Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !stickerMenuOpen;
                  closeAllMenus();
                  setStickerMenuOpen(next);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#efede6]"
              >
                <Smile className="h-3.5 w-3.5 text-rose-500" />
                <span>สติกเกอร์</span>
              </button>
              {stickerMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-line bg-white p-2.5 shadow-lg z-30 grid grid-cols-4 gap-1.5">
                  {STICKER_PACK.map((st) => (
                    <button
                      key={st.label}
                      type="button"
                      onClick={() => {
                        onInsertSticker(st.emoji, st.label);
                        closeAllMenus();
                      }}
                      className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 hover:bg-paper"
                    >
                      <span className="text-xl leading-none">{st.emoji}</span>
                      <span className="text-[10px] text-muted">{st.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Shape Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !shapeMenuOpen;
                  closeAllMenus();
                  setShapeMenuOpen(next);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#efede6]"
              >
                <Shapes className="h-3.5 w-3.5 text-indigo-600" />
                <span>รูปทรง</span>
              </button>
              {shapeMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-44 rounded-xl border border-line bg-white p-1.5 shadow-lg z-30 space-y-1">
                  {(
                    [
                      ["rounded", "กรอบมุมโค้ง"],
                      ["rect", "กรอบสี่เหลี่ยม"],
                      ["circle", "วงกลม / วงรี"],
                      ["banner", "แถบหัวข้อตกแต่ง"],
                    ] as Array<[ShapeKind, string]>
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        onInsertShape(kind);
                        closeAllMenus();
                      }}
                      className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-ink hover:bg-paper"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadImage(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#efede6]"
            >
              <ImagePlus className="h-3.5 w-3.5 text-emerald-600" />
              <span>แนบภาพ</span>
            </button>

            <input
              ref={docInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadDocument(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#efede6]"
              title="แนบ PDF, Word, Excel, PowerPoint หรือ CSV"
            >
              <FileUp className="h-3.5 w-3.5 text-sky-600" />
              <span>แนบไฟล์</span>
            </button>

            <input
              ref={mediaInputRef}
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadMedia(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#efede6]"
            >
              <Film className="h-3.5 w-3.5 text-violet-600" />
              <span>คลิป/เสียง</span>
            </button>

            <button
              type="button"
              onClick={onOpenInsertLink}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/80 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100"
              title="แนบหน้าจอ YouTube หรือลิงก์ Google Drive / OneDrive / เปเปอร์"
            >
              <PlaySquare className="h-3.5 w-3.5 text-rose-600" />
              <span>YouTube / ลิงก์</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted hidden sm:inline">กระดาษ:</span>
            <select
              value={paperTemplate}
              onChange={(e) => onChangeTemplate(e.target.value as PaperTemplate)}
              aria-label="เลือกลายกระดาษ"
              className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink focus:border-accent focus:outline-none"
            >
              {PAPER_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
