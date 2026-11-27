import type { NotebookPage, PageOrientation } from "../types/notebook";

export interface ImportedPdfPageResult {
  page: NotebookPage;
  blobId: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
}

const VIRTUAL_LONG_SIDE_PX = 1480;
const RENDER_LONG_SIDE_PX = 1650;
const MAX_IMPORT_PAGES = 60;

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjs;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("ไม่สามารถแปลงหน้า PDF เป็นรูปภาพได้"));
      },
      mimeType,
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Render all pages of a PDF file (up to 60 pages) into high-res page background images
 * preserving each page's natural portrait or landscape aspect ratio.
 */
export async function importPdfFileToPages(
  file: File,
  options?: {
    startOrder?: number;
    onProgress?: (currentPage: number, totalPages: number) => void;
  }
): Promise<ImportedPdfPageResult[]> {
  const pdfjs = await getPdfJs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const totalPages = Math.min(pdf.numPages, MAX_IMPORT_PAGES);
  const startOrder = options?.startOrder ?? 0;
  const now = Date.now();
  const results: ImportedPdfPageResult[] = [];

  for (let pNum = 1; pNum <= totalPages; pNum += 1) {
    options?.onProgress?.(pNum, totalPages);
    const pdfPage = await pdf.getPage(pNum);
    const unscaled = pdfPage.getViewport({ scale: 1 });
    const rawW = Math.max(1, unscaled.width);
    const rawH = Math.max(1, unscaled.height);
    const orientation: PageOrientation = rawW > rawH ? "landscape" : "portrait";

    // High-resolution render scale for crisp zooming & writing
    const renderScale = Math.min(
      3.0,
      Math.max(1.2, RENDER_LONG_SIDE_PX / Math.max(rawW, rawH))
    );
    const viewport = pdfPage.getViewport({ scale: renderScale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await pdfPage.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    const blobId = `pdfbg-${now}-${pNum}-${Math.floor(Math.random() * 1000)}`;

    // Normalize virtual coordinate size so pen stroke sizes feel natural on portrait & landscape PDFs
    const virtualScale = VIRTUAL_LONG_SIDE_PX / Math.max(rawW, rawH);
    const pageWidth = Math.round(rawW * virtualScale);
    const pageHeight = Math.round(rawH * virtualScale);

    const page: NotebookPage = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? `page-${crypto.randomUUID().slice(0, 8)}`
          : `page-pdf-${now}-${pNum}`,
      title: `หน้า ${pNum}`,
      paperTemplate: "blank",
      paperSize: "pdf_custom",
      orientation,
      pageWidth,
      pageHeight,
      aspect: "portrait",
      backgroundImageBlobId: blobId,
      order: startOrder + (pNum - 1),
      updatedAt: now,
    };

    results.push({
      page,
      blobId,
      blob,
      mimeType: "image/jpeg",
      fileName: `${file.name}-page-${pNum}.jpg`,
    });
  }

  return results;
}

/** Render page 1 of a PDF file to a DataURL so it can be saved as a reusable Custom Paper Template. */
export async function renderPdfFirstPageToDataUrl(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  orientation: PageOrientation;
}> {
  const imported = await importPdfFileToPages(file);
  const first = imported[0];
  if (!first) {
    throw new Error("ไม่พบหน้าเอกสารในไฟล์ PDF นี้");
  }
  const dataUrl = await blobToDataUrl(first.blob);
  return {
    dataUrl,
    width: first.page.pageWidth || 1000,
    height: first.page.pageHeight,
    orientation: first.page.orientation || "portrait",
  };
}
