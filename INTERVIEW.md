# Interview preparation

Direct answers, each tied to a specific file/function so they can be
verified against the actual code rather than taken on faith.

### "Walk me through the architecture."

One AdSpec, one SurfaceProfile, in. A pipeline of pure functions in
`src/engine` — validate, normalize, group, choose an axis, run a
priority-ordered fit loop, place rects, validate again — produces a
`ResolvedLayout`: plain data, no React. `src/renderers/dom` paints that data
to the DOM and makes no layout decisions of its own. The demo app in
`src/demo` is a thin UI shell around `resolveLayout()` plus an inspector that
reads the same diagnostics the engine produced. See ARCHITECTURE.md §5 for
the exact pipeline and which file implements which stage.

### "Walk me through the resolver step by step."

See README, "Layout algorithm — step by step." In one sentence per stage:
fold hard constraints into effective minimums (`constraints.ts`), group
related elements (`constraints.buildFlowItems`), pick horizontal or vertical
flow from the content area's aspect ratio (`resolver.determineAxis`), decide
how much main-axis space each item gets via priority-ordered degradation
(`degradation.resolveMainAxisFit`), place bands sequentially, resolve each
item's cross-axis rect via a handful of scored candidates
(`candidates.ts`/`scoring.ts`), place anything that got pulled out of the
flow into leftover free space, then validate the whole thing independently
(`validation.ts`).

### "What is a hard constraint versus a soft constraint?"

Hard: surface bounds, safe area, minimum tap target, minimum text size,
non-overlap, presence of `required` elements — never traded away. Soft:
preferred size, preferred alignment, preferred aspect ratio — traded away
first, in priority order, when space runs out. The implementation trick:
hard size constraints are folded into each element's `effectiveMinWidth` /
`effectiveMinHeight` *before* the resolver runs (`constraints.normalizeElement`),
so the resolver's only job is "respect the effective minimum, prefer the
preferred size." See ARCHITECTURE.md §4.

### "Why does the logo disappear instead of the CTA?"

Two independent reasons that both point the same way. First, priority: the
logo is priority 3, the CTA is priority 2, and degradation always processes
lowest-priority-first (`degradation.resolveMainAxisFit`, sorted `priority
desc`). Second, even if priorities were reversed, the CTA is `required` with
`capabilities.hideable: false` (enforced to agree at spec-validation time —
you cannot construct a spec where those two disagree), so `isHideable()`
would return `false` for it regardless of processing order — it physically
cannot reach the `HIDE` branch. The logo has no such protection: it's
hideable and not required.

### "How do you guarantee there is no overlap?"

Two layers. Structurally: the main flow is placed by a single monotonically
advancing cursor along one axis (`resolver.ts`, the `cursor` loop) — each
band starts exactly where the previous one's allocated size ends, so bands
mathematically cannot overlap each other regardless of what values are in
them. Elements within a band are confined to that band by the candidate
generation in `candidates.ts` (clamped to the band's bounds). Repositioned
elements are placed only inside regions computed by
`geometry.availableRegions`, which by construction exclude every already-occupied
rect. On top of that: `validation.validateLayout` independently re-checks
every pair of visible elements for overlap, from the actual output rects, as
a safety net that doesn't trust the placement logic got it right — see
ARCHITECTURE.md §9 for the one documented exception (impossible constraints
can push an element past the surface edge; they cannot make two elements
overlap each other).

### "What happens if I give you a 173 × 641 surface you've never seen?"

Exactly what happens with any surface: `defineSurface({ width: 173, height:
641, ... })` builds a `SurfaceProfile`, `resolveLayout(productAd, surface)`
runs the same pipeline, and you get a valid layout back. This is tested
directly in `resolver.test.ts` ("unknown / custom surfaces") and is exactly
what the demo's "Try custom surface" panel does — type in numbers, click
Resolve, no code path is aware that this surface exists ahead of time.

### "Why isn't the resolver inside React?"

Because layout resolution is a pure data transformation
(`AdSpec + SurfaceProfile → ResolvedLayout`) with no reason to depend on a
rendering framework's lifecycle, hooks, or reconciliation. Keeping
`src/engine` React-free means it's unit-testable with plain Vitest (74 tests,
none of which touch React), reusable from a Canvas renderer or a server, and
— practically — it makes it structurally impossible to accidentally let a
component's render cycle influence a layout decision.

### "Why isn't this just responsive CSS?"

Because the *decision* of what goes where, what size, and what disappears is
made in TypeScript, from priorities and capabilities, before any CSS is ever
written. CSS in this project only paints a rect the resolver already
computed (`elementStyle` in `DomRenderer.tsx` sets `left/top/width/height`
from `el.rect`, nothing else). There are no `@media` breakpoints anywhere in
the codebase, and there's no per-surface CSS file — one surface produces a
1920px-wide layout and another produces a 320px-wide layout from the exact
same rendering code, because the difference lives entirely in the data
(`ResolvedLayout`) they were each given.

### "How would you add Canvas?"

Write `src/renderers/canvas/CanvasRenderer.ts` that accepts a
`RendererInput` (the same type `DomRenderer` accepts — see
`renderer-types.ts`) and, for each visible `ResolvedElement`, calls
`ctx.fillRect`/`ctx.strokeRect`/`ctx.fillText` using `el.rect`, `el.fontSize`,
etc., with a role-to-color mapping analogous to `DomRenderer`'s. Zero
changes to `src/engine`. The debug overlay
(`src/demo/DebugOverlay.tsx`) already demonstrates this pattern in miniature:
it's a second, independent consumer of the same `ResolvedLayout`.

### "How would you add video?"

Add `"video"` to the `ElementType` union in `types.ts`, then add one case to
`DomRenderer`'s `elementStyle`/JSX switch (probably a `<video>` tag sized to
`el.rect`, muted/looping by convention). The resolver needs **no changes** —
it already treats every element uniformly by size/priority/capability
regardless of `type`; type only matters for `text`/`interaction` constraint
folding (a video element would set neither) and for the renderer's paint
logic.

### "What is the complexity?"

`O(n log n + n·k)` for `n` elements and `k` already-placed elements at
reposition time — see ARCHITECTURE.md §13 for the full breakdown. In
practice, for the 5-10 element ads this problem targets, resolution runs in
well under a millisecond; `resolver.test.ts`'s determinism suite calls
`resolveLayout` twice per surface with no perceptible delay.

### "Why didn't you implement a full linear programming solver?"

The assignment's own FAQ says not to ("a well-reasoned priority-ordered
algorithm is sufficient and preferred over an over-engineered general
solver... we care more about correct, explainable behavior than mathematical
generality"). Beyond following that guidance: a general solver would make
"why did element X end up here" much harder to answer honestly in an
interview — the answer would be "the solver found this was optimal" rather
than "priority 3 elements degrade before priority 2, in this order, because
X." Explainability was treated as a first-class requirement, not an
afterthought bolted onto a black box.

### "What happens if the constraints are impossible?"

The resolver still returns a `ResolvedLayout` — it never throws for this
reason — but `layout.validation.valid` is `false`, and a `VIOLATION`
diagnostic explains, by element id and pixel count, exactly what's short.
This is directly testable:
`invariants.test.ts`, "when constraints are genuinely impossible, reports it
explicitly instead of silently corrupting the layout," constructs exactly
this scenario (a 180×180 surface with a 60px minimum tap target) and asserts
both that the violation is reported *and* that elements still never overlap
each other — the one guarantee that survives impossibility, because
sequential placement never requires an already-placed element to move. Two
real instances of this exact scenario were caught by the stress-test suite
during development (see "failure cases" below).

### "What would you build next?"

Real text measurement instead of a fixed line-height approximation, a second
renderer (Canvas) to make the "renderer separation" claim demonstrated
rather than only argued, and per-member (not just per-group) repositioning.
Full list in ARCHITECTURE.md §16.

---

## Failure cases found during development (and fixed)

Two real bugs were caught by the stress-test suite, not by manual
inspection — worth knowing in detail because they're good illustrations of
how the hard-constraint model is supposed to work when it's *not* wired up
correctly yet.

1. **Hard minimums weren't enforced when the preferred size was already
   below them.** The first draft initialized every flow item's main-axis
   size to its *preferred* size, and only compared against the effective
   minimum if degradation kicked in due to overflow. A button whose
   preferred height (48px) was smaller than the surface's `minTapTarget`
   (60px) rendered at 48px whenever there happened to be enough total space
   — because nothing ever forced it up to 60px if there was no overflow to
   trigger degradation. Fixed by initializing every allocation to
   `Math.max(preferred, effectiveMin)` from the start (`degradation.ts`
   and the analogous fix in `resolver.ts`'s group cross-axis logic) — hard
   constraints must hold *before* any degradation logic runs, not only
   after.

2. **Font size floor used the element's own minimum, ignoring the surface's
   larger minimum.** `fontSizeFromRect` clamped the resolved font size
   between the element's own `minFontSize` and its `preferredFontSize` — so
   on a broadcast surface with `minTextSize: 32`, a headline whose own
   preferred size was 28px rendered at 28px even though the surface requires
   32px minimum, because 28 already satisfied the (wrong, too-low) floor.
   Fixed by computing the *effective* floor as
   `Math.max(element.text.minFontSize, surface.minTextSize)` at the point
   font size is resolved, mirroring the same fold-in-the-hard-constraint
   principle used everywhere else in the engine.

Both were caught by `resolver.test.ts`'s per-surface compliance checks
("gives visible text elements a font size >= surface minimum," "gives
interactive elements a tap target >= surface minimum") — exactly the kind of
invariant test the assignment asks for, run automatically across every
required surface rather than eyeballed in the demo.

3. **Group members forced side-by-side regardless of whether that made
   sense for the surface's shape.** Found by actually running the demo and
   looking at mobile portrait, not by a test — the automated suite checked
   geometry validity but never asked "does this look like a reasonable
   composition." The `copy` group (headline + price + supporting text)
   originally always arranged its members along the flow's *cross* axis. On
   a wide broadcast surface (row flow, cross axis = vertical) that's exactly
   right: the three lines stack in one narrow column. On a narrow, tall
   mobile surface (column flow, cross axis = horizontal), the same rule
   forced three lines of text to squeeze side-by-side into ~296px of width
   — they couldn't, so two of the three were shrunk to nothing and hidden,
   even though 456px of unused vertical space sat right below the headline.
   The layout was still geometrically *valid* (no overlap, no clipping,
   passed every automated check) — it was just a bad, avoidable composition.
   Fixed by making a group's internal layout always stack top-to-bottom
   (`resolver.placeGroupMembers`), and changing how much of the outer main
   axis a group is allowed to claim depending on the flow's orientation
   (`degradation.mainPreferred`/`mainMin`): on a row flow the group is a
   narrow column sized to its widest member; on a column flow it's a
   full-width block sized to the *sum* of its members' heights, since
   they're now sequential lines rather than a single row. A second,
   related fix was needed in the same pass: a group's minimum footprint
   should only reserve space for members that truly can't be dropped
   (`required`, or not `hideable`) — a hideable, non-required member
   contributes `0` to that floor, so a group can still shrink all the way
   down to just its required member's minimum on a very small surface,
   rather than refusing to shrink below "all members present."
   This is a good illustration of why `INTERVIEW.md`'s "why isn't this a
   full solver" answer matters in practice: the bug wasn't a math error, it
   was a genuinely wrong *modeling* choice (which axis a group should stack
   along), and finding it required looking at an actual composition, not
   just checking invariants — automated geometry tests can prove a layout is
   *valid* without proving it's *good*.

4. **Long single-line text was allowed to wrap, overflowing a box sized for
   one line.** Also found by looking at the running demo. The headline's
   copy ("Built for the next 100 miles") is long enough that it visually
   wraps onto two lines at its resolved width — but the engine only ever
   reserves vertical space for one line (`effectiveMinHeight = minFontSize *
   lineHeightFactor`), because it doesn't measure real text width (see
   "Known limitations" — this is a deliberate scope boundary, not something
   the fix reverses). The renderer was allowing normal wrapping whenever the
   resolver's (width-based, not wrap-aware) truncation heuristic said
   `truncated: false`, so the second line spilled out of its box and
   visually collided with the element below — a real visual defect, even
   though every geometric invariant the test suite checks (the *box*
   doesn't overlap anything) still passed. Fixed by always rendering text as
   a single line with ellipsis overflow (`DomRenderer.tsx`), regardless of
   the resolver's truncation flag — since the box is never sized for more
   than one line, allowing wrap was the actually-unsafe path. This is the
   cleanest fix available without reversing the "no text-measurement"
   scope decision: it guarantees the renderer never draws outside a box the
   engine promised was big enough, at the cost of showing an ellipsis
   instead of a wrapped second line on very long copy.
