"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  FileSpreadsheet,
  FileText,
  Printer,
} from "lucide-react";
import type { SavedMeeting } from "../types/meeting";
import {
  downloadTextFile,
  formatAsMarkdown,
  formatForLineChat,
  formatTasksAsCsv,
  sanitizeFileName,
} from "../lib/export-utils";

interface ExportMenuProps {
  meeting: SavedMeeting;
}

export function ExportMenu({ meeting }: ExportMenuProps) {
  const [copiedType, setCopiedType] = useState<"line" | "md" | null>(null);

  const handleCopy = async (type: "line" | "md") => {
    const content =
      type === "line" ? formatForLineChat(meeting) : formatAsMarkdown(meeting);
    try {
      await navigator.clipboard.writeText(content);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2200);
    } catch {
      // Fallback textarea copy
      const el = document.createElement("textarea");
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2200);
    }
  };

  const baseName = sanitizeFileName(meeting.analysis.meetingTitle);

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => handleCopy("line")}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark transition-colors shadow-sm"
      >
        {copiedType === "line" ? (
          <>
            <Check className="h-3.5 w-3.5" />
            <span>คัดลอกแล้ว!</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            <span>คัดลอกสรุปส่ง LINE</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={() =>
          downloadTextFile(
            formatTasksAsCsv(meeting),
            `${baseName}-tasks.csv`,
            "text/csv;charset=utf-8;"
          )
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper transition-colors"
      >
        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
        <span>ส่งออก CSV งาน</span>
      </button>

      <button
        type="button"
        onClick={() =>
          downloadTextFile(
            formatAsMarkdown(meeting),
            `${baseName}.md`,
            "text/markdown;charset=utf-8;"
          )
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper transition-colors"
      >
        <FileText className="h-3.5 w-3.5 text-indigo-600" />
        <span>ดาวน์โหลด .md</span>
      </button>

      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper transition-colors"
      >
        <Printer className="h-3.5 w-3.5 text-muted" />
        <span>พิมพ์ / PDF</span>
      </button>
    </div>
  );
}
