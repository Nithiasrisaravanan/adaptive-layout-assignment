/**
 * Domain model for the Adaptive Layout Engine.
 *
 * This file has no dependency on React, the DOM, or any rendering technology.
 * Everything here is plain data. The resolver (resolver.ts) consumes an
 * `AdSpec` + `SurfaceProfile` and produces a `ResolvedLayout`. Nothing in
 * this file — or anywhere in `src/engine` — is allowed to know the name
 * "mobile", "broadcast", or "kiosk". Surfaces are just numbers and flags.
 */

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/** An axis-aligned rectangle in surface coordinates (origin top-left). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Inset padding that defines the "safe" content region of a surface. */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ---------------------------------------------------------------------------
// Element vocabulary
// ---------------------------------------------------------------------------

/**
 * The kind of content an element represents. This is an open string union
 * of the built-in types the demo renderer knows how to draw; adding a new
 * type (e.g. "video") means adding a case to the renderer's switch, not to
 * the resolver, which only ever reasons about sizes, priorities and
 * capabilities.
 */
export type ElementType = "text" | "image" | "button" | "shape";

/**
 * Semantic role of an element within the ad. Roles carry no layout meaning
 * by themselves — they exist for readability, diagnostics, and for the
 * renderer to pick appropriate typography/visual treatment. The resolver
 * does not switch behavior on role string values.
 */
export type ElementRole =
  | "primary"
  | "hero"
  | "secondary"
  | "action"
  | "branding"
  | "supporting"
  | (string & {});

/**
 * Priority controls which elements receive scarce space first and which
 * are degraded first when the surface cannot fit everything at preferred
 * size. Lower number = higher importance. 1 is the highest priority the
 * engine recognizes as "must survive whenever geometrically possible";
 * higher numbers degrade first.
 */
export type Priority = 1 | 2 | 3 | 4 | 5;

/** The four degradation actions the engine may apply, in generic order. */
export type DegradationAction = "SHRINK" | "REPOSITION" | "TRUNCATE" | "HIDE";

/** Two-dimensional alignment preference within an allocated slot. */
export type AlignPreference = "start" | "center" | "end";

// ---------------------------------------------------------------------------
// Constraints (declared on an AdElement)
// ---------------------------------------------------------------------------

/** Size intent for an element. All values are in the surface's own units (px). */
export interface SizeConstraints {
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  preferredWidth: number;
  preferredHeight: number;
  /** If set, candidate generation will try to preserve width/height ratio. */
  preferredAspectRatio?: number;
}

/** How an element wants to be aligned and grouped within the flow. */
export interface PositionPreferences {
  alignMain: AlignPreference;
  alignCross: AlignPreference;
  /**
   * Elements sharing a group id are placed as adjacent siblings and treated
   * as a single composite unit during main-axis allocation, then arranged
   * relative to one another along the cross axis. This is how, e.g., a
   * headline and its price can end up sharing a column on a wide surface
   * without the resolver knowing anything about "headline" or "price".
   */
  group?: string;
  /** Explicit tie-break ordering within a priority band / group. Lower first. */
  order: number;
}

/** Constraints specific to text content. */
export interface TextConstraints {
  minFontSize: number;
  preferredFontSize: number;
  /** Rough line-height multiple used to translate font size into box height. */
  lineHeightFactor?: number;
  /** The actual copy, used only by the renderer + width estimation. */
  content: string;
}

/** Constraints specific to interactive elements (buttons, tap targets). */
export interface InteractionConstraints {
  isInteractive: boolean;
  /** Overrides the surface's minTapTarget for this element if larger. */
  minTapTargetOverride?: number;
}

/** What degradation actions an element permits, declared up front. */
export interface ElementCapabilities {
  resizable: boolean;
  truncatable: boolean;
  hideable: boolean;
  repositionable: boolean;
}

// ---------------------------------------------------------------------------
// AdElement / AdSpec
// ---------------------------------------------------------------------------

export interface AdElement {
  id: string;
  type: ElementType;
  role: ElementRole;
  priority: Priority;
  /** If true, validation fails the whole spec/layout if this can't be shown. */
  required: boolean;
  size: SizeConstraints;
  position: PositionPreferences;
  capabilities: ElementCapabilities;
  text?: TextConstraints;
  interaction?: InteractionConstraints;
  /** Non-text, non-interactive display content (alt text for images, etc). */
  alt?: string;
}

export interface AdSpec {
  id: string;
  elements: AdElement[];
}

// ---------------------------------------------------------------------------
// SurfaceProfile
// ---------------------------------------------------------------------------

export type ViewingDistance = "near" | "far";
export type Orientation = "portrait" | "landscape" | "square";

export interface SurfaceProfile {
  id: string;
  width: number;
  height: number;
  safeArea: SafeArea;
  /** Minimum tap target edge length (px) for interactive elements. */
  minTapTarget: number;
  /** Minimum legible font size (px) for text elements on this surface. */
  minTextSize: number;
  viewingDistance: ViewingDistance;
  touchOnly: boolean;
  orientation: Orientation;
  /**
   * Optional cap on how much of the content area may be occupied
   * (0-1). Used to model surfaces that need generous negative space
   * (e.g. broadcast safe title areas). Defaults to 1 (no cap) if omitted.
   */
  maxDensity?: number;
}

// ---------------------------------------------------------------------------
// Resolution output
// ---------------------------------------------------------------------------

export interface ResolvedElement {
  id: string;
  role: ElementRole;
  type: ElementType;
  priority: Priority;
  visible: boolean;
  /** Meaningful only when visible === true. */
  rect: Rect;
  /** Resolved font size, only present for text elements. */
  fontSize?: number;
  truncated: boolean;
  degradations: DegradationAction[];
  /** Pass-through display content — never decided by the resolver. */
  content?: string;
  alt?: string;
  isInteractive?: boolean;
}

export type DiagnosticType = "INFO" | "DEGRADATION" | "VIOLATION" | "ERROR";

export interface LayoutDiagnostic {
  type: DiagnosticType;
  elementId?: string;
  action?: DegradationAction;
  reason: string;
  priority?: Priority;
}

export type ViolationKind =
  | "OVERLAP"
  | "CLIPPING"
  | "OUT_OF_BOUNDS"
  | "SAFE_AREA"
  | "MIN_TEXT_SIZE"
  | "MIN_TAP_TARGET"
  | "INVALID_DIMENSIONS"
  | "MISSING_REQUIRED";

export interface ConstraintViolation {
  kind: ViolationKind;
  elementIds: string[];
  message: string;
}

export interface LayoutValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
}

export interface ResolvedLayout {
  surface: SurfaceProfile;
  elements: ResolvedElement[];
  diagnostics: LayoutDiagnostic[];
  validation: LayoutValidationResult;
}

// ---------------------------------------------------------------------------
// Internal resolution types (used across engine modules, not part of the
// public renderer-facing contract, but exported for tests/inspection).
// ---------------------------------------------------------------------------

/** An AdElement whose size constraints have folded-in surface hard minimums. */
export interface NormalizedElement extends AdElement {
  effectiveMinWidth: number;
  effectiveMinHeight: number;
}

/** A candidate placement for an element, prior to scoring. */
export interface LayoutCandidate {
  elementId: string;
  rect: Rect;
  fontSize?: number;
  truncated: boolean;
  /** Which strategy produced this candidate, for debug/trace purposes. */
  source: "flow" | "reposition-free-space" | "fallback";
}

export interface ScoredCandidate {
  candidate: LayoutCandidate;
  score: number;
  breakdown: Record<string, number>;
}
