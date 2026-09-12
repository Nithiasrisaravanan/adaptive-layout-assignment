import { describe, expect, it } from "vitest";
import {
  availableRegions,
  calculateBoundingBox,
  calculateFreeSpace,
  containsRectangle,
  fitAspectRatio,
  intersectsSafeArea,
  rectanglesOverlap,
  shrinkRectangle,
  translateRectangle,
} from "../engine/geometry";

describe("rectanglesOverlap", () => {
  it("detects overlap", () => {
    expect(rectanglesOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(
      true,
    );
  });
  it("detects non-overlap", () => {
    expect(rectanglesOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(
      false,
    );
  });
  it("touching edges do not count as overlap", () => {
    expect(rectanglesOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(
      false,
    );
  });
});

describe("containsRectangle", () => {
  it("true when fully inside", () => {
    expect(containsRectangle({ x: 0, y: 0, width: 100, height: 100 }, { x: 10, y: 10, width: 20, height: 20 })).toBe(
      true,
    );
  });
  it("false when extending outside", () => {
    expect(containsRectangle({ x: 0, y: 0, width: 100, height: 100 }, { x: 90, y: 10, width: 20, height: 20 })).toBe(
      false,
    );
  });
});

describe("intersectsSafeArea", () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  const safeArea = { top: 10, right: 10, bottom: 10, left: 10 };
  it("true when rect is inside margin", () => {
    expect(intersectsSafeArea({ x: 0, y: 0, width: 5, height: 5 }, bounds, safeArea)).toBe(true);
  });
  it("false when rect stays within interior", () => {
    expect(intersectsSafeArea({ x: 20, y: 20, width: 10, height: 10 }, bounds, safeArea)).toBe(false);
  });
});

describe("fitAspectRatio", () => {
  it("constrains by height when width would overflow", () => {
    const result = fitAspectRatio({ width: 100, height: 100 }, 2);
    expect(result.width).toBeCloseTo(100);
    expect(result.height).toBeCloseTo(50);
  });
  it("constrains by width when height would overflow", () => {
    const result = fitAspectRatio({ width: 50, height: 100 }, 2);
    expect(result.width).toBeCloseTo(50);
    expect(result.height).toBeCloseTo(25);
  });
});

describe("shrinkRectangle / translateRectangle", () => {
  it("shrinks without going negative", () => {
    const r = shrinkRectangle({ x: 0, y: 0, width: 10, height: 10 }, 20, 20);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
  it("translates by delta", () => {
    const r = translateRectangle({ x: 5, y: 5, width: 10, height: 10 }, 3, -2);
    expect(r.x).toBe(8);
    expect(r.y).toBe(3);
  });
});

describe("availableRegions / calculateFreeSpace", () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  it("returns the whole bounds when nothing is occupied", () => {
    const regions = availableRegions(bounds, []);
    expect(regions).toHaveLength(1);
    expect(calculateFreeSpace(bounds, [])).toBe(10000);
  });
  it("subtracts occupied area", () => {
    const occ = [{ x: 0, y: 0, width: 100, height: 50 }];
    const free = calculateFreeSpace(bounds, occ);
    expect(free).toBeCloseTo(5000);
  });
  it("produced free regions never overlap the occupied rect", () => {
    const occ = [{ x: 20, y: 20, width: 30, height: 30 }];
    const regions = availableRegions(bounds, occ);
    for (const r of regions) {
      expect(rectanglesOverlap(r, occ[0]!)).toBe(false);
    }
  });
});

describe("calculateBoundingBox", () => {
  it("returns null for empty input", () => {
    expect(calculateBoundingBox([])).toBeNull();
  });
  it("computes the smallest enclosing rect", () => {
    const box = calculateBoundingBox([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 5, width: 5, height: 5 },
    ]);
    expect(box).toEqual({ x: 0, y: 0, width: 25, height: 10 });
  });
});
