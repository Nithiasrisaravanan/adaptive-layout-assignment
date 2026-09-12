import type { AdSpec, NormalizedElement, Priority, SurfaceProfile } from "./types";

/**
 * Approximate ratio of font size to minimum legible box height for a single
 * line of text (font size * lineHeightFactor). Kept as a named constant so
 * the "how do you turn minTextSize into a box constraint" question has one
 * obvious answer.
 */
const DEFAULT_LINE_HEIGHT_FACTOR = 1.4;

/**
 * Folds every *hard* surface constraint into each element's effective
 * minimum size, so the resolver never has to special-case "this is a text
 * element, check minTextSize" or "this is interactive, check minTapTarget"
 * during placement. By the time normalization is done, every hard
 * requirement is expressed uniformly as effectiveMinWidth/effectiveMinHeight.
 */
export function normalizeElement(
  element: AdSpec["elements"][number],
  surface: SurfaceProfile,
): NormalizedElement {
  let effectiveMinWidth = element.size.minWidth;
  let effectiveMinHeight = element.size.minHeight;

  if (element.text) {
    const minFontSize = Math.max(element.text.minFontSize, surface.minTextSize);
    const lineHeightFactor = element.text.lineHeightFactor ?? DEFAULT_LINE_HEIGHT_FACTOR;
    const minTextHeight = minFontSize * lineHeightFactor;
    effectiveMinHeight = Math.max(effectiveMinHeight, minTextHeight);
  }

  if (element.interaction?.isInteractive) {
    const minTap = Math.max(
      surface.minTapTarget,
      element.interaction.minTapTargetOverride ?? 0,
    );
    effectiveMinWidth = Math.max(effectiveMinWidth, minTap);
    effectiveMinHeight = Math.max(effectiveMinHeight, minTap);
  }

  return { ...element, effectiveMinWidth, effectiveMinHeight };
}

export function normalizeSpec(
  spec: AdSpec,
  surface: SurfaceProfile,
): NormalizedElement[] {
  return spec.elements.map((el) => normalizeElement(el, surface));
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export interface ElementFlowItem {
  kind: "element";
  id: string;
  priority: Priority;
  order: number;
  element: NormalizedElement;
}

export interface GroupFlowItem {
  kind: "group";
  id: string;
  priority: Priority;
  order: number;
  members: NormalizedElement[];
}

export type FlowItem = ElementFlowItem | GroupFlowItem;

/**
 * Elements that share `position.group` are combined into a single
 * `GroupFlowItem`, ordered internally by (priority, order, id) — the same
 * deterministic tie-break used everywhere else. A group's own priority for
 * main-axis allocation purposes is the *highest* priority (lowest number)
 * among its members, so a group is never degraded before a standalone
 * element that is less important than every element inside it.
 */
export function buildFlowItems(elements: NormalizedElement[]): FlowItem[] {
  const groups = new Map<string, NormalizedElement[]>();
  const standalone: NormalizedElement[] = [];

  for (const el of elements) {
    const groupId = el.position.group;
    if (groupId) {
      const members = groups.get(groupId) ?? [];
      members.push(el);
      groups.set(groupId, members);
    } else {
      standalone.push(el);
    }
  }

  const items: FlowItem[] = standalone.map((el) => ({
    kind: "element",
    id: el.id,
    priority: el.priority,
    order: el.position.order,
    element: el,
  }));

  for (const [groupId, members] of groups) {
    const sortedMembers = sortDeterministically(members);
    const priority = sortedMembers.reduce(
      (min, m) => (m.priority < min ? m.priority : min),
      sortedMembers[0]!.priority,
    );
    const order = Math.min(...sortedMembers.map((m) => m.position.order));
    items.push({ kind: "group", id: groupId, priority, order, members: sortedMembers });
  }

  return sortFlowItems(items);
}

function sortDeterministically(elements: NormalizedElement[]): NormalizedElement[] {
  return [...elements].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.position.order !== b.position.order) return a.position.order - b.position.order;
    return a.id.localeCompare(b.id);
  });
}

export function sortFlowItems(items: FlowItem[]): FlowItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

export function flatMembersOf(item: FlowItem): NormalizedElement[] {
  return item.kind === "element" ? [item.element] : item.members;
}
