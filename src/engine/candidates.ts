import { fitAspectRatio } from "./geometry";
import type { AlignPreference, NormalizedElement, Rect } from "./types";

/**
 * A generic candidate: a proposed rect for an element plus which strategy
 * produced it. Candidates are cheap to generate and are not layouts by
 * themselves — `scoring.ts` picks among them.
 */
export interface PlacementCandidate {
  rect: Rect;
  source: "flow-align" | "free-region";
  /** Which cross-axis alignment this candidate represents (flow-align only). */
  align?: AlignPreference;
}

function clampSize(
  preferred: number,
  min: number,
  max: number | undefined,
  available: number,
): number {
  const upper = Math.min(max ?? Number.POSITIVE_INFINITY, available);
  if (upper < min) return min; // caller is responsible for handling infeasibility
  return Math.min(Math.max(preferred, min), upper);
}

function alignWithin(
  bandStart: number,
  bandLength: number,
  size: number,
  align: AlignPreference,
): number {
  const slack = Math.max(0, bandLength - size);
  if (align === "start") return bandStart;
  if (align === "end") return bandStart + slack;
  return bandStart + slack / 2;
}

/**
 * Given a "band" (a rect spanning the full cross-axis extent of the content
 * area, sized to `mainSize` along the main axis), generates one candidate
 * rect per alignment option for the element, sized as close to its
 * preferred size as the band and constraints allow.
 */
export function generateAlignmentCandidates(
  band: Rect,
  axis: "row" | "column",
  element: Pick<NormalizedElement, "size" | "position" | "effectiveMinWidth" | "effectiveMinHeight">,
): PlacementCandidate[] {
  const aligns: AlignPreference[] = ["start", "center", "end"];
  const candidates: PlacementCandidate[] = [];
  for (const align of aligns) {
    let width: number;
    let height: number;

    if (axis === "row") {
      // main axis is horizontal -> band.width is the allocated main size;
      // cross axis is vertical -> we choose height within band.height.
      width = band.width;
      height = clampSize(
        element.size.preferredHeight,
        element.effectiveMinHeight,
        element.size.maxHeight,
        band.height,
      );
      if (element.size.preferredAspectRatio) {
        const fit = fitAspectRatio({ width: band.width, height }, element.size.preferredAspectRatio);
        width = Math.max(element.effectiveMinWidth, Math.min(fit.width, band.width));
        height = Math.max(element.effectiveMinHeight, Math.min(fit.height, band.height));
      }
    } else {
      // main axis vertical -> band.height is the allocated main size;
      // cross axis horizontal -> we choose width within band.width.
      height = band.height;
      width = clampSize(
        element.size.preferredWidth,
        element.effectiveMinWidth,
        element.size.maxWidth,
        band.width,
      );
      if (element.size.preferredAspectRatio) {
        const fit = fitAspectRatio({ width, height: band.height }, element.size.preferredAspectRatio);
        width = Math.max(element.effectiveMinWidth, Math.min(fit.width, band.width));
        height = Math.max(element.effectiveMinHeight, Math.min(fit.height, band.height));
      }
    }

    const x =
      axis === "row" ? band.x : alignWithin(band.x, band.width, width, align);
    const y =
      axis === "row" ? alignWithin(band.y, band.height, height, align) : band.y;

    candidates.push({
      rect: { x, y, width, height },
      source: "flow-align",
      align,
    });
  }

  return candidates;
}

/**
 * Generates candidates for repositioning an element into leftover free
 * space (used by the degradation pipeline for `REPOSITION` actions).
 */
export function generateFreeRegionCandidates(
  freeRegions: Rect[],
  element: Pick<NormalizedElement, "size" | "effectiveMinWidth" | "effectiveMinHeight">,
): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = [];
  for (const region of freeRegions) {
    if (region.width < element.effectiveMinWidth || region.height < element.effectiveMinHeight) {
      continue;
    }
    let width = clampSize(
      element.size.preferredWidth,
      element.effectiveMinWidth,
      element.size.maxWidth,
      region.width,
    );
    let height = clampSize(
      element.size.preferredHeight,
      element.effectiveMinHeight,
      element.size.maxHeight,
      region.height,
    );
    if (element.size.preferredAspectRatio) {
      const fit = fitAspectRatio({ width: region.width, height: region.height }, element.size.preferredAspectRatio);
      width = Math.max(element.effectiveMinWidth, Math.min(fit.width, region.width));
      height = Math.max(element.effectiveMinHeight, Math.min(fit.height, region.height));
    }
    candidates.push({
      rect: { x: region.x, y: region.y, width, height },
      source: "free-region",
    });
  }
  return candidates;
}
