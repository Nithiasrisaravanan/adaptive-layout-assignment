# Adaptive Layout Engine for Multi-Surface Ads

A constraint-based layout engine that takes **one declarative ad specification** and resolves it into the best feasible layout for whatever surface it is given — from a tall mobile interstitial to a wide broadcast lower-third, a square retail kiosk, or a surface the resolver has never seen before.

The same specification is resolved through the same TypeScript engine across every surface. There are **no per-surface layout branches** and no CSS media queries driving layout decisions.

**Architecture**

```text
AdSpec + SurfaceProfile
          │
          ▼
 Constraint Resolver
          │
          ▼
   ResolvedLayout
          │
          ▼
      Renderer
```

**[Live Demo →](https://adaptive-layout-assignment-nu.vercel.app/)**

---

## The Problem

Multi-surface advertising cannot reliably be implemented as a collection of hand-designed layouts.

A single advertisement may need to run on:

* a `320 × 480` mobile interstitial
* a `480 × 320` mobile landscape surface
* a `1920 × 250` broadcast lower-third
* a `1080 × 1080` retail kiosk
* an arbitrary surface introduced later

The content remains the same, but the composition cannot.

A naive implementation tends to become a collection of:

```ts
if (surface === "mobile") ...
if (surface === "broadcast") ...
if (surface === "kiosk") ...
```

or a collection of CSS breakpoints that select pre-designed layouts.

This project takes a different approach.

The layout engine reasons about:

* available geometry
* hard constraints
* soft preferences
* element priority
* element capabilities
* safe areas
* minimum text sizes
* minimum tap targets
* degradation cost
* collision-free placement

The result is a **generic constraint-resolution system**, rather than a collection of surface-specific layouts.

---

# Core Design Principle

The system separates **what the advertisement wants to communicate** from **where it needs to be rendered**.

```text
        Ad Specification
        "What should appear?"
                 │
                 │
                 ▼
        Surface Profile
        "What constraints exist?"
                 │
                 ▼
       Constraint Resolver
        "How can it fit?"
                 │
                 ▼
        Resolved Layout
        "Where does everything go?"
                 │
                 ▼
            Renderer
        "Draw the result"
```

The advertisement specification never contains final pixel coordinates.

The surface profile contains constraints rather than a pre-designed layout.

The resolver produces the coordinates.

The renderer only paints those coordinates.

---

# What's Actually in Here

### Framework-independent layout engine

The core engine under `src/engine/` is plain TypeScript and has no React dependency.

It handles:

* specification normalization
* constraint resolution
* geometry
* candidate placement
* scoring
* priority-based degradation
* layout validation
* diagnostics

### Strong TypeScript model

The system uses explicit types for:

* advertisement elements
* roles
* priorities
* capabilities
* surface profiles
* safe areas
* constraints
* resolved elements
* diagnostics
* degradation actions
* layout candidates

The TypeScript configuration is intentionally strict, including:

* `noUncheckedIndexedAccess`
* `noImplicitOverride`

and the implementation contains no `any`.

### Automated validation

The project includes **74 automated tests** covering:

* geometry primitives
* resolver behavior
* priority degradation
* geometric validation
* constraint handling
* deterministic resolution
* stress-test configurations

The stress suite includes extreme dimensions such as:

```text
180 × 180
200 × 300
250 × 900
300 × 400
320 × 480
400 × 200
900 × 180
1080 × 1080
1920 × 250
2000 × 120
```

### Interactive demo

The deployed application demonstrates:

* multiple surface profiles
* live layout resolution
* debug visualization
* element inspection
* resolution diagnostics
* decision traces
* constraint stress testing
* custom/unknown surfaces

**[Open the live demo →](https://adaptive-layout-assignment-nu.vercel.app/)**

---

# Supported Surfaces

The demo includes four required surface categories plus constrained/custom configurations.

| Surface               | Example dimensions | Typical composition            |
| --------------------- | -----------------: | ------------------------------ |
| Mobile Portrait       |        `320 × 480` | Vertical content flow          |
| Mobile Landscape      |        `480 × 320` | Horizontal/compact composition |
| Broadcast Lower Third |       `1920 × 250` | Wide horizontal composition    |
| Square Kiosk          |      `1080 × 1080` | Balanced square composition    |
| Custom / Stress       |       User-defined | Dynamically resolved           |

The important distinction is that these are **inputs to the resolver**, not separate layout implementations.

Adding a new surface should be a data change rather than a resolver change.

---

# How It Actually Works

The resolution pipeline is:

```text
AdSpec ─────────────────┐
                        │
                        ▼
              normalizeSpec()
                        │
                        ▼
              buildFlowItems()
                        │
                        ▼
                 determineAxis()
                        │
                        ▼
              resolveMainAxisFit()
                        │
                        ▼
              Candidate Placement
                        │
                        ▼
                Scoring / Ranking
                        │
                        ▼
               Degradation Pass
                        │
                        ▼
               Geometry Validation
                        │
                        ▼
                ResolvedLayout
                        │
                        ▼
                 DOM Renderer
```

The resolver is deliberately separated from rendering.

---

# 1. Specification Normalization

The engine first normalizes the advertisement specification.

Surface-level hard constraints such as:

* minimum tap target
* minimum readable text size
* safe-area restrictions

are incorporated into the effective constraints used during resolution.

This means the resolver does not need surface-specific knowledge such as:

```ts
if (surface === "kiosk") ...
```

Instead, it operates on normalized element constraints.

The resolver ultimately reasons about:

```text
size
priority
capabilities
available geometry
constraints
```

rather than surface names.

---

# 2. Flow Construction

Related elements can be grouped together.

For example:

```text
Headline
Price
Supporting text
```

can form a related content group.

The grouping allows the engine to reason about meaningful content units rather than treating every element as completely independent.

---

# 3. Axis Selection

The resolver determines an appropriate primary flow direction from the available content area's geometry.

The important point is that this decision is based on **layout constraints and geometry**, not on surface names.

The engine therefore does not need:

```ts
if (surface === "mobile")
    useColumn();

if (surface === "broadcast")
    useRow();
```

Instead, the same resolution logic receives different geometric constraints and responds accordingly.

---

# 4. Main-Axis Resolution

The engine resolves the primary flow using priority and available space.

When the available space becomes constrained, elements can undergo controlled degradation.

The degradation cascade is:

```text
SHRINK
   ↓
REPOSITION
   ↓
HIDE
```

The engine processes optional/lower-priority content before higher-priority content.

A required, non-hideable element cannot simply disappear because the surface is small.

---

# 5. Candidate Placement

After the main flow is established, remaining elements are placed using candidate regions and scoring.

Candidate placement considers:

* available space
* preferred alignment
* element dimensions
* aspect ratio
* existing elements
* grouping
* priority
* constraints

Candidates are evaluated rather than selecting a layout from a surface-specific lookup table.

---

# 6. Scoring

Candidate layouts are evaluated using a cost model.

Conceptually:

```text
layout cost =
    hard constraint violations
  + overlap penalties
  + clipping penalties
  + safe-area violations
  + priority loss
  + hiding cost
  + truncation cost
  + resizing cost
  + preference penalties
```

Hard constraint violations dominate softer preferences.

This means:

> "The CTA is slightly less aesthetically positioned"

is always preferable to:

> "The CTA violates its minimum tap target."

The exact scoring implementation is intentionally deterministic and explainable rather than attempting to implement a general-purpose mathematical optimization solver.

---

# Why a Priority-Ordered Heuristic?

A full linear-programming or general constraint solver could theoretically model the problem, but it would add substantial complexity for a relatively small number of advertisement elements.

This implementation instead uses a deterministic priority-ordered heuristic.

The resolver:

1. Establishes hard constraints.
2. Places higher-priority content first.
3. Generates candidate placements.
4. Evaluates candidates.
5. Applies the least-cost degradation available.
6. Validates the resulting geometry.
7. Reports explicit diagnostics if the constraints become infeasible.

This approach was chosen because the assignment prioritizes:

* correctness
* predictability
* explainability
* extensibility

over theoretical global optimality.

The trade-off is explicit: the resolver does not claim to find the mathematically optimal composition for every possible arrangement. It aims to find a **valid, explainable, low-cost composition efficiently**.

---

# Priority & Degradation

Elements have explicit priorities and capabilities.

For example:

| Element         | Priority | Typical behavior   |
| --------------- | -------: | ------------------ |
| Headline        |        1 | Preserve           |
| Product image   |        1 | Preserve           |
| CTA             |        2 | Preserve usability |
| Price           |        2 | Resize/reposition  |
| Logo            |        3 | Resize/hide        |
| Supporting text |        3 | Truncate/hide      |

When space becomes insufficient, lower-priority optional content gives up space before higher-priority content.

The engine can perform:

```text
SHRINK
REPOSITION
TRUNCATE
HIDE
```

depending on the element's capabilities.

Every degradation produces an explicit diagnostic.

Example:

```text
Logo
Priority: 3

Action: HIDE

Reason:
Insufficient space remained after satisfying the
headline, product image and CTA constraints.
```

This makes degradation predictable rather than arbitrary.

---

# Hard vs Soft Constraints

The resolver distinguishes between constraints that **must** be satisfied and preferences that can be sacrificed.

### Hard constraints

Examples:

* surface bounds
* safe area
* minimum tap target
* minimum text size
* required element visibility
* non-overlap

### Soft constraints

Examples:

* preferred size
* preferred alignment
* preferred position
* preferred aspect ratio

When these conflict, hard constraints always win.

If a combination of hard constraints is genuinely impossible, the engine should expose the infeasibility through diagnostics rather than silently returning an invalid layout.

---

# Geometry Validation

The resolver has an independent validation layer.

Before a layout is returned, it is checked for:

* element overlap
* clipping
* out-of-bounds elements
* safe-area violations
* invalid dimensions
* minimum tap-target violations
* minimum text-size violations

Conceptually:

```text
Resolved Layout
      │
      ▼
validateLayout()
      │
 ┌────┴────┐
 │         │
VALID    INVALID
 │         │
 ▼         ▼
Return    Repair /
Layout    Degrade /
          Diagnose
```

This acts as a safety net between the resolution algorithm and the renderer.

---

# Same Spec, Different Constraints

The same advertisement can naturally produce very different compositions.

For example:

### Mobile Portrait

```text
┌─────────────────┐
│     HEADLINE    │
│                 │
│    PRODUCT      │
│      IMAGE      │
│                 │
│      PRICE      │
│                 │
│    [ CTA ]      │
│                 │
│       LOGO      │
└─────────────────┘
```

### Broadcast Lower Third

```text
┌──────────────────────────────────────────────────────────┐
│ LOGO │ PRODUCT │ HEADLINE + PRICE │       [ CTA ]       │
└──────────────────────────────────────────────────────────┘
```

### Square Kiosk

```text
┌──────────────────────┐
│                      │
│      PRODUCT         │
│       IMAGE          │
│                      │
│       HEADLINE       │
│         PRICE        │
│                      │
│       [ CTA ]        │
│                      │
│         LOGO         │
└──────────────────────┘
```

These are **not separate layouts**.

They are outputs of the same resolver receiving different surface constraints.

That distinction is the core of the project.

---

# Why This Isn't Just Responsive CSS

CSS is responsible for rendering the layout.

It is not responsible for deciding the layout.

The important decisions happen before rendering:

```text
What should remain?
Where should it go?
How large should it be?
What should shrink?
What can move?
What can disappear?
```

Those decisions are made in plain TypeScript.

There are no surface-specific CSS media queries acting as the layout engine.

The DOM renderer receives a `ResolvedLayout` and paints it.

It does not decide:

* element position
* element size
* element visibility
* font size
* degradation
* priority

This also means another renderer could consume the same resolved output without changing the resolution algorithm.

---

# Debugging & Engineering Validation

The engine was not treated as correct simply because the demo looked correct.

Automated stress testing and manual inspection of the running application exposed several issues during development.

## 1. Hard minimum constraints were not always enforced

A preferred element size could initially fall below a surface's effective minimum constraint when no degradation path was triggered.

### Fix

Effective minimum constraints are normalized before resolution so the engine cannot treat an invalid preferred size as a valid resolved minimum.

---

## 2. Related text was forced into an inappropriate arrangement

A group containing headline, price and supporting content could remain side-by-side even when the available width made that composition unusable.

This was particularly problematic on narrow surfaces where vertical space was available but horizontal space was not.

### Fix

Axis selection now responds to the available content geometry rather than assuming one arrangement for every surface.

---

## 3. Multi-line text could exceed its resolved box

Long text could wrap onto an additional line even though the engine had only allocated space for the original text box.

### Fix

Text rendering uses single-line truncation with ellipsis rather than allowing uncontrolled wrapping beyond the resolved geometry.

---

These failures are documented further in `INTERVIEW.md` under **Failure cases found during development**.

---

# Interactive Demo

The demo is designed to expose the engine rather than hide it.

### Surface switching

Switch between the supported surfaces and observe the same specification being resolved differently.

### Debug mode

Displays:

* element boundaries
* priorities
* dimensions
* resolved positions

### Element inspection

Click an element to inspect its:

* position
* size
* font size
* priority
* capabilities
* degradation state
* resolution reason

### Decision trace

The resolver exposes the ordered sequence of decisions made during a resolution.

For example:

```text
✓ Created safe-area region
✓ Placed headline
✓ Placed product image
✓ Reserved CTA minimum size
✓ Placed price
⚠ Insufficient space for logo
→ Attempted resize
→ Attempted reposition
→ HIDE selected
✓ Final layout validated
```

### Stress testing

Surface parameters can be changed dynamically:

* width
* height
* safe-area padding
* minimum text size
* minimum tap target

The layout re-resolves immediately.

### Custom surfaces

A completely new surface can be entered manually.

The purpose is to demonstrate that the resolver does not depend on a predefined list of surface layouts.

**[Try the deployed application →](https://adaptive-layout-assignment-nu.vercel.app/)**

---

# Architecture

```text
                        ┌─────────────────────┐
                        │       AdSpec        │
                        │ intent + priority   │
                        └──────────┬──────────┘
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │ Surface Profile     │
                        │ constraints + size  │
                        └──────────┬──────────┘
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │  Constraint Engine  │
                        │    Plain TypeScript │
                        └──────────┬──────────┘
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │   ResolvedLayout    │
                        │ geometry + state    │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
             ┌─────────────┐              ┌─────────────┐
             │ DOM Renderer│              │Future Canvas│
             │             │              │   Renderer  │
             └─────────────┘              └─────────────┘
```

The key architectural boundary is:

> **The engine decides. The renderer paints.**

---

# Repository Structure

```text
adaptive-layout-assignment/
│
├── src/
│   ├── engine/
│   │   ├── types.ts
│   │   ├── spec.ts
│   │   ├── surfaces.ts
│   │   ├── constraints.ts
│   │   ├── geometry.ts
│   │   ├── candidates.ts
│   │   ├── scoring.ts
│   │   ├── degradation.ts
│   │   ├── resolver.ts
│   │   └── validation.ts
│   │
│   ├── renderers/
│   │   └── dom/
│   │
│   ├── demo/
│   │
│   ├── examples/
│   │
│   └── tests/
│
├── README.md
├── ARCHITECTURE.md
├── INTERVIEW.md
├── DEMO.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

# Testing

The test suite covers:

### Geometry

* rectangle intersection
* containment
* safe-area checks
* dimension calculations
* aspect-ratio behavior

### Resolver

* multiple surface profiles
* different aspect ratios
* deterministic resolution
* placement behavior

### Degradation

* shrinking
* repositioning
* truncation
* hiding
* priority ordering

### Validation

* overlap detection
* clipping detection
* safe-area violations
* minimum tap targets
* minimum text sizes

### Stress testing

Extreme and unusual surface configurations are included to catch failures that would not appear on the standard demo surfaces.

The goal is not merely to test individual functions.

The tests enforce **layout invariants**.

For a valid resolved layout:

```text
All visible elements are within bounds
        AND
No visible elements overlap
        AND
Hard constraints are satisfied
        AND
Required elements remain present
```

---

# Extensibility

The architecture is intentionally designed so that the resolver does not need to change when the system grows.

## New surface

Add a new `SurfaceProfile`.

No new resolver branch should be required.

## New renderer

Implement a renderer consuming `ResolvedLayout`.

The resolution engine remains unchanged.

## New constraint

Add the constraint to the normalized constraint model and resolution pipeline.

## New element type

Add the element's capabilities and rendering behavior without encoding a specific surface layout.

This keeps the system centered around **constraints and capabilities rather than surface identities**.

---

# Limitations

This project deliberately focuses on the layout-resolution problem rather than attempting to become a complete advertising platform.

Current limitations include:

* no real text-measurement-aware glyph layout
* text uses geometry-based sizing and single-line ellipsis truncation
* image and logo elements currently render as labeled placeholders
* no animated transition between surface resolutions
* groups are repositioned as units rather than allowing arbitrary member extraction
* the heuristic resolver does not guarantee a globally optimal composition
* no complete asset-management pipeline

These are deliberate scope boundaries rather than hidden behavior.

---

# Future Improvements

Potential extensions include:

* actual browser text measurement
* font-aware line breaking
* Canvas renderer
* animated layout transitions
* video elements
* richer constraint types
* print bleed constraints
* broadcast safe-zone constraints
* accessibility/contrast constraints
* more sophisticated candidate search
* learned or optimization-based scoring
* visual regression testing

---

# Running Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

---

# Engineering Trade-offs

The system intentionally avoids implementing a complete general-purpose constraint solver.

For a small advertisement containing a handful of elements, a deterministic priority-ordered heuristic provides a better balance between:

* correctness
* performance
* predictability
* explainability
* implementation complexity

A more sophisticated solver could potentially find better global arrangements, but it would also make the system harder to reason about and harder to explain during an engineering interview.

The chosen approach makes the degradation decisions visible and deterministic.

---

# AI Usage Disclosure

This project was developed with Claude (Anthropic) as a hands-on pair-programming tool.

Claude assisted with:

* initial implementation
* iterative code changes
* type checking
* linting
* test execution
* debugging

The implementation was then validated through the automated test suite and manual inspection of the running application.

Architectural decisions were made deliberately against the assignment requirements, including:

* separating the resolver from rendering
* normalizing surface constraints
* using a priority-ordered degradation strategy
* using geometry validation as an independent safety layer
* supporting arbitrary/custom surface profiles
* keeping the resolver framework-independent

The resulting architecture and trade-offs are documented in `ARCHITECTURE.md`.

The important principle is that AI assistance was used as an engineering tool; the final implementation, behavior, constraints, and architectural decisions remain something the author must be able to explain and defend.

---

# Documentation

Additional documentation:

* **`ARCHITECTURE.md`** — architecture, constraint model, resolution strategy, complexity and trade-offs
* **`INTERVIEW.md`** — likely technical interview questions and answers tied to the implementation
* **`DEMO.md`** — suggested 3–5 minute demonstration flow

---

# Time Spent

The project was developed as a focused engineering exercise:

1. domain modeling and type system
2. geometry primitives
3. constraint normalization
4. resolver pipeline
5. priority degradation
6. validation and stress testing
7. interactive demo
8. debugging and failure analysis
9. documentation
10. final engineering review

The emphasis was on building a **small, explainable, genuinely adaptive layout engine** rather than maximizing the number of features.

---

# Final Takeaway

This project treats multi-surface advertising as a **constraint-resolution problem**, not a responsive-design problem.

One specification goes in.

Different surface constraints go in.

The engine determines the composition.

The renderer simply draws the result.

```text
             ONE AD SPEC
                  │
                  ▼
       ┌────────────────────┐
       │ Constraint Resolver│
       └─────────┬──────────┘
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
    MOBILE   BROADCAST   KIOSK
       │         │         │
       ▼         ▼         ▼
   Different  Different  Different
   composition composition composition
```

The system is designed so that the next surface does not require the next `if` statement.

**[Live Demo →](https://adaptive-layout-assignment-nu.vercel.app/)**

