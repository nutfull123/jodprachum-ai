"use client";

import { useRef, useState } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Download,
  Eraser,
  FilePlus,
  FileUp,
  Film,
  Hand,
  Highlighter,
  ImagePlus,
  LayoutTemplate,
  MousePointer2,
  Pencil,
  PenTool,
  Play,
  PlaySquare,
  Redo2,
  RotateCw,
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
  ERASER_SIZES,
  GOODNOTES_COLORS,
  HIGHLIGHTER_COLORS,
  PAPER_SIZES,
  PAPER_TEMPLATES,
  SHAPE_CATALOG,
  STICKER_PACK,
  type CustomPaperTemplate,
  type EraserMode,
  type NotebookTool,
  type PageOrientation,
  type PaperSize,
  type PaperTemplate,
  type ShapeKind,
} from "../../types/notebook";
import { getShapeSvgPath } from "../../lib/shape-svg";

interface NotebookToolbarProps {
  tool: NotebookTool;
  color: string;
  size: number;
  fingerDrawEnabled: boolean;
  stylusDetected: boolean;
  eraserMode: EraserMode;
  eraserSize: number;
  autoShape: boolean;
  calcOpen: boolean;
  paperTemplate: PaperTemplate;
  customTemplateId?: string;
  customTemplates: CustomPaperTemplate[];
  paperSize: PaperSize;
  orientation: PageOrientation;
  canUndo: boolean;
  canRedo: boolean;
  roomId?: string;
  peerCount: number;
  isImportingPdf?: boolean;
  onSelectTool: (tool: NotebookTool) => void;
  onChangeColor: (color: string) => void;
  onChangeSize: (size: number) => void;
  onToggleFingerDraw: () => void;
  onChangeEraserMode: (mode: EraserMode) => void;
  onChangeEraserSize: (size: number) => void;
  onToggleAutoShape: () => void;
  onToggleCalc: () => void;
  onChangeTemplate: (tpl: PaperTemplate) => void;
  onSelectCustomTemplate: (tpl: CustomPaperTemplate) => void;
  onOpenCustomTemplateModal: () => void;
  onChangePaperSize: (size: PaperSize) => void;
  onToggleOrientation: () => void;
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
  onImportPdf: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportPptx: () => void;
  onExportJson: () => void;
  onOpenShareModal: () => void;
  onToggleTopChrome?: () => void;
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
  fingerDrawEnabled,
  stylusDetected,
  eraserMode,
  eraserSize,
  autoShape,
  calcOpen,
  paperTemplate,
  customTemplateId,
  customTemplates,
  paperSize,
  orientation,
  canUndo,
  canRedo,
  roomId,
  peerCount,
  isImportingPdf = false,
  onSelectTool,
  onChangeColor,
  onChangeSize,
  onToggleFingerDraw,
  onChangeEraserMode,
  onChangeEraserSize,
  onToggleAutoShape,
  onToggleCalc,
  onChangeTemplate,
  onSelectCustomTemplate,
  onOpenCustomTemplateModal,
  onChangePaperSize,
  onToggleOrientation,
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
  onImportPdf,
  onUndo,
  onRedo,
  onExportPng,
  onExportPdf,
  onExportPptx,
  onExportJson,
  onOpenShareModal,
  onToggleTopChrome,
}: NotebookToolbarProps) {
  const [stickerMenuOpen, setStickerMenuOpen] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [row2Collapsed, setRow2Collapsed] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

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
      {/* Row 1: Primary Drawing Tools, Input Separation (Pencil vs Finger), Eraser Options, Snap, Calc, Undo/Redo, Present & Share */}
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

          {/* Separate Pencil (1-finger pan) vs Finger-Draw Switcher */}
          <div
            className="inline-flex items-center rounded-xl border border-line bg-paper p-0.5"
            title={
              fingerDrawEnabled
                ? "โหมดใช้นิ้ววาด: นิ้วเดียววาดเส้นได้, 2 นิ้วเลื่อน/ซูม"
                : "โหมดปากกา (Pencil): ปากกาเขียนอย่างเดียว ส่วนนิ้วเดียวใช้เลื่อนหน้ากระดาษไปมาได้เลย"
            }
          >
            <button
              type="button"
              onClick={() => {
                if (fingerDrawEnabled) onToggleFingerDraw();
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                !fingerDrawEnabled
                  ? "bg-accent-soft text-accent-dark shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Pencil className="h-3 w-3" />
              <span>ปากกา/เลื่อนด้วยนิ้ว</span>
              {stylusDetected && (
                <span className="hidden xl:inline rounded bg-emerald-500/20 px-1 text-[9px] text-emerald-700">
                  Pencil
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!fingerDrawEnabled) onToggleFingerDraw();
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                fingerDrawEnabled
                  ? "bg-amber-100 text-amber-900 shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Hand className="h-3 w-3" />
              <span>นิ้วเขียน</span>
            </button>
          </div>

          {(tool === "pen" || tool === "highlighter") && (
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
          )}

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

          {/* Eraser Mode & Size Controls */}
          {tool === "eraser" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50/70 p-0.5">
                <button
                  type="button"
                  onClick={() => onChangeEraserMode("partial")}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    eraserMode === "partial"
                      ? "bg-white text-rose-700 shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  ลบเฉพาะส่วน
                </button>
                <button
                  type="button"
                  onClick={() => onChangeEraserMode("stroke")}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    eraserMode === "stroke"
                      ? "bg-white text-rose-700 shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  ลบทั้งเส้น
                </button>
              </div>

              <div className="inline-flex items-center rounded-xl border border-line bg-paper p-0.5">
                {ERASER_SIZES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onChangeEraserSize(preset.value)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                      eraserSize === preset.value
                        ? "bg-white text-rose-700 shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
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
                    onExportPdf();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-accent-dark hover:bg-accent-soft"
                >
                  ส่งออกทุกหน้าเป็น PDF (.pdf)
                </button>
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
            title={
              row2Collapsed
                ? "แสดงแถบแทรกเครื่องมือ"
                : "ซ่อนแถบแทรกเพื่อขยายพื้นที่เขียน"
            }
            aria-label={row2Collapsed ? "แสดงแถบแทรก" : "ซ่อนแถบแทรก"}
          >
            {row2Collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>

          {onToggleTopChrome && (
            <button
              type="button"
              onClick={onToggleTopChrome}
              className="inline-flex items-center gap-1 rounded-xl border border-line bg-paper px-2 py-1.5 text-[11px] font-medium text-muted hover:text-ink hover:bg-[#efede6]"
              title="พับแถบด้านบนทั้งหมดเพื่อขยายพื้นที่กระดาษเขียน"
              aria-label="พับแถบด้านบน"
            >
              <ChevronsUp className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">พับด้านบน</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Insert Items, 16 Shapes, Files, PDF Import, Paper Size, Landscape Orientation & Custom Templates */}
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

            {/* Rich 16-Shape Visual Picker */}
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
                <div className="absolute left-0 mt-1.5 w-80 max-w-[92vw] rounded-2xl border border-line bg-white p-2.5 shadow-xl z-30 grid grid-cols-4 gap-1.5">
                  {SHAPE_CATALOG.map((sh) => (
                    <button
                      key={sh.kind}
                      type="button"
                      onClick={() => {
                        onInsertShape(sh.kind);
                        closeAllMenus();
                      }}
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-transparent p-1.5 hover:border-line hover:bg-paper transition-colors"
                      title={sh.label}
                    >
                      <svg viewBox="0 0 36 28" className="h-6 w-8">
                        <path
                          d={getShapeSvgPath(sh.kind, 36, 28, 3)}
                          fill="#EFFAF8"
                          stroke="#0F766E"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-[10px] font-medium text-ink truncate max-w-full">
                        {sh.label}
                      </span>
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
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportPdf(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={isImportingPdf}
              onClick={() => pdfInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50/80 px-2.5 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
              title="นำเข้าไฟล์ PDF เพิ่มต่อท้ายในสมุดนี้เพื่อเขียนโน้ตทับได้ทันที"
            >
              <FilePlus className="h-3.5 w-3.5 text-sky-600" />
              <span>{isImportingPdf ? "กำลังนำเข้า..." : "นำเข้า PDF"}</span>
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
              title="แนบไฟล์ PDF, Word, Excel, PowerPoint หรือ CSV"
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

          {/* Right side: Paper Size, Portrait/Landscape Orientation, Paper Template & Custom Templates */}
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={paperSize}
              onChange={(e) => onChangePaperSize(e.target.value as PaperSize)}
              aria-label="เลือกขนาดกระดาษ"
              title="ขนาดกระดาษ"
              className="rounded-lg border border-line bg-paper px-2 py-1 text-xs font-medium text-ink focus:border-accent focus:outline-none"
            >
              {PAPER_SIZES.map((sz) => (
                <option key={sz.id} value={sz.id}>
                  {sz.label}
                </option>
              ))}
              {paperSize === "pdf_custom" && (
                <option value="pdf_custom">ขนาดตามไฟล์ PDF</option>
              )}
            </select>

            <button
              type="button"
              onClick={onToggleOrientation}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                orientation === "landscape"
                  ? "border-accent bg-accent-soft text-accent-dark"
                  : "border-line bg-paper text-ink hover:bg-[#efede6]"
              }`}
              title="สลับแนวตั้ง / แนวนอน"
            >
              <RotateCw className="h-3 w-3" />
              <span>{orientation === "landscape" ? "แนวนอน" : "แนวตั้ง"}</span>
            </button>

            <select
              value={customTemplateId ? `custom:${customTemplateId}` : paperTemplate}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith("custom:")) {
                  const id = val.slice("custom:".length);
                  const found = customTemplates.find((t) => t.id === id);
                  if (found) onSelectCustomTemplate(found);
                } else {
                  onChangeTemplate(val as PaperTemplate);
                }
              }}
              aria-label="เลือกลายกระดาษ"
              className="rounded-lg border border-line bg-paper px-2 py-1 text-xs font-medium text-ink focus:border-accent focus:outline-none max-w-[160px]"
            >
              <optgroup label="เทมเพลตมาตรฐาน">
                {PAPER_TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label}
                  </option>
                ))}
              </optgroup>
              {customTemplates.length > 0 && (
                <optgroup label="เทมเพลตที่สร้างเอง">
                  {customTemplates.map((ct) => (
                    <option key={ct.id} value={`custom:${ct.id}`}>
                      ★ {ct.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              type="button"
              onClick={onOpenCustomTemplateModal}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:bg-[#efede6]"
              title="สร้าง/จัดการเทมเพลตสมุดเอง"
            >
              <LayoutTemplate className="h-3.5 w-3.5 text-accent" />
              <span className="hidden sm:inline">+ เทมเพลตเอง</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
