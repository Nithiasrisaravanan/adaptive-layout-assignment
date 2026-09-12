import type { Orientation, SafeArea, SurfaceProfile, ViewingDistance } from "./types";

export interface SurfaceProfileInput {
  id: string;
  width: number;
  height: number;
  safeArea?: Partial<SafeArea>;
  minTapTarget?: number;
  minTextSize?: number;
  viewingDistance?: ViewingDistance;
  touchOnly?: boolean;
  maxDensity?: number;
}

function inferOrientation(width: number, height: number): Orientation {
  const ratio = width / height;
  if (ratio > 1.05) return "landscape";
  if (ratio < 0.95) return "portrait";
  return "square";
}

/**
 * Builds a fully-specified SurfaceProfile from partial input, filling
 * reasonable defaults. This is the ONLY place surfaces are constructed —
 * a brand-new, never-seen surface is just another call to this function
 * with different numbers. Nothing downstream needs to recognize its id.
 */
export function defineSurface(input: SurfaceProfileInput): SurfaceProfile {
  if (input.width <= 0 || input.height <= 0) {
    throw new Error(`Surface "${input.id}" must have positive width/height`);
  }
  const safeArea: SafeArea = {
    top: input.safeArea?.top ?? 0,
    right: input.safeArea?.right ?? 0,
    bottom: input.safeArea?.bottom ?? 0,
    left: input.safeArea?.left ?? 0,
  };
  return {
    id: input.id,
    width: input.width,
    height: input.height,
    safeArea,
    minTapTarget: input.minTapTarget ?? 24,
    minTextSize: input.minTextSize ?? 12,
    viewingDistance: input.viewingDistance ?? "near",
    touchOnly: input.touchOnly ?? false,
    orientation: inferOrientation(input.width, input.height),
    maxDensity: input.maxDensity,
  };
}

/** The four surfaces the assignment requires, plus one designed to force degradation. */
export const mobilePortrait: SurfaceProfile = defineSurface({
  id: "mobile-portrait",
  width: 320,
  height: 480,
  safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
  minTapTarget: 44,
  minTextSize: 12,
  touchOnly: true,
  viewingDistance: "near",
});

export const mobileLandscape: SurfaceProfile = defineSurface({
  id: "mobile-landscape",
  width: 480,
  height: 320,
  safeArea: { top: 10, right: 16, bottom: 10, left: 16 },
  minTapTarget: 44,
  minTextSize: 12,
  touchOnly: true,
  viewingDistance: "near",
});

export const broadcastLowerThird: SurfaceProfile = defineSurface({
  id: "broadcast-lower-third",
  width: 1920,
  height: 250,
  // Broadcast title-safe margins are conventionally generous.
  safeArea: { top: 12, right: 80, bottom: 12, left: 80 },
  minTapTarget: 24, // not touch-driven, kept small but non-zero for consistency
  minTextSize: 32, // far viewing distance requires large legible text
  touchOnly: false,
  viewingDistance: "far",
});

export const squareRetailKiosk: SurfaceProfile = defineSurface({
  id: "square-retail-kiosk",
  width: 1080,
  height: 1080,
  safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
  minTapTarget: 60,
  minTextSize: 20,
  touchOnly: true,
  viewingDistance: "near",
});

/** Intentionally too small to fit everything at preferred size — forces degradation. */
export const constrainedStrip: SurfaceProfile = defineSurface({
  id: "constrained-strip",
  width: 300,
  height: 160,
  safeArea: { top: 6, right: 6, bottom: 6, left: 6 },
  minTapTarget: 44,
  minTextSize: 12,
  touchOnly: true,
  viewingDistance: "near",
});

export const requiredSurfaces: SurfaceProfile[] = [
  mobilePortrait,
  mobileLandscape,
  broadcastLowerThird,
  squareRetailKiosk,
  constrainedStrip,
];
