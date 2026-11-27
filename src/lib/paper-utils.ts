import {
  PAPER_SIZES,
  PORTRAIT_WIDTH,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type NotebookPage,
  type PageOrientation,
  type PaperSize,
} from "../types/notebook.ts";

export function getDimensionsForPaperSize(
  size: PaperSize,
  orientation: PageOrientation = "portrait"
): { width: number; height: number } {
  const spec =
    size === "pdf_custom"
      ? PAPER_SIZES.find((p) => p.id === "a4")!
      : PAPER_SIZES.find((p) => p.id === size) ||
        PAPER_SIZES.find((p) => p.id === "goodnotes_standard")!;

  if (orientation === "landscape") {
    return {
      width: Math.max(spec.width, spec.height),
      height: Math.min(spec.width, spec.height),
    };
  }
  return {
    width: Math.min(spec.width, spec.height),
    height: Math.max(spec.width, spec.height),
  };
}

export function resolvePageDimensions(
  page?: Partial<NotebookPage> | null
): {
  width: number;
  height: number;
  orientation: PageOrientation;
  paperSize: PaperSize;
} {
  if (!page) {
    return {
      width: PORTRAIT_WIDTH,
      height: 1600,
      orientation: "portrait",
      paperSize: "goodnotes_standard",
    };
  }

  if (page.aspect === "slide16x9" && !page.paperSize && !page.pageWidth) {
    return {
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      orientation: "landscape",
      paperSize: "slide16x9",
    };
  }

  const fallbackPaperSize: PaperSize =
    page.paperSize ||
    (page.aspect === "slide16x9" ? "slide16x9" : "goodnotes_standard");
  const fallbackOrientation: PageOrientation =
    page.orientation ||
    (page.aspect === "slide16x9"
      ? "landscape"
      : page.pageWidth && page.pageHeight && page.pageWidth > page.pageHeight
        ? "landscape"
        : "portrait");

  const specDims = getDimensionsForPaperSize(
    fallbackPaperSize,
    fallbackOrientation
  );

  const width =
    typeof page.pageWidth === "number" && page.pageWidth > 0
      ? Math.round(page.pageWidth)
      : specDims.width;
  const height =
    typeof page.pageHeight === "number" && page.pageHeight > 0
      ? Math.round(page.pageHeight)
      : specDims.height;

  const orientation: PageOrientation =
    page.orientation || (width > height ? "landscape" : "portrait");

  return {
    width,
    height,
    orientation,
    paperSize: fallbackPaperSize,
  };
}
