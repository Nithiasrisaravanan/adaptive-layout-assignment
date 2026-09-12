import { intersectsSafeArea, rectanglesOverlap } from "./geometry";
import type { NormalizedElement, Rect, SafeArea } from "./types";
import type { PlacementCandidate } from "./candidates";

/**
 * This is a deterministic HEURISTIC scoring function, not a global
 * optimizer. It exists to pick among a small, cheaply-generated set of
 * candidate rects for a single element — never to search a combinatorial
 * space of whole-layout arrangements. See ARCHITECTURE.md "Complexity and
 * trade-offs" for why this is the right level of sophistication for the
 * problem (the FAQ in the assignment explicitly discourages an
 * over-engineered general solver).
 *
 * Lower score is better. Hard-constraint violations (overlap, safe-area
 * intrusion) are weighted orders of magnitude above soft preferences so
 * they always dominate the comparison.
 */
const HUGE_PENALTY = 1_000_000;

export interface ScoreBreakdown {
  overlapPenalty: number;
  safeAreaPenalty: number;
  sizeLossPenalty: number;
  aspectRatioPenalty: number;
  alignmentPenalty: number;
  total: number;
}

export function scoreCandidate(
  candidate: PlacementCandidate,
  element: Pick<NormalizedElement, "size" | "position">,
  context: {
    occupied: Rect[];
    surfaceBounds: Rect;
    safeArea: SafeArea;
    preferredAlign: "start" | "center" | "end";
    axis: "row" | "column";
  },
): ScoreBreakdown {
  const { rect } = candidate;

  const overlapPenalty = context.occupied.some((occ) => rectanglesOverlap(occ, rect))
    ? HUGE_PENALTY
    : 0;

  const safeAreaPenalty = intersectsSafeArea(rect, context.surfaceBounds, context.safeArea)
    ? HUGE_PENALTY
    : 0;

  const preferredArea = element.size.preferredWidth * element.size.preferredHeight;
  const actualArea = rect.width * rect.height;
  const sizeLossPenalty =
    preferredArea > 0 ? Math.max(0, (preferredArea - actualArea) / preferredArea) * 100 : 0;

  let aspectRatioPenalty = 0;
  if (element.size.preferredAspectRatio && rect.height > 0) {
    const actualRatio = rect.width / rect.height;
    aspectRatioPenalty =
      Math.abs(actualRatio - element.size.preferredAspectRatio) /
      element.size.preferredAspectRatio *
      20;
  }

  // Alignment penalty only applies to flow-align candidates: does the
  // candidate's offset within its band match the element's declared
  // preference? Free-region candidates are scored without this term since
  // "preferred alignment" is meaningless once an element has been bumped
  // out of the normal flow.
  const alignmentPenalty =
    candidate.source === "flow-align" && candidate.align !== context.preferredAlign ? 5 : 0;

  const total =
    overlapPenalty +
    safeAreaPenalty +
    sizeLossPenalty +
    aspectRatioPenalty +
    alignmentPenalty;

  return { overlapPenalty, safeAreaPenalty, sizeLossPenalty, aspectRatioPenalty, alignmentPenalty, total };
}

/** Picks the lowest-scoring candidate, breaking ties by candidate order (deterministic). */
export function selectBestCandidate<T extends PlacementCandidate>(
  candidates: T[],
  element: Pick<NormalizedElement, "size" | "position">,
  context: Parameters<typeof scoreCandidate>[2],
): { candidate: T; score: ScoreBreakdown } | null {
  let best: { candidate: T; score: ScoreBreakdown } | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, element, context);
    if (!best || score.total < best.score.total) {
      best = { candidate, score };
    }
  }
  return best;
}
