"use client";

import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  PlayCircle,
} from "lucide-react";
import {
  getTopicColor,
  type MeetingTask,
  type MeetingTopic,
} from "../../types/meeting";
import { parseTimestampToSeconds } from "../../lib/mime";

interface TopicsViewProps {
  topics: MeetingTopic[];
  tasks: MeetingTask[];
  hasAudio: boolean;
  onSeek: (seconds: number) => void;
  onToggleTaskDone: (taskId: string) => void;
  onJumpToTasks: () => void;
}

export function TopicsView({
  topics,
  tasks,
  hasAudio,
  onSeek,
  onToggleTaskDone,
  onJumpToTasks,
}: TopicsViewProps) {
  if (topics.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-muted">
        ยังไม่มีหัวข้อการประชุมที่แยกไว้ในรายการนี้
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Quick Jump Pills */}
      <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">
          สารบัญหัวข้อ ({topics.length} วาระ)
        </p>
        <div className="flex flex-wrap gap-2">
          {topics.map((topic, idx) => {
            const palette = getTopicColor(topic.colorIndex);
            return (
              <a
                key={topic.id}
                href={`#topic-card-${topic.id}`}
                style={{
                  backgroundColor: palette.softBg,
                  borderColor: palette.border,
                  color: palette.text,
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium hover:opacity-85 transition-opacity"
              >
                <span
                  style={{ backgroundColor: palette.accent }}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                >
                  {idx + 1}
                </span>
                <span className="truncate max-w-[220px]">{topic.title}</span>
                {topic.startTime && (
                  <span className="font-mono text-[10px] opacity-75">
                    {topic.startTime}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </div>

      {/* Topic Cards */}
      <div className="space-y-4">
        {topics.map((topic, idx) => {
          const palette = getTopicColor(topic.colorIndex);
          const linkedTasks = tasks.filter((t) => t.topicId === topic.id);
          const startSeconds = parseTimestampToSeconds(topic.startTime);

          return (
            <section
              key={topic.id}
              id={`topic-card-${topic.id}`}
              style={{ borderLeftColor: palette.accent }}
              className="rounded-2xl border border-line border-l-4 bg-white p-5 shadow-sm space-y-4 scroll-mt-24"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span
                    style={{
                      backgroundColor: palette.pillBg,
                      color: palette.text,
                    }}
                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-ink leading-snug">
                      {topic.title}
                    </h3>
                    {topic.startTime && (
                      <div className="mt-1 flex items-center gap-2">
                        {hasAudio ? (
                          <button
                            type="button"
                            onClick={() => onSeek(startSeconds)}
                            className="inline-flex items-center gap-1 rounded-md bg-paper border border-line px-2 py-0.5 font-mono text-[11px] font-medium text-accent hover:bg-accent-soft transition-colors"
                            title="คลิกเพื่อฟังเสียงช่วงหัวข้อนี้"
                          >
                            <PlayCircle className="h-3 w-3" />
                            <span>
                              {topic.startTime}
                              {topic.endTime ? ` – ${topic.endTime}` : ""}
                            </span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-paper border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
                            <Clock className="h-3 w-3" />
                            <span>
                              {topic.startTime}
                              {topic.endTime ? ` – ${topic.endTime}` : ""}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {topic.summary && (
                <p className="text-sm text-ink/90 leading-relaxed">
                  {topic.summary}
                </p>
              )}

              {topic.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                    ประเด็นสำคัญที่คุยกัน
                  </h4>
                  <ul className="space-y-1.5">
                    {topic.keyPoints.map((point, pIdx) => (
                      <li
                        key={pIdx}
                        className="flex items-start gap-2.5 text-sm text-ink/90 leading-relaxed"
                      >
                        <span
                          style={{ backgroundColor: palette.accent }}
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                        />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {topic.decisions.length > 0 && (
                <div
                  style={{
                    backgroundColor: palette.softBg,
                    borderColor: palette.border,
                  }}
                  className="rounded-xl border p-3.5 space-y-1.5"
                >
                  <p
                    style={{ color: palette.text }}
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    มติ / ข้อสรุปของหัวข้อนี้
                  </p>
                  {topic.decisions.map((decision, dIdx) => (
                    <p
                      key={dIdx}
                      className="text-sm font-medium text-[#1C1B18] leading-relaxed pl-5"
                    >
                      • {decision}
                    </p>
                  ))}
                </div>
              )}

              {linkedTasks.length > 0 && (
                <div className="pt-2 border-t border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <ListChecks className="h-3.5 w-3.5 text-accent" />
                      งานที่ต้องทำต่อจากหัวข้อนี้ ({linkedTasks.length})
                    </span>
                    <button
                      type="button"
                      onClick={onJumpToTasks}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      จัดการในบอร์ดงาน
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {linkedTasks.map((task) => {
                      const isDone = task.status === "done";
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => onToggleTaskDone(task.id)}
                          className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                            isDone
                              ? "border-emerald-200 bg-emerald-50/50 text-muted"
                              : "border-line bg-paper/70 hover:bg-paper text-ink"
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-xs font-medium leading-snug ${
                                isDone ? "line-through" : ""
                              }`}
                            >
                              {task.title}
                            </p>
                            <p className="mt-1 text-[11px] text-muted">
                              {task.assignee || "ไม่ระบุ"}
                              {task.dueDate ? ` · กำหนด ${task.dueDate}` : ""}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
