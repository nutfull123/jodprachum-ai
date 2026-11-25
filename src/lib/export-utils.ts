import type { MeetingTask, SavedMeeting, TaskPriority, TaskStatus } from "../types/meeting";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "ด่วนมาก",
  medium: "ปานกลาง",
  low: "ทั่วไป",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "รอดำเนินการ",
  doing: "กำลังทำ",
  done: "เสร็จแล้ว",
};

function formatDateThai(timestamp: number): string {
  return new Date(timestamp).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-");
  return cleaned.slice(0, 80) || "meeting-summary";
}

export function formatForLineChat(meeting: SavedMeeting): string {
  const { analysis, createdAt } = meeting;
  const lines: string[] = [];

  lines.push(`📌 สรุปประชุม: ${analysis.meetingTitle}`);
  lines.push(`🗓 วันที่: ${formatDateThai(createdAt)}`);
  if (analysis.participants.length > 0) {
    lines.push(`👥 ผู้เข้าร่วม: ${analysis.participants.join(", ")}`);
  }
  lines.push("");
  lines.push(`📝 ภาพรวม: ${analysis.executiveSummary}`);

  if (analysis.keyDecisions.length > 0) {
    lines.push("");
    lines.push("✅ มติสำคัญ:");
    for (const decision of analysis.keyDecisions) {
      lines.push(`• ${decision}`);
    }
  }

  if (analysis.topics.length > 0) {
    lines.push("");
    lines.push("📂 สรุปแยกตามหัวข้อ:");
    analysis.topics.forEach((topic, idx) => {
      const timeRange = topic.startTime
        ? ` (${topic.startTime}${topic.endTime ? `–${topic.endTime}` : ""})`
        : "";
      lines.push(`\n${idx + 1}. ${topic.title}${timeRange}`);
      if (topic.summary) lines.push(`   ${topic.summary}`);
      for (const point of topic.keyPoints) {
        lines.push(`   - ${point}`);
      }
      for (const dec of topic.decisions) {
        lines.push(`   ★ มติ: ${dec}`);
      }
    });
  }

  if (analysis.tasks.length > 0) {
    lines.push("");
    lines.push("📋 งานที่ต้องทำต่อ (Action Items):");
    analysis.tasks.forEach((task) => {
      const mark = task.status === "done" ? "[x]" : "[ ]";
      const meta = [
        task.assignee && task.assignee !== "ไม่ระบุ" ? `ผู้รับผิดชอบ: ${task.assignee}` : "",
        task.dueDate ? `กำหนด: ${task.dueDate}` : "",
        `ระดับ: ${PRIORITY_LABEL[task.priority]}`,
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`${mark} ${task.title}${meta ? ` (${meta})` : ""}`);
    });
  }

  if (analysis.blockers.length > 0) {
    lines.push("");
    lines.push("⚠️ ประเด็นติดขัด / ความเสี่ยง:");
    for (const blocker of analysis.blockers) {
      lines.push(`• ${blocker}`);
    }
  }

  return lines.join("\n");
}

export function formatTasksOnlyForChat(
  meetingTitle: string,
  tasks: MeetingTask[]
): string {
  const lines: string[] = [`📋 รายการงานจากประชุม: ${meetingTitle}`, ""];
  if (tasks.length === 0) {
    lines.push("(ไม่มีรายการงานที่ต้องติดตาม)");
    return lines.join("\n");
  }

  tasks.forEach((task, idx) => {
    const icon = task.status === "done" ? "✅" : task.status === "doing" ? "🔄" : "⬜";
    const owner = task.assignee ? `@${task.assignee}` : "ไม่ระบุผู้รับผิดชอบ";
    const due = task.dueDate ? ` · กำหนด ${task.dueDate}` : "";
    const prio = task.priority === "high" ? " [ด่วน]" : "";
    lines.push(`${idx + 1}. ${icon} ${task.title}${prio} — ${owner}${due}`);
    if (task.description) {
      lines.push(`    ↳ ${task.description}`);
    }
  });

  return lines.join("\n");
}

export function formatAsMarkdown(meeting: SavedMeeting): string {
  const { analysis, createdAt, fileName } = meeting;
  const lines: string[] = [];

  lines.push(`# ${analysis.meetingTitle}`);
  lines.push("");
  lines.push(`- **วันที่บันทึก:** ${formatDateThai(createdAt)}`);
  lines.push(`- **ไฟล์ต้นฉบับ:** \`${fileName}\``);
  if (analysis.participants.length > 0) {
    lines.push(`- **ผู้เข้าร่วม:** ${analysis.participants.join(", ")}`);
  }
  lines.push("");
  lines.push("## ภาพรวมการประชุม");
  lines.push(analysis.executiveSummary);

  if (analysis.keyDecisions.length > 0) {
    lines.push("");
    lines.push("## มติที่ประชุม");
    for (const d of analysis.keyDecisions) {
      lines.push(`- ${d}`);
    }
  }

  if (analysis.blockers.length > 0) {
    lines.push("");
    lines.push("## ประเด็นติดขัดและความเสี่ยง");
    for (const b of analysis.blockers) {
      lines.push(`- ${b}`);
    }
  }

  if (analysis.topics.length > 0) {
    lines.push("");
    lines.push("## สรุปแยกตามหัวข้อ");
    analysis.topics.forEach((topic, idx) => {
      const range = topic.startTime
        ? ` (${topic.startTime}${topic.endTime ? ` - ${topic.endTime}` : ""})`
        : "";
      lines.push("");
      lines.push(`### ${idx + 1}. ${topic.title}${range}`);
      if (topic.summary) {
        lines.push(topic.summary);
        lines.push("");
      }
      if (topic.keyPoints.length > 0) {
        lines.push("**ประเด็นสำคัญ:**");
        for (const pt of topic.keyPoints) {
          lines.push(`- ${pt}`);
        }
      }
      if (topic.decisions.length > 0) {
        lines.push("");
        lines.push("**ข้อสรุป / มติในหัวข้อนี้:**");
        for (const dec of topic.decisions) {
          lines.push(`- ✅ ${dec}`);
        }
      }
    });
  }

  if (analysis.tasks.length > 0) {
    lines.push("");
    lines.push("## รายการงานที่ต้องทำ (Action Items)");
    lines.push("| สถานะ | งาน | ผู้รับผิดชอบ | กำหนดส่ง | ความสำคัญ |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const task of analysis.tasks) {
      const title = task.title.replace(/\|/g, "\\|");
      const assignee = (task.assignee || "ไม่ระบุ").replace(/\|/g, "\\|");
      const due = (task.dueDate || "-").replace(/\|/g, "\\|");
      lines.push(
        `| ${STATUS_LABEL[task.status]} | ${title} | ${assignee} | ${due} | ${PRIORITY_LABEL[task.priority]} |`
      );
    }
  }

  if (analysis.transcript.length > 0) {
    lines.push("");
    lines.push("## บทถอดเสียงฉบับเต็ม");
    for (const seg of analysis.transcript) {
      lines.push(`- **[${seg.timestamp}] ${seg.speaker}:** ${seg.text}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function escapeCsvCell(value: string): string {
  const safe = value.replace(/\r?\n/g, " ");
  if (/[",]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function formatTasksAsCsv(meeting: SavedMeeting): string {
  const topicTitleMap = new Map(
    meeting.analysis.topics.map((t) => [t.id, t.title])
  );
  const headers = [
    "ลำดับ",
    "ชื่องาน",
    "รายละเอียด",
    "ผู้รับผิดชอบ",
    "กำหนดส่ง",
    "ความสำคัญ",
    "สถานะ",
    "หัวข้อที่เกี่ยวข้อง",
    "เวลาอ้างอิง",
  ];

  const rows = meeting.analysis.tasks.map((task, idx) => [
    String(idx + 1),
    task.title,
    task.description || "",
    task.assignee || "ไม่ระบุ",
    task.dueDate || "",
    PRIORITY_LABEL[task.priority],
    STATUS_LABEL[task.status],
    (task.topicId && topicTitleMap.get(task.topicId)) || "",
    task.timestamp || "",
  ]);

  const csvLines = [headers, ...rows].map((row) =>
    row.map(escapeCsvCell).join(",")
  );
  // Prepend UTF-8 BOM so Microsoft Excel reads Thai text cleanly.
  return "\uFEFF" + csvLines.join("\r\n");
}

export function downloadTextFile(
  content: string,
  fileName: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
