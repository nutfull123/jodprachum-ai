import type {
  MeetingAnalysis,
  MeetingTask,
  MeetingTopic,
  TaskPriority,
  TranscriptSegment,
} from "../types/meeting";
import { parseTimestampToSeconds } from "./mime.ts";
import { buildMindMapTree } from "./mindmap-builder.ts";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

export type AuthResolution =
  | { ok: true; apiKey: string }
  | { ok: false; status: number; error: string };

export function resolveAuth(req: Request): AuthResolution {
  const userKey = req.headers.get("x-gemini-api-key")?.trim();
  if (userKey) {
    return { ok: true, apiKey: userKey };
  }

  const serverKey = process.env.GEMINI_API_KEY?.trim();
  if (serverKey) {
    const requiredPasscode = process.env.ACCESS_PASSCODE?.trim();
    if (requiredPasscode) {
      const provided = req.headers.get("x-access-passcode")?.trim() || "";
      if (provided !== requiredPasscode) {
        return {
          ok: false,
          status: 403,
          error: "รหัสผ่านเข้าใช้งาน (Passcode) ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
        };
      }
    }
    return { ok: true, apiKey: serverKey };
  }

  return {
    ok: false,
    status: 401,
    error:
      "ยังไม่ได้ตั้งค่า Gemini API Key กรุณากดปุ่ม 'ตั้งค่าคีย์ AI ฟรี' ด้านบน (ขอคีย์ฟรีได้ใน 1 นาที)",
  };
}

export function isSafeGoogleUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "generativelanguage.googleapis.com"
    );
  } catch {
    return false;
  }
}

export function translateGeminiHttpError(status: number, rawBody: string): string {
  console.error("[Gemini API Error]", status, rawBody);

  let detail = "";
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { message?: string };
    };
    if (typeof parsed?.error?.message === "string") {
      detail = parsed.error.message.trim();
    }
  } catch {
    // Non-JSON upstream error body
  }

  const lower = rawBody.toLowerCase();
  if (
    status === 400 &&
    (lower.includes("api_key_invalid") || lower.includes("api key not valid"))
  ) {
    return "Gemini API Key ไม่ถูกต้อง กรุณาตรวจสอบคีย์ที่กรอกใหม่อีกครั้ง";
  }
  if (status === 401 || status === 403) {
    return "ไม่มีสิทธิ์ใช้งาน Gemini API Key นี้ หรือคีย์ถูกปิดใช้งานแล้ว";
  }
  if (status === 429 || lower.includes("resource_exhausted")) {
    return "โควตาใช้งานฟรีของคีย์นี้เต็มชั่วคราว (Rate Limit) กรุณารอสัก 1 นาทีแล้วลองใหม่ หรือใส่คีย์ฟรีของคุณเองที่ปุ่ม 'ตั้งค่าคีย์ AI ฟรี'";
  }
  if (status === 413) {
    return "ไฟล์มีขนาดใหญ่เกินขีดจำกัดของ API (สูงสุด 2 GB)";
  }
  if (status === 415 || lower.includes("unsupported mime")) {
    return "รูปแบบไฟล์เสียงนี้ยังไม่รองรับ แนะนำให้แปลงเป็น .mp3, .m4a หรือ .wav ก่อนลองใหม่";
  }
  return `เกิดข้อผิดพลาดจากบริการ Gemini API (HTTP ${status}${detail ? `: ${detail}` : ""}) กรุณาลองใหม่อีกครั้ง`;
}

// Non-recursive OpenAPI schema with UPPERCASE types required by raw Gemini REST API
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    meetingTitle: {
      type: "STRING",
      description: "Concise Thai meeting title summarizing the overall subject.",
    },
    executiveSummary: {
      type: "STRING",
      description: "2-4 sentence executive overview of the meeting in Thai.",
    },
    participants: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Speaker names or roles identified from the audio.",
    },
    keyDecisions: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Top concrete decisions agreed in the meeting in Thai.",
    },
    blockers: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Risks, blockers, or unresolved issues raised in Thai.",
    },
    topics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", description: "Short ID like topic-1, topic-2" },
          title: { type: "STRING", description: "Clear Thai topic heading" },
          startTime: { type: "STRING", description: "Start time MM:SS or HH:MM:SS" },
          endTime: { type: "STRING", description: "End time MM:SS or HH:MM:SS" },
          summary: { type: "STRING", description: "Concise Thai summary of this topic" },
          keyPoints: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Main discussion bullet points for this topic in Thai",
          },
          decisions: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Decisions reached specifically inside this topic",
          },
        },
        required: [
          "id",
          "title",
          "startTime",
          "endTime",
          "summary",
          "keyPoints",
          "decisions",
        ],
      },
    },
    tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", description: "Short ID like task-1, task-2" },
          title: { type: "STRING", description: "Actionable task title in Thai" },
          description: {
            type: "STRING",
            description: "Brief clarifying details or empty string",
          },
          assignee: {
            type: "STRING",
            description: "Responsible person name, or 'ไม่ระบุ' if unmentioned",
          },
          dueDate: {
            type: "STRING",
            description: "Deadline mentioned in audio, or empty string if none",
          },
          priority: {
            type: "STRING",
            enum: ["high", "medium", "low"],
          },
          topicId: {
            type: "STRING",
            description: "Matching topic id from topics array",
          },
          timestamp: {
            type: "STRING",
            description: "Timestamp MM:SS where task was discussed",
          },
        },
        required: [
          "id",
          "title",
          "description",
          "assignee",
          "dueDate",
          "priority",
          "topicId",
          "timestamp",
        ],
      },
    },
    transcript: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          timestamp: { type: "STRING", description: "MM:SS or HH:MM:SS" },
          speaker: { type: "STRING", description: "Speaker name or ผู้พูด 1" },
          text: { type: "STRING", description: "Accurate spoken words" },
          topicId: { type: "STRING", description: "Matching topic id" },
        },
        required: ["timestamp", "speaker", "text", "topicId"],
      },
    },
  },
  required: [
    "meetingTitle",
    "executiveSummary",
    "participants",
    "keyDecisions",
    "blockers",
    "topics",
    "tasks",
    "transcript",
  ],
};

export function buildAnalysisPrompt(meetingContext?: string): string {
  const ctxLine = meetingContext?.trim()
    ? `\nบริบทเพิ่มเติมจากผู้ใช้: "${meetingContext.trim()}"\n`
    : "";

  return `คุณคือผู้ช่วยถอดเสียงและสรุปรายงานการประชุมระดับมืออาชีพ
โปรดฟังไฟล์เสียงการประชุมทั้งหมดอย่างละเอียดแล้วถอดความพร้อมวิเคราะห์สรุปงานเป็น JSON ที่มีโครงสร้างดังนี้:
- meetingTitle (string), executiveSummary (string), participants (string[]), keyDecisions (string[]), blockers (string[])
- topics: [{ id, title, startTime, endTime, summary, keyPoints, decisions }]
- tasks: [{ id, title, description, assignee, dueDate, priority ("high"|"medium"|"low"), topicId, timestamp }]
- transcript: [{ timestamp, speaker, text, topicId }]
${ctxLine}
ข้อกำหนดสำคัญ:
1. ภาษาที่ใช้: เขียนหัวข้อ ภาพรวม ประเด็นสำคัญ มติ และชื่องานเป็น **ภาษาไทย** ที่ชัดเจน อ่านง่าย ตรงประเด็น (คงคำศัพท์เทคนิคหรือชื่อเฉพาะภาษาอังกฤษไว้ตามที่พูดจริง)
2. การแยกหัวข้อ (topics): แบ่งช่วงการสนทนาออกเป็นหัวข้อหลักเรียงตามลำดับเวลาจริงในไฟล์เสียง ระบุ startTime และ endTime (รูปแบบ MM:SS หรือ HH:MM:SS) พร้อมสรุปสาระสำคัญ ประเด็นย่อย และมติของแต่ละหัวข้ออย่างชัดเจน ใช้ id เป็น "topic-1", "topic-2", ...
3. การสกัดงานที่ต้องทำ (tasks): ดึงเฉพาะงานหรือสิ่งที่ต้องติดตามต่อจริงจากการประชุม เชื่อม topicId ให้ตรงกับหัวข้อ ระบุผู้รับผิดชอบ (ถ้าไม่ระบุชื่อให้ใส่ "ไม่ระบุ") และกำหนดส่งตามที่พูดถึงจริง (ถ้าไม่ได้พูดถึงให้ใส่ "") ห้ามแต่งเติมข้อมูลที่ไม่มีในเสียง
4. บทถอดเสียง (transcript): ถอดเสียงพูดให้ครบถ้วน แบ่งตามจังหวะการพูดหรือการสลับผู้พูด ระบุเวลา timestamp รูปแบบ MM:SS หรือ HH:MM:SS และระบุชื่อผู้พูด (หรือ "ผู้พูด 1", "ผู้พูด 2" หากไม่ทราบชื่อ) พร้อมเชื่อม topicId ให้ตรงกับหัวข้อ
5. ความซื่อตรง: รายงานเฉพาะสิ่งที่เกิดขึ้นจริงในไฟล์เสียง ห้ามเดาหรือสมมติตัวเลข วันเวลา หรือข้อตกลงที่ผู้พูดไม่ได้กล่าว`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizePriority(value: unknown): TaskPriority {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

export function normalizeGeminiAnalysis(rawInput: unknown): MeetingAnalysis {
  const raw =
    rawInput && typeof rawInput === "object"
      ? (rawInput as Record<string, unknown>)
      : {};

  const rawTopics = Array.isArray(raw.topics) ? raw.topics : [];
  const topics: MeetingTopic[] = rawTopics.map((item, idx) => {
    const obj = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const id =
      typeof obj.id === "string" && obj.id.trim()
        ? obj.id.trim()
        : `topic-${idx + 1}`;
    return {
      id,
      title:
        typeof obj.title === "string" && obj.title.trim()
          ? obj.title.trim()
          : `หัวข้อที่ ${idx + 1}`,
      startTime: typeof obj.startTime === "string" ? obj.startTime.trim() : "",
      endTime: typeof obj.endTime === "string" ? obj.endTime.trim() : "",
      summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
      keyPoints: asStringArray(obj.keyPoints),
      decisions: asStringArray(obj.decisions),
      colorIndex: idx % 6,
    };
  });

  const validTopicIds = new Set(topics.map((t) => t.id));
  const fallbackTopicId = topics[0]?.id;

  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks: MeetingTask[] = rawTasks.map((item, idx) => {
    const obj = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const rawTopicId =
      typeof obj.topicId === "string" ? obj.topicId.trim() : "";
    return {
      id:
        typeof obj.id === "string" && obj.id.trim()
          ? obj.id.trim()
          : `task-${idx + 1}`,
      title:
        typeof obj.title === "string" && obj.title.trim()
          ? obj.title.trim()
          : `งานติดตาม ${idx + 1}`,
      description:
        typeof obj.description === "string" ? obj.description.trim() : "",
      assignee:
        typeof obj.assignee === "string" && obj.assignee.trim()
          ? obj.assignee.trim()
          : "ไม่ระบุ",
      dueDate: typeof obj.dueDate === "string" ? obj.dueDate.trim() : "",
      priority: normalizePriority(obj.priority),
      status: "todo",
      topicId: validTopicIds.has(rawTopicId) ? rawTopicId : fallbackTopicId,
      timestamp: typeof obj.timestamp === "string" ? obj.timestamp.trim() : "",
    };
  });

  const rawTranscript = Array.isArray(raw.transcript) ? raw.transcript : [];
  const transcript: TranscriptSegment[] = rawTranscript.map((item, idx) => {
    const obj = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const ts =
      typeof obj.timestamp === "string" && obj.timestamp.trim()
        ? obj.timestamp.trim()
        : "00:00";
    const rawTopicId =
      typeof obj.topicId === "string" ? obj.topicId.trim() : "";
    return {
      id: `seg-${idx + 1}`,
      timestamp: ts,
      seconds: parseTimestampToSeconds(ts),
      speaker:
        typeof obj.speaker === "string" && obj.speaker.trim()
          ? obj.speaker.trim()
          : "ผู้พูด",
      text: typeof obj.text === "string" ? obj.text.trim() : "",
      topicId: validTopicIds.has(rawTopicId) ? rawTopicId : fallbackTopicId,
    };
  });

  const meetingTitle =
    typeof raw.meetingTitle === "string" && raw.meetingTitle.trim()
      ? raw.meetingTitle.trim()
      : "สรุปผลการประชุม";
  const executiveSummary =
    typeof raw.executiveSummary === "string" && raw.executiveSummary.trim()
      ? raw.executiveSummary.trim()
      : "สรุปใจความสำคัญจากการถอดเสียงประชุม";
  const participants = asStringArray(raw.participants);
  const keyDecisions = asStringArray(raw.keyDecisions);
  const blockers = asStringArray(raw.blockers);

  return {
    meetingTitle,
    executiveSummary,
    participants,
    keyDecisions,
    blockers,
    topics,
    tasks,
    transcript,
    mindMap: buildMindMapTree({
      meetingTitle,
      topics,
      tasks,
      blockers,
    }),
  };
}
