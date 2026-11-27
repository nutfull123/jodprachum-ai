import { getStroke } from "perfect-freehand";
import type { SavedMeeting } from "../types/meeting";
import {
  SLIDE_HEIGHT,
  type CanvasItem,
  type InkStroke,
  type NotebookPage,
  type PaperTemplate,
  type ShootNotebook,
  type StrokePoint,
} from "../types/notebook.ts";

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return `SN-${code}`;
}

export function createNotebookPage(
  order: number,
  paperTemplate: PaperTemplate = "lined",
  pageHeight: number = 1600,
  id?: string,
  aspect: "portrait" | "slide16x9" = "portrait"
): NotebookPage {
  const now = Date.now();
  return {
    id:
      id ||
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `page-${crypto.randomUUID().slice(0, 8)}`
        : `page-${now}-${order}`),
    paperTemplate,
    pageHeight: aspect === "slide16x9" ? SLIDE_HEIGHT : pageHeight,
    aspect,
    order,
    updatedAt: now,
  };
}

function comparePages(a: NotebookPage, b: NotebookPage): number {
  return (
    a.order - b.order ||
    a.updatedAt - b.updatedAt ||
    a.id.localeCompare(b.id)
  );
}

export function ensureNotebookPages(nb: ShootNotebook): NotebookPage[] {
  const raw = Array.isArray(nb.pages) ? nb.pages : [];
  const active = raw
    .filter((p) => !p.deleted)
    .slice()
    .sort(comparePages);

  if (active.length > 0) {
    return active;
  }

  return [
    {
      id: "page-1",
      paperTemplate: nb.paperTemplate || "lined",
      pageHeight: nb.pageHeight || 1600,
      aspect: nb.kind === "slides" ? "slide16x9" : "portrait",
      order: 0,
      updatedAt: nb.metaUpdatedAt || nb.createdAt || 0,
    },
  ];
}

export function attachNotebookToRoom(
  nb: ShootNotebook,
  roomId: string
): ShootNotebook {
  return {
    ...nb,
    roomId: roomId.trim().toUpperCase(),
    updatedAt: Date.now(),
  };
}

export function createGuestRoomNotebook(roomId: string): ShootNotebook {
  const cleanRoom = roomId.trim().toUpperCase();
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `nb-room-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind: "notebook",
    title: `ห้องแชร์ ${cleanRoom}`,
    paperTemplate: "lined",
    pageHeight: 1600,
    pages: [
      {
        id: "page-1",
        paperTemplate: "lined",
        pageHeight: 1600,
        aspect: "portrait",
        order: 0,
        updatedAt: 0,
      },
    ],
    strokes: [],
    items: [],
    roomId: cleanRoom,
    metaUpdatedAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

export type SlideLayoutPreset = "cover" | "content" | "two_col" | "table_chart";

export function createSlideLayoutItems(
  layout: SlideLayoutPreset,
  pageId: string
): CanvasItem[] {
  const now = Date.now();
  const makeId = (suffix: string) =>
    `sl-${suffix}-${now}-${Math.floor(Math.random() * 1000)}`;

  if (layout === "cover") {
    return [
      {
        id: makeId("banner"),
        pageId,
        type: "shape",
        shapeKind: "banner",
        x: 90,
        y: 165,
        width: 1100,
        height: 150,
        zIndex: 1,
        text: "หัวข้องานนำเสนอ / งานวิจัย",
        bgColor: "#EFFAF8",
        color: "#0F766E",
        fontSize: 34,
        updatedAt: now,
      },
      {
        id: makeId("sub"),
        pageId,
        type: "text",
        x: 90,
        y: 350,
        width: 1100,
        height: 140,
        zIndex: 2,
        text: "สรุปประเด็นสำคัญ · คณะผู้จัดทำ / ทีมวิจัย\nวันที่นำเสนอ...",
        color: "#1C1B18",
        fontSize: 22,
        updatedAt: now,
      },
    ];
  }

  if (layout === "two_col") {
    return [
      {
        id: makeId("head"),
        pageId,
        type: "shape",
        shapeKind: "banner",
        x: 64,
        y: 44,
        width: 1152,
        height: 76,
        zIndex: 1,
        text: "เปรียบเทียบประเด็นสำคัญ (2 คอลัมน์)",
        bgColor: "#EFFAF8",
        color: "#0F766E",
        fontSize: 24,
        updatedAt: now,
      },
      {
        id: makeId("left"),
        pageId,
        type: "meeting_card",
        x: 64,
        y: 150,
        width: 556,
        height: 500,
        zIndex: 2,
        title: "📌 ประเด็น / วิธีที่ 1",
        text: "• ระบุข้อมูลหรือผลวิเคราะห์...\n• ตัวอย่างประกอบ...",
        bgColor: "#FFFFFF",
        color: "#1C1B18",
        fontSize: 18,
        updatedAt: now,
      },
      {
        id: makeId("right"),
        pageId,
        type: "meeting_card",
        x: 660,
        y: 150,
        width: 556,
        height: 500,
        zIndex: 3,
        title: "💡 ประเด็น / วิธีที่ 2",
        text: "• สรุปข้อดี ข้อสังเกต...\n• ข้อเสนอแนะ...",
        bgColor: "#FEF9C3",
        color: "#1C1B18",
        fontSize: 18,
        updatedAt: now,
      },
    ];
  }

  if (layout === "table_chart") {
    return [
      {
        id: makeId("head"),
        pageId,
        type: "shape",
        shapeKind: "banner",
        x: 64,
        y: 44,
        width: 1152,
        height: 74,
        zIndex: 1,
        text: "สรุปผลข้อมูลและตารางเปรียบเทียบ",
        bgColor: "#EFFAF8",
        color: "#0F766E",
        fontSize: 24,
        updatedAt: now,
      },
      {
        id: makeId("tbl"),
        pageId,
        type: "table",
        x: 64,
        y: 148,
        width: 760,
        height: 440,
        zIndex: 2,
        tableData: {
          headerBg: "#0F766E",
          rows: [
            ["ตัวแปร / เกณฑ์", "กลุ่มทดลอง", "กลุ่มควบคุม", "หมายเหตุ"],
            ["รายการที่ 1", "", "", ""],
            ["รายการที่ 2", "", "", ""],
            ["สรุปภาพรวม", "", "", ""],
          ],
        },
        updatedAt: now,
      },
      {
        id: makeId("note"),
        pageId,
        type: "sticky",
        x: 854,
        y: 148,
        width: 360,
        height: 440,
        zIndex: 3,
        title: "📝 ข้อค้นพบสำคัญ",
        text: "สรุปแนวโน้มจากตาราง หรือใช้ปากกาวง/ชี้ไฮไลต์เพิ่มเติมได้เลย",
        bgColor: "#FEF9C3",
        color: "#1C1B18",
        fontSize: 16,
        updatedAt: now,
      },
    ];
  }

  // Default: "content"
  return [
    {
      id: makeId("head"),
      pageId,
      type: "shape",
      shapeKind: "banner",
      x: 64,
      y: 44,
      width: 1152,
      height: 76,
      zIndex: 1,
      text: "หัวข้อสไลด์",
      bgColor: "#EFFAF8",
      color: "#0F766E",
      fontSize: 26,
      updatedAt: now,
    },
    {
      id: makeId("body"),
      pageId,
      type: "meeting_card",
      x: 64,
      y: 148,
      width: 1152,
      height: 502,
      zIndex: 2,
      title: "สาระสำคัญ",
      text: "• พิมพ์เนื้อหา หรือวางรูปภาพ ตาราง และคลิป YouTube ได้ทันที",
      bgColor: "#FFFFFF",
      color: "#1C1B18",
      fontSize: 18,
      updatedAt: now,
    },
  ];
}

export function createEmptyNotebook(
  kind: "notebook" | "shortnote" | "slides" = "notebook",
  title?: string
): ShootNotebook {
  const now = Date.now();
  const paperTemplate: PaperTemplate =
    kind === "shortnote" ? "dotted" : kind === "slides" ? "blank" : "lined";
  const pageHeight =
    kind === "slides" ? SLIDE_HEIGHT : kind === "shortnote" ? 1100 : 1600;
  const pageAspect = kind === "slides" ? "slide16x9" : "portrait";

  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `nb-${now}-${Math.floor(Math.random() * 1000)}`,
    kind,
    title:
      title?.trim() ||
      (kind === "slides"
        ? "ชุดสไลด์ใหม่"
        : kind === "shortnote"
          ? "ShootNote ด่วน"
          : "สมุดจดใหม่"),
    quickBody: kind === "shortnote" ? "" : undefined,
    paperTemplate,
    pageHeight,
    pages: [
      createNotebookPage(0, paperTemplate, pageHeight, "page-1", pageAspect),
    ],
    strokes: [],
    items: kind === "slides" ? createSlideLayoutItems("cover", "page-1") : [],
    metaUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeByIdLWW<T extends { id: string; updatedAt: number }>(
  localArr: T[],
  remoteArr: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of localArr) {
    map.set(item.id, item);
  }
  for (const item of remoteArr) {
    const existing = map.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function mergePagesLWW(
  localPages: NotebookPage[],
  remotePages: NotebookPage[]
): NotebookPage[] {
  const map = new Map<string, NotebookPage>();
  for (const p of localPages) {
    map.set(p.id, p);
  }
  for (const p of remotePages) {
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
    } else {
      const winner = p.updatedAt >= existing.updatedAt ? p : existing;
      map.set(p.id, {
        ...winner,
        pageHeight: Math.max(existing.pageHeight || 1600, p.pageHeight || 1600),
      });
    }
  }
  return Array.from(map.values()).sort(comparePages);
}

export function mergeNotebook(
  local: ShootNotebook,
  remote: ShootNotebook
): ShootNotebook {
  const useRemoteMeta = remote.metaUpdatedAt > local.metaUpdatedAt;
  const localPages = local.pages?.length ? local.pages : ensureNotebookPages(local);
  const remotePages = remote.pages?.length
    ? remote.pages
    : ensureNotebookPages(remote);

  const createdAt =
    local.createdAt > 0 && remote.createdAt > 0
      ? Math.min(local.createdAt, remote.createdAt)
      : local.createdAt || remote.createdAt || Date.now();

  return {
    id: local.id || remote.id,
    kind: useRemoteMeta ? remote.kind : local.kind,
    title: useRemoteMeta ? remote.title : local.title,
    quickBody: useRemoteMeta ? remote.quickBody : local.quickBody,
    paperTemplate: useRemoteMeta ? remote.paperTemplate : local.paperTemplate,
    pageHeight: Math.max(local.pageHeight || 1600, remote.pageHeight || 1600),
    pages: mergePagesLWW(localPages, remotePages),
    strokes: mergeByIdLWW<InkStroke>(local.strokes || [], remote.strokes || []),
    items: mergeByIdLWW<CanvasItem>(local.items || [], remote.items || []),
    roomId: local.roomId || remote.roomId,
    roomPinProtected: Boolean(local.roomPinProtected || remote.roomPinProtected),
    metaUpdatedAt: Math.max(local.metaUpdatedAt || 0, remote.metaUpdatedAt || 0),
    createdAt,
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
  };
}

function getSvgPathFromStroke(points: number[][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x.toFixed(1)} ${y.toFixed(1)} Z`;
  }

  const d: string[] = [
    `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`,
  ];

  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const mx = ((x0 + x1) / 2).toFixed(1);
    const my = ((y0 + y1) / 2).toFixed(1);
    d.push(`Q ${x0.toFixed(1)} ${y0.toFixed(1)} ${mx} ${my}`);
  }

  const last = points[points.length - 1];
  const first = points[0];
  d.push(
    `Q ${last[0].toFixed(1)} ${last[1].toFixed(1)} ${first[0].toFixed(1)} ${first[1].toFixed(1)} Z`
  );
  return d.join(" ");
}

export function strokePointsToSvgPath(
  points: StrokePoint[],
  options: {
    size: number;
    tool: "pen" | "highlighter";
    isStylus: boolean;
  }
): string {
  if (!points || points.length === 0) return "";

  const isHighlighter = options.tool === "highlighter";
  const outline = getStroke(points, {
    size: options.size,
    thinning: isHighlighter ? 0.1 : 0.55,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: !options.isStylus && !isHighlighter,
  });

  return getSvgPathFromStroke(outline);
}

const TOPIC_CARD_BG = [
  "#EFFAF8",
  "#FEF7EB",
  "#F2F3FE",
  "#FEF1F4",
  "#EFFAF3",
  "#F4F6F8",
] as const;

export function createMeetingPageItems(
  meeting: SavedMeeting,
  pageId: string,
  baseZIndex: number = 1
): { items: CanvasItem[]; pageHeight: number } {
  const now = Date.now();
  const { analysis } = meeting;
  const items: CanvasItem[] = [];
  let cursorY = 56;
  let z = baseZIndex;

  const execText = [
    analysis.executiveSummary,
    analysis.participants.length > 0
      ? `\nผู้เข้าร่วม: ${analysis.participants.join(", ")}`
      : "",
    analysis.keyDecisions.length > 0
      ? `\nมติสำคัญ:\n${analysis.keyDecisions.map((d) => `• ${d}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const execHeight = Math.max(190, Math.min(340, 120 + execText.length * 0.42));
  items.push({
    id: `mc-exec-${now}-${Math.floor(Math.random() * 1000)}`,
    pageId,
    type: "meeting_card",
    x: 48,
    y: cursorY,
    width: 904,
    height: Math.round(execHeight),
    zIndex: z++,
    title: `📌 ${analysis.meetingTitle}`,
    text: execText,
    bgColor: "#EFFAF8",
    color: "#1C1B18",
    fontSize: 15,
    updatedAt: now,
  });
  cursorY += Math.round(execHeight) + 28;

  const colWidth = 438;
  const gap = 28;
  let leftY = cursorY;
  let rightY = cursorY;

  analysis.topics.forEach((topic, idx) => {
    const isLeft = idx % 2 === 0;
    const x = isLeft ? 48 : 48 + colWidth + gap;
    const y = isLeft ? leftY : rightY;

    const lines: string[] = [];
    if (topic.startTime) {
      lines.push(
        `⏱ ${topic.startTime}${topic.endTime ? ` – ${topic.endTime}` : ""}`
      );
    }
    if (topic.summary) lines.push(topic.summary);
    if (topic.keyPoints.length > 0) {
      lines.push("\nประเด็นสำคัญ:");
      topic.keyPoints.forEach((pt) => lines.push(`• ${pt}`));
    }
    if (topic.decisions.length > 0) {
      lines.push("\nมติ:");
      topic.decisions.forEach((dec) => lines.push(`✅ ${dec}`));
    }

    const body = lines.join("\n");
    const cardHeight = Math.max(210, Math.min(420, 110 + body.length * 0.55));
    items.push({
      id: `mc-topic-${idx}-${now}-${Math.floor(Math.random() * 1000)}`,
      pageId,
      type: "meeting_card",
      x,
      y,
      width: colWidth,
      height: Math.round(cardHeight),
      zIndex: z++,
      title: `${idx + 1}. ${topic.title}`,
      text: body,
      bgColor: TOPIC_CARD_BG[idx % TOPIC_CARD_BG.length],
      color: "#1C1B18",
      fontSize: 14,
      updatedAt: now,
    });

    if (isLeft) {
      leftY += Math.round(cardHeight) + 24;
    } else {
      rightY += Math.round(cardHeight) + 24;
    }
  });

  cursorY = Math.max(leftY, rightY) + 12;

  if (analysis.tasks.length > 0) {
    const taskLines = analysis.tasks.map((t, idx) => {
      const mark = t.status === "done" ? "☑" : "☐";
      const due = t.dueDate ? ` (กำหนด ${t.dueDate})` : "";
      return `${mark} ${idx + 1}. ${t.title} — ${t.assignee || "ไม่ระบุ"}${due}`;
    });
    const taskBody = taskLines.join("\n");
    const taskHeight = Math.max(190, 90 + analysis.tasks.length * 32);

    items.push({
      id: `mc-tasks-${now}-${Math.floor(Math.random() * 1000)}`,
      pageId,
      type: "sticky",
      x: 48,
      y: cursorY,
      width: 904,
      height: Math.round(taskHeight),
      zIndex: z++,
      title: `📋 งานที่ต้องทำต่อ (${analysis.tasks.length} งาน)`,
      text: taskBody,
      bgColor: "#FEF9C3",
      color: "#1C1B18",
      fontSize: 15,
      updatedAt: now,
    });
    cursorY += Math.round(taskHeight) + 120;
  }

  return {
    items,
    pageHeight: Math.max(1600, cursorY + 300),
  };
}

export function createNotebookFromMeeting(meeting: SavedMeeting): ShootNotebook {
  const now = Date.now();
  const page1Id = "page-1";
  const built = createMeetingPageItems(meeting, page1Id, 1);

  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `nb-meeting-${now}`,
    kind: "notebook",
    title: meeting.analysis.meetingTitle,
    paperTemplate: "lined",
    pageHeight: built.pageHeight,
    pages: [
      createNotebookPage(0, "lined", built.pageHeight, page1Id),
      createNotebookPage(1, "lined", 1600, "page-2"),
    ],
    strokes: [],
    items: built.items,
    metaUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
