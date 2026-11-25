"use client";

import { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  FileSpreadsheet,
  Kanban,
  ListTodo,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  getTopicColor,
  type MeetingTask,
  type MeetingTopic,
  type SavedMeeting,
  type TaskPriority,
  type TaskStatus,
} from "../../types/meeting";
import {
  downloadTextFile,
  formatTasksAsCsv,
  formatTasksOnlyForChat,
  sanitizeFileName,
} from "../../lib/export-utils";
import { parseTimestampToSeconds } from "../../lib/mime";

interface TasksViewProps {
  meeting: SavedMeeting;
  hasAudio: boolean;
  onSeek: (seconds: number) => void;
  onUpdateTasks: (tasks: MeetingTask[]) => void;
}

const PRIORITY_BADGE: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  high: {
    label: "ด่วนมาก",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  medium: {
    label: "ปานกลาง",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  low: {
    label: "ทั่วไป",
    className: "bg-stone-100 text-stone-700 border-stone-200",
  },
};

const STATUS_COLUMNS: Array<{
  status: TaskStatus;
  title: string;
  accent: string;
}> = [
  { status: "todo", title: "รอดำเนินการ", accent: "bg-stone-500" },
  { status: "doing", title: "กำลังทำ", accent: "bg-amber-500" },
  { status: "done", title: "เสร็จแล้ว", accent: "bg-emerald-600" },
];

export function TasksView({
  meeting,
  hasAudio,
  onSeek,
  onUpdateTasks,
}: TasksViewProps) {
  const { tasks, topics, meetingTitle } = meeting.analysis;
  const [subView, setSubView] = useState<"checklist" | "kanban">("checklist");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [copiedTasks, setCopiedTasks] = useState(false);

  // Add task form
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newTopicId, setNewTopicId] = useState<string>(topics[0]?.id || "");

  // Edit task inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MeetingTask | null>(null);

  const topicMap = useMemo(
    () => new Map<string, MeetingTopic>(topics.map((t) => [t.id, t])),
    [topics]
  );

  const assignees = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => set.add(t.assignee || "ไม่ระบุ"));
    return Array.from(set);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const owner = task.assignee || "ไม่ระบุ";
      if (assigneeFilter !== "all" && owner !== assigneeFilter) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, assigneeFilter, priorityFilter]);

  const doneCount = tasks.filter((t) => t.status === "done").length;

  const setTaskStatus = (taskId: string, status: TaskStatus) => {
    onUpdateTasks(
      tasks.map((t) => (t.id === taskId ? { ...t, status } : t))
    );
  };

  const toggleDone = (taskId: string) => {
    onUpdateTasks(
      tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === "done" ? "todo" : "done" }
          : t
      )
    );
  };

  const handleDeleteTask = (taskId: string) => {
    onUpdateTasks(tasks.filter((t) => t.id !== taskId));
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const item: MeetingTask = {
      id: `task-${Date.now()}`,
      title: newTitle.trim(),
      description: "",
      assignee: newAssignee.trim() || "ไม่ระบุ",
      dueDate: newDue.trim(),
      priority: newPriority,
      status: "todo",
      topicId: newTopicId || undefined,
    };
    onUpdateTasks([item, ...tasks]);
    setNewTitle("");
    setNewAssignee("");
    setNewDue("");
    setNewPriority("medium");
    setIsAdding(false);
  };

  const startEdit = (task: MeetingTask) => {
    setEditingId(task.id);
    setEditDraft({ ...task });
  };

  const saveEdit = () => {
    if (!editDraft || !editDraft.title.trim()) return;
    onUpdateTasks(
      tasks.map((t) =>
        t.id === editDraft.id
          ? {
              ...editDraft,
              title: editDraft.title.trim(),
              assignee: editDraft.assignee.trim() || "ไม่ระบุ",
              dueDate: editDraft.dueDate.trim(),
            }
          : t
      )
    );
    setEditingId(null);
    setEditDraft(null);
  };

  const handleCopyTasks = async () => {
    const txt = formatTasksOnlyForChat(meetingTitle, filteredTasks);
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const el = document.createElement("textarea");
      el.value = txt;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopiedTasks(true);
    setTimeout(() => setCopiedTasks(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-2xl border border-line bg-white p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-paper p-1 border border-line">
            <button
              type="button"
              onClick={() => setSubView("checklist")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                subView === "checklist"
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <ListTodo className="h-3.5 w-3.5" />
              เช็กลิสต์
            </button>
            <button
              type="button"
              onClick={() => setSubView("kanban")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                subView === "kanban"
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              บอร์ด Kanban
            </button>
          </div>

          <span className="rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
            เสร็จแล้ว {doneCount}/{tasks.length} งาน
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            aria-label="กรองตามผู้รับผิดชอบ"
            className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
          >
            <option value="all">ผู้รับผิดชอบทุกคน</option>
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(e.target.value as "all" | TaskPriority)
            }
            aria-label="กรองตามความสำคัญ"
            className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
          >
            <option value="all">ความสำคัญทั้งหมด</option>
            <option value="high">ด่วนมาก</option>
            <option value="medium">ปานกลาง</option>
            <option value="low">ทั่วไป</option>
          </select>

          <button
            type="button"
            onClick={handleCopyTasks}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6]"
          >
            {copiedTasks ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>คัดลอกแล้ว</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-accent" />
                <span>คัดลอกสั่งงาน (LINE)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                formatTasksAsCsv(meeting),
                `${sanitizeFileName(meetingTitle)}-tasks.csv`,
                "text/csv;charset=utf-8;"
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>เพิ่มงาน</span>
          </button>
        </div>
      </div>

      {/* Add Task Inline Form */}
      {isAdding && (
        <form
          onSubmit={handleAddTask}
          className="rounded-2xl border border-accent/30 bg-white p-4 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-ink">เพิ่มรายการงานใหม่</h4>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="ชื่องานที่ต้องทำ..."
              className="sm:col-span-2 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-accent focus:bg-white focus:outline-none"
            />
            <input
              type="text"
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              placeholder="ผู้รับผิดชอบ (เช่น พลอย)"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-accent focus:bg-white focus:outline-none"
            />
            <input
              type="text"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              placeholder="กำหนดส่ง (เช่น ศุกร์นี้)"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-accent focus:bg-white focus:outline-none"
            />
            <div className="flex gap-2">
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                className="flex-1 rounded-lg border border-line bg-paper px-2 py-2 text-xs text-ink focus:border-accent focus:outline-none"
              >
                <option value="high">ด่วนมาก</option>
                <option value="medium">ปานกลาง</option>
                <option value="low">ทั่วไป</option>
              </select>
              <button
                type="submit"
                className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-dark"
              >
                เพิ่ม
              </button>
            </div>
          </div>
          {topics.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">หัวข้อที่เกี่ยวข้อง:</span>
              <select
                value={newTopicId}
                onChange={(e) => setNewTopicId(e.target.value)}
                className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs text-ink"
              >
                <option value="">ไม่ระบุหัวข้อ</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      )}

      {/* Checklist View */}
      {subView === "checklist" && (
        <div className="space-y-2.5">
          {filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-muted">
              ไม่มีรายการงานที่ตรงกับตัวกรอง
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isDone = task.status === "done";
              const topic = task.topicId ? topicMap.get(task.topicId) : undefined;
              const topicColor = topic ? getTopicColor(topic.colorIndex) : null;
              const prio = PRIORITY_BADGE[task.priority];

              if (editingId === task.id && editDraft) {
                return (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-accent bg-white p-4 shadow-sm space-y-3"
                  >
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <input
                        type="text"
                        value={editDraft.title}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, title: e.target.value })
                        }
                        className="sm:col-span-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-ink focus:border-accent focus:bg-white focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editDraft.description || ""}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            description: e.target.value,
                          })
                        }
                        placeholder="รายละเอียดเพิ่มเติม..."
                        className="sm:col-span-2 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-accent focus:bg-white focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editDraft.assignee}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, assignee: e.target.value })
                        }
                        placeholder="ผู้รับผิดชอบ"
                        className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs text-ink"
                      />
                      <input
                        type="text"
                        value={editDraft.dueDate}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, dueDate: e.target.value })
                        }
                        placeholder="กำหนดส่ง"
                        className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs text-ink"
                      />
                      <select
                        value={editDraft.priority}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            priority: e.target.value as TaskPriority,
                          })
                        }
                        className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs text-ink"
                      >
                        <option value="high">ด่วนมาก</option>
                        <option value="medium">ปานกลาง</option>
                        <option value="low">ทั่วไป</option>
                      </select>
                      <select
                        value={editDraft.status}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            status: e.target.value as TaskStatus,
                          })
                        }
                        className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs text-ink"
                      >
                        <option value="todo">รอดำเนินการ</option>
                        <option value="doing">กำลังทำ</option>
                        <option value="done">เสร็จแล้ว</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft(null);
                        }}
                        className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark"
                      >
                        บันทึกการแก้ไข
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={task.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-colors ${
                    isDone
                      ? "border-emerald-200/80 bg-emerald-50/35"
                      : "border-line bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleDone(task.id)}
                      className="mt-0.5 shrink-0 text-accent hover:scale-105 transition-transform"
                      aria-label={isDone ? "เปลี่ยนเป็นยังไม่เสร็จ" : "ติ๊กเสร็จแล้ว"}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-stone-400" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p
                          className={`text-sm font-semibold leading-snug ${
                            isDone ? "line-through text-muted" : "text-ink"
                          }`}
                        >
                          {task.title}
                        </p>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            value={task.status}
                            onChange={(e) =>
                              setTaskStatus(task.id, e.target.value as TaskStatus)
                            }
                            aria-label="สถานะงาน"
                            className="rounded-lg border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink"
                          >
                            <option value="todo">รอดำเนินการ</option>
                            <option value="doing">กำลังทำ</option>
                            <option value="done">เสร็จแล้ว</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => startEdit(task)}
                            className="rounded-lg p-1.5 text-muted hover:bg-paper hover:text-ink"
                            title="แก้ไขงาน"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600"
                            title="ลบงาน"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-xs text-muted leading-relaxed">
                          {task.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${prio.className}`}
                        >
                          {prio.label}
                        </span>

                        <span className="inline-flex items-center gap-1 rounded-md bg-paper border border-line px-2 py-0.5 text-[11px] text-ink">
                          <User className="h-3 w-3 text-muted" />
                          {task.assignee || "ไม่ระบุ"}
                        </span>

                        {task.dueDate && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-paper border border-line px-2 py-0.5 text-[11px] text-ink">
                            <Clock3 className="h-3 w-3 text-muted" />
                            {task.dueDate}
                          </span>
                        )}

                        {topic && topicColor && (
                          <span
                            style={{
                              backgroundColor: topicColor.softBg,
                              borderColor: topicColor.border,
                              color: topicColor.text,
                            }}
                            className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium max-w-[240px] truncate"
                          >
                            {topic.title}
                          </span>
                        )}

                        {task.timestamp && hasAudio && (
                          <button
                            type="button"
                            onClick={() =>
                              onSeek(parseTimestampToSeconds(task.timestamp))
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-0.5 font-mono text-[11px] text-accent hover:bg-accent-soft"
                          >
                            <PlayCircle className="h-3 w-3" />
                            {task.timestamp}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Kanban View */}
      {subView === "kanban" && (
        <div className="grid gap-4 md:grid-cols-3">
          {STATUS_COLUMNS.map((col, colIdx) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="rounded-2xl border border-line bg-white/85 p-3.5 flex flex-col gap-3 min-h-[260px]"
              >
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.accent}`} />
                    <h4 className="text-xs font-semibold text-ink">
                      {col.title}
                    </h4>
                  </div>
                  <span className="rounded-full bg-paper border border-line px-2 py-0.5 font-mono text-[11px] font-medium text-muted">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted">
                      ยังไม่มีงานในสถานะนี้
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const prio = PRIORITY_BADGE[task.priority];
                      const topic = task.topicId
                        ? topicMap.get(task.topicId)
                        : undefined;
                      const topicColor = topic
                        ? getTopicColor(topic.colorIndex)
                        : null;

                      return (
                        <div
                          key={task.id}
                          className="rounded-xl border border-line bg-white p-3 shadow-sm space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${prio.className}`}
                            >
                              {prio.label}
                            </span>
                            <div className="flex items-center gap-1">
                              {colIdx > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTaskStatus(
                                      task.id,
                                      STATUS_COLUMNS[colIdx - 1].status
                                    )
                                  }
                                  className="rounded border border-line bg-paper p-1 text-muted hover:text-ink"
                                  title={`ย้ายไป ${STATUS_COLUMNS[colIdx - 1].title}`}
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </button>
                              )}
                              {colIdx < STATUS_COLUMNS.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTaskStatus(
                                      task.id,
                                      STATUS_COLUMNS[colIdx + 1].status
                                    )
                                  }
                                  className="rounded border border-line bg-paper p-1 text-muted hover:text-ink"
                                  title={`ย้ายไป ${STATUS_COLUMNS[colIdx + 1].title}`}
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="text-xs font-semibold text-ink leading-snug">
                            {task.title}
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            <span className="inline-flex items-center gap-1 font-medium text-ink/80">
                              <User className="h-3 w-3" />
                              {task.assignee || "ไม่ระบุ"}
                            </span>
                            {task.dueDate && <span>· {task.dueDate}</span>}
                          </div>

                          {topic && topicColor && (
                            <p
                              style={{
                                backgroundColor: topicColor.softBg,
                                color: topicColor.text,
                              }}
                              className="rounded px-2 py-0.5 text-[10px] font-medium truncate"
                            >
                              {topic.title}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
