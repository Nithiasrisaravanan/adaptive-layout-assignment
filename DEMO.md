# Demo script (3-5 minutes)

Run `npm run dev` and open the printed local URL before starting.

## 1. Show the shared spec (30s)

Open `src/examples/productAd.ts`. One `AdSpec`: headline, hero product image,
price, supporting text, CTA, badge, logo — each with a priority, role,
size intent, and capabilities. Point out there's no x/y coordinate anywhere
in the file. This exact object is what every surface below resolves.

## 2. Mobile portrait (30s)

It's selected by default. Narrate the vertical composition: headline on top,
hero image below it, price/supporting text, CTA, logo. Toggle **Debug** on
(top right) to show the safe-area boundary and bounding boxes.

## 3. Switch to landscape (20s)

Click **Mobile Landscape** in the sidebar. Point out the composition
actually changed shape — it's not the same layout scaled down, elements have
re-flowed.

## 4. Switch to broadcast (30s)

Click **Broadcast Lower Third**. The flow axis flips to horizontal — this is
the content area's aspect ratio crossing the row/column threshold
(`resolver.ts`, `AXIS_THRESHOLD`), not a hardcoded "if broadcast" branch.
Note the headline and price now share a column (the `group: "copy"`
elements stack along the cross axis instead of the main axis).

## 5. Switch to kiosk (20s)

Click **Square Retail Kiosk**. Back to a vertical flow (square content area
falls under the axis threshold), but with much more generous sizing —
everything gets its full preferred size because there's abundant space.

## 6. Open the constrained strip (45s)

Click **Constrained Strip** — intentionally too small for everything at
preferred size. Point at the status bar: some elements are flagged
"degraded" or "hidden." Click the logo (with debug mode on) — the inspector
shows its `HIDE` degradation and the exact reason. Click the CTA — still
full tap-target size, never compromised.

## 7. Decision trace (30s)

In the inspector, switch to the **Decision trace** tab. Read through the
ordered log: which axis was chosen, what was shrunk, what was repositioned,
what was hidden, and why — in the actual order the algorithm made those
calls, not reconstructed after the fact.

## 8. Stress test (45s)

Click **Stress test** in the sidebar. Drag the width down to something like
`200 × 300`, then try `2000 × 120`. The layout re-resolves live on every
keystroke. Point out the status bar never shows an overlap or an unsafe tap
target, no matter how extreme the numbers get.

## 9. Custom / unknown surface (45s)

Click **Try custom surface**. Type in numbers that don't match any preset —
e.g. `173 × 641`, a large `minTapTarget`. Click **Resolve layout**. This is
the "give me a surface I've never told you about" moment: no code change,
same pipeline, valid output.

## 10. Tests and wrap-up (30s)

Run `npm test` in a terminal — 74 tests across geometry, resolver,
degradation, validation, and cross-surface invariants, including the full
stress matrix from the assignment brief. Close by pointing at
`ARCHITECTURE.md` §5 (the pipeline diagram) and reiterating: one spec, one
generic pipeline, structurally different output per surface, and every
decision traceable to a stated reason.
