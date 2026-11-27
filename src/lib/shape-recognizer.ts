import type { StrokePoint } from "../types/notebook";

export type RecognizedShapeKind =
  | "line"
  | "arrow"
  | "circle"
  | "ellipse"
  | "rect"
  | "triangle";

export interface RecognizedShapeResult {
  kind: RecognizedShapeKind;
  labelTh: string;
  points: StrokePoint[];
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function interpolateSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pressure: number,
  steps: number
): StrokePoint[] {
  const out: StrokePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t, pressure]);
  }
  return out;
}

function buildPolygonPoints(
  vertices: Array<[number, number]>,
  pressure: number,
  stepsPerEdge: number = 10
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const [ax, ay] = vertices[i];
    const [bx, by] = vertices[(i + 1) % vertices.length];
    const seg = interpolateSegment(ax, ay, bx, by, pressure, stepsPerEdge);
    if (i > 0) seg.shift();
    pts.push(...seg);
  }
  return pts;
}

function meanPressure(points: StrokePoint[]): number {
  let sum = 0;
  for (const p of points) sum += p[2] || 0.5;
  return Number((sum / Math.max(1, points.length)).toFixed(3));
}

export function recognizeHeldShape(
  rawPoints: StrokePoint[]
): RecognizedShapeResult | null {
  if (!rawPoints || rawPoints.length < 8) return null;

  let pathLen = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < rawPoints.length; i += 1) {
    const [x, y] = rawPoints[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sumX += x;
    sumY += y;
    if (i > 0) {
      pathLen += Math.hypot(x - rawPoints[i - 1][0], y - rawPoints[i - 1][1]);
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const diag = Math.hypot(width, height);
  if (pathLen < 28 || diag < 24) return null;

  const p = meanPressure(rawPoints);
  const start = rawPoints[0];
  const end = rawPoints[rawPoints.length - 1];
  const startEndDist = Math.hypot(end[0] - start[0], end[1] - start[1]);

  // 1. Check Open Shapes (Straight Line or Arrow)
  const isClosed = startEndDist <= Math.max(36, diag * 0.42);

  if (!isClosed) {
    // Straight line test
    let maxPerp = 0;
    for (const pt of rawPoints) {
      const d = distToSegment(pt[0], pt[1], start[0], start[1], end[0], end[1]);
      if (d > maxPerp) maxPerp = d;
    }

    if (
      startEndDist / pathLen >= 0.85 &&
      maxPerp <= Math.max(12, diag * 0.085)
    ) {
      let x1 = start[0];
      let y1 = start[1];
      let x2 = end[0];
      let y2 = end[1];

      // Snap to horizontal or vertical within ~6 degrees
      const angle = Math.abs(Math.atan2(y2 - y1, x2 - x1));
      const sixDeg = (6 * Math.PI) / 180;
      if (angle <= sixDeg || Math.abs(angle - Math.PI) <= sixDeg) {
        const midY = (y1 + y2) / 2;
        y1 = midY;
        y2 = midY;
      } else if (Math.abs(angle - Math.PI / 2) <= sixDeg) {
        const midX = (x1 + x2) / 2;
        x1 = midX;
        x2 = midX;
      }

      const steps = Math.max(8, Math.min(36, Math.round(startEndDist / 16)));
      return {
        kind: "line",
        labelTh: "เส้นตรง",
        points: interpolateSegment(x1, y1, x2, y2, p, steps),
      };
    }

    // Arrow test: shaft up to farthest point from start, followed by short hook back
    let tipIdx = 0;
    let tipDist = 0;
    for (let i = 1; i < rawPoints.length; i += 1) {
      const d = Math.hypot(rawPoints[i][0] - start[0], rawPoints[i][1] - start[1]);
      if (d > tipDist) {
        tipDist = d;
        tipIdx = i;
      }
    }

    if (tipIdx >= 4 && tipIdx <= rawPoints.length - 3 && tipDist >= 30) {
      let shaftLen = 0;
      for (let i = 1; i <= tipIdx; i += 1) {
        shaftLen += Math.hypot(
          rawPoints[i][0] - rawPoints[i - 1][0],
          rawPoints[i][1] - rawPoints[i - 1][1]
        );
      }
      const headLen = pathLen - shaftLen;
      const tipPt = rawPoints[tipIdx];
      let maxShaftPerp = 0;
      for (let i = 0; i <= tipIdx; i += 1) {
        const d = distToSegment(
          rawPoints[i][0],
          rawPoints[i][1],
          start[0],
          start[1],
          tipPt[0],
          tipPt[1]
        );
        if (d > maxShaftPerp) maxShaftPerp = d;
      }

      if (
        shaftLen >= pathLen * 0.55 &&
        headLen >= 10 &&
        headLen <= pathLen * 0.45 &&
        tipDist / shaftLen >= 0.82 &&
        maxShaftPerp <= Math.max(14, tipDist * 0.1)
      ) {
        const dx = tipPt[0] - start[0];
        const dy = tipPt[1] - start[1];
        const baseAngle = Math.atan2(dy, dx);
        const headSize = Math.max(14, Math.min(26, tipDist * 0.2));
        const wing1: [number, number] = [
          tipPt[0] - headSize * Math.cos(baseAngle - Math.PI / 6),
          tipPt[1] - headSize * Math.sin(baseAngle - Math.PI / 6),
        ];
        const wing2: [number, number] = [
          tipPt[0] - headSize * Math.cos(baseAngle + Math.PI / 6),
          tipPt[1] - headSize * Math.sin(baseAngle + Math.PI / 6),
        ];

        const shaftPts = interpolateSegment(
          start[0],
          start[1],
          tipPt[0],
          tipPt[1],
          p,
          14
        );
        const leg1 = interpolateSegment(
          tipPt[0],
          tipPt[1],
          wing1[0],
          wing1[1],
          p,
          4
        );
        const backToTip = interpolateSegment(
          wing1[0],
          wing1[1],
          tipPt[0],
          tipPt[1],
          p,
          3
        );
        const leg2 = interpolateSegment(
          tipPt[0],
          tipPt[1],
          wing2[0],
          wing2[1],
          p,
          4
        );
        return {
          kind: "arrow",
          labelTh: "ลูกศร",
          points: [
            ...shaftPts,
            ...leg1.slice(1),
            ...backToTip.slice(1),
            ...leg2.slice(1),
          ],
        };
      }
    }

    return null;
  }

  // 2. Closed Shapes: Circle / Ellipse vs Rectangle vs Triangle
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = width / 2;
  const ry = height / 2;

  if (rx >= 10 && ry >= 10) {
    let ellipErrSum = 0;
    for (const [x, y] of rawPoints) {
      const norm = Math.hypot((x - cx) / rx, (y - cy) / ry);
      ellipErrSum += Math.abs(norm - 1);
    }
    const ellipErr = ellipErrSum / rawPoints.length;

    if (ellipErr <= 0.21) {
      const aspectRatio = Math.min(rx, ry) / Math.max(rx, ry);
      const isCircle = aspectRatio >= 0.78;
      const finalRx = isCircle ? (rx + ry) / 2 : rx;
      const finalRy = isCircle ? (rx + ry) / 2 : ry;
      const pts: StrokePoint[] = [];
      const steps = 40;
      for (let i = 0; i <= steps; i += 1) {
        const theta = (i / steps) * Math.PI * 2;
        pts.push([
          cx + finalRx * Math.cos(theta),
          cy + finalRy * Math.sin(theta),
          p,
        ]);
      }
      return {
        kind: isCircle ? "circle" : "ellipse",
        labelTh: isCircle ? "วงกลม" : "วงรี",
        points: pts,
      };
    }
  }

  // Triangle vs Rectangle perimeter error comparison
  if (width >= 16 && height >= 16) {
    // Rectangle edges
    let rectErrSum = 0;
    for (const [x, y] of rawPoints) {
      const d = Math.min(
        Math.abs(x - minX),
        Math.abs(x - maxX),
        Math.abs(y - minY),
        Math.abs(y - maxY)
      );
      rectErrSum += d;
    }
    const rectMeanErr = rectErrSum / rawPoints.length;

    // Find 3 candidate triangle vertices using farthest points
    const meanX = sumX / rawPoints.length;
    const meanY = sumY / rawPoints.length;
    let v1 = rawPoints[0];
    let d1 = -1;
    for (const pt of rawPoints) {
      const d = Math.hypot(pt[0] - meanX, pt[1] - meanY);
      if (d > d1) {
        d1 = d;
        v1 = pt;
      }
    }
    let v2 = v1;
    let d2 = -1;
    for (const pt of rawPoints) {
      const d = Math.hypot(pt[0] - v1[0], pt[1] - v1[1]);
      if (d > d2) {
        d2 = d;
        v2 = pt;
      }
    }
    let v3 = v2;
    let maxArea = -1;
    for (const pt of rawPoints) {
      const area = Math.abs(
        (v2[0] - v1[0]) * (pt[1] - v1[1]) - (pt[0] - v1[0]) * (v2[1] - v1[1])
      );
      if (area > maxArea) {
        maxArea = area;
        v3 = pt;
      }
    }

    let triErrSum = 0;
    for (const [x, y] of rawPoints) {
      const d = Math.min(
        distToSegment(x, y, v1[0], v1[1], v2[0], v2[1]),
        distToSegment(x, y, v2[0], v2[1], v3[0], v3[1]),
        distToSegment(x, y, v3[0], v3[1], v1[0], v1[1])
      );
      triErrSum += d;
    }
    const triMeanErr = triErrSum / rawPoints.length;

    const tol = Math.max(14, diag * 0.12);
    if (triMeanErr <= tol && triMeanErr < rectMeanErr * 0.85) {
      return {
        kind: "triangle",
        labelTh: "สามเหลี่ยม",
        points: buildPolygonPoints(
          [
            [v1[0], v1[1]],
            [v2[0], v2[1]],
            [v3[0], v3[1]],
          ],
          p,
          12
        ),
      };
    }

    if (rectMeanErr <= tol) {
      return {
        kind: "rect",
        labelTh: "สี่เหลี่ยม",
        points: buildPolygonPoints(
          [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY],
          ],
          p,
          12
        ),
      };
    }
  }

  return null;
}
