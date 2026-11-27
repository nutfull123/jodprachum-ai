import type { ShapeKind } from "../types/notebook.ts";

function polygonPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return "";
  return (
    pts
      .map(
        ([x, y], i) =>
          `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
      )
      .join(" ") + " Z"
  );
}

function regularPolygonPoints(
  sides: number,
  w: number,
  h: number,
  pad: number,
  startAngleDeg: number = -90
): Array<[number, number]> {
  const cx = w / 2;
  const cy = h / 2;
  const rx = Math.max(4, w / 2 - pad);
  const ry = Math.max(4, h / 2 - pad);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < sides; i += 1) {
    const rad = ((startAngleDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)]);
  }
  return pts;
}

/** Generate clean SVG path string inside [0..w, 0..h] for any ShapeKind. */
export function getShapeSvgPath(
  kind: ShapeKind,
  rawW: number,
  rawH: number,
  pad: number = 3
): string {
  const w = Math.max(24, rawW);
  const h = Math.max(24, rawH);
  const x0 = pad;
  const y0 = pad;
  const x1 = w - pad;
  const y1 = h - pad;
  const iw = x1 - x0;
  const ih = y1 - y0;
  const cx = w / 2;
  const cy = h / 2;

  switch (kind) {
    case "rect":
      return polygonPath([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ]);

    case "rounded":
    case "banner": {
      const r = Math.min(kind === "banner" ? 14 : 18, iw / 3, ih / 3);
      return [
        `M ${x0 + r} ${y0}`,
        `L ${x1 - r} ${y0}`,
        `Q ${x1} ${y0} ${x1} ${y0 + r}`,
        `L ${x1} ${y1 - r}`,
        `Q ${x1} ${y1} ${x1 - r} ${y1}`,
        `L ${x0 + r} ${y1}`,
        `Q ${x0} ${y1} ${x0} ${y1 - r}`,
        `L ${x0} ${y0 + r}`,
        `Q ${x0} ${y0} ${x0 + r} ${y0} Z`,
      ].join(" ");
    }

    case "circle": {
      const rx = iw / 2;
      const ry = ih / 2;
      return [
        `M ${cx - rx} ${cy}`,
        `A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`,
        `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`,
      ].join(" ");
    }

    case "triangle":
      return polygonPath([
        [cx, y0],
        [x1, y1],
        [x0, y1],
      ]);

    case "diamond":
      return polygonPath([
        [cx, y0],
        [x1, cy],
        [cx, y1],
        [x0, cy],
      ]);

    case "pentagon":
      return polygonPath(regularPolygonPoints(5, w, h, pad, -90));

    case "hexagon":
      return polygonPath(regularPolygonPoints(6, w, h, pad, -90));

    case "star": {
      const rxOuter = iw / 2;
      const ryOuter = ih / 2;
      const rxInner = rxOuter * 0.42;
      const ryInner = ryOuter * 0.42;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i += 1) {
        const rad = ((-90 + i * 36) * Math.PI) / 180;
        const rx = i % 2 === 0 ? rxOuter : rxInner;
        const ry = i % 2 === 0 ? ryOuter : ryInner;
        pts.push([cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)]);
      }
      return polygonPath(pts);
    }

    case "arrow_right": {
      const shaftTop = y0 + ih * 0.28;
      const shaftBot = y1 - ih * 0.28;
      const headStart = x0 + iw * 0.58;
      return polygonPath([
        [x0, shaftTop],
        [headStart, shaftTop],
        [headStart, y0],
        [x1, cy],
        [headStart, y1],
        [headStart, shaftBot],
        [x0, shaftBot],
      ]);
    }

    case "arrow_left": {
      const shaftTop = y0 + ih * 0.28;
      const shaftBot = y1 - ih * 0.28;
      const headEnd = x0 + iw * 0.42;
      return polygonPath([
        [x1, shaftTop],
        [headEnd, shaftTop],
        [headEnd, y0],
        [x0, cy],
        [headEnd, y1],
        [headEnd, shaftBot],
        [x1, shaftBot],
      ]);
    }

    case "arrow_up": {
      const shaftLeft = x0 + iw * 0.28;
      const shaftRight = x1 - iw * 0.28;
      const headEnd = y0 + ih * 0.42;
      return polygonPath([
        [cx, y0],
        [x1, headEnd],
        [shaftRight, headEnd],
        [shaftRight, y1],
        [shaftLeft, y1],
        [shaftLeft, headEnd],
        [x0, headEnd],
      ]);
    }

    case "arrow_down": {
      const shaftLeft = x0 + iw * 0.28;
      const shaftRight = x1 - iw * 0.28;
      const headStart = y0 + ih * 0.58;
      return polygonPath([
        [shaftLeft, y0],
        [shaftRight, y0],
        [shaftRight, headStart],
        [x1, headStart],
        [cx, y1],
        [x0, headStart],
        [shaftLeft, headStart],
      ]);
    }

    case "callout": {
      const bodyBot = y0 + ih * 0.78;
      const r = Math.min(16, iw / 4, (bodyBot - y0) / 3);
      return [
        `M ${x0 + r} ${y0}`,
        `L ${x1 - r} ${y0}`,
        `Q ${x1} ${y0} ${x1} ${y0 + r}`,
        `L ${x1} ${bodyBot - r}`,
        `Q ${x1} ${bodyBot} ${x1 - r} ${bodyBot}`,
        `L ${x0 + iw * 0.38} ${bodyBot}`,
        `L ${x0 + iw * 0.2} ${y1}`,
        `L ${x0 + iw * 0.22} ${bodyBot}`,
        `L ${x0 + r} ${bodyBot}`,
        `Q ${x0} ${bodyBot} ${x0} ${bodyBot - r}`,
        `L ${x0} ${y0 + r}`,
        `Q ${x0} ${y0} ${x0 + r} ${y0} Z`,
      ].join(" ");
    }

    case "heart": {
      const topY = y0 + ih * 0.3;
      return [
        `M ${cx} ${y1}`,
        `C ${x0 - iw * 0.05} ${y0 + ih * 0.62} ${x0} ${topY} ${x0 + iw * 0.25} ${y0 + ih * 0.05}`,
        `C ${x0 + iw * 0.4} ${y0 - ih * 0.02} ${cx} ${y0 + ih * 0.14} ${cx} ${y0 + ih * 0.24}`,
        `C ${cx} ${y0 + ih * 0.14} ${x1 - iw * 0.4} ${y0 - ih * 0.02} ${x1 - iw * 0.25} ${y0 + ih * 0.05}`,
        `C ${x1} ${topY} ${x1 + iw * 0.05} ${y0 + ih * 0.62} ${cx} ${y1} Z`,
      ].join(" ");
    }

    case "cloud":
      return [
        `M ${x0 + iw * 0.25} ${y1}`,
        `L ${x0 + iw * 0.78} ${y1}`,
        `C ${x1} ${y1} ${x1 + iw * 0.02} ${y0 + ih * 0.56} ${x0 + iw * 0.84} ${y0 + ih * 0.48}`,
        `C ${x0 + iw * 0.86} ${y0 + ih * 0.18} ${x0 + iw * 0.6} ${y0 + ih * 0.04} ${x0 + iw * 0.44} ${y0 + ih * 0.22}`,
        `C ${x0 + iw * 0.32} ${y0 + ih * 0.04} ${x0 + iw * 0.1} ${y0 + ih * 0.22} ${x0 + iw * 0.14} ${y0 + ih * 0.46}`,
        `C ${x0 - iw * 0.02} ${y0 + ih * 0.56} ${x0 + iw * 0.04} ${y1} ${x0 + iw * 0.25} ${y1} Z`,
      ].join(" ");
  }
}
