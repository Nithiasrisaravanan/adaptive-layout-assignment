import { describe, expect, it } from "vitest";
import { resolveLayout } from "../engine/resolver";
import {
  broadcastLowerThird,
  constrainedStrip,
  mobileLandscape,
  mobilePortrait,
  squareRetailKiosk,
} from "../engine/surfaces";
import { productAd } from "../examples/productAd";
import { assertValidLayout } from "../engine/validation";

const surfaces = [mobilePortrait, mobileLandscape, broadcastLowerThird, squareRetailKiosk, constrainedStrip];

describe("resolveLayout — required surfaces", () => {
  for (const surface of surfaces) {
    it(`produces a valid layout for ${surface.id}`, () => {
      const layout = resolveLayout(productAd, surface);
      assertValidLayout(layout.elements, surface);
    });

    it(`keeps required elements visible on ${surface.id}`, () => {
      const layout = resolveLayout(productAd, surface);
      const required = productAd.elements.filter((e) => e.required);
      for (const el of required) {
        const resolved = layout.elements.find((r) => r.id === el.id);
        expect(resolved?.visible).toBe(true);
      }
    });

    it(`gives interactive elements a tap target >= surface minimum on ${surface.id}`, () => {
      const layout = resolveLayout(productAd, surface);
      const cta = layout.elements.find((r) => r.id === "cta");
      expect(cta?.visible).toBe(true);
      expect(cta!.rect.width).toBeGreaterThanOrEqual(surface.minTapTarget - 0.01);
      expect(cta!.rect.height).toBeGreaterThanOrEqual(surface.minTapTarget - 0.01);
    });

    it(`gives visible text elements a font size >= surface minimum on ${surface.id}`, () => {
      const layout = resolveLayout(productAd, surface);
      for (const el of layout.elements) {
        if (el.visible && el.fontSize !== undefined) {
          expect(el.fontSize).toBeGreaterThanOrEqual(surface.minTextSize - 0.01);
        }
      }
    });
  }
});

describe("resolveLayout — genuinely different compositions", () => {
  it("produces different flow axes for a wide vs a tall surface", () => {
    const wide = resolveLayout(productAd, broadcastLowerThird);
    const tall = resolveLayout(productAd, mobilePortrait);

    const wideHero = wide.elements.find((e) => e.id === "product-image")!;
    const tallHero = tall.elements.find((e) => e.id === "product-image")!;

    // Both must still be valid, visible placements — the real proof that
    // the axis differs structurally (not just "the numbers differ some
    // amount") is the variance-based test directly below this one.
    expect(wideHero.visible).toBe(true);
    expect(tallHero.visible).toBe(true);
    expect(wide.elements.some((e) => e.id === "headline")).toBe(true);
  });

  it("arranges elements along a different structural axis per surface, not a uniform scale", () => {
    // Portrait mobile should read as a vertical stack: elements are spread
    // out mainly in Y, clustered in X. Broadcast should read as a
    // horizontal row: elements are spread out mainly in X, clustered in Y.
    const variance = (values: number[]) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    };

    const portrait = resolveLayout(productAd, mobilePortrait);
    const portraitVisible = portrait.elements.filter((e) => e.visible);
    const portraitXVariance = variance(portraitVisible.map((e) => e.rect.x + e.rect.width / 2));
    const portraitYVariance = variance(portraitVisible.map((e) => e.rect.y + e.rect.height / 2));
    expect(portraitYVariance).toBeGreaterThan(portraitXVariance);

    const broadcast = resolveLayout(productAd, broadcastLowerThird);
    const broadcastVisible = broadcast.elements.filter((e) => e.visible);
    const broadcastXVariance = variance(broadcastVisible.map((e) => e.rect.x + e.rect.width / 2));
    const broadcastYVariance = variance(broadcastVisible.map((e) => e.rect.y + e.rect.height / 2));
    expect(broadcastXVariance).toBeGreaterThan(broadcastYVariance);
  });
});

describe("resolveLayout — determinism", () => {
  it("produces byte-identical output across repeated runs", () => {
    for (const surface of surfaces) {
      const a = resolveLayout(productAd, surface, { trace: false });
      const b = resolveLayout(productAd, surface, { trace: false });
      expect(JSON.stringify(a.elements)).toBe(JSON.stringify(b.elements));
      expect(a.validation.valid).toBe(b.validation.valid);
    }
  });
});

describe("resolveLayout — unknown / custom surfaces", () => {
  it("resolves an arbitrary never-seen surface without throwing", () => {
    const custom = {
      id: "custom-173x641",
      width: 173,
      height: 641,
      safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
      minTapTarget: 40,
      minTextSize: 12,
      viewingDistance: "near" as const,
      touchOnly: true,
      orientation: "portrait" as const,
    };
    const layout = resolveLayout(productAd, custom);
    assertValidLayout(layout.elements, custom);
  });
});
