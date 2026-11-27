import {
  isDarkPaperTemplate,
  type CanvasItem,
  type CustomPaperTemplate,
  type NotebookPage,
  type ShootNotebook,
} from "../types/notebook";
import { sanitizeFileName } from "./export-utils";
import { ensureNotebookPages, strokePointsToSvgPath } from "./notebook-crdt";
import { resolvePageDimensions } from "./paper-utils";
import { getShapeSvgPath } from "./shape-svg";
import { getMediaBlob } from "./storage";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) {
      lines.push("");
      if (lines.length >= maxLines) break;
      continue;
    }
    let current = "";
    for (const ch of para) {
      const candidate = current + ch;
      if (ctx.measureText(candidate).width > maxWidth && current.length > 0) {
        lines.push(current);
        current = ch;
        if (lines.length >= maxLines) break;
      } else {
        current = candidate;
      }
    }
    if (current && lines.length < maxLines) {
      lines.push(current);
    }
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, maxLines);
}

function drawTemplateBackground(
  ctx: CanvasRenderingContext2D,
  tpl: NotebookPage["paperTemplate"],
  width: number,
  height: number
) {
  const dark = isDarkPaperTemplate(tpl);
  ctx.fillStyle = dark ? "#181B20" : tpl === "cream" ? "#FDF8EC" : "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  if (
    tpl === "lined" ||
    tpl === "cream" ||
    tpl === "cornell" ||
    tpl === "dark_lined"
  ) {
    ctx.strokeStyle = dark
      ? "#2A303B"
      : tpl === "cream"
        ? "#EDE2C8"
        : "#E2E8F0";
    ctx.lineWidth = 1;
    for (let y = 36; y < height; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    if (tpl === "lined" || tpl === "dark_lined" || tpl === "cornell") {
      const marginX = tpl === "cornell" ? 239 : 84;
      ctx.strokeStyle = dark ? "#7F1D1D" : "#FCA5A5";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(marginX, 0);
      ctx.lineTo(marginX, height);
      ctx.stroke();
    }
  } else if (tpl === "grid" || tpl === "dark_grid") {
    ctx.strokeStyle = dark ? "#2A303B" : "#E5E7EB";
    ctx.lineWidth = 1;
    for (let x = 28; x < width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 28; y < height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (tpl === "dotted" || tpl === "dark_dotted") {
    ctx.fillStyle = dark ? "#3B4252" : "#CBD5E1";
    for (let x = 24; x < width; x += 24) {
      for (let y = 24; y < height; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

async function drawItemToContext(
  ctx: CanvasRenderingContext2D,
  item: CanvasItem,
  dark: boolean
) {
  if (item.type === "image" && item.dataUrl) {
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, item.width, item.height, 12);
    ctx.fill();
    ctx.stroke();

    const img = await loadImage(item.dataUrl);
    if (img) {
      const pad = 6;
      const boxW = Math.max(10, item.width - pad * 2);
      const boxH = Math.max(10, item.height - pad * 2);
      const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const dx = item.x + pad + (boxW - drawW) / 2;
      const dy = item.y + pad + (boxH - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    }
    return;
  }

  if (item.type === "table" && item.tableData?.rows?.length) {
    const rows = item.tableData.rows;
    const rowCount = rows.length;
    const colCount = Math.max(1, rows[0]?.length || 1);
    const cellW = item.width / colCount;
    const cellH = item.height / rowCount;
    const headerBg = item.tableData.headerBg || "#0F766E";

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, item.width, item.height, 12);
    ctx.clip();

    rows.forEach((row, rIdx) => {
      for (let cIdx = 0; cIdx < colCount; cIdx += 1) {
        const cx = item.x + cIdx * cellW;
        const cy = item.y + rIdx * cellH;
        ctx.fillStyle = rIdx === 0 ? headerBg : rIdx % 2 === 1 ? "#FFFFFF" : "#F8F7F4";
        ctx.fillRect(cx, cy, cellW, cellH);
        ctx.strokeStyle = "#CBD5E1";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cellW, cellH);

        const cellText = row[cIdx] || "";
        ctx.fillStyle = rIdx === 0 ? "#FFFFFF" : "#1C1B18";
        ctx.font = `${rIdx === 0 ? 700 : 500} 14px "IBM Plex Sans Thai", sans-serif`;
        const wrapped = wrapLines(ctx, cellText, Math.max(24, cellW - 14), 3);
        wrapped.forEach((ln, li) => {
          ctx.fillText(ln, cx + 8, cy + 20 + li * 18, Math.max(20, cellW - 16));
        });
      }
    });
    ctx.restore();

    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, item.width, item.height, 12);
    ctx.stroke();
    return;
  }

  if (item.type === "file" || item.type === "link" || item.type === "youtube") {
    ctx.fillStyle = item.type === "youtube" ? "#FEF2F2" : "#F8FAFC";
    ctx.strokeStyle = item.type === "youtube" ? "#FECACA" : "#CBD5E1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, item.width, item.height, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1C1B18";
    ctx.font = `700 15px "IBM Plex Sans Thai", sans-serif`;
    const label =
      item.type === "youtube"
        ? `▶ YouTube: ${item.title || item.youtubeId || "วิดีโอประกอบ"}`
        : item.type === "file"
          ? `📎 ${item.fileName || item.title || "ไฟล์แนบ"}`
          : `🔗 ${item.title || item.linkUrl || "ลิงก์เอกสาร"}`;
    ctx.fillText(label, item.x + 14, item.y + 30, item.width - 28);

    const sub = item.linkUrl || item.fileUrl || (item.youtubeId ? `https://youtu.be/${item.youtubeId}` : "");
    if (sub) {
      ctx.fillStyle = "#475569";
      ctx.font = `500 12px "IBM Plex Sans Thai", sans-serif`;
      ctx.fillText(sub, item.x + 14, item.y + 54, item.width - 28);
    }
    return;
  }

  if (item.type === "shape") {
    const kind = item.shapeKind || "rounded";
    const d = getShapeSvgPath(kind, item.width, item.height, 3);
    ctx.save();
    ctx.translate(item.x, item.y);
    const p2d = new Path2D(d);
    ctx.fillStyle = item.bgColor || "#EFFAF8";
    ctx.strokeStyle = item.color || "#0F766E";
    ctx.lineWidth = 2;
    ctx.fill(p2d);
    ctx.stroke(p2d);
    ctx.restore();
  } else if (item.type === "sticky" || item.type === "meeting_card") {
    ctx.fillStyle = item.bgColor || "#FEF9C3";
    ctx.strokeStyle = item.color || "#D6D3C9";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, item.width, item.height, 14);
    ctx.fill();
    ctx.stroke();
  }

  if (item.type === "sticker") {
    ctx.font = `${Math.max(36, Math.round(Math.min(item.width, item.height) * 0.55))}px sans-serif`;
    ctx.fillText(item.stickerEmoji || "⭐", item.x + 18, item.y + item.height * 0.65);
    return;
  }

  if (item.title || item.text) {
    ctx.fillStyle =
      item.type === "text" && dark ? "#F3F4F6" : item.color || "#1C1B18";
    const fontSize = item.fontSize || 15;
    ctx.font = `600 ${fontSize}px "IBM Plex Sans Thai", sans-serif`;
    const textBlock = [item.title, item.text].filter(Boolean).join("\n");
    const lines = wrapLines(
      ctx,
      textBlock,
      Math.max(40, item.width - 28),
      Math.max(4, Math.floor((item.height - 20) / (fontSize * 1.4)))
    );
    lines.forEach((ln, idx) => {
      ctx.fillText(
        ln,
        item.x + 14,
        item.y + 28 + idx * Math.round(fontSize * 1.45),
        Math.max(40, item.width - 28)
      );
    });
  }
}

async function resolvePageBackgroundUrl(
  page: NotebookPage,
  customTemplates?: CustomPaperTemplate[]
): Promise<{ src: string; revoke: boolean } | null> {
  if (page.backgroundImageBlobId) {
    try {
      const rec = await getMediaBlob(page.backgroundImageBlobId);
      if (rec?.blob) {
        return { src: URL.createObjectURL(rec.blob), revoke: true };
      }
    } catch {
      // Fallback below
    }
  }
  if (page.backgroundImageDataUrl) {
    return { src: page.backgroundImageDataUrl, revoke: false };
  }
  if (page.customTemplateId && customTemplates) {
    const found = customTemplates.find((t) => t.id === page.customTemplateId);
    if (found?.dataUrl) {
      return { src: found.dataUrl, revoke: false };
    }
  }
  return null;
}

export async function renderNotebookPageToCanvas(
  notebook: ShootNotebook,
  page: NotebookPage,
  pageIndex: number,
  customTemplates?: CustomPaperTemplate[]
): Promise<HTMLCanvasElement> {
  const { width, height } = resolvePageDimensions(page);
  const dark = isDarkPaperTemplate(page.paperTemplate);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  drawTemplateBackground(ctx, page.paperTemplate, width, height);

  const bgAsset = await resolvePageBackgroundUrl(page, customTemplates);
  if (bgAsset) {
    try {
      const bgImg = await loadImage(bgAsset.src);
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
      }
    } finally {
      if (bgAsset.revoke) URL.revokeObjectURL(bgAsset.src);
    }
  }

  const pageItems = notebook.items
    .filter(
      (i) => !i.deleted && (i.pageId === page.id || (!i.pageId && pageIndex === 0))
    )
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const item of pageItems) {
    await drawItemToContext(ctx, item, dark);
  }

  const pageStrokes = notebook.strokes.filter(
    (st) => !st.deleted && (st.pageId === page.id || (!st.pageId && pageIndex === 0))
  );
  for (const s of pageStrokes) {
    const pathStr = strokePointsToSvgPath(s.points, {
      size: s.size,
      tool: s.tool,
      isStylus: s.isStylus,
    });
    if (!pathStr) continue;
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.fillStyle = s.color;
    ctx.fill(new Path2D(pathStr));
    ctx.restore();
  }

  return canvas;
}

function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function buildMultiPagePdfBlob(
  pages: Array<{ jpegBytes: Uint8Array; widthPx: number; heightPx: number }>
): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // 1-based object table
  let byteOffset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteOffset += bytes.length;
  };
  const pushStr = (str: string) => pushBytes(encoder.encode(str));

  pushStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  const startObj = (objNum: number) => {
    offsets[objNum] = byteOffset;
    pushStr(`${objNum} 0 obj\n`);
  };

  // Obj 1: Catalog, Obj 2: Pages
  const pageCount = pages.length;
  const firstPageObj = 3;
  const pageObjNums: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    pageObjNums.push(firstPageObj + i * 3);
  }

  startObj(1);
  pushStr("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObj(2);
  pushStr(
    `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageCount} >>\nendobj\n`
  );

  for (let i = 0; i < pageCount; i += 1) {
    const pg = pages[i];
    const wPt = Number((pg.widthPx * 0.75).toFixed(2));
    const hPt = Number((pg.heightPx * 0.75).toFixed(2));
    const pageObj = firstPageObj + i * 3;
    const contentObj = pageObj + 1;
    const imgObj = pageObj + 2;

    startObj(pageObj);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`
    );

    const streamCmd = `q\n${wPt} 0 0 ${hPt} 0 0 cm\n/Im0 Do\nQ\n`;
    startObj(contentObj);
    pushStr(`<< /Length ${streamCmd.length} >>\nstream\n${streamCmd}endstream\nendobj\n`);

    startObj(imgObj);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${pg.widthPx} /Height ${pg.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(pg.jpegBytes);
    pushStr("\nendstream\nendobj\n");
  }

  const xrefOffset = byteOffset;
  const totalObjects = 2 + pageCount * 3;
  pushStr(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= totalObjects; n += 1) {
    const pos = String(offsets[n] || 0).padStart(10, "0");
    pushStr(`${pos} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  const combined = new Uint8Array(byteOffset);
  let cursor = 0;
  for (const part of chunks) {
    combined.set(part, cursor);
    cursor += part.length;
  }
  return new Blob([combined], { type: "application/pdf" });
}

export async function exportNotebookToPdf(
  notebook: ShootNotebook,
  customTemplates?: CustomPaperTemplate[]
): Promise<void> {
  const pages = ensureNotebookPages(notebook);
  const rendered: Array<{
    jpegBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  }> = [];

  for (let i = 0; i < pages.length; i += 1) {
    const canvas = await renderNotebookPageToCanvas(
      notebook,
      pages[i],
      i,
      customTemplates
    );
    const jpegUrl = canvas.toDataURL("image/jpeg", 0.92);
    const base64 = jpegUrl.split(",")[1] || "";
    rendered.push({
      jpegBytes: base64ToUint8(base64),
      widthPx: canvas.width,
      heightPx: canvas.height,
    });
  }

  const blob = buildMultiPagePdfBlob(rendered);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFileName(notebook.title)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function toHex6(color?: string, fallback: string = "1C1B18"): string {
  const clean = (color || "").replace("#", "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return clean.toUpperCase();
  return fallback;
}

export async function exportNotebookToPptx(
  notebook: ShootNotebook,
  customTemplates?: CustomPaperTemplate[]
): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  const pages = ensureNotebookPages(notebook);
  const firstDims = resolvePageDimensions(pages[0]);
  const firstIsLandscape = firstDims.width > firstDims.height;
  const slideW = firstIsLandscape ? 10 : 7.5;
  const slideH = firstIsLandscape ? Number((10 * (firstDims.height / firstDims.width)).toFixed(3)) : Number((7.5 * (firstDims.height / firstDims.width)).toFixed(3));

  pptx.defineLayout({ name: "SHOOTNOTE_DYNAMIC", width: slideW, height: slideH });
  pptx.layout = "SHOOTNOTE_DYNAMIC";

  for (let idx = 0; idx < pages.length; idx += 1) {
    const page = pages[idx];
    const dims = resolvePageDimensions(page);
    const vW = dims.width;
    const vH = dims.height;
    const scaleX = slideW / vW;
    const scaleY = slideH / vH;
    const dark = isDarkPaperTemplate(page.paperTemplate);

    const slide = pptx.addSlide();
    slide.background = {
      color: dark
        ? "181B20"
        : page.paperTemplate === "cream"
          ? "FDF8EC"
          : "FFFFFF",
    };

    const bgAsset = await resolvePageBackgroundUrl(page, customTemplates);
    if (bgAsset) {
      try {
        if (bgAsset.src.startsWith("data:")) {
          slide.addImage({
            data: bgAsset.src,
            x: 0,
            y: 0,
            w: slideW,
            h: slideH,
          });
        }
      } finally {
        if (bgAsset.revoke) URL.revokeObjectURL(bgAsset.src);
      }
    }

    const pageItems = notebook.items
      .filter(
        (i) => !i.deleted && (i.pageId === page.id || (!i.pageId && idx === 0))
      )
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const item of pageItems) {
      const x = Math.max(0, item.x * scaleX);
      const y = Math.max(0, item.y * scaleY);
      const w = Math.max(0.4, item.width * scaleX);
      const h = Math.max(0.3, item.height * scaleY);

      if (item.type === "image" && item.dataUrl) {
        slide.addImage({
          data: item.dataUrl,
          x,
          y,
          w,
          h,
          sizing: { type: "contain", w, h },
        });
      } else if (item.type === "table" && item.tableData?.rows?.length) {
        const headerBg = toHex6(item.tableData.headerBg, "0F766E");
        const tableRows = item.tableData.rows.map((row, rIdx) =>
          row.map((cell) => ({
            text: cell || "",
            options: {
              bold: rIdx === 0,
              color: rIdx === 0 ? "FFFFFF" : "1C1B18",
              fill: {
                color: rIdx === 0 ? headerBg : rIdx % 2 === 1 ? "FFFFFF" : "F8F7F4",
              },
              fontSize: 11,
              border: { color: "CBD5E1", pt: 0.75 },
            },
          }))
        );
        slide.addTable(tableRows, { x, y, w });
      } else if (
        item.type === "file" ||
        item.type === "link" ||
        item.type === "youtube"
      ) {
        const targetUrl =
          item.linkUrl ||
          item.fileUrl ||
          (item.youtubeId ? `https://youtu.be/${item.youtubeId}` : undefined);
        const label =
          item.type === "youtube"
            ? `▶ ${item.title || "YouTube Video"}`
            : item.type === "file"
              ? `📎 ${item.fileName || item.title || "ไฟล์แนบ"}`
              : `🔗 ${item.title || item.linkUrl || "ลิงก์"}`;
        slide.addText(label, {
          x,
          y,
          w,
          h,
          fill: { color: item.type === "youtube" ? "FEF2F2" : "F1F5F9" },
          line: { color: "CBD5E1", pt: 1 },
          color: "0F766E",
          bold: true,
          fontSize: 12,
          valign: "middle",
          hyperlink: targetUrl ? { url: targetUrl } : undefined,
        });
      } else if (item.type === "sticker") {
        slide.addText(
          `${item.stickerEmoji || "⭐"}${item.stickerLabel ? `\n${item.stickerLabel}` : ""}`,
          { x, y, w, h, align: "center", valign: "middle", fontSize: 18 }
        );
      } else {
        const textBlock = [item.title, item.text].filter(Boolean).join("\n");
        const hasFill =
          item.type === "sticky" ||
          item.type === "meeting_card" ||
          item.type === "shape";
        slide.addText(textBlock || " ", {
          x,
          y,
          w,
          h,
          fill: hasFill
            ? { color: toHex6(item.bgColor, "FEF9C3") }
            : undefined,
          line: hasFill ? { color: toHex6(item.color, "D6D3C9"), pt: 1 } : undefined,
          color:
            item.type === "text" && dark
              ? "F3F4F6"
              : toHex6(item.color, "1C1B18"),
          fontSize: Math.max(10, Math.round((item.fontSize || 15) * 0.72)),
          valign: "top",
          margin: 0.1,
        });
      }
    }

    // Overlay transparent ink strokes PNG if page has handwriting
    const pageStrokes = notebook.strokes.filter(
      (st) => !st.deleted && (st.pageId === page.id || (!st.pageId && idx === 0))
    );
    if (pageStrokes.length > 0) {
      const inkCanvas = document.createElement("canvas");
      inkCanvas.width = vW;
      inkCanvas.height = vH;
      const ictx = inkCanvas.getContext("2d");
      if (ictx) {
        for (const s of pageStrokes) {
          const pathStr = strokePointsToSvgPath(s.points, {
            size: s.size,
            tool: s.tool,
            isStylus: s.isStylus,
          });
          if (!pathStr) continue;
          ictx.save();
          ictx.globalAlpha = s.opacity;
          ictx.fillStyle = s.color;
          ictx.fill(new Path2D(pathStr));
          ictx.restore();
        }
        slide.addImage({
          data: inkCanvas.toDataURL("image/png"),
          x: 0,
          y: 0,
          w: slideW,
          h: slideH,
        });
      }
    }
  }

  await pptx.writeFile({
    fileName: `${sanitizeFileName(notebook.title)}.pptx`,
  });
}
