import { containsRectangle, intersectsSafeArea, rectanglesOverlap } from "./geometry";
import type {
  ConstraintViolation,
  LayoutValidationResult,
  ResolvedElement,
  SurfaceProfile,
} from "./types";

/**
 * Validates a fully-resolved layout against the hard invariants the engine
 * promises to uphold. This is the single source of truth for "is this
 * layout acceptable" — the resolver calls this before returning, and the
 * test suite (`invariants.test.ts`) calls it after every resolution to
 * catch regressions independent of any specific test's assertions.
 */
export function validateLayout(
  elements: ResolvedElement[],
  surface: SurfaceProfile,
): LayoutValidationResult {
  const violations: ConstraintViolation[] = [];
  const bounds = { x: 0, y: 0, width: surface.width, height: surface.height };
  const visible = elements.filter((e) => e.visible);

  // Invalid dimensions.
  for (const el of visible) {
    if (el.rect.width <= 0 || el.rect.height <= 0) {
      violations.push({
        kind: "INVALID_DIMENSIONS",
        elementIds: [el.id],
        message: `Element "${el.id}" has non-positive resolved size (${el.rect.width}x${el.rect.height}).`,
      });
    }
  }

  // Out of bounds / clipping.
  for (const el of visible) {
    if (!containsRectangle(bounds, el.rect)) {
      violations.push({
        kind: "OUT_OF_BOUNDS",
        elementIds: [el.id],
        message: `Element "${el.id}" extends outside the surface bounds (${surface.width}x${surface.height}).`,
      });
    }
  }

  // Safe-area compliance.
  for (const el of visible) {
    if (intersectsSafeArea(el.rect, bounds, surface.safeArea)) {
      violations.push({
        kind: "SAFE_AREA",
        elementIds: [el.id],
        message: `Element "${el.id}" intrudes into the surface's safe-area margin.`,
      });
    }
  }

  // Overlap — pairwise check.
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i]!;
      const b = visible[j]!;
      if (rectanglesOverlap(a.rect, b.rect)) {
        violations.push({
          kind: "OVERLAP",
          elementIds: [a.id, b.id],
          message: `Elements "${a.id}" and "${b.id}" overlap.`,
        });
      }
    }
  }

  // Minimum tap target — recomputed here independent of the resolver's own
  // bookkeeping, on any element whose rect implies an interactive control
  // smaller than the surface minimum. We check via the resolved rect size
  // directly against surface.minTapTarget for elements flagged interactive
  // by the resolver (encoded as role/type, so re-derive conservatively):
  // the resolver is expected to never emit an interactive element below
  // minTapTarget, so this is a pure safety net.
  for (const el of visible) {
    if (el.type === "button") {
      if (el.rect.width < surface.minTapTarget || el.rect.height < surface.minTapTarget) {
        violations.push({
          kind: "MIN_TAP_TARGET",
          elementIds: [el.id],
          message: `Interactive element "${el.id}" is ${Math.round(el.rect.width)}x${Math.round(
            el.rect.height,
          )}px, below the surface's minimum tap target of ${surface.minTapTarget}px.`,
        });
      }
    }
  }

  // Minimum text size.
  for (const el of visible) {
    if (el.type === "text" && el.fontSize !== undefined && el.fontSize < surface.minTextSize) {
      violations.push({
        kind: "MIN_TEXT_SIZE",
        elementIds: [el.id],
        message: `Text element "${el.id}" has resolved font size ${el.fontSize}px, below the surface minimum of ${surface.minTextSize}px.`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Throws if `layout` violates any invariant. Used by tests as the
 * "property-style" assertion described in the assignment brief: if this
 * ever throws on output the resolver considered valid, that's a resolver
 * bug to be fixed, not a test to be weakened.
 */
export function assertValidLayout(
  elements: ResolvedElement[],
  surface: SurfaceProfile,
): void {
  const result = validateLayout(elements, surface);
  if (!result.valid) {
    const messages = result.violations.map((v) => `- [${v.kind}] ${v.message}`).join("\n");
    throw new Error(`Layout failed validation:\n${messages}`);
  }
}
