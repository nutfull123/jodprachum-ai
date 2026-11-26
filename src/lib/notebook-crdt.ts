import { getStroke } from "perfect-freehand";
import type { SavedMeeting } from "../types/meeting";
import type {
  CanvasItem,
  InkStroke,
  ShootNotebook,
  StrokePoint,
} from "../types/notebook";

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return `SN-${code}`;
}

export function createEmptyNotebook(
  kind: "notebook" | "shortnote" = "notebook",
  title?: string
): ShootNotebook {
  const now = Date.now();
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `nb-${now}-${Math.floor(Math.random() * 1000)}`,
    kind,
    title:
      title?.trim() ||
      (kind === "shortnote" ? "ShootNote ด่วน" : "สมุดจดใหม่"),
    quickBody: kind === "shortnote" ? "" : undefined,
    paperTemplate: kind === "shortnote" ? "dotted" : "lined",
    pageHeight: kind === "shortnote" ? 1100 : 1600,
    strokes: [],
    items: [],
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

export function mergeNotebook(
  local: ShootNotebook,
  remote: ShootNotebook
): ShootNotebook {
  const useRemoteMeta = remote.metaUpdatedAt > local.metaUpdatedAt;
  return {
    id: local.id || remote.id,
    kind: useRemoteMeta ? remote.kind : local.kind,
    title: useRemoteMeta ? remote.title : local.title,
    quickBody: useRemoteMeta ? remote.quickBody : local.quickBody,
    paperTemplate: useRemoteMeta ? remote.paperTemplate : local.paperTemplate,
    pageHeight: Math.max(local.pageHeight || 1600, remote.pageHeight || 1600),
    strokes: mergeByIdLWW<InkStroke>(local.strokes || [], remote.strokes || []),
    items: mergeByIdLWW<CanvasItem>(local.items || [], remote.items || []),
    roomId: local.roomId || remote.roomId,
    metaUpdatedAt: Math.max(local.metaUpdatedAt || 0, remote.metaUpdatedAt || 0),
    createdAt: Math.min(local.createdAt || Date.now(), remote.createdAt || Date.now()),
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

export function createNotebookFromMeeting(meeting: SavedMeeting): ShootNotebook {
  const now = Date.now();
  const { analysis } = meeting;
  const items: CanvasItem[] = [];
  let cursorY = 56;
  let z = 1;

  // Header executive summary card
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
    id: `mc-exec-${now}`,
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

  // Topic cards arranged cleanly in 2 columns
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
      id: `mc-topic-${idx}-${now}`,
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

  // Action items sticky note
  if (analysis.tasks.length > 0) {
    const taskLines = analysis.tasks.map((t, idx) => {
      const mark = t.status === "done" ? "☑" : "☐";
      const due = t.dueDate ? ` (กำหนด ${t.dueDate})` : "";
      return `${mark} ${idx + 1}. ${t.title} — ${t.assignee || "ไม่ระบุ"}${due}`;
    });
    const taskBody = taskLines.join("\n");
    const taskHeight = Math.max(190, 90 + analysis.tasks.length * 32);

    items.push({
      id: `mc-tasks-${now}`,
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
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `nb-meeting-${now}`,
    kind: "notebook",
    title: analysis.meetingTitle,
    paperTemplate: "lined",
    pageHeight: Math.max(1600, cursorY + 300),
    strokes: [],
    items,
    metaUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
