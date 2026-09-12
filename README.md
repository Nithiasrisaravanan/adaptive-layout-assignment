# Adaptive Layout Engine for Multi-Surface Ads

A constraint-based layout engine that takes **one** declarative ad specification
and resolves it into a valid, meaningfully different layout for whatever
surface it's given — a tall mobile interstitial, a wide broadcast lower-third,
a square kiosk screen, or a surface the resolver has never seen before —
without a single `if (surface === "...")` branch anywhere in the codebase.

```
AdSpec + SurfaceProfile → Constraint Resolver → ResolvedLayout → Renderer
```

## Setup

```bash
npm install
npm run dev       # demo at http://localhost:5173
npm test          # 74 tests across geometry, resolver, degradation, validation, invariants
npm run lint
npm run build     # type-checks + production bundle
```

## Running the demo

Open the dev server and use the left sidebar to switch between the five
required surfaces (mobile portrait, mobile landscape, broadcast lower-third,
square kiosk, and an intentionally constrained strip). Every surface re-runs
`resolveLayout(productAd, surface)` on the exact same `AdSpec` — nothing about
the spec changes.

- **Debug toggle** (top right) draws the safe-area boundary and a bounding-box
  label over every element.
- **Click any element** on the canvas (with debug on) to open its full
  resolved state in the right-hand inspector: position, size, font size,
  capabilities, and — if it was degraded — exactly which action was taken and
  why.
- **Decision trace** tab in the inspector shows the full, ordered log of what
  the resolver did for the current surface: which axis it chose, what it
  shrank, repositioned, or hid, and why.
- **Stress test** panel lets you drag width/height/safe-area/min-text/min-tap
  to any value and watch the layout re-resolve live, including every extreme
  combination listed in the assignment brief.
- **Try custom surface** is the "unknown surface introduced live in the
  interview" scenario: type in numbers the resolver has never seen, hit
  **Resolve layout**, and get a valid, degraded-if-necessary composition with
  zero code changes.

## Known limitations

- No text-measurement-aware wrapping — font size and truncation are decided
  from box geometry and a fixed line-height factor, not actual glyph metrics.
  Every text element renders as a single line with an ellipsis if it doesn't
  fit, rather than wrapping — the engine only ever sizes a text box for one
  line, so allowing a second line to render would overflow into whatever's
  below it. A long headline on a narrow surface may show as truncated text
  rather than wrapping onto two lines.
- No animated transition between surfaces (an explicit non-goal — see
  ARCHITECTURE.md).
- The element type set is fixed at `text | image | button | shape`. Adding a
  new type (e.g. video) is a renderer change, not a resolver change (see
  "Extensibility" below), but it hasn't been implemented.
- The free-space search for `REPOSITION` treats the full main-axis band of
  every placed element as occupied, not just its trimmed rect. This is
  intentionally conservative (guarantees no accidental overlap) at some cost
  to packing tightness — see ARCHITECTURE.md, "Trade-offs."
- Groups (elements sharing `position.group`) can only be repositioned as a
  whole today — individual group members are never pulled out to free space.

## Time spent

Roughly one focused work session, structured as: domain modeling and
geometry primitives first, then the resolver pipeline (built and debugged
against the automated test suite rather than the UI), then the demo
application, then documentation. The stress-test suite caught two real bugs
in the first draft — both are described in `INTERVIEW.md` under "failure
cases" because they're good illustrations of how the hard-constraint model
is supposed to work.

## AI usage disclosure

This project was built with Claude (Anthropic) as a hands-on pair programmer:
Claude wrote the initial implementation of every file, then iteratively
type-checked (`tsc`), linted (`eslint`), and ran the Vitest suite after each
change, fixing real bugs the tests surfaced (see `INTERVIEW.md`, "failure
cases," for two concrete examples where a hard constraint wasn't actually
being enforced until a stress test caught it). Architectural decisions —
folding surface constraints into per-element effective minimums, choosing a
priority-ordered greedy resolver over a general solver, the axis-selection
rule, the group/cross-axis model — were made deliberately to satisfy the
assignment's explicit evaluation criteria and are explained in
`ARCHITECTURE.md`. All code in the repository was reviewed for correctness
against the automated test suite; every test that would have needed to be
weakened to pass was instead treated as a signal to fix the engine.

---

## Layout algorithm

### Step by step

1. **Validate the spec** (`spec.ts`). Catches structurally invalid specs at
   construction time (duplicate ids, a `required` element that's also
   `hideable`, a button with no interaction constraints, etc.).
2. **Compute the safe content area** (`geometry.safeAreaInterior`) — the
   surface's bounds minus its safe-area margin.
3. **Normalize constraints** (`constraints.normalizeSpec`). This is the key
   step that keeps the resolver itself generic: every *hard* surface
   constraint (`minTapTarget` for interactive elements, `minTextSize` for
   text elements) is folded into an `effectiveMinWidth`/`effectiveMinHeight`
   on the element. From this point on, the resolver never has to ask "is
   this interactive?" or "is this text?" — it only ever reasons about
   min/preferred/max size and priority.
4. **Group elements** (`constraints.buildFlowItems`). Elements that share a
   `position.group` id are combined into one composite "flow item," so
   related content (e.g. a headline and its price) can be placed and
   degraded as a unit.
5. **Choose the main axis** (`resolver.determineAxis`). If the content
   area's aspect ratio is ≥ 1.15 the main axis is horizontal ("row"); if it's
   a tall rectangle, vertical ("column"). This is the **only** place a
   surface's shape influences the algorithm, and it's a continuous function
   of geometry — never a check against a surface's name or id.
6. **Run the priority-ordered fit loop** (`degradation.resolveMainAxisFit`).
   Every item starts at its preferred main-axis size (or its effective
   minimum, whichever is larger — hard constraints always win). If the total
   exceeds the available space, items are processed from **lowest priority
   to highest**, each one trying, in order: `SHRINK` toward its minimum,
   `REPOSITION` out of the main flow (to be placed in leftover space later),
   then `HIDE` (only if not `required`). The loop stops the moment the total
   fits.
7. **Place the main flow.** Visible, non-repositioned items are laid out
   sequentially along the main axis with even gap distribution, in their
   declared `position.order` — independent of the priority that governed
   step 6.
8. **Resolve cross-axis placement per item** (`candidates.ts` +
   `scoring.ts`). For a standalone element, three alignment candidates
   (start/center/end) are generated and scored; for a group, members are
   arranged sequentially along the cross axis with their own small
   shrink/hide pass if they don't fit.
9. **Place repositioned elements** into the largest leftover free region
   (`geometry.availableRegions`), or hide them if nothing fits.
10. **Compute font size and truncation** from final box geometry, never
    from the element's own preferred/min values in isolation — the surface's
    `minTextSize` always wins if it's larger than the element's own minimum.
11. **Validate** (`validation.validateLayout`) — a full, independent
    safety-net pass over the geometry the previous nine steps produced,
    checking overlap, out-of-bounds, safe-area intrusion, tap targets, text
    size, and dimension sanity.

### How priority/degradation is decided

Priority is a number, 1 (must survive) to 5 (first to go). When space runs
out, the resolver processes elements **from the least important upward**,
applying the cheapest available action first:

```
SHRINK → REPOSITION → HIDE
```

An element only reaches `HIDE` if it's not `required` and its
`capabilities.hideable` is `true` (the two are enforced to agree at spec
validation time). `TRUNCATE` is handled separately, during cross-axis sizing,
because narrowing text doesn't free up main-axis space the way shrinking or
hiding does.

This is why, in the shipped ad spec, the **logo** disappears before the
**CTA** ever does: the CTA is `required`, non-hideable, and its effective
minimum size is pinned to the surface's `minTapTarget` (a hard floor) — while
the logo is priority 3, hideable, and has no hard floor beyond a small
minimum size.

## TypeScript design

- `AdElement.size`, `.position`, `.capabilities` are all required, fully-typed
  objects — there is no valid way to construct an element with an undefined
  role or a size constraint missing a required field; `spec.ts`'s
  `defineAd()` fills sane defaults for the ergonomic subset and the compiler
  enforces the rest.
- `SurfaceProfile` has no optional core fields once built by `defineSurface()`
  — partial input is allowed, but the output type the resolver consumes is
  fully populated.
- `NormalizedElement` (an `AdElement` plus `effectiveMinWidth/Height`) is a
  distinct type from `AdElement`, so it's a compile error to accidentally
  pass a raw, un-normalized element into resolution logic that expects
  effective minimums.
- `ResolvedElement`/`ResolvedLayout` — the renderer contract — contain only
  primitive/plain data (numbers, strings, booleans, arrays of the same). No
  React types leak into `src/engine`, and no engine types are React-specific.
- Strict compiler settings are on: `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noUnusedLocals/Parameters`, and `no-explicit-any` is
  an ESLint error, not a warning.

## Resolution flow

```
AdSpec ──┐
         ├─► normalizeSpec (fold hard constraints into effective minimums)
SurfaceProfile ─┘
         │
         ▼
   buildFlowItems (group elements sharing position.group)
         │
         ▼
   determineAxis (row vs column, from content-area aspect ratio)
         │
         ▼
   resolveMainAxisFit (priority-ordered SHRINK → REPOSITION → HIDE)
         │
         ▼
   place main flow + group cross-axis sub-layout (candidates + scoring)
         │
         ▼
   place repositioned elements into leftover free space
         │
         ▼
   validateLayout (independent geometry safety net)
         │
         ▼
      ResolvedLayout ──► DomRenderer (pure paint, zero layout decisions)
```

See `ARCHITECTURE.md` for the full design rationale, complexity discussion,
and extensibility story; see `INTERVIEW.md` for direct answers to the
questions this assignment says to expect live; see `DEMO.md` for a suggested
walkthrough script.
