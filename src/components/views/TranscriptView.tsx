"use client";

import { useMemo, useState } from "react";
import { Check, Copy, PlayCircle, Search } from "lucide-react";
import {
  getTopicColor,
  type MeetingTopic,
  type TranscriptSegment,
} from "../../types/meeting";

interface TranscriptViewProps {
  transcript: TranscriptSegment[];
  topics: MeetingTopic[];
  hasAudio: boolean;
  onSeek: (seconds: number) => void;
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    regex.test(part) ? (
      <mark key={idx} className="rounded bg-amber-200 px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function TranscriptView({
  transcript,
  topics,
  hasAudio,
  onSeek,
}: TranscriptViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  const topicMap = useMemo(
    () => new Map<string, MeetingTopic>(topics.map((t) => [t.id, t])),
    [topics]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transcript.filter((seg) => {
      if (topicFilter !== "all" && seg.topicId !== topicFilter) return false;
      if (!q) return true;
      return (
        seg.text.toLowerCase().includes(q) ||
        seg.speaker.toLowerCase().includes(q)
      );
    });
  }, [transcript, searchQuery, topicFilter]);

  const handleCopyAll = async () => {
    const text = filtered
      .map((s) => `[${s.timestamp}] ${s.speaker}: ${s.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-white p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[210px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาคำพูด หรือชื่อผู้พูด..."
            className="w-full rounded-xl border border-line bg-paper py-2 pl-9 pr-3 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {topics.length > 0 && (
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              aria-label="กรองตามหัวข้อ"
              className="rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-accent focus:outline-none max-w-[220px]"
            >
              <option value="all">ทุกหัวข้อ ({transcript.length})</option>
              {topics.map((t, idx) => (
                <option key={t.id} value={t.id}>
                  {idx + 1}. {t.title}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-medium text-ink hover:bg-[#efede6]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>คัดลอกแล้ว</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-accent" />
                <span>คัดลอกบทถอดเสียง</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white divide-y divide-line shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            ไม่พบข้อความที่ตรงกับการค้นหา
          </div>
        ) : (
          filtered.map((seg) => {
            const topic = seg.topicId ? topicMap.get(seg.topicId) : undefined;
            const pal = topic ? getTopicColor(topic.colorIndex) : null;

            return (
              <div
                key={seg.id}
                className="p-4 hover:bg-paper/60 transition-colors flex flex-col sm:flex-row gap-2 sm:gap-4"
              >
                <div className="flex items-center sm:items-start gap-2 sm:w-36 shrink-0">
                  {hasAudio ? (
                    <button
                      type="button"
                      onClick={() => onSeek(seg.seconds)}
                      className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[11px] font-medium text-accent hover:bg-accent-soft"
                      title="คลิกเพื่อฟังเสียงตรงช่วงเวลานี้"
                    >
                      <PlayCircle className="h-3 w-3" />
                      {seg.timestamp}
                    </button>
                  ) : (
                    <span className="rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
                      {seg.timestamp}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-ink">
                      {highlightMatch(seg.speaker, searchQuery)}
                    </span>
                    {topic && pal && (
                      <span
                        style={{
                          backgroundColor: pal.softBg,
                          color: pal.text,
                        }}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      >
                        {topic.title}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink/90 leading-relaxed">
                    {highlightMatch(seg.text, searchQuery)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
