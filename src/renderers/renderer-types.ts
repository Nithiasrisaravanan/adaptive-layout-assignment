import type { ResolvedLayout } from "../engine/types";

/**
 * The contract a renderer consumes. Intentionally identical to the
 * engine's own `ResolvedLayout` — a renderer needs nothing more than pure
 * position/size/visibility data plus enough metadata (type, role, alt,
 * text content) to draw something on screen. Adding a Canvas renderer, a
 * React Native renderer, or a server-side SVG renderer means writing a new
 * module that consumes this same type; it never requires touching
 * `src/engine`.
 */
export type RendererInput = ResolvedLayout;
