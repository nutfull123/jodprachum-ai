export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "doing" | "done";

export interface MeetingTask {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  topicId?: string;
  timestamp?: string;
}

export interface MeetingTopic {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  colorIndex: number;
}

export interface TranscriptSegment {
  id: string;
  timestamp: string;
  seconds: number;
  speaker: string;
  text: string;
  topicId?: string;
}

export type MindMapNodeType = "root" | "topic" | "point" | "decision" | "task";

export interface MindMapNode {
  id: string;
  label: string;
  badge?: string;
  nodeType: MindMapNodeType;
  colorIndex?: number;
  children: MindMapNode[];
}

export interface MeetingAnalysis {
  meetingTitle: string;
  executiveSummary: string;
  participants: string[];
  keyDecisions: string[];
  blockers: string[];
  topics: MeetingTopic[];
  tasks: MeetingTask[];
  transcript: TranscriptSegment[];
  mindMap: MindMapNode;
}

export interface SavedMeeting {
  id: string;
  createdAt: number;
  updatedAt: number;
  sourceType: "upload" | "record" | "demo";
  fileName: string;
  durationSec?: number;
  hasLocalAudio: boolean;
  analysis: MeetingAnalysis;
}

export interface TopicColorStyle {
  name: string;
  accent: string;
  softBg: string;
  border: string;
  text: string;
  pillBg: string;
}

export const TOPIC_PALETTE: TopicColorStyle[] = [
  {
    name: "teal",
    accent: "#0F766E",
    softBg: "#EFFAF8",
    border: "#99D6CE",
    text: "#0B5B54",
    pillBg: "#D7F0EC",
  },
  {
    name: "amber",
    accent: "#B45309",
    softBg: "#FEF7EB",
    border: "#F0CB8B",
    text: "#8C3E06",
    pillBg: "#FBE8C5",
  },
  {
    name: "indigo",
    accent: "#4338CA",
    softBg: "#F2F3FE",
    border: "#B9BEF5",
    text: "#352BA3",
    pillBg: "#E1E4FC",
  },
  {
    name: "rose",
    accent: "#BE123C",
    softBg: "#FEF1F4",
    border: "#F3B4C3",
    text: "#980E30",
    pillBg: "#FCDDE5",
  },
  {
    name: "emerald",
    accent: "#15803D",
    softBg: "#EFFAF3",
    border: "#A4DDB7",
    text: "#106530",
    pillBg: "#D8F2E1",
  },
  {
    name: "slate",
    accent: "#475569",
    softBg: "#F4F6F8",
    border: "#CBD5E1",
    text: "#334155",
    pillBg: "#E2E8F0",
  },
];

export function getTopicColor(colorIndex?: number): TopicColorStyle {
  const idx = Math.abs(colorIndex ?? 0) % TOPIC_PALETTE.length;
  return TOPIC_PALETTE[idx];
}
