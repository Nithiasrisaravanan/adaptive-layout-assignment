import { buildFlowItems, flatMembersOf, type FlowItem } from "./constraints";
import { normalizeSpec } from "./constraints";
import { resolveMainAxisFit, type Axis, type MainAxisAllocation } from "./degradation";
import {
  generateAlignmentCandidates,
  generateFreeRegionCandidates,
  type PlacementCandidate,
} from "./candidates";
import { availableRegions, safeAreaInterior } from "./geometry";
import { scoreCandidate } from "./scoring";
import { validateAdSpec } from "./spec";
import { validateLayout } from "./validation";
import type {
  AdSpec,
  DegradationAction,
  LayoutDiagnostic,
  NormalizedElement,
  Rect,
  ResolvedElement,
  ResolvedLayout,
  SurfaceProfile,
} from "./types";

/**
 * Below this aspect ratio the content area is treated as close enough to
 * square that we default to a vertical (column) flow. Above it, horizontal
 * (row) flow is used. This threshold is the ONLY place "shape" of a surface
 * influences the algorithm, and it is a continuous function of geometry —
 * not a check against a surface id or name.
 */
const AXIS_THRESHOLD = 1.15;

function determineAxis(contentArea: Rect): Axis {
  const ratio = contentArea.width / contentArea.height;
  if (ratio >= AXIS_THRESHOLD) return "row";
  return "column";
}

function fontSizeFromRect(
  rectHeight: number,
  minFontSize: number,
  preferredFontSize: number,
  lineHeightFactor: number,
): number {
  const maxFittingFontSize = rectHeight / lineHeightFactor;
  return Math.max(minFontSize, Math.min(preferredFontSize, maxFittingFontSize));
}

interface PlacedMember {
  element: NormalizedElement;
  rect: Rect;
  hidden: boolean;
  degradations: DegradationAction[];
}

/**
 * Places a group's members stacked top-to-bottom within `band`, applying a
 * small local shrink/hide degradation pass if the members' combined
 * preferred height exceeds what the band offers. Every member stretches to
 * fill the band's full width.
 *
 * Groups always stack vertically internally — a related block of copy
 * reads top-to-bottom regardless of the outer flow's orientation. The
 * outer flow axis only changes how much space the group's own box gets
 * allocated (see `degradation.mainPreferred`): on a row-flow surface the
 * group is a narrow, tall column; on a column-flow surface it's a full-width
 * block whose height already accounts for every member stacked inside it.
 */
function placeGroupMembers(
  band: Rect,
  members: NormalizedElement[],
  diagnostics: LayoutDiagnostic[],
): PlacedMember[] {
  const stackAvailable = band.height;

  const state = members.map((m) => {
    const stackMin = m.effectiveMinHeight;
    const stackPreferredRaw = m.size.preferredHeight;
    return {
      element: m,
      // Never below the effective minimum, mirroring the main-axis rule.
      stackPreferred: Math.max(stackPreferredRaw, stackMin),
      stackMin,
      hidden: false,
      degradations: [] as DegradationAction[],
    };
  });

  const total = () => state.reduce((sum, s) => (s.hidden ? sum : sum + s.stackPreferred), 0);

  // Sort least-important-first for degradation purposes only.
  const degradeOrder = [...state].sort((a, b) => {
    if (a.element.priority !== b.element.priority) return b.element.priority - a.element.priority;
    return b.element.position.order - a.element.position.order;
  });

  for (const s of degradeOrder) {
    if (total() <= stackAvailable) break;
    if (s.stackPreferred > s.stackMin && s.element.capabilities.resizable) {
      const before = s.stackPreferred;
      s.stackPreferred = s.stackMin;
      s.degradations.push("SHRINK");
      diagnostics.push({
        type: "DEGRADATION",
        elementId: s.element.id,
        action: "SHRINK",
        priority: s.element.priority,
        reason: `Shrunk within its group from ${Math.round(before)}px to ${Math.round(
          s.stackMin,
        )}px to share space with sibling elements.`,
      });
      if (total() <= stackAvailable) continue;
    }
    if (s.element.capabilities.hideable && !s.element.required && !s.hidden) {
      s.hidden = true;
      s.degradations.push("HIDE");
      diagnostics.push({
        type: "DEGRADATION",
        elementId: s.element.id,
        action: "HIDE",
        priority: s.element.priority,
        reason: `Hidden: its group did not have enough vertical space even after shrinking all resizable members.`,
      });
    }
  }

  const visible = state.filter((s) => !s.hidden);
  const usedStack = visible.reduce((sum, s) => sum + s.stackPreferred, 0);
  const gap = visible.length > 0 ? Math.max(0, stackAvailable - usedStack) / (visible.length + 1) : 0;

  let cursor = band.y + gap;
  const placed: PlacedMember[] = [];
  for (const s of state) {
    if (s.hidden) {
      placed.push({ element: s.element, rect: { x: 0, y: 0, width: 0, height: 0 }, hidden: true, degradations: s.degradations });
      continue;
    }
    const rect: Rect = { x: band.x, y: cursor, width: band.width, height: s.stackPreferred };
    cursor += s.stackPreferred + gap;
    placed.push({ element: s.element, rect, hidden: false, degradations: s.degradations });
  }
  return placed;
}

function resolveStandaloneElement(
  band: Rect,
  axis: Axis,
  element: NormalizedElement,
  occupied: Rect[],
  surfaceBounds: Rect,
  surface: SurfaceProfile,
): { rect: Rect; truncated: boolean } {
  const candidates: PlacementCandidate[] = generateAlignmentCandidates(band, axis, element);
  let best: { candidate: PlacementCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, element, {
      occupied,
      surfaceBounds,
      safeArea: surface.safeArea,
      preferredAlign: element.position.alignCross,
      axis,
    }).total;
    if (!best || score < best.score) best = { candidate, score };
  }
  const rect = best!.candidate.rect;
  const truncated =
    !!element.capabilities.truncatable &&
    !!element.text &&
    rect.width < element.size.preferredWidth - 0.5;
  return { rect, truncated };
}

export interface ResolveOptions {
  /** If true, includes verbose INFO diagnostics describing each pipeline stage. */
  trace?: boolean;
}

export function resolveLayout(
  spec: AdSpec,
  surface: SurfaceProfile,
  options: ResolveOptions = {},
): ResolvedLayout {
  const diagnostics: LayoutDiagnostic[] = [];
  const trace = options.trace ?? true;

  validateAdSpec(spec);

  const surfaceBounds: Rect = { x: 0, y: 0, width: surface.width, height: surface.height };
  const contentArea = safeAreaInterior(surfaceBounds, surface.safeArea);

  if (trace) {
    diagnostics.push({
      type: "INFO",
      reason: `Created safe-area content region: ${Math.round(contentArea.width)}x${Math.round(
        contentArea.height,
      )}px inside a ${surface.width}x${surface.height}px surface.`,
    });
  }

  const normalized = normalizeSpec(spec, surface);
  const flowItems = buildFlowItems(normalized);
  const axis = determineAxis(contentArea);

  if (trace) {
    diagnostics.push({
      type: "INFO",
      reason: `Content area aspect ratio ${(contentArea.width / contentArea.height).toFixed(
        2,
      )} selected "${axis}" as the main flow axis.`,
    });
  }

  const density = surface.maxDensity ?? 1;
  const availableMain = (axis === "row" ? contentArea.width : contentArea.height) * density;

  const { allocations, diagnostics: mainDiagnostics } = resolveMainAxisFit(
    flowItems,
    axis,
    availableMain,
  );
  diagnostics.push(...mainDiagnostics);

  // --- Place the main flow (visible, non-repositioned items) ------------
  const visibleAllocs = allocations.filter((a) => !a.hidden && !a.repositioned);
  const usedMain = visibleAllocs.reduce((sum, a) => sum + a.mainSize, 0);
  const leftover = Math.max(0, availableMain - usedMain);
  const gap = visibleAllocs.length > 0 ? leftover / (visibleAllocs.length + 1) : 0;

  const resolvedById = new Map<string, ResolvedElement>();
  const occupied: Rect[] = [];
  let cursor = (axis === "row" ? contentArea.x : contentArea.y) + gap;

  for (const alloc of visibleAllocs) {
    const band: Rect =
      axis === "row"
        ? { x: cursor, y: contentArea.y, width: alloc.mainSize, height: contentArea.height }
        : { x: contentArea.x, y: cursor, width: contentArea.width, height: alloc.mainSize };
    cursor += alloc.mainSize + gap;
    occupied.push(band);

    placeAllocationIntoBand(alloc, band, axis, occupied, surfaceBounds, surface, resolvedById, diagnostics);
  }

  // --- Place repositioned items into leftover free space -----------------
  for (const alloc of allocations.filter((a) => a.repositioned)) {
    if (alloc.item.kind !== "element") continue; // only standalone elements can be repositioned
    const element = alloc.item.element;
    const freeRegions = availableRegions(contentArea, occupied);
    const candidates = generateFreeRegionCandidates(freeRegions, element);
    let best: { candidate: PlacementCandidate; score: number } | null = null;
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate, element, {
        occupied,
        surfaceBounds,
        safeArea: surface.safeArea,
        preferredAlign: element.position.alignCross,
        axis,
      }).total;
      if (!best || score < best.score) best = { candidate, score };
    }

    if (best) {
      occupied.push(best.candidate.rect);
      resolvedById.set(
        element.id,
        buildResolvedElement(element, best.candidate.rect, false, alloc.degradations, false, surface.minTextSize),
      );
      diagnostics.push({
        type: "INFO",
        elementId: element.id,
        reason: `Placed in leftover free space (${Math.round(best.candidate.rect.width)}x${Math.round(
          best.candidate.rect.height,
        )}px) after repositioning.`,
      });
    } else {
      diagnostics.push({
        type: "DEGRADATION",
        elementId: element.id,
        action: "HIDE",
        priority: element.priority,
        reason: `No leftover free region was large enough after repositioning; hiding instead.`,
      });
      resolvedById.set(
        element.id,
        buildResolvedElement(
          element,
          { x: 0, y: 0, width: 0, height: 0 },
          true,
          [...alloc.degradations, "HIDE"],
          false,
          surface.minTextSize,
        ),
      );
    }
  }

  // --- Hidden items ---------------------------------------------------
  for (const alloc of allocations.filter((a) => a.hidden)) {
    for (const member of flatMembersOf(alloc.item)) {
      if (!resolvedById.has(member.id)) {
        resolvedById.set(
          member.id,
          buildResolvedElement(
            member,
            { x: 0, y: 0, width: 0, height: 0 },
            true,
            alloc.degradations,
            false,
            surface.minTextSize,
          ),
        );
      }
    }
  }

  // Preserve original spec order in the output for predictable snapshots.
  const elements: ResolvedElement[] = spec.elements.map(
    (el) =>
      resolvedById.get(el.id) ??
      buildResolvedElement(
        normalized.find((n) => n.id === el.id)!,
        { x: 0, y: 0, width: 0, height: 0 },
        true,
        ["HIDE"],
        false,
        surface.minTextSize,
      ),
  );

  const validation = validateLayout(elements, surface);
  if (!validation.valid) {
    for (const v of validation.violations) {
      diagnostics.push({
        type: "VIOLATION",
        elementId: v.elementIds[0],
        reason: `[${v.kind}] ${v.message}`,
      });
    }
  } else if (trace) {
    diagnostics.push({ type: "INFO", reason: "Final layout validated: no overlaps, clipping, or safe-area violations." });
  }

  return { surface, elements, diagnostics, validation };
}

function placeAllocationIntoBand(
  alloc: MainAxisAllocation,
  band: Rect,
  axis: Axis,
  occupied: Rect[],
  surfaceBounds: Rect,
  surface: SurfaceProfile,
  resolvedById: Map<string, ResolvedElement>,
  diagnostics: LayoutDiagnostic[],
): void {
  const item: FlowItem = alloc.item;
  if (item.kind === "element") {
    const { rect, truncated } = resolveStandaloneElement(
      band,
      axis,
      item.element,
      occupied,
      surfaceBounds,
      surface,
    );
    if (truncated) {
      diagnostics.push({
        type: "DEGRADATION",
        elementId: item.element.id,
        action: "TRUNCATE",
        priority: item.element.priority,
        reason: `Rendered narrower than preferred (${Math.round(rect.width)}px vs ${Math.round(
          item.element.size.preferredWidth,
        )}px); text will truncate with ellipsis.`,
      });
    }
    resolvedById.set(
      item.element.id,
      buildResolvedElement(
        item.element,
        rect,
        false,
        [...alloc.degradations, ...(truncated ? (["TRUNCATE"] as DegradationAction[]) : [])],
        truncated,
        surface.minTextSize,
      ),
    );
    return;
  }

  // Group.
  const placedMembers = placeGroupMembers(band, item.members, diagnostics);
  for (const pm of placedMembers) {
    const truncated =
      !pm.hidden &&
      !!pm.element.capabilities.truncatable &&
      !!pm.element.text &&
      pm.rect.width < pm.element.size.preferredWidth - 0.5;
    if (truncated) {
      diagnostics.push({
        type: "DEGRADATION",
        elementId: pm.element.id,
        action: "TRUNCATE",
        priority: pm.element.priority,
        reason: `Rendered narrower than preferred within its group; text will truncate with ellipsis.`,
      });
    }
    resolvedById.set(
      pm.element.id,
      buildResolvedElement(
        pm.element,
        pm.rect,
        pm.hidden,
        [...alloc.degradations, ...pm.degradations, ...(truncated ? (["TRUNCATE"] as DegradationAction[]) : [])],
        truncated,
        surface.minTextSize,
      ),
    );
    if (!pm.hidden) occupied.push(pm.rect);
  }
}

function buildResolvedElement(
  element: NormalizedElement,
  rect: Rect,
  hidden: boolean,
  degradations: DegradationAction[],
  truncated: boolean,
  surfaceMinTextSize: number,
): ResolvedElement {
  let fontSize: number | undefined;
  if (element.text && !hidden) {
    // The effective floor is the larger of the element's own minimum and
    // the surface's hard minimum legible size — a surface constraint can
    // only ever push font size UP relative to the element's own minimum,
    // never down.
    const effectiveMinFontSize = Math.max(element.text.minFontSize, surfaceMinTextSize);
    fontSize = fontSizeFromRect(
      rect.height,
      effectiveMinFontSize,
      element.text.preferredFontSize,
      element.text.lineHeightFactor ?? 1.4,
    );
  }
  return {
    id: element.id,
    role: element.role,
    type: element.type,
    priority: element.priority,
    visible: !hidden,
    rect,
    fontSize,
    truncated,
    degradations: dedupeActions(degradations),
    content: element.text?.content,
    alt: element.alt,
    isInteractive: element.interaction?.isInteractive,
  };
}

function dedupeActions(actions: DegradationAction[]): DegradationAction[] {
  return Array.from(new Set(actions));
}
