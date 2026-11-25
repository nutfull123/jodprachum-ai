"use client";

import { useMemo, useRef, useState } from "react";
import {
  Download,
  Expand,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getTopicColor, type MindMapNode } from "../../types/meeting";
import { computeTreeLayout } from "../../lib/mindmap-builder";
import { sanitizeFileName } from "../../lib/export-utils";

interface MindMapViewProps {
  meetingTitle: string;
  mindMap: MindMapNode;
}

const FONT_STACK =
  '"IBM Plex Sans Thai", "IBM Plex Sans", "Noto Sans Thai", "Thonburi", sans-serif';

export function MindMapView({ meetingTitle, mindMap }: MindMapViewProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [includeTasks, setIncludeTasks] = useState(true);
  const [zoom, setZoom] = useState(0.92);
  const [pan, setPan] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const layout = useMemo(
    () => computeTreeLayout(mindMap, collapsedIds, includeTasks),
    [mindMap, collapsedIds, includeTasks]
  );

  const toggleCollapse = (nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const expandAll = () => setCollapsedIds(new Set());

  const collapseTopics = () => {
    const topicIds = mindMap.children
      .filter((c) => c.children.length > 0)
      .map((c) => c.id);
    setCollapsedIds(new Set(topicIds));
  };

  const fitToContainer = () => {
    const box = containerRef.current;
    if (!box) {
      setZoom(0.9);
      setPan({ x: 16, y: 16 });
      return;
    }
    const availW = Math.max(320, box.clientWidth - 24);
    const availH = Math.max(320, box.clientHeight - 24);
    const nextZoom = Math.min(
      1.15,
      Math.max(0.2, Math.min(availW / layout.width, availH / layout.height))
    );
    setZoom(Number(nextZoom.toFixed(2)));
    setPan({
      x: Math.max(12, Math.round((box.clientWidth - layout.width * nextZoom) / 2)),
      y: Math.max(12, Math.round((box.clientHeight - layout.height * nextZoom) / 2)),
    });
  };

  const handleDownloadPng = async () => {
    const svgEl = svgRef.current;
    if (!svgEl || isExporting) return;
    setIsExporting(true);

    try {
      const scale = 2;
      const headerHeight = 56;
      const exportWidth = Math.ceil(layout.width);
      const exportHeight = Math.ceil(layout.height + headerHeight);

      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(exportWidth));
      clone.setAttribute("height", String(exportHeight));
      clone.setAttribute("viewBox", `0 0 ${exportWidth} ${exportHeight}`);

      // Shift inner group down to leave clean title banner
      const innerGroup = clone.querySelector("g[data-mindmap-root='true']");
      if (innerGroup) {
        innerGroup.setAttribute("transform", `translate(0, ${headerHeight})`);
      }

      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("x", "0");
      bgRect.setAttribute("y", "0");
      bgRect.setAttribute("width", String(exportWidth));
      bgRect.setAttribute("height", String(exportHeight));
      bgRect.setAttribute("fill", "#FFFFFF");
      clone.insertBefore(bgRect, clone.firstChild);

      const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      titleText.setAttribute("x", "40");
      titleText.setAttribute("y", "36");
      titleText.setAttribute("fill", "#1C1B18");
      titleText.setAttribute("font-size", "20");
      titleText.setAttribute("font-weight", "700");
      titleText.setAttribute("font-family", FONT_STACK);
      titleText.textContent = `Mind Map: ${meetingTitle}`;
      clone.insertBefore(titleText, bgRect.nextSibling);

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = exportWidth * scale;
        canvas.height = exportHeight * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((pngBlob) => {
            if (pngBlob) {
              const pngUrl = URL.createObjectURL(pngBlob);
              const link = document.createElement("a");
              link.href = pngUrl;
              link.download = `${sanitizeFileName(meetingTitle)}-mindmap.png`;
              document.body.appendChild(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
            }
            setIsExporting(false);
          }, "image/png");
        } else {
          setIsExporting(false);
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setIsExporting(false);
      };
      img.src = url;
    } catch {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Mind Map Toolbar */}
      <div className="no-print rounded-2xl border border-line bg-white p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-line bg-paper p-0.5">
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.max(0.2, Number((z - 0.12).toFixed(2))))
              }
              className="rounded-lg p-1.5 text-ink hover:bg-white"
              title="ย่อ"
              aria-label="ย่อผัง Mind Map"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="px-2 font-mono text-xs font-medium text-ink min-w-[52px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.min(1.8, Number((z + 0.12).toFixed(2))))
              }
              className="rounded-lg p-1.5 text-ink hover:bg-white"
              title="ขยาย"
              aria-label="ขยายผัง Mind Map"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={fitToContainer}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6]"
          >
            <Expand className="h-3.5 w-3.5" />
            <span>จัดพอดีจอ</span>
          </button>

          <button
            type="button"
            onClick={expandAll}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>ขยายทั้งหมด</span>
          </button>

          <button
            type="button"
            onClick={collapseTopics}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-[#efede6]"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span>ย่อเหลือหัวข้อ</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeTasks}
              onChange={(e) => setIncludeTasks(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-[#0F766E]"
            />
            <span>แสดงงาน (Tasks) ในผัง</span>
          </label>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark transition-colors shadow-sm disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? "กำลังสร้างภาพ..." : "บันทึกรูป PNG"}</span>
          </button>
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div
        ref={containerRef}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-mindmap-toggle='true']")) {
            return;
          }
          setIsDragging(true);
          dragStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            panX: pan.x,
            panY: pan.y,
          };
        }}
        onPointerMove={(e) => {
          if (!isDragging || !dragStartRef.current) return;
          const dx = e.clientX - dragStartRef.current.clientX;
          const dy = e.clientY - dragStartRef.current.clientY;
          setPan({
            x: dragStartRef.current.panX + dx,
            y: dragStartRef.current.panY + dy,
          });
        }}
        onPointerUp={() => {
          setIsDragging(false);
          dragStartRef.current = null;
        }}
        onPointerLeave={() => {
          setIsDragging(false);
          dragStartRef.current = null;
        }}
        className={`relative h-[540px] sm:h-[620px] w-full overflow-hidden rounded-2xl border border-line bg-[#FAF9F6] shadow-inner select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          backgroundImage:
            "radial-gradient(#DCD9CE 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
          className="inline-block"
        >
          <svg
            ref={svgRef}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <g data-mindmap-root="true">
              {/* Edges */}
              {layout.edges.map((edge) => {
                const pal = getTopicColor(edge.colorIndex);
                return (
                  <path
                    key={edge.id}
                    d={edge.path}
                    fill="none"
                    stroke={pal.border}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Nodes */}
              {layout.nodes.map((node) => {
                const pal = getTopicColor(node.colorIndex);
                const isRoot = node.nodeType === "root";
                const isTopic = node.nodeType === "topic";
                const isDecision = node.nodeType === "decision";
                const isTask = node.nodeType === "task";

                const fill = isRoot
                  ? "#0F766E"
                  : isTopic
                    ? pal.softBg
                    : isDecision
                      ? "#ECFDF5"
                      : isTask
                        ? "#FFFBEB"
                        : "#FFFFFF";

                const stroke = isRoot
                  ? "#0B5B54"
                  : isTopic
                    ? pal.accent
                    : isDecision
                      ? "#10B981"
                      : isTask
                        ? "#F59E0B"
                        : "#D6D3C9";

                const textColor = isRoot ? "#FFFFFF" : "#1C1B18";
                const fontSize = isRoot ? 15 : isTopic ? 14 : 13;
                const lineHeight = isRoot ? 22 : isTopic ? 20 : 19;
                const startY = node.y + (node.badge ? 34 : 22);

                return (
                  <g key={node.id}>
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                      rx={12}
                      ry={12}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={isRoot || isTopic ? 2 : 1.4}
                    />

                    {!isRoot && (
                      <rect
                        x={node.x}
                        y={node.y + 8}
                        width={4}
                        height={Math.max(12, node.height - 16)}
                        rx={2}
                        fill={
                          isDecision
                            ? "#059669"
                            : isTask
                              ? "#D97706"
                              : pal.accent
                        }
                      />
                    )}

                    {node.badge && (
                      <text
                        x={node.x + 14}
                        y={node.y + 18}
                        fill={
                          isRoot
                            ? "#CCFBF1"
                            : isDecision
                              ? "#047857"
                              : isTask
                                ? "#B45309"
                                : pal.text
                        }
                        fontSize={11}
                        fontWeight={600}
                        fontFamily={FONT_STACK}
                      >
                        {node.badge}
                      </text>
                    )}

                    {node.lines.map((line, lIdx) => (
                      <text
                        key={lIdx}
                        x={node.x + 14}
                        y={startY + lIdx * lineHeight}
                        fill={textColor}
                        fontSize={fontSize}
                        fontWeight={isRoot || isTopic ? 600 : 500}
                        fontFamily={FONT_STACK}
                      >
                        {line}
                      </text>
                    ))}

                    {/* Collapse / Expand toggle button */}
                    {node.hasChildren && (
                      <g
                        data-mindmap-toggle="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(node.id);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <circle
                          cx={node.x + node.width}
                          cy={node.y + node.height / 2}
                          r={11}
                          fill="#FFFFFF"
                          stroke={isRoot ? "#0F766E" : pal.accent}
                          strokeWidth={1.8}
                        />
                        <text
                          x={node.x + node.width}
                          y={node.y + node.height / 2 + 4}
                          textAnchor="middle"
                          fill={isRoot ? "#0F766E" : pal.accent}
                          fontSize={14}
                          fontWeight={700}
                          fontFamily={FONT_STACK}
                        >
                          {node.isCollapsed ? "+" : "−"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-line bg-white/90 px-2.5 py-1 text-[11px] text-muted shadow-sm">
          ลากพื้นที่ว่างเพื่อเลื่อนดู · กดปุ่ม + / − ท้ายกล่องเพื่อย่อหรือขยายกิ่ง
        </div>
      </div>
    </div>
  );
}
