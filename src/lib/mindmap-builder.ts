import type {
  MeetingTask,
  MeetingTopic,
  MindMapNode,
  MindMapNodeType,
} from "../types/meeting";

export interface PositionedMindMapNode {
  id: string;
  label: string;
  badge?: string;
  lines: string[];
  nodeType: MindMapNodeType;
  colorIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}

export interface PositionedMindMapEdge {
  id: string;
  sourceId: string;
  targetId: string;
  colorIndex: number;
  path: string;
}

export interface MindMapLayoutResult {
  nodes: PositionedMindMapNode[];
  edges: PositionedMindMapEdge[];
  width: number;
  height: number;
}

const COMBINING_THAI_RE = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;

function visualLength(str: string): number {
  return str.replace(COMBINING_THAI_RE, "").length;
}

function segmentWords(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("th", { granularity: "word" });
    return Array.from(segmenter.segment(normalized), (s) => s.segment);
  }

  // Fallback: keep combining marks attached to their preceding base character
  const tokens: string[] = [];
  for (const ch of normalized) {
    if (/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch) && tokens.length > 0) {
      tokens[tokens.length - 1] += ch;
    } else {
      tokens.push(ch);
    }
  }
  return tokens;
}

export function wrapThaiText(
  text: string,
  maxVisualChars: number = 26,
  maxLines: number = 4
): string[] {
  const segments = segmentWords(text);
  if (segments.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const seg of segments) {
    if (!current && seg === " ") continue;
    const candidate = current + seg;
    if (visualLength(candidate) <= maxVisualChars || !current) {
      current = candidate;
    } else {
      lines.push(current.trimEnd());
      current = seg.trimStart();
      if (lines.length >= maxLines) {
        break;
      }
    }
  }

  if (current.trim() && lines.length < maxLines) {
    lines.push(current.trimEnd());
  } else if (current.trim() && lines.length === maxLines) {
    const lastIdx = lines.length - 1;
    const last = lines[lastIdx];
    if (!last.endsWith("…")) {
      lines[lastIdx] = last.slice(0, Math.max(1, last.length - 1)) + "…";
    }
  }

  return lines.length > 0 ? lines : [text.slice(0, maxVisualChars)];
}

export function buildMindMapTree(input: {
  meetingTitle: string;
  topics: MeetingTopic[];
  tasks: MeetingTask[];
  blockers?: string[];
}): MindMapNode {
  const topicIds = new Set(input.topics.map((t) => t.id));

  const topicNodes: MindMapNode[] = input.topics.map((topic, idx) => {
    const colorIndex = topic.colorIndex ?? idx % 6;
    const children: MindMapNode[] = [];

    topic.decisions.forEach((decision, dIdx) => {
      children.push({
        id: `${topic.id}-dec-${dIdx}`,
        label: decision,
        badge: "มติ",
        nodeType: "decision",
        colorIndex,
        children: [],
      });
    });

    topic.keyPoints.forEach((point, pIdx) => {
      children.push({
        id: `${topic.id}-pt-${pIdx}`,
        label: point,
        nodeType: "point",
        colorIndex,
        children: [],
      });
    });

    const linkedTasks = input.tasks.filter((task) => task.topicId === topic.id);
    linkedTasks.forEach((task) => {
      const badgeParts = [
        task.assignee && task.assignee !== "ไม่ระบุ" ? task.assignee : "งาน",
        task.dueDate || "",
      ].filter(Boolean);
      children.push({
        id: `${topic.id}-task-${task.id}`,
        label: task.title,
        badge: badgeParts.join(" · "),
        nodeType: "task",
        colorIndex,
        children: [],
      });
    });

    if (children.length === 0 && topic.summary) {
      children.push({
        id: `${topic.id}-sum-0`,
        label: topic.summary,
        nodeType: "point",
        colorIndex,
        children: [],
      });
    }

    const timeRange = topic.startTime
      ? `${topic.startTime}${topic.endTime ? `–${topic.endTime}` : ""}`
      : undefined;

    return {
      id: `topic-node-${topic.id}`,
      label: topic.title,
      badge: timeRange,
      nodeType: "topic",
      colorIndex,
      children,
    };
  });

  const orphanTasks = input.tasks.filter(
    (t) => !t.topicId || !topicIds.has(t.topicId)
  );
  if (orphanTasks.length > 0) {
    const colorIndex = input.topics.length % 6;
    topicNodes.push({
      id: "topic-node-orphan-tasks",
      label: "งานติดตามเพิ่มเติม",
      badge: `${orphanTasks.length} งาน`,
      nodeType: "topic",
      colorIndex,
      children: orphanTasks.map((task) => ({
        id: `orphan-task-${task.id}`,
        label: task.title,
        badge: [
          task.assignee && task.assignee !== "ไม่ระบุ" ? task.assignee : "งาน",
          task.dueDate || "",
        ]
          .filter(Boolean)
          .join(" · "),
        nodeType: "task",
        colorIndex,
        children: [],
      })),
    });
  }

  if (input.blockers && input.blockers.length > 0) {
    const colorIndex = 3; // rose
    topicNodes.push({
      id: "topic-node-blockers",
      label: "ประเด็นติดขัด / ความเสี่ยง",
      badge: `${input.blockers.length} ข้อ`,
      nodeType: "topic",
      colorIndex,
      children: input.blockers.map((blocker, bIdx) => ({
        id: `blocker-${bIdx}`,
        label: blocker,
        badge: "ติดขัด",
        nodeType: "point",
        colorIndex,
        children: [],
      })),
    });
  }

  return {
    id: "root",
    label: input.meetingTitle || "สรุปการประชุม",
    nodeType: "root",
    colorIndex: 0,
    children: topicNodes,
  };
}

interface MeasuredNode {
  raw: MindMapNode;
  colorIndex: number;
  lines: string[];
  width: number;
  height: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  visibleChildren: MeasuredNode[];
  subtreeHeight: number;
}

const GAP_X = 62;
const GAP_Y = 16;
const PADDING = 40;

function getVisibleRawChildren(node: MindMapNode, includeTasks: boolean): MindMapNode[] {
  return node.children.filter((child) => includeTasks || child.nodeType !== "task");
}

function measureNode(
  node: MindMapNode,
  collapsedIds: Set<string>,
  includeTasks: boolean,
  inheritedColor: number
): MeasuredNode {
  const colorIndex = node.colorIndex ?? inheritedColor;
  const allEligibleChildren = getVisibleRawChildren(node, includeTasks);
  const hasChildren = allEligibleChildren.length > 0;
  const isCollapsed = hasChildren && collapsedIds.has(node.id);

  let width = 264;
  let maxVisualChars = 26;
  let lineHeight = 19;
  let basePadY = 20;

  if (node.nodeType === "root") {
    width = 244;
    maxVisualChars = 20;
    lineHeight = 22;
    basePadY = 28;
  } else if (node.nodeType === "topic") {
    width = 232;
    maxVisualChars = 21;
    lineHeight = 20;
    basePadY = 22;
  }

  const lines = wrapThaiText(node.label, maxVisualChars, 4);
  const badgeExtra = node.badge ? 22 : 0;
  const height = Math.max(46, basePadY + badgeExtra + lines.length * lineHeight);

  const visibleChildren = isCollapsed
    ? []
    : allEligibleChildren.map((child, idx) =>
        measureNode(
          child,
          collapsedIds,
          includeTasks,
          node.nodeType === "root" ? child.colorIndex ?? idx % 6 : colorIndex
        )
      );

  const childrenTotalHeight =
    visibleChildren.length === 0
      ? 0
      : visibleChildren.reduce((sum, c) => sum + c.subtreeHeight, 0) +
        (visibleChildren.length - 1) * GAP_Y;

  const subtreeHeight = Math.max(height, childrenTotalHeight);

  return {
    raw: node,
    colorIndex,
    lines,
    width,
    height,
    hasChildren,
    isCollapsed,
    visibleChildren,
    subtreeHeight,
  };
}

export function computeTreeLayout(
  root: MindMapNode,
  collapsedIds: Set<string>,
  includeTasks: boolean = true
): MindMapLayoutResult {
  const measuredRoot = measureNode(root, collapsedIds, includeTasks, 0);

  // Calculate max width at each depth so columns line up cleanly
  const depthWidths = new Map<number, number>();
  function collectWidths(m: MeasuredNode, depth: number) {
    depthWidths.set(depth, Math.max(depthWidths.get(depth) || 0, m.width));
    for (const c of m.visibleChildren) {
      collectWidths(c, depth + 1);
    }
  }
  collectWidths(measuredRoot, 0);

  const depthX = new Map<number, number>();
  let cursorX = PADDING;
  const maxDepth = Math.max(...Array.from(depthWidths.keys()), 0);
  for (let d = 0; d <= maxDepth; d++) {
    depthX.set(d, cursorX);
    cursorX += (depthWidths.get(d) || 240) + GAP_X;
  }

  const nodes: PositionedMindMapNode[] = [];
  const edges: PositionedMindMapEdge[] = [];

  function assign(m: MeasuredNode, depth: number, topY: number): PositionedMindMapNode {
    const x = depthX.get(depth) || PADDING;
    const y = topY + (m.subtreeHeight - m.height) / 2;

    const positioned: PositionedMindMapNode = {
      id: m.raw.id,
      label: m.raw.label,
      badge: m.raw.badge,
      lines: m.lines,
      nodeType: m.raw.nodeType,
      colorIndex: m.colorIndex,
      x,
      y,
      width: m.width,
      height: m.height,
      depth,
      hasChildren: m.hasChildren,
      isCollapsed: m.isCollapsed,
    };
    nodes.push(positioned);

    if (m.visibleChildren.length > 0) {
      const childrenTotalHeight =
        m.visibleChildren.reduce((sum, c) => sum + c.subtreeHeight, 0) +
        (m.visibleChildren.length - 1) * GAP_Y;
      let childTop = topY + (m.subtreeHeight - childrenTotalHeight) / 2;

      for (const child of m.visibleChildren) {
        const childPos = assign(child, depth + 1, childTop);
        const startX = positioned.x + positioned.width;
        const startY = positioned.y + positioned.height / 2;
        const endX = childPos.x;
        const endY = childPos.y + childPos.height / 2;
        const midX = startX + (endX - startX) * 0.52;

        edges.push({
          id: `edge-${positioned.id}-${childPos.id}`,
          sourceId: positioned.id,
          targetId: childPos.id,
          colorIndex: childPos.colorIndex,
          path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
        });

        childTop += child.subtreeHeight + GAP_Y;
      }
    }

    return positioned;
  }

  assign(measuredRoot, 0, PADDING);

  const totalWidth =
    Math.max(...nodes.map((n) => n.x + n.width), 600) + PADDING;
  const totalHeight =
    Math.max(...nodes.map((n) => n.y + n.height), 420) + PADDING;

  return {
    nodes,
    edges,
    width: totalWidth,
    height: totalHeight,
  };
}
