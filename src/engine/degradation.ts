import type { FlowItem } from "./constraints";
import { flatMembersOf } from "./constraints";
import type { DegradationAction, LayoutDiagnostic, NormalizedElement } from "./types";

export type Axis = "row" | "column";

/** Per-item state produced by the main-axis fit loop. */
export interface MainAxisAllocation {
  item: FlowItem;
  /** Allocated size along the main axis, in px. 0 if hidden. */
  mainSize: number;
  hidden: boolean;
  repositioned: boolean;
  degradations: DegradationAction[];
}

function mainPreferred(item: FlowItem, axis: Axis): number {
  const members = flatMembersOf(item);
  if (item.kind === "element") {
    return axis === "row" ? item.element.size.preferredWidth : item.element.size.preferredHeight;
  }
  // Group: members are always stacked top-to-bottom internally (see
  // resolver.placeGroupMembers) — a related block of copy reads vertically
  // regardless of the outer flow's orientation. That means the group's own
  // footprint along the main axis depends on which axis IS vertical:
  //   - row flow (main = horizontal): the group is a narrow column; its
  //     main-axis (width) requirement is just the widest member.
  //   - column flow (main = vertical): the group's main-axis (height)
  //     requirement is the SUM of every member's height, since they stack
  //     sequentially down the page.
  if (axis === "row") {
    return Math.max(...members.map((m) => m.size.preferredWidth));
  }
  return members.reduce((sum, m) => sum + m.size.preferredHeight, 0);
}

function mainMin(item: FlowItem, axis: Axis): number {
  if (item.kind === "element") {
    return axis === "row" ? item.element.effectiveMinWidth : item.element.effectiveMinHeight;
  }
  // A group's true floor only has to reserve space for members that
  // CANNOT be dropped (required, or not hideable). A hideable, non-required
  // member can still be hidden by placeGroupMembers's own internal
  // degradation pass once the band is sized — so it contributes 0 to the
  // floor the outer main-axis loop must respect, letting e.g. a
  // "headline + price + supporting text" group shrink all the way down to
  // just the headline's minimum on a very small surface, instead of
  // refusing to shrink past "all three members present."
  const floorContribution = (m: NormalizedElement) => {
    if (m.capabilities.hideable && !m.required) return 0;
    return axis === "row" ? m.effectiveMinWidth : m.effectiveMinHeight;
  };
  if (axis === "row") {
    return Math.max(...item.members.map(floorContribution));
  }
  return item.members.reduce((sum, m) => sum + floorContribution(m), 0);
}

export function mainMax(item: FlowItem, axis: Axis): number | undefined {
  const members = flatMembersOf(item);
  if (axis === "row") {
    const maxes = members.map((m) => m.size.maxWidth);
    if (maxes.some((v) => v === undefined)) return undefined;
    return Math.min(...(maxes as number[]));
  }
  const maxes = members.map((m) => m.size.maxHeight);
  if (maxes.some((v) => v === undefined)) return undefined;
  return (maxes as number[]).reduce((sum, v) => sum + v, 0);
}

function isHideable(item: FlowItem): boolean {
  return flatMembersOf(item).every((m) => m.capabilities.hideable && !m.required);
}

function isRepositionable(item: FlowItem): boolean {
  return item.kind === "element" && item.element.capabilities.repositionable;
}

function isResizable(item: FlowItem): boolean {
  return flatMembersOf(item).every((m) => m.capabilities.resizable);
}

/**
 * Runs the priority-ordered greedy degradation loop described in
 * ARCHITECTURE.md: starting from every item at its preferred main-axis
 * size, if the total exceeds the available space, process items from
 * *lowest* priority to *highest*, applying in order:
 *   1. SHRINK      — reduce toward effective minimum
 *   2. REPOSITION   — pull out of the main flow, to be placed in leftover
 *                      free space later (only if still needed after shrink)
 *   3. HIDE         — drop the element entirely (only if not required)
 * after each single action, the running total is rechecked; the loop stops
 * as soon as it fits. TRUNCATE is handled later, during cross-axis sizing,
 * because it affects the cross dimension, not the main-axis budget.
 */
export function resolveMainAxisFit(
  items: FlowItem[],
  axis: Axis,
  availableMain: number,
): { allocations: MainAxisAllocation[]; diagnostics: LayoutDiagnostic[] } {
  const diagnostics: LayoutDiagnostic[] = [];

  // Never start below the effective minimum, even if the *preferred* size
  // happens to be smaller than a hard constraint the surface imposes (e.g.
  // a button's preferred height is 48px but this surface's minTapTarget is
  // 60px). Hard constraints must hold before any degradation logic runs.
  const allocations: MainAxisAllocation[] = items.map((item) => ({
    item,
    mainSize: Math.max(mainPreferred(item, axis), mainMin(item, axis)),
    hidden: false,
    repositioned: false,
    degradations: [],
  }));

  const totalMain = () =>
    allocations.reduce((sum, a) => sum + (a.hidden || a.repositioned ? 0 : a.mainSize), 0);

  if (totalMain() <= availableMain) {
    return { allocations, diagnostics };
  }

  diagnostics.push({
    type: "INFO",
    reason: `Preferred sizes require ${Math.round(totalMain())}px along the main axis but only ${Math.round(
      availableMain,
    )}px is available. Starting priority-ordered degradation.`,
  });

  // Process from least important to most important (priority descending).
  const order = [...allocations].sort((a, b) => {
    if (a.item.priority !== b.item.priority) return b.item.priority - a.item.priority;
    return b.item.order - a.item.order;
  });

  for (const alloc of order) {
    if (totalMain() <= availableMain) break;
    const { item } = alloc;
    const min = mainMin(item, axis);

    // 1. SHRINK
    if (isResizable(item) && alloc.mainSize > min) {
      const before = alloc.mainSize;
      alloc.mainSize = min;
      alloc.degradations.push("SHRINK");
      diagnostics.push({
        type: "DEGRADATION",
        elementId: item.id,
        action: "SHRINK",
        priority: item.priority,
        reason: `Shrunk from ${Math.round(before)}px to its effective minimum ${Math.round(
          min,
        )}px along the main axis to help fit priority ${item.priority} content.`,
      });
      if (totalMain() <= availableMain) continue;
    }

    // 2. REPOSITION — remove from the main sequential flow; it will be
    // placed into leftover free space once the rest of the flow is fixed.
    if (isRepositionable(item) && !alloc.repositioned) {
      alloc.repositioned = true;
      alloc.degradations.push("REPOSITION");
      diagnostics.push({
        type: "DEGRADATION",
        elementId: item.id,
        action: "REPOSITION",
        priority: item.priority,
        reason: `Pulled out of the main content flow to be placed in leftover free space, freeing ${Math.round(
          alloc.mainSize,
        )}px for higher-priority content.`,
      });
      if (totalMain() <= availableMain) continue;
    }

    // 3. HIDE — last resort, only for non-required, hideable items.
    if (isHideable(item) && !alloc.hidden) {
      alloc.hidden = true;
      alloc.repositioned = false;
      alloc.degradations.push("HIDE");
      diagnostics.push({
        type: "DEGRADATION",
        elementId: item.id,
        action: "HIDE",
        priority: item.priority,
        reason: `Hidden entirely: available space was insufficient after shrinking and attempting to reposition, and this element is not required.`,
      });
    }
  }

  if (totalMain() > availableMain) {
    const remaining = allocations.filter((a) => !a.hidden && !a.repositioned);
    diagnostics.push({
      type: "VIOLATION",
      reason:
        `Even after full degradation, required/non-hideable content still needs ` +
        `${Math.round(totalMain())}px but only ${Math.round(availableMain)}px is available. ` +
        `Remaining elements: ${remaining.map((a) => a.item.id).join(", ")}.`,
    });
  }

  return { allocations, diagnostics };
}
