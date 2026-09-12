import type {
  AdElement,
  AdSpec,
  ElementCapabilities,
  InteractionConstraints,
  PositionPreferences,
  SizeConstraints,
  TextConstraints,
} from "./types";

/**
 * Input shape for `defineAd`. Every field an element cares about is
 * expressed as intent (priority, role, capability, preferred/min/max size)
 * — never as a final x/y pixel coordinate. See README "Why this is not
 * responsive CSS" for the reasoning.
 */
export interface AdElementInput {
  id: string;
  type: AdElement["type"];
  role: AdElement["role"];
  priority: AdElement["priority"];
  required?: boolean;
  size: Partial<SizeConstraints> &
    Pick<SizeConstraints, "preferredWidth" | "preferredHeight">;
  position?: Partial<PositionPreferences>;
  capabilities?: Partial<ElementCapabilities>;
  text?: TextConstraints;
  interaction?: InteractionConstraints;
  alt?: string;
}

export interface AdSpecInput {
  id: string;
  elements: AdElementInput[];
}

const DEFAULT_CAPABILITIES: ElementCapabilities = {
  resizable: true,
  truncatable: false,
  hideable: true,
  repositionable: true,
};

const DEFAULT_POSITION: PositionPreferences = {
  alignMain: "start",
  alignCross: "center",
  order: 0,
};

function fillElement(input: AdElementInput): AdElement {
  const capabilities: ElementCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...input.capabilities,
  };
  const position: PositionPreferences = { ...DEFAULT_POSITION, ...input.position };
  const size: SizeConstraints = {
    minWidth: input.size.minWidth ?? Math.min(24, input.size.preferredWidth),
    minHeight: input.size.minHeight ?? Math.min(24, input.size.preferredHeight),
    maxWidth: input.size.maxWidth,
    maxHeight: input.size.maxHeight,
    preferredWidth: input.size.preferredWidth,
    preferredHeight: input.size.preferredHeight,
    preferredAspectRatio: input.size.preferredAspectRatio,
  };

  const element: AdElement = {
    id: input.id,
    type: input.type,
    role: input.role,
    priority: input.priority,
    required: input.required ?? false,
    size,
    position,
    capabilities,
    text: input.text,
    interaction: input.interaction,
    alt: input.alt,
  };
  return element;
}

export class AdSpecValidationError extends Error {
  constructor(message: string) {
    super(`Invalid AdSpec: ${message}`);
    this.name = "AdSpecValidationError";
  }
}

/**
 * Builds and validates an AdSpec from a lightweight, ergonomic input shape,
 * filling in sane defaults. Throws `AdSpecValidationError` for structurally
 * invalid specs (duplicate ids, a required-but-hideable element, an
 * interactive element with no interaction constraints, etc.) so mistakes
 * fail loudly at construction time rather than silently mis-laying-out.
 */
export function defineAd(input: AdSpecInput): AdSpec {
  const elements = input.elements.map(fillElement);
  const spec: AdSpec = { id: input.id, elements };
  validateAdSpec(spec);
  return spec;
}

export function validateAdSpec(spec: AdSpec): void {
  if (spec.elements.length === 0) {
    throw new AdSpecValidationError("spec must declare at least one element");
  }

  const seen = new Set<string>();
  for (const el of spec.elements) {
    if (!el.id || el.id.trim().length === 0) {
      throw new AdSpecValidationError("every element must have a non-empty id");
    }
    if (seen.has(el.id)) {
      throw new AdSpecValidationError(`duplicate element id "${el.id}"`);
    }
    seen.add(el.id);

    if (el.required && el.capabilities.hideable) {
      throw new AdSpecValidationError(
        `element "${el.id}" is marked required but capabilities.hideable is true. ` +
          `Required elements must set capabilities.hideable = false.`,
      );
    }

    if (el.type === "text" && !el.text) {
      throw new AdSpecValidationError(
        `element "${el.id}" has type "text" but no text constraints`,
      );
    }
    if (el.type === "button" && !el.interaction?.isInteractive) {
      throw new AdSpecValidationError(
        `element "${el.id}" has type "button" but interaction.isInteractive is not true`,
      );
    }

    if (el.size.minWidth <= 0 || el.size.minHeight <= 0) {
      throw new AdSpecValidationError(
        `element "${el.id}" must have positive minWidth/minHeight`,
      );
    }
    if (el.size.preferredWidth < el.size.minWidth) {
      throw new AdSpecValidationError(
        `element "${el.id}" preferredWidth is smaller than minWidth`,
      );
    }
    if (el.size.preferredHeight < el.size.minHeight) {
      throw new AdSpecValidationError(
        `element "${el.id}" preferredHeight is smaller than minHeight`,
      );
    }
    if (
      el.size.maxWidth !== undefined &&
      el.size.maxWidth < el.size.minWidth
    ) {
      throw new AdSpecValidationError(
        `element "${el.id}" maxWidth is smaller than minWidth`,
      );
    }
  }
}
