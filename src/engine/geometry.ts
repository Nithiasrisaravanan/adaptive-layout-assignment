import type { Rect, SafeArea } from "./types";

/** Small epsilon to absorb floating point noise in comparisons. */
const EPS = 1e-6;

export function rectanglesOverlap(a: Rect, b: Rect): boolean {
  const noOverlap =
    a.x + a.width <= b.x + EPS ||
    b.x + b.width <= a.x + EPS ||
    a.y + a.height <= b.y + EPS ||
    b.y + b.height <= a.y + EPS;
  return !noOverlap;
}

/** True if `outer` fully contains `inner` (inclusive of touching edges). */
export function containsRectangle(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.width <= outer.x + outer.width + EPS &&
    inner.y + inner.height <= outer.y + outer.height + EPS
  );
}

/**
 * Returns true if `rect` intersects the excluded safe-area margin of
 * `bounds`, i.e. it is not fully contained within the safe interior.
 */
export function intersectsSafeArea(
  rect: Rect,
  bounds: Rect,
  safeArea: SafeArea,
): boolean {
  const interior = safeAreaInterior(bounds, safeArea);
  return !containsRectangle(interior, rect);
}

/** The rectangle remaining after insetting `bounds` by `safeArea`. */
export function safeAreaInterior(bounds: Rect, safeArea: SafeArea): Rect {
  const x = bounds.x + safeArea.left;
  const y = bounds.y + safeArea.top;
  const width = Math.max(0, bounds.width - safeArea.left - safeArea.right);
  const height = Math.max(0, bounds.height - safeArea.top - safeArea.bottom);
  return { x, y, width, height };
}

/**
 * Fits a box with the given aspect ratio (width / height) inside `available`
 * without exceeding either dimension, preserving ratio. Returns the largest
 * such box anchored at available's origin.
 */
export function fitAspectRatio(
  available: { width: number; height: number },
  aspectRatio: number,
): { width: number; height: number } {
  if (aspectRatio <= 0) return { width: available.width, height: available.height };
  const widthIfHeightBound = available.height * aspectRatio;
  if (widthIfHeightBound <= available.width) {
    return { width: widthIfHeightBound, height: available.height };
  }
  const heightIfWidthBound = available.width / aspectRatio;
  return { width: available.width, height: heightIfWidthBound };
}

/** Shrinks a rect toward its top-left corner by the given deltas, floored at 0. */
export function shrinkRectangle(
  rect: Rect,
  deltaWidth: number,
  deltaHeight: number,
): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(0, rect.width - deltaWidth),
    height: Math.max(0, rect.height - deltaHeight),
  };
}

export function translateRectangle(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
}

/**
 * Computes the free rectangular regions of `bounds` not covered by any rect
 * in `occupied`. Uses a simple axis-aligned sweep that is sufficient for the
 * shelf/flow layouts this engine produces (occupied rects are non-overlapping
 * and axis-aligned). This is intentionally not a general polygon-clipping
 * routine — see ARCHITECTURE.md for the complexity trade-off discussion.
 */
export function availableRegions(bounds: Rect, occupied: Rect[]): Rect[] {
  let free: Rect[] = [bounds];

  for (const occ of occupied) {
    const next: Rect[] = [];
    for (const region of free) {
      if (!rectanglesOverlap(region, occ)) {
        next.push(region);
        continue;
      }
      // Split `region` into up to 4 leftover slivers around `occ`.
      const top = occ.y - region.y;
      if (top > EPS) {
        next.push({ x: region.x, y: region.y, width: region.width, height: top });
      }
      const bottom = region.y + region.height - (occ.y + occ.height);
      if (bottom > EPS) {
        next.push({
          x: region.x,
          y: occ.y + occ.height,
          width: region.width,
          height: bottom,
        });
      }
      const overlapTop = Math.max(region.y, occ.y);
      const overlapBottom = Math.min(region.y + region.height, occ.y + occ.height);
      const midHeight = overlapBottom - overlapTop;
      if (midHeight > EPS) {
        const left = occ.x - region.x;
        if (left > EPS) {
          next.push({ x: region.x, y: overlapTop, width: left, height: midHeight });
        }
        const right = region.x + region.width - (occ.x + occ.width);
        if (right > EPS) {
          next.push({
            x: occ.x + occ.width,
            y: overlapTop,
            width: right,
            height: midHeight,
          });
        }
      }
    }
    free = next;
  }

  return free.filter((r) => r.width > EPS && r.height > EPS);
}

/** Total free area within `bounds` after removing `occupied` rects. */
export function calculateFreeSpace(bounds: Rect, occupied: Rect[]): number {
  return availableRegions(bounds, occupied).reduce(
    (sum, r) => sum + r.width * r.height,
    0,
  );
}

/** The smallest rect containing every rect in `rects`, or null if empty. */
export function calculateBoundingBox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const first = rects[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Returns the largest free region by area, or null if none exist. */
export function largestFreeRegion(bounds: Rect, occupied: Rect[]): Rect | null {
  const regions = availableRegions(bounds, occupied);
  if (regions.length === 0) return null;
  return regions.reduce((best, r) =>
    r.width * r.height > best.width * best.height ? r : best,
  );
}
