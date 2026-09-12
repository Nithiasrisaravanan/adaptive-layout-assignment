import { describe, expect, it } from "vitest";
import { resolveLayout } from "../engine/resolver";
import { defineSurface } from "../engine/surfaces";
import { productAd } from "../examples/productAd";
import { assertValidLayout } from "../engine/validation";
import type { SurfaceProfile } from "../engine/types";

/**
 * The stress matrix from the assignment brief, plus a few adversarial
 * extras (Phase 26 "attack the engine"): extremely wide/tall/small
 * surfaces, huge/tiny safe areas, and oversized hard constraints.
 */
const stressDimensions: Array<{ width: number; height: number }> = [
  { width: 180, height: 180 },
  { width: 200, height: 300 },
  { width: 250, height: 900 },
  { width: 300, height: 400 },
  { width: 320, height: 480 },
  { width: 400, height: 200 },
  { width: 900, height: 180 },
  { width: 1080, height: 1080 },
  { width: 1920, height: 250 },
  { width: 2000, height: 120 },
];

function stressSurface(id: string, overrides: Partial<SurfaceProfile> = {}): SurfaceProfile {
  return defineSurface({
    id,
    width: overrides.width ?? 320,
    height: overrides.height ?? 480,
    safeArea: overrides.safeArea,
    minTapTarget: overrides.minTapTarget ?? 44,
    minTextSize: overrides.minTextSize ?? 12,
    touchOnly: overrides.touchOnly ?? true,
    viewingDistance: overrides.viewingDistance,
  });
}

describe("invariants — stress matrix from the assignment brief", () => {
  for (const dims of stressDimensions) {
    it(`resolves ${dims.width}x${dims.height} into a valid layout`, () => {
      const surface = stressSurface(`stress-${dims.width}x${dims.height}`, dims);
      const layout = resolveLayout(productAd, surface, { trace: false });
      assertValidLayout(layout.elements, surface);
    });
  }
});

describe("invariants — adversarial cases", () => {
  it("survives a huge safe area that consumes most of the surface", () => {
    const surface = stressSurface("huge-safe-area", {
      width: 320,
      height: 480,
      safeArea: { top: 150, right: 100, bottom: 150, left: 100 },
    });
    const layout = resolveLayout(productAd, surface, { trace: false });
    assertValidLayout(layout.elements, surface);
  });

  it("survives a tiny (near-zero) safe area", () => {
    const surface = stressSurface("tiny-safe-area", {
      width: 320,
      height: 480,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const layout = resolveLayout(productAd, surface, { trace: false });
    assertValidLayout(layout.elements, surface);
  });

  it("survives an unreasonably large minimum text size", () => {
    const surface = stressSurface("huge-min-text", { minTextSize: 90 });
    const layout = resolveLayout(productAd, surface, { trace: false });
    // May not be fully "valid" (impossible constraints), but must never throw,
    // never overlap, and never clip.
    const result = layout.validation;
    const structuralViolations = result.violations.filter(
      (v) => v.kind === "OVERLAP" || v.kind === "OUT_OF_BOUNDS" || v.kind === "INVALID_DIMENSIONS",
    );
    expect(structuralViolations).toHaveLength(0);
  });

  it("survives an unreasonably large minimum tap target", () => {
    const surface = stressSurface("huge-tap-target", { minTapTarget: 250, width: 320, height: 480 });
    const layout = resolveLayout(productAd, surface, { trace: false });
    const structuralViolations = layout.validation.violations.filter(
      (v) => v.kind === "OVERLAP" || v.kind === "OUT_OF_BOUNDS" || v.kind === "INVALID_DIMENSIONS",
    );
    expect(structuralViolations).toHaveLength(0);
  });

  it("survives a 1x1-ish degenerate surface without throwing", () => {
    const surface = stressSurface("degenerate", {
      width: 40,
      height: 40,
      safeArea: { top: 1, right: 1, bottom: 1, left: 1 },
      minTapTarget: 10,
      minTextSize: 8,
    });
    expect(() => resolveLayout(productAd, surface, { trace: false })).not.toThrow();
  });

  it("never overlaps or produces invalid dimensions across the full stress matrix, even when required minimums exceed the surface", () => {
    // These per-element minimums (esp. minTapTarget=60 combined with a
    // required, non-repositionable CTA) can genuinely exceed what a very
    // small surface offers once combined with the required headline group
    // and hero image. When that happens the engine is allowed to report an
    // OUT_OF_BOUNDS violation (see the dedicated "impossible constraints"
    // test below) — but it must NEVER overlap two visible elements or
    // produce a non-positive rect, because sequential band placement never
    // requires backtracking over already-placed content.
    for (const dims of stressDimensions) {
      const surface = stressSurface(`combined-${dims.width}x${dims.height}`, {
        ...dims,
        minTapTarget: 60,
        minTextSize: 24,
      });
      const layout = resolveLayout(productAd, surface, { trace: false });
      const structuralViolations = layout.validation.violations.filter(
        (v) => v.kind === "OVERLAP" || v.kind === "INVALID_DIMENSIONS",
      );
      expect(structuralViolations).toHaveLength(0);
    }
  });

  it("when constraints are genuinely impossible, reports it explicitly instead of silently corrupting the layout", () => {
    // 180x180 with no safe area still cannot fit the combined hard minimums
    // of the required headline group (~31px), the required hero image
    // (96x96 min) and the required, non-shrinkable-further CTA tap target
    // (60px) stacked along one axis: 31 + 96 + 60 = 187 > 180.
    const surface = stressSurface("impossible", {
      width: 180,
      height: 180,
      minTapTarget: 60,
      minTextSize: 24,
    });
    const layout = resolveLayout(productAd, surface, { trace: false });

    expect(layout.validation.valid).toBe(false);
    // The violation must name real elements and be traceable to a
    // diagnostic explaining why — never a silent/opaque failure.
    const hasExplainedViolation = layout.diagnostics.some(
      (d) => d.type === "VIOLATION" && d.reason.length > 0,
    );
    expect(hasExplainedViolation).toBe(true);
    // And critically: still no overlap, even in the impossible case.
    const visible = layout.elements.filter((e) => e.visible);
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i]!.rect;
        const b = visible[j]!.rect;
        const overlap = !(
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        );
        expect(overlap).toBe(false);
      }
    }
  });
});

describe("invariants — core promises hold on every resolution", () => {
  const surfaces = [
    stressSurface("s1", { width: 320, height: 480 }),
    stressSurface("s2", { width: 1920, height: 250, minTextSize: 32 }),
    stressSurface("s3", { width: 1080, height: 1080, minTapTarget: 60 }),
    stressSurface("s4", { width: 300, height: 160 }),
  ];

  for (const surface of surfaces) {
    it(`holds all invariants for ${surface.id}`, () => {
      const layout = resolveLayout(productAd, surface, { trace: false });

      // 1. Visible elements are inside the surface.
      for (const el of layout.elements.filter((e) => e.visible)) {
        expect(el.rect.x).toBeGreaterThanOrEqual(-0.01);
        expect(el.rect.y).toBeGreaterThanOrEqual(-0.01);
        expect(el.rect.x + el.rect.width).toBeLessThanOrEqual(surface.width + 0.01);
        expect(el.rect.y + el.rect.height).toBeLessThanOrEqual(surface.height + 0.01);
      }

      // 2. No overlaps (checked pairwise).
      const visible = layout.elements.filter((e) => e.visible);
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i]!.rect;
          const b = visible[j]!.rect;
          const overlap = !(
            a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y
          );
          expect(overlap).toBe(false);
        }
      }

      // 3 & 4. Required elements are present (hard constraint).
      const requiredIds = productAd.elements.filter((e) => e.required).map((e) => e.id);
      for (const id of requiredIds) {
        const resolved = layout.elements.find((e) => e.id === id);
        expect(resolved?.visible).toBe(true);
      }

      // 7. Hidden elements have an explicit reason recorded.
      for (const el of layout.elements.filter((e) => !e.visible)) {
        const hasReason = layout.diagnostics.some((d) => d.elementId === el.id);
        expect(hasReason).toBe(true);
      }

      // 8. Resolved dimensions are positive for visible elements.
      for (const el of layout.elements.filter((e) => e.visible)) {
        expect(el.rect.width).toBeGreaterThan(0);
        expect(el.rect.height).toBeGreaterThan(0);
      }
    });
  }
});
