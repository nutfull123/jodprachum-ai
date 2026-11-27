export type PaperTemplate =
  | "blank"
  | "lined"
  | "grid"
  | "dotted"
  | "cream"
  | "cornell"
  | "dark_lined"
  | "dark_grid"
  | "dark_dotted";

export const PORTRAIT_WIDTH = 1000;
export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

export type NotebookTool = "select" | "pen" | "highlighter" | "eraser";

export type StrokePoint = [number, number, number]; // [x, y, pressure]

export interface NotebookPage {
  id: string;
  title?: string;
  paperTemplate: PaperTemplate;
  pageHeight: number;
  aspect?: "portrait" | "slide16x9";
  order: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface InkStroke {
  id: string;
  pageId?: string;
  tool: "pen" | "highlighter";
  color: string;
  size: number;
  opacity: number;
  isStylus: boolean;
  points: StrokePoint[];
  updatedAt: number;
  deleted?: boolean;
}

export type CanvasItemType =
  | "text"
  | "sticky"
  | "sticker"
  | "shape"
  | "image"
  | "video"
  | "audio"
  | "meeting_card"
  | "file"
  | "link"
  | "youtube"
  | "table";

export type ShapeKind = "rect" | "rounded" | "circle" | "banner";

export type LinkProvider = "gdrive" | "onedrive" | "dropbox" | "pdf" | "web";

export interface TableItemData {
  rows: string[][];
  headerBg?: string;
}

export interface CanvasItem {
  id: string;
  pageId?: string;
  type: CanvasItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  text?: string;
  title?: string;
  color?: string;
  bgColor?: string;
  fontSize?: number;
  bold?: boolean;
  shapeKind?: ShapeKind;
  stickerEmoji?: string;
  stickerLabel?: string;
  dataUrl?: string;
  mediaBlobId?: string;
  mimeType?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  linkUrl?: string;
  linkProvider?: LinkProvider;
  youtubeId?: string;
  youtubeStart?: number;
  tableData?: TableItemData;
  updatedAt: number;
  deleted?: boolean;
}

export interface NotebookFolder {
  id: string;
  name: string;
  color: string;
  parentId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export const FOLDER_COLORS = [
  { name: "เขียวมิ้นต์", hex: "#0F766E" },
  { name: "น้ำเงินรอยัล", hex: "#2563EB" },
  { name: "ส้มอบอุ่น", hex: "#D97706" },
  { name: "ม่วงคราม", hex: "#7C3AED" },
  { name: "ชมพูโรส", hex: "#DB2777" },
  { name: "เขียวมรกต", hex: "#059669" },
  { name: "เทาหินชนวน", hex: "#475569" },
] as const;

export interface ShootNotebook {
  id: string;
  kind: "notebook" | "shortnote" | "slides";
  title: string;
  folderId?: string | null;
  quickBody?: string;
  paperTemplate: PaperTemplate;
  pageHeight: number;
  pages?: NotebookPage[];
  strokes: InkStroke[];
  items: CanvasItem[];
  roomId?: string;
  roomPinProtected?: boolean;
  metaUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface PeerPresence {
  peerId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  tool: NotebookTool;
  lastSeen: number;
}

export const GOODNOTES_COLORS = [
  "#1C1B18", // Charcoal ink
  "#FFFFFF", // White chalk (for dark paper)
  "#0F766E", // ShootNote Teal
  "#1D4ED8", // Royal Blue
  "#DC2626", // Crimson Red
  "#D97706", // Warm Amber
  "#7C3AED", // Violet
  "#DB2777", // Rose Pink
  "#15803D", // Forest Green
] as const;

export const HIGHLIGHTER_COLORS = [
  "#FEF08A", // Yellow
  "#A7F3D0", // Mint
  "#BFDBFE", // Sky
  "#FBCFE8", // Pink
  "#FED7AA", // Peach
  "#DDD6FE", // Lavender
] as const;

export const STICKY_COLORS = [
  { name: "เหลืองอ่อน", bg: "#FEF9C3", border: "#FDE047" },
  { name: "เขียวมิ้นต์", bg: "#D1FAE5", border: "#6EE7B7" },
  { name: "ฟ้าพาสเทล", bg: "#DBEAFE", border: "#93C5FD" },
  { name: "ชมพูพีช", bg: "#FCE7F3", border: "#F9A8D4" },
  { name: "ม่วงลาเวนเดอร์", bg: "#EDE9FE", border: "#C4B5FD" },
  { name: "ครีมอุ่น", bg: "#FFF7ED", border: "#FDBA74" },
] as const;

export const STICKER_PACK: Array<{ emoji: string; label: string }> = [
  { emoji: "📌", label: "ปักหมุด" },
  { emoji: "⭐", label: "สำคัญ" },
  { emoji: "✅", label: "เสร็จแล้ว" },
  { emoji: "🔥", label: "ด่วน!" },
  { emoji: "💡", label: "ไอเดีย" },
  { emoji: "🎯", label: "เป้าหมาย" },
  { emoji: "📝", label: "จดเพิ่ม" },
  { emoji: "⚠️", label: "ระวัง" },
  { emoji: "👏", label: "เยี่ยมเลย" },
  { emoji: "❤️", label: "ชอบมาก" },
  { emoji: "📅", label: "นัดหมาย" },
  { emoji: "🚀", label: "เริ่มเลย" },
];

export const PAPER_TEMPLATES: Array<{
  id: PaperTemplate;
  label: string;
}> = [
  { id: "lined", label: "กระดาษมีเส้น" },
  { id: "grid", label: "ตารางกริด" },
  { id: "dotted", label: "จุดไข่ปลา" },
  { id: "cream", label: "ครีมถนอมสายตา" },
  { id: "cornell", label: "Cornell Note" },
  { id: "blank", label: "กระดาษขาวล้วน" },
  { id: "dark_lined", label: "กระดาษมืดมีเส้น" },
  { id: "dark_grid", label: "กระดาษมืดกริด" },
  { id: "dark_dotted", label: "กระดาษมืดจุดไข่ปลา" },
];

export function isDarkPaperTemplate(tpl: PaperTemplate): boolean {
  return (
    tpl === "dark_lined" || tpl === "dark_grid" || tpl === "dark_dotted"
  );
}

export const PEER_COLORS = [
  "#0F766E",
  "#2563EB",
  "#D97706",
  "#DB2777",
  "#7C3AED",
  "#059669",
] as const;
