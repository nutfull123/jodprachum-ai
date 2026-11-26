export type PaperTemplate =
  | "blank"
  | "lined"
  | "grid"
  | "dotted"
  | "cream"
  | "cornell";

export type NotebookTool = "select" | "pen" | "highlighter" | "eraser";

export type StrokePoint = [number, number, number]; // [x, y, pressure]

export interface InkStroke {
  id: string;
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
  | "meeting_card";

export type ShapeKind = "rect" | "rounded" | "circle" | "banner";

export interface CanvasItem {
  id: string;
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
  updatedAt: number;
  deleted?: boolean;
}

export interface ShootNotebook {
  id: string;
  kind: "notebook" | "shortnote";
  title: string;
  quickBody?: string;
  paperTemplate: PaperTemplate;
  pageHeight: number;
  strokes: InkStroke[];
  items: CanvasItem[];
  roomId?: string;
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
];

export const PEER_COLORS = [
  "#0F766E",
  "#2563EB",
  "#D97706",
  "#DB2777",
  "#7C3AED",
  "#059669",
] as const;
