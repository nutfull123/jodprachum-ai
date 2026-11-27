import type { InkStroke, StrokePoint } from "../types/notebook.ts";

function makeFragmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `frag-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `frag-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function densifyPoints(points: StrokePoint[], maxStep: number): StrokePoint[] {
  if (points.length <= 1) return points.slice();
  const out: StrokePoint[] = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay, ap] = points[i - 1];
    const [bx, by, bp] = points[i];
    const dist = Math.hypot(bx - ax, by - ay);
    if (dist > maxStep) {
      const steps = Math.min(200, Math.ceil(dist / maxStep));
      for (let s = 1; s < steps; s += 1) {
        const t = s / steps;
        out.push([
          ax + (bx - ax) * t,
          ay + (by - ay) * t,
          ap + (bp - ap) * t,
        ]);
      }
    }
    out.push([bx, by, bp]);
  }
  return out;
}

/**
 * Partially erase a single stroke inside circle (x, y, radius).
 * Densifies long segments first so snapped straight lines cut accurately in the middle.
 */
export function eraseStrokePartially(
  stroke: InkStroke,
  x: number,
  y: number,
  radius: number,
  now: number = Date.now()
): { changed: boolean; tombstone?: InkStroke; fragments: InkStroke[] } {
  if (stroke.deleted || stroke.points.length === 0) {
    return { changed: false, fragments: [] };
  }

  const effectiveRadius = Math.max(4, radius + stroke.size * 0.2);
  const stepSize = Math.max(4, Math.min(8, effectiveRadius * 0.45));
  const dense = densifyPoints(stroke.points, stepSize);

  // Quick reject if no point is within effectiveRadius
  let hitAny = false;
  for (let i = 0; i < dense.length; i += 1) {
    const [px, py] = dense[i];
    if (Math.hypot(px - x, py - y) <= effectiveRadius) {
      hitAny = true;
      break;
    }
  }
  if (!hitAny) {
    return { changed: false, fragments: [] };
  }

  const runs: StrokePoint[][] = [];
  let current: StrokePoint[] = [];

  for (let i = 0; i < dense.length; i += 1) {
    const pt = dense[i];
    if (Math.hypot(pt[0] - x, pt[1] - y) > effectiveRadius) {
      current.push(pt);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    runs.push(current);
  }

  const fragments: InkStroke[] = runs
    .filter((r) => r.length >= 2)
    .map((pts) => ({
      ...stroke,
      id: makeFragmentId(),
      points: pts,
      updatedAt: now,
      deleted: false,
    }));

  return {
    changed: true,
    tombstone: {
      ...stroke,
      deleted: true,
      updatedAt: now,
    },
    fragments,
  };
}

/**
 * Erase smoothly along drag segment (x0, y0) -> (x1, y1) across page strokes.
 * Returns updated stroke array plus tombstones & added fragments for Live sync.
 */
export function applyPartialEraseAlongSegment(
  strokes: InkStroke[],
  pageId: string,
  isFirstPage: boolean,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  now: number = Date.now()
): {
  strokes: InkStroke[];
  erasedTombstones: InkStroke[];
  addedFragments: InkStroke[];
  anyChanged: boolean;
} {
  const segDist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(3, radius * 0.4);
  const steps = Math.max(1, Math.min(48, Math.ceil(segDist / step)));

  let working = strokes.slice();
  const initialIds = new Set(strokes.map((s) => s.id));
  const tombstoneById = new Map<string, InkStroke>();
  let anyChanged = false;

  for (let s = 0; s <= steps; s += 1) {
    const t = steps === 0 ? 1 : s / steps;
    const sx = x0 + (x1 - x0) * t;
    const sy = y0 + (y1 - y0) * t;

    const nextWorking: InkStroke[] = [];
    for (const st of working) {
      const onPage =
        !st.deleted && (st.pageId === pageId || (!st.pageId && isFirstPage));
      if (!onPage) {
        nextWorking.push(st);
        continue;
      }

      const res = eraseStrokePartially(st, sx, sy, radius, now);
      if (!res.changed) {
        nextWorking.push(st);
        continue;
      }

      anyChanged = true;
      if (res.tombstone && initialIds.has(st.id)) {
        tombstoneById.set(st.id, res.tombstone);
        nextWorking.push(res.tombstone);
      }
      for (const frag of res.fragments) {
        nextWorking.push(frag);
      }
    }
    working = nextWorking;
  }

  const erasedTombstones = Array.from(tombstoneById.values());
  const addedFragments = working.filter(
    (s) => !s.deleted && !initialIds.has(s.id)
  );

  return {
    strokes: working,
    erasedTombstones,
    addedFragments,
    anyChanged,
  };
}
