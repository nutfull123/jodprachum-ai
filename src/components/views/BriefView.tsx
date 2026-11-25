"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Users,
} from "lucide-react";
import type { MeetingAnalysis } from "../../types/meeting";

interface BriefViewProps {
  analysis: MeetingAnalysis;
}

export function BriefView({ analysis }: BriefViewProps) {
  // Compute workload per assignee
  const workloadMap = new Map<
    string,
    { total: number; done: number; high: number }
  >();
  for (const task of analysis.tasks) {
    const owner = task.assignee || "ไม่ระบุ";
    const entry = workloadMap.get(owner) || { total: 0, done: 0, high: 0 };
    entry.total += 1;
    if (task.status === "done") entry.done += 1;
    if (task.priority === "high") entry.high += 1;
    workloadMap.set(owner, entry);
  }
  const workloads = Array.from(workloadMap.entries()).sort(
    (a, b) => b[1].total - a[1].total
  );

  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
          <FileText className="h-4 w-4" />
          <span>ภาพรวมการประชุม (สรุปจบในหน้าเดียว)</span>
        </div>
        <p className="text-sm sm:text-base text-ink leading-relaxed">
          {analysis.executiveSummary}
        </p>

        {analysis.participants.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
              <Users className="h-3.5 w-3.5" />
              ผู้เข้าร่วม:
            </span>
            {analysis.participants.map((person, idx) => (
              <span
                key={idx}
                className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs font-medium text-ink"
              >
                {person}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Key Decisions */}
        <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>มติสำคัญที่ตกลงแล้ว ({analysis.keyDecisions.length})</span>
          </div>

          {analysis.keyDecisions.length === 0 ? (
            <p className="text-xs text-muted">
              ไม่มีมติที่เป็นทางการระบุในไฟล์เสียงนี้
            </p>
          ) : (
            <ul className="space-y-2">
              {analysis.keyDecisions.map((decision, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100 p-3 text-xs sm:text-sm text-ink leading-relaxed"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{decision}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Blockers & Risks */}
        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>ประเด็นติดขัด / เรื่องที่ต้องระวัง ({analysis.blockers.length})</span>
          </div>

          {analysis.blockers.length === 0 ? (
            <p className="text-xs text-muted">
              ไม่พบประเด็นติดขัดหรือความเสี่ยงที่ถูกหยิบยกในประชุมนี้
            </p>
          ) : (
            <ul className="space-y-2">
              {analysis.blockers.map((blocker, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 rounded-xl bg-amber-50/70 border border-amber-100 p-3 text-xs sm:text-sm text-ink leading-relaxed"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{blocker}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Workload per person */}
      {workloads.length > 0 && (
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-ink">
            การกระจายงานตามผู้รับผิดชอบ
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workloads.map(([owner, stat]) => {
              const pct = Math.round((stat.done / stat.total) * 100);
              return (
                <div
                  key={owner}
                  className="rounded-xl border border-line bg-paper p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink truncate">
                      {owner}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      {stat.done}/{stat.total} เสร็จ
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white border border-line">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {stat.high > 0 && (
                    <p className="text-[11px] text-rose-700 font-medium">
                      มีงานด่วนมาก {stat.high} งาน
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
