import type { ResolvedLayout } from "../engine/types";

export interface DebugOverlayProps {
  layout: ResolvedLayout;
}

/**
 * Purely a visualization of the same `ResolvedLayout` the DomRenderer
 * draws — proof that debug tooling is just another consumer of the
 * engine's output, not a special code path baked into rendering.
 */
export function DebugOverlay({ layout }: DebugOverlayProps) {
  return (
    <>
      {layout.elements
        .filter((el) => el.visible)
        .map((el) => (
          <div
            key={el.id}
            className="debug-label"
            style={{ left: el.rect.x, top: Math.max(10, el.rect.y) }}
          >
            {el.id} p{el.priority} {Math.round(el.rect.width)}×{Math.round(el.rect.height)}
          </div>
        ))}
    </>
  );
}
