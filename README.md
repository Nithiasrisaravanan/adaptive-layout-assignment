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
