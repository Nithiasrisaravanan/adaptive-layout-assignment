# Architecture

## 1. Design goals

- **One spec, many surfaces.** The same `AdSpec` must resolve into a valid,
  structurally different layout for any `SurfaceProfile`, including ones
  written after the resolver was.
- **Explainability over cleverness.** Every decision the resolver makes
  should be traceable to a stated reason (`LayoutDiagnostic`), not just an
  emergent property of a black-box optimizer.
- **Hard constraints are absolute.** Safe area, minimum tap target, minimum
  text size, non-overlap, and required-element presence are never traded
  away for a better-looking layout.
- **Deterministic.** Same spec + same surface → byte-identical output, always.

## 2. Non-goals

- **Not a general constraint solver.** There is no linear programming, no
  simulated annealing, no combinatorial search over whole-layout
  arrangements. The assignment's own FAQ discourages this ("we care more
  about correct, explainable behavior than mathematical generality"), and a
  general solver would make the "why did element X end up here" question
  much harder to answer in an interview.
- **Not pixel-perfect text layout.** No real glyph measurement, no text
  wrapping simulation. Font size and truncation are derived from box
  geometry using a fixed line-height factor.
- **Not an animation system.** Surface switches are instant. Animating
  between two independently-resolved layouts is a real, hard problem
  (matching up elements, interpolating a hidden element in/out) that's out
  of scope here.
- **Not a full design system.** The renderer applies minimal, functional
  styling by role — it is not trying to be a polished ad-creative tool.

## 3. Domain model

See `src/engine/types.ts` for the full type definitions. The key modeling
decision: **every constraint an element or surface can express is either a
size (min/preferred/max width/height), a priority, or a capability
(resizable/truncatable/hideable/repositionable).** Nothing else exists for
the resolver to reason about. This is deliberate — it's what makes "add a
new surface" or "add a new element" additive rather than a resolver change:
new surfaces and elements are just new *values* along the same finite set of
axes the resolver already understands.

Roles (`primary`, `hero`, `action`, `branding`, etc.) and element types
(`text`, `image`, `button`, `shape`) exist purely for the renderer's benefit
(what color, what shape, what a11y role) and for human readability of specs
and diagnostics. **The resolver never branches on role or type strings** —
only `element.text` / `element.interaction` being present or absent changes
resolver behavior (folding in `minTextSize` / `minTapTarget`), and that's a
structural check, not a name check.

## 4. Constraint model

**Hard constraints** (never violated, by promise — see §9 on what happens
when they're mathematically impossible to satisfy):

- Surface bounds (nothing renders outside `0,0 → width,height`)
- Safe area (nothing renders inside the safe-area margin)
- Minimum tap target (interactive elements)
- Minimum text size (text elements)
- Non-overlap between visible elements
- Presence of `required` elements

**Soft constraints** (satisfied on a best-effort basis, traded off first
under pressure):

- Preferred size
- Preferred alignment
- Preferred aspect ratio
- "Visual balance" (implemented as even gap distribution along the main axis
  and centered cross-axis alignment by default)

The mechanism that keeps these two categories from needing separate code
paths: `constraints.normalizeElement` **folds every hard size constraint
into `effectiveMinWidth`/`effectiveMinHeight`** before the resolver ever
runs. A button's minimum height becomes `max(its own minHeight,
surface.minTapTarget)`. A text element's minimum height becomes
`max(its own minHeight, max(its own minFontSize, surface.minTextSize) *
lineHeightFactor)`. From that point on, "hard constraint" and "soft
constraint" are just "effective minimum" and "preferred/maximum" — the same
two numbers every element has, handled by one code path.

## 5. Resolution pipeline

```
validateAdSpec
  → normalizeSpec (fold hard constraints into effective minimums)
  → buildFlowItems (group by position.group)
  → determineAxis (row/column from content-area aspect ratio)
  → resolveMainAxisFit (priority-ordered SHRINK → REPOSITION → HIDE)
  → place main flow (sequential bands, even gap distribution)
  → resolve cross-axis per item (candidates + scoring)
  → place repositioned items into leftover free space
  → validateLayout (independent safety net)
  → ResolvedLayout
```

Implemented across `spec.ts`, `constraints.ts`, `resolver.ts`,
`degradation.ts`, `candidates.ts`, `scoring.ts`, `validation.ts` — each file
maps to one stage above.

## 6. Candidate generation

For a single element being placed within an already-allocated "band" (a rect
spanning the full cross-axis extent at some main-axis position),
`candidates.generateAlignmentCandidates` produces one candidate rect per
alignment option (`start`/`center`/`end`), each sized as close to the
element's preferred size as the band and its own min/max/aspect-ratio allow.

For an element pulled out of the main flow (`REPOSITION`),
`candidates.generateFreeRegionCandidates` produces one candidate per leftover
free region large enough to hold it (computed via
`geometry.availableRegions`), sized the same way.

Candidates are **cheap and few** (3 alignment options, or one per free
region — never more than a handful) by design; see §13, complexity.

## 7. Scoring function

```
score =
    overlapPenalty        (huge, should be structurally impossible — safety net)
  + safeAreaPenalty        (huge, same)
  + sizeLossPenalty        (0-100, proportional to area lost vs. preferred)
  + aspectRatioPenalty     (proportional to deviation from preferred ratio)
  + alignmentPenalty       (small flat penalty if not the declared preference)
```

Lower is better; the candidate with the lowest score is chosen, ties broken
by generation order (deterministic). This is a **deterministic heuristic**,
not a proof of global optimality — it exists to pick among a handful of
candidates for one element at a time, never to search whole-layout
arrangements. Hard-constraint terms (`overlapPenalty`, `safeAreaPenalty`) are
weighted at `1,000,000` specifically so they can never be outweighed by any
combination of soft-constraint terms, even though in practice they should
always score `0` given how bands are constructed (defense in depth, not the
primary correctness mechanism — that's §5's sequential, non-overlapping band
placement).

## 8. Priority / degradation system

See README "How priority/degradation is decided" for the mechanics. The
architectural point worth calling out here: **degradation operates on the
main-axis allocation, not directly on rects.** `resolveMainAxisFit` decides,
in the abstract, how many pixels each flow item gets along the main axis (or
whether it's hidden/repositioned) — only after that's settled does the
resolver compute actual rects. This separation means the degradation
algorithm never has to reason about x/y coordinates, alignment, or groups'
internal structure; it only ever reasons about one number per item (its
main-axis budget) and three actions.

`TRUNCATE` is the one action that isn't part of this loop — it's decided
during cross-axis sizing, per element, because narrowing an element's width
(in a column-flow layout) doesn't change how much *height* budget the main
loop needs to hand out.

## 9. Geometry validation

`validation.validateLayout` is a complete, independent re-derivation of every
hard-constraint check, run once at the end of resolution on the actual
output rects — not on the resolver's own bookkeeping. It does not trust that
the pipeline got it right; if the pipeline has a bug, this is what catches
it (and did, twice, during development — see `INTERVIEW.md`, "failure
cases").

**What happens when hard constraints are mathematically impossible to
satisfy simultaneously** — e.g., a surface's `minTapTarget` is 250px on a
320px-wide phone, and there are three required elements that each need a
hard minimum: `resolveMainAxisFit` still runs to completion (there's no
special "give up" path), degrading everything degradable, and the resolver
returns whatever geometry results — but `validateLayout` will report the
resulting violations, `ResolvedLayout.validation.valid` will be `false`, and
a `VIOLATION`-type diagnostic explains, by name, which elements and how many
pixels are short. **The one guarantee that holds even in this case:
elements never overlap**, because sequential main-axis placement (§5) never
requires backtracking over already-placed content — an over-budget item
simply extends past the surface edge rather than into a sibling. This is a
deliberate design choice: an honestly-flagged, out-of-bounds layout is
recoverable (the caller can react to `validation.valid === false`); a
silently-corrupted one is not.

## 10. Determinism

Every sort in the codebase (`buildFlowItems`, the main-axis degradation
order, cross-axis member ordering) uses the same explicit tie-break chain:
**priority → declared `position.order` → element id (lexicographic)**. There
is no use of object iteration order, `Math.random`, `Date.now()`, or any
other non-deterministic input anywhere in `src/engine`. `resolver.test.ts`
asserts byte-identical JSON output across repeated resolutions of the same
input for every required surface.

## 11. Renderer architecture

`ResolvedLayout` (surface + `ResolvedElement[]` + diagnostics + validation)
is plain data — numbers, strings, booleans, arrays. `src/renderers/dom`
consumes it and makes exactly one kind of decision: **how to paint a given
rect for a given element type** (color, border, whether it's a `<button>` or
a `<div role="img">`). It never decides where an element goes, how big it
is, whether it's visible, or what font size to use — all of that already
exists on the `ResolvedElement` it's given.

A Canvas renderer would import nothing from `src/renderers/dom` and nothing
new from `src/engine` — it would take a `RendererInput` (identical type) and
call `ctx.fillRect`/`ctx.fillText` instead of setting CSS. The debug overlay
(`src/demo/DebugOverlay.tsx`) is, deliberately, built as a second, completely
independent consumer of the same `ResolvedLayout` — proof that "another
renderer" doesn't require resolver changes, demonstrated by an artifact that
already exists in this repo rather than only argued for in prose.

## 12. Extensibility

- **New surface**: call `defineSurface({...})` with new numbers. Nothing in
  `src/engine` changes. This is demonstrated live by the "Try custom
  surface" panel in the demo, and by `resolver.test.ts`'s
  "unknown / custom surfaces" suite.
- **New element type**: add a case to the renderer's `elementStyle` switch
  (how to paint it). The resolver needs no changes — it already treats
  every element uniformly by size/priority/capability, regardless of `type`.
- **New constraint**: add a field to `SurfaceProfile` and/or the element's
  constraint objects, then fold it into `effectiveMinWidth/Height` (or a new
  effective-* field) in `constraints.normalizeElement`. This is the same
  mechanism `minTapTarget` and `minTextSize` already use — e.g., a
  broadcast-safe-title-area or print-bleed constraint would be one new field
  plus one new line in `normalizeElement`, not a resolver rewrite.
- **New renderer**: implement anything that consumes `RendererInput` (see
  §11).

## 13. Complexity

For an ad with `n` elements: `normalizeSpec` and `buildFlowItems` are
`O(n log n)` (sorting). `resolveMainAxisFit`'s degradation loop is bounded by
`O(n)` outer iterations (one pass through the priority-ordered list), each
doing `O(1)` work per action — worst case `O(n)`. Cross-axis candidate
generation and scoring is `O(1)` per element (a fixed 3 candidates) or
`O(f)` per repositioned element where `f` is the number of free regions,
which itself is bounded by `O(k)` where `k` is the number of already-placed
elements (each placement can add at most a constant number of new free
sub-regions via the guillotine split in `availableRegions`). Overall:
**`O(n log n + n·k)`**, dominated in practice by sorting for the ad sizes
(5-10 elements) this problem targets. There is no exponential blow-up
anywhere — deliberately, per the assignment FAQ's preference for a
well-reasoned greedy algorithm over an over-engineered general solver.

## 14. Trade-offs

- **Sequential greedy over global search.** A layout that considers all
  elements jointly might occasionally find a more visually balanced
  arrangement than one that processes lowest-priority-first, one action at a
  time. We chose predictability and explainability instead: every degraded
  element has one clear, stateable reason.
- **Conservative occupied-region tracking for reposition.** Free-region
  search treats a placed standalone element's full main-axis band (not just
  its trimmed rect) as occupied, to guarantee reposition candidates can
  never overlap main-flow content without needing a second overlap check.
  This sacrifices some packing tightness for a simpler, more obviously
  correct implementation.
- **Continuous axis threshold, not a lookup table.** `AXIS_THRESHOLD = 1.15`
  is one tunable number. It would be easy to imagine a more sophisticated
  "compute the flow axis from a small cost function over both choices"
  approach; we chose the simplest rule that produces genuinely different
  compositions across the required surfaces and is trivial to explain.
- **Stretch-to-fill for group members.** Every member of a group is
  stretched to the group band's full main-axis size rather than being
  individually sized and centered within it. Simpler to implement and
  reason about; occasionally means a short price label is exactly as tall
  as a headline sharing its column.

## 15. Failure modes

| Situation | Behavior |
|---|---|
| Two elements' combined hard minimums exceed the available space | Resolver still returns a layout; `validation.valid = false`; a `VIOLATION` diagnostic names the elements and the pixel shortfall. Never overlaps, never silently drops geometry. |
| A malformed spec (duplicate ids, required+hideable both true) | Throws `AdSpecValidationError` at `defineAd()`/`validateAdSpec()` time — before any surface is even considered. |
| A surface with zero-area content (safe area consumes the whole surface) | `safeAreaInterior` floors dimensions at 0; degradation runs against a 0px budget, hiding everything hideable; required elements still render at their effective minimum, likely producing `OUT_OF_BOUNDS`/`SAFE_AREA` violations that are honestly reported. |
| An element with a `maxWidth`/`maxHeight` smaller than its `minWidth`/`minHeight` | Rejected at spec-validation time. |

## 16. Future improvements

- Real text measurement (canvas `measureText` or a headless layout pass) to
  replace the fixed line-height-factor approximation.
- Per-member repositioning within a group, not just whole-group.
- A cost-function-based axis choice that considers element preferences, not
  just content-area aspect ratio.
- A Canvas renderer, to prove out §11's claim with a second real
  implementation rather than only the debug overlay.
- Snapshot-based visual regression tests (rendering each required surface to
  a fixed-size PNG and diffing) as a complement to the geometric invariant
  tests.
