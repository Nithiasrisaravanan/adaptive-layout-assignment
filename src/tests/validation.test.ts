import { describe, expect, it } from "vitest";
import { validateLayout } from "../engine/validation";
import { defineSurface } from "../engine/surfaces";
import type { ResolvedElement } from "../engine/types";

const surface = defineSurface({
  id: "test-surface",
  width: 200,
  height: 200,
  safeArea: { top: 10, right: 10, bottom: 10, left: 10 },
  minTapTarget: 44,
  minTextSize: 12,
});

function el(overrides: Partial<ResolvedElement>): ResolvedElement {
  return {
    id: "el",
    role: "primary",
    type: "text",
    priority: 1,
    visible: true,
    rect: { x: 20, y: 20, width: 50, height: 20 },
    truncated: false,
    degradations: [],
    ...overrides,
  };
}

describe("validateLayout", () => {
  it("passes a clean, well-formed layout", () => {
    const result = validateLayout(
      [el({ id: "a", rect: { x: 20, y: 20, width: 50, height: 20 } })],
      surface,
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects overlap between two visible elements", () => {
    const result = validateLayout(
      [
        el({ id: "a", rect: { x: 20, y: 20, width: 50, height: 20 } }),
        el({ id: "b", rect: { x: 40, y: 25, width: 50, height: 20 } }),
      ],
      surface,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === "OVERLAP")).toBe(true);
  });

  it("ignores overlap between a visible and a hidden element", () => {
    const result = validateLayout(
      [
        el({ id: "a", rect: { x: 20, y: 20, width: 50, height: 20 } }),
        el({ id: "b", visible: false, rect: { x: 20, y: 20, width: 50, height: 20 } }),
      ],
      surface,
    );
    expect(result.valid).toBe(true);
  });

  it("detects out-of-bounds / clipping", () => {
    const result = validateLayout(
      [el({ id: "a", rect: { x: 180, y: 20, width: 50, height: 20 } })],
      surface,
    );
    expect(result.violations.some((v) => v.kind === "OUT_OF_BOUNDS")).toBe(true);
  });

  it("detects safe-area intrusion", () => {
    const result = validateLayout(
      [el({ id: "a", rect: { x: 0, y: 20, width: 20, height: 20 } })],
      surface,
    );
    expect(result.violations.some((v) => v.kind === "SAFE_AREA")).toBe(true);
  });

  it("detects invalid (non-positive) dimensions", () => {
    const result = validateLayout(
      [el({ id: "a", rect: { x: 20, y: 20, width: 0, height: 20 } })],
      surface,
    );
    expect(result.violations.some((v) => v.kind === "INVALID_DIMENSIONS")).toBe(true);
  });

  it("detects an undersized tap target on an interactive element", () => {
    const result = validateLayout(
      [el({ id: "a", type: "button", rect: { x: 20, y: 20, width: 30, height: 30 } })],
      surface,
    );
    expect(result.violations.some((v) => v.kind === "MIN_TAP_TARGET")).toBe(true);
  });

  it("detects text below the minimum legible size", () => {
    const result = validateLayout(
      [el({ id: "a", type: "text", fontSize: 8, rect: { x: 20, y: 20, width: 50, height: 20 } })],
      surface,
    );
    expect(result.violations.some((v) => v.kind === "MIN_TEXT_SIZE")).toBe(true);
  });
});
