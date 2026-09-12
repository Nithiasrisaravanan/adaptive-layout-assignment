# Adaptive Layout Engine for Multi-Surface Ads

A constraint-based layout engine that takes **one** declarative ad specification
and resolves it into a valid, meaningfully different layout for whatever
surface it's given — a tall mobile interstitial, a wide broadcast lower-third,
a square kiosk screen, or a surface the resolver has never seen before —
without a single `if (surface === "...")` branch anywhere in the codebase.

```
AdSpec + SurfaceProfile → Constraint Resolver → ResolvedLayout → Renderer
```

**[Live demo →](https://adaptive-layout-assignment-nu.vercel.app/)**

---

## The problem this solves

Multi-surface advertising can't be a set of hand-drawn layouts per placement. A headline, hero image, price, CTA, and logo need to recompose intelligently — not just scale — across a 320×480 phone screen, a 1920×250 broadcast strip, and a 1080×1080 kiosk. The naive solution is a pile of `if (surface === "mobile")` branches or CSS media queries. This project is the alternative: a genuine constraint-resolution algorithm that reasons about **priority, available geometry, and degradation cost** — the same code path, every surface, every time.

## What's actually in here

- **A framework-independent resolver** (`src/engine/`) — plain TypeScript, zero React imports, fully unit-testable in isolation.
- **74 automated tests** across geometry primitives, the resolver, priority degradation, geometric validation, and a full stress-test matrix (including every extreme dimension pair from the brief: `180×180`, `2000×120`, `1920×250`, etc.).
- **A working demo** with 5 surfaces, live stress-testing, a "never-seen-before custom surface" panel, a click-to-inspect element detail view, and a full decision trace of every resolution the engine ran.
- **Strict TypeScript** (`noUncheckedIndexedAccess`, `noImplicitOverride`, zero `any`), clean ESLint pass, clean production build.

## Setup

```bash
npm install
npm run dev       # demo at http://localhost:5173
npm test          # 74 tests
npm run lint
npm run build
```

## Try it live

Open the [deployed demo](https://adaptive-layout-assignment-nu.vercel.app/) and:

- Switch between the 5 surfaces in the sidebar — the **same** `AdSpec` re-resolves into a genuinely different composition each time, not a scaled copy.
- Toggle **Debug** (top right) to see bounding boxes, priorities, and resolved dimensions on every element.
- Click any element to open its full resolved state — position, size, font size, capabilities, and (if it was degraded) exactly which action was taken and why.
- Open **Decision trace** in the inspector to see the ordered log of every choice the resolver made for the current surface.
- Use **Stress test** to drag width/height/safe-area/min-text/min-tap to any value and watch it re-resolve live.
- Use **Try custom surface** to type in numbers the resolver has never seen, hit *Resolve layout*, and get a valid, gracefully-degraded composition — with zero code changes.

---

## How it actually works
AdSpec ──┐
├─► normalizeSpec (fold every hard constraint into effective minimums)
SurfaceProfile ─┘
│
▼
buildFlowItems (group related elements, e.g. headline + price)
│
▼
determineAxis (row vs column — from the content area's aspect ratio, not the surface's name)
│
▼
resolveMainAxisFit (priority-ordered SHRINK → REPOSITION → HIDE)
│
▼
place main flow + per-item cross-axis resolution (candidates + scoring)
│
▼
place repositioned elements into leftover free space
│
▼
validateLayout (independent geometry safety net — overlap, bounds, safe area, tap targets, text size)
│
▼
ResolvedLayout ──► DomRenderer (pure paint, zero layout decisions)


**The key idea that keeps the resolver generic:** every hard constraint a surface imposes — minimum tap target, minimum legible text size — gets folded into each element's own effective minimum size *before* resolution starts (`constraints.ts`). From that point on, the resolver never asks "is this a button?" or "is this on a broadcast surface?" — it only ever reasons about size, priority, and capability. That's what makes adding a brand-new surface a **data change**, not a resolver change.

**Priority and degradation**, when space runs out, is a strict cascade:

SHRINK → REPOSITION → HIDE


processed from *lowest* priority to *highest*. A `required`, non-hideable element (like the CTA) simply cannot reach `HIDE`, no matter what — its effective minimum is pinned to the surface's tap-target floor and it degrades no further than that.

## Why this isn't just responsive CSS

Every layout decision — what goes where, what size, what disappears — is made in plain TypeScript **before** any pixel is drawn. There are no media queries anywhere in this codebase. The DOM renderer (`src/renderers/dom`) does exactly one thing: paint the rect it's handed. It never decides position, size, visibility, or font size — all of that already exists on the resolved data by the time the renderer sees it. A Canvas renderer could consume the exact same output type and require zero engine changes.

## The debugging story (honestly documented)

Three real bugs were found and fixed during development — not by inspection, but by the automated stress-test suite and by actually looking at the running demo:

1. **Hard constraints weren't enforced when the preferred size was already below them.** A button's preferred height could render smaller than the surface's required tap target if nothing ever triggered the degradation path that would have caught it.
2. **A group of related text elements (headline + price + supporting copy) was forced to sit side-by-side, regardless of whether that made sense for the surface's shape.** Correct for a wide broadcast strip; on a narrow phone screen it squeezed two of the three lines out of existence, even with plenty of unused vertical space sitting right below them.
3. **Long text was allowed to wrap onto a second line, overflowing a box the engine only ever sized for one.** Fixed by always rendering a single line with ellipsis truncation instead.

All three are written up in detail — root cause, fix, and reasoning — in `INTERVIEW.md` under "Failure cases found during development." Full documentation set:

- **`ARCHITECTURE.md`** — design goals, non-goals, constraint model, complexity analysis, trade-offs, failure modes.
- **`INTERVIEW.md`** — direct answers to the questions this assignment says to expect live, each tied to the actual code.
- **`DEMO.md`** — a suggested 3–5 minute walkthrough script.

## Known limitations

- No text-measurement-aware wrapping — font size and truncation are decided from box geometry, not real glyph metrics. Long text truncates with an ellipsis rather than wrapping.
- Image and logo elements render as labeled placeholder boxes (alt text + resolved dimensions), not real photography — this project is a layout algorithm, not an asset pipeline, and the placeholder is more useful to a reviewer than a real photo would be (it shows exactly what the resolver decided).
- No animated transition between surfaces.
- Groups can only be repositioned as a whole; individual members can't be pulled out to free space independently.

## AI usage disclosure

This project was built with Claude (Anthropic) as a hands-on pair programmer: it wrote the initial implementation of every file, then iteratively type-checked, linted, and ran the test suite after each change — fixing the three real bugs listed above when the suite (and, in one case, manual inspection of the running demo) surfaced them. Architectural decisions — folding surface constraints into effective minimums, choosing a priority-ordered greedy resolver over a general solver, the axis-selection rule, the group-stacking model — were made deliberately against the assignment's stated evaluation criteria and are explained in full in `ARCHITECTURE.md`.

## Time spent

One focused build session: domain modeling and geometry primitives first, then the resolver pipeline (built and debugged against the automated test suite), then the demo application, then documentation — followed by a second pass fixing the three issues above after actually running and looking at the demo.


