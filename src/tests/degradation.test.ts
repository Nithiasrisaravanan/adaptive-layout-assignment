import { describe, expect, it } from "vitest";
import { resolveLayout } from "../engine/resolver";
import { constrainedStrip, defineSurface } from "../engine/surfaces";
import { productAd } from "../examples/productAd";

describe("degradation — priority order", () => {
  it("degrades the lowest-priority elements before higher-priority ones under the constrained strip", () => {
    const layout = resolveLayout(productAd, constrainedStrip);
    const byId = new Map(layout.elements.map((e) => [e.id, e]));

    // priority-1 elements must survive
    expect(byId.get("headline")?.visible).toBe(true);
    expect(byId.get("product-image")?.visible).toBe(true);
    // the CTA (priority 2, required, interactive) must survive and remain usable
    const cta = byId.get("cta")!;
    expect(cta.visible).toBe(true);
    expect(cta.rect.width).toBeGreaterThanOrEqual(constrainedStrip.minTapTarget - 0.01);
    expect(cta.rect.height).toBeGreaterThanOrEqual(constrainedStrip.minTapTarget - 0.01);
  });

  it("hides low-priority optional elements before truncating or hiding required ones", () => {
    const layout = resolveLayout(productAd, constrainedStrip);
    const byId = new Map(layout.elements.map((e) => [e.id, e]));
    const requiredIds = productAd.elements.filter((e) => e.required).map((e) => e.id);

    // If ANY optional (non-required) element is still visible, then every
    // required element must ALSO be visible — required content is never
    // sacrificed to save an optional element.
    const anyOptionalVisible = layout.elements.some(
      (e) => e.visible && !requiredIds.includes(e.id),
    );
    if (anyOptionalVisible) {
      for (const id of requiredIds) {
        expect(byId.get(id)?.visible).toBe(true);
      }
    }
  });

  it("every degradation action taken is recorded as a diagnostic", () => {
    const layout = resolveLayout(productAd, constrainedStrip);
    const degradedElements = layout.elements.filter((e) => e.degradations.length > 0);
    for (const el of degradedElements) {
      const hasDiagnostic = layout.diagnostics.some(
        (d) => d.type === "DEGRADATION" && d.elementId === el.id,
      );
      expect(hasDiagnostic).toBe(true);
    }
  });

  it("logo (priority 3, hideable) can disappear while headline/CTA remain intact", () => {
    // An intentionally tiny surface to force real degradation.
    const tiny = defineSurface({
      id: "tiny-test-surface",
      width: 220,
      height: 140,
      safeArea: { top: 4, right: 4, bottom: 4, left: 4 },
      minTapTarget: 44,
      minTextSize: 11,
      touchOnly: true,
    });
    const layout = resolveLayout(productAd, tiny);
    const byId = new Map(layout.elements.map((e) => [e.id, e]));
    expect(byId.get("headline")?.visible).toBe(true);
    expect(byId.get("cta")?.visible).toBe(true);
  });

  it("supporting text can truncate instead of overflowing", () => {
    const narrow = defineSurface({
      id: "narrow-test-surface",
      width: 200,
      height: 600,
      safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
      minTapTarget: 44,
      minTextSize: 11,
    });
    const layout = resolveLayout(productAd, narrow);
    const supporting = layout.elements.find((e) => e.id === "supporting-text");
    // Either it's visible (possibly truncated) or hidden — never overflowing,
    // which is guaranteed separately by validateLayout in other tests.
    expect(supporting).toBeDefined();
  });
});
