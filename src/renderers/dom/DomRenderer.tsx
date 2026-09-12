import type { CSSProperties } from "react";
import type { ResolvedElement } from "../../engine/types";
import type { RendererInput } from "../renderer-types";

/**
 * Renders a `ResolvedLayout` to DOM/CSS. This component makes ZERO layout
 * decisions: every position, size, visibility, font size, and truncation
 * flag comes directly from the engine's output. It only decides how to
 * *paint* a given rect for a given element type (colors, borders, a
 * placeholder icon for images) — never where that rect is or how big it is.
 *
 * A future <CanvasRenderer /> or <SvgRenderer /> would consume the exact
 * same `RendererInput` and require no changes here or in `src/engine`.
 */
export interface DomRendererProps {
  layout: RendererInput;
  /** Called when the user clicks an element (used by the debug inspector). */
  onSelectElement?: (id: string) => void;
  selectedElementId?: string | null;
  showDebugOverlay?: boolean;
}

const ROLE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  primary: { bg: "#1c1c1e", fg: "#f5f5f0", border: "#1c1c1e" },
  hero: { bg: "#e8e4da", fg: "#1c1c1e", border: "#c9c2b0" },
  secondary: { bg: "#f5f5f0", fg: "#1c1c1e", border: "#c9c2b0" },
  action: { bg: "#b5502e", fg: "#ffffff", border: "#b5502e" },
  branding: { bg: "#f5f5f0", fg: "#6b6558", border: "#c9c2b0" },
  supporting: { bg: "#f5f5f0", fg: "#6b6558", border: "#c9c2b0" },
};

// Text elements render directly on the pale canvas stage — never on a
// filled chip — so they need their own dark-ink palette, independent of
// ROLE_COLORS.fg above (which assumes a colored/dark background, e.g. a
// button or badge). Using ROLE_COLORS.fg for plain text was the bug behind
// the near-invisible headline: "primary" is meant to be light text on a
// dark chip, not light text directly on the light stage.
const TEXT_INK: Record<string, string> = {
  primary: "#1c1c1e",
  secondary: "#3a3b40",
  supporting: "#6b6558",
  branding: "#6b6558",
};

function textColorFor(role: string): string {
  return TEXT_INK[role] ?? "#1c1c1e";
}

function colorsFor(role: string) {
  return ROLE_COLORS[role] ?? { bg: "#f5f5f0", fg: "#1c1c1e", border: "#c9c2b0" };
}

function elementStyle(el: ResolvedElement): CSSProperties {
  const colors = colorsFor(el.role);
  const base: CSSProperties = {
    position: "absolute",
    left: el.rect.x,
    top: el.rect.y,
    width: el.rect.width,
    height: el.rect.height,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: el.type === "text" ? "flex-start" : "center",
    overflow: "hidden",
    borderRadius: el.type === "button" ? 6 : el.type === "image" ? 4 : 3,
  };

  if (el.type === "text") {
    return {
      ...base,
      color: textColorFor(el.role),
      fontSize: el.fontSize ?? 14,
      fontFamily: '"Iowan Old Style", "Georgia", serif',
      fontWeight: el.role === "primary" ? 600 : 400,
      lineHeight: 1.15,
    };
  }
  if (el.type === "image") {
    return {
      ...base,
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: colors.fg,
      fontSize: 11,
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      padding: 4,
    };
  }
  if (el.type === "button") {
    return {
      ...base,
      background: colors.bg,
      color: colors.fg,
      fontFamily: "system-ui, sans-serif",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      border: "none",
    };
  }
  // shape / badge
  return {
    ...base,
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    color: colors.fg,
    fontFamily: "system-ui, sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.02em",
  };
}

export function DomRenderer({
  layout,
  onSelectElement,
  selectedElementId,
  showDebugOverlay,
}: DomRendererProps) {
  const { surface } = layout;

  return (
    <div
      className="dom-renderer-surface"
      style={{
        position: "relative",
        width: surface.width,
        height: surface.height,
        background: "#faf9f6",
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px rgba(28,28,30,0.08)",
      }}
      aria-label={`Resolved ad layout for ${surface.id}`}
    >
      {showDebugOverlay && (
        <div
          style={{
            position: "absolute",
            left: surface.safeArea.left,
            top: surface.safeArea.top,
            width: Math.max(0, surface.width - surface.safeArea.left - surface.safeArea.right),
            height: Math.max(0, surface.height - surface.safeArea.top - surface.safeArea.bottom),
            border: "1px dashed #b5502e",
            pointerEvents: "none",
          }}
          aria-hidden
        />
      )}

      {layout.elements
        .filter((el) => el.visible)
        .map((el) => {
          const isSelected = showDebugOverlay && selectedElementId === el.id;
          const style = elementStyle(el);
          const content =
            el.type === "image"
              ? el.alt ?? el.id
              : el.type === "shape"
                ? el.content ?? el.alt ?? el.id
                : el.content;

          const commonProps = {
            style: {
              ...style,
              outline: isSelected ? "2px solid #2f6fed" : showDebugOverlay ? "1px dashed rgba(28,28,30,0.35)" : undefined,
              outlineOffset: isSelected ? 1 : undefined,
              cursor: onSelectElement ? "pointer" : style.cursor,
            } as CSSProperties,
            onClick: onSelectElement ? () => onSelectElement(el.id) : undefined,
            "data-element-id": el.id,
            "data-priority": el.priority,
            "data-role": el.role,
          };

          if (el.type === "button") {
            return (
              <button key={el.id} {...commonProps} type="button" aria-label={el.alt ?? el.content ?? el.id}>
                {content}
              </button>
            );
          }
          if (el.type === "image") {
            return (
              <div key={el.id} {...commonProps} role="img" aria-label={el.alt ?? el.id}>
                {content}
              </div>
            );
          }
          if (el.type === "text") {
            return (
              <div key={el.id} {...commonProps}>
                {/*
                  Every text box is sized by the engine for exactly ONE line
                  at its resolved font size (see
                  constraints.normalizeElement's minFontSize *
                  lineHeightFactor) — the engine does not measure actual
                  glyph widths or simulate wrapping (a documented, scope
                  limitation; see README "Known limitations"). Letting this
                  wrap onto a second line would overflow a box that was
                  never sized to hold it, spilling into whatever sits below.
                  A block-level inner span with `nowrap` + `ellipsis` is the
                  reliable cross-browser way to guarantee single-line
                  truncation regardless of the outer flex container.
                */}
                <span
                  style={{
                    display: "block",
                    width: "100%",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {content}
                </span>
              </div>
            );
          }
          return (
            <div key={el.id} {...commonProps}>
              {content}
            </div>
          );
        })}
    </div>
  );
}
