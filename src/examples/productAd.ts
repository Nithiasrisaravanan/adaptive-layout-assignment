import { defineAd } from "../engine/spec";
import type { AdSpec } from "../engine/types";

/**
 * One ad. Every surface in the demo resolves THIS spec — nothing about it
 * changes between mobile, broadcast, kiosk, or a custom surface entered
 * live. Only the SurfaceProfile changes.
 */
export const productAd: AdSpec = defineAd({
  id: "trail-runner-ad",
  elements: [
    {
      id: "headline",
      type: "text",
      role: "primary",
      priority: 1,
      required: true,
      size: {
        preferredWidth: 260,
        preferredHeight: 56,
        minWidth: 100,
        minHeight: 24,
      },
      position: { alignMain: "start", alignCross: "start", group: "copy", order: 0 },
      capabilities: { resizable: true, truncatable: true, hideable: false, repositionable: false },
      text: {
        content: "Built for the next 100 miles",
        preferredFontSize: 28,
        minFontSize: 14,
        lineHeightFactor: 1.25,
      },
    },
    {
      id: "product-image",
      type: "image",
      role: "hero",
      priority: 1,
      required: true,
      size: {
        preferredWidth: 320,
        preferredHeight: 320,
        minWidth: 96,
        minHeight: 96,
        preferredAspectRatio: 1,
      },
      position: { alignMain: "start", alignCross: "center", order: 1 },
      capabilities: { resizable: true, truncatable: false, hideable: false, repositionable: false },
      alt: "Trail running shoe, three-quarter view",
    },
    {
      id: "price",
      type: "text",
      role: "secondary",
      priority: 2,
      size: {
        preferredWidth: 140,
        preferredHeight: 40,
        minWidth: 60,
        minHeight: 20,
      },
      position: { alignMain: "start", alignCross: "start", group: "copy", order: 2 },
      capabilities: { resizable: true, truncatable: true, hideable: true, repositionable: true },
      text: {
        content: "$129",
        preferredFontSize: 22,
        minFontSize: 13,
        lineHeightFactor: 1.2,
      },
    },
    {
      id: "supporting-text",
      type: "text",
      role: "supporting",
      priority: 3,
      size: {
        preferredWidth: 260,
        preferredHeight: 44,
        minWidth: 80,
        minHeight: 18,
      },
      position: { alignMain: "start", alignCross: "start", group: "copy", order: 3 },
      capabilities: { resizable: true, truncatable: true, hideable: true, repositionable: true },
      text: {
        content: "Breathable mesh. Zero-drop platform. Free returns for 30 days.",
        preferredFontSize: 15,
        minFontSize: 11,
        lineHeightFactor: 1.3,
      },
    },
    {
      id: "cta",
      type: "button",
      role: "action",
      priority: 2,
      required: true,
      size: {
        preferredWidth: 160,
        preferredHeight: 48,
        minWidth: 44,
        minHeight: 44,
      },
      position: { alignMain: "start", alignCross: "center", order: 4 },
      capabilities: { resizable: true, truncatable: false, hideable: false, repositionable: false },
      interaction: { isInteractive: true },
      alt: "Shop now",
    },
    {
      id: "badge",
      type: "shape",
      role: "supporting",
      priority: 3,
      size: {
        preferredWidth: 84,
        preferredHeight: 28,
        minWidth: 40,
        minHeight: 16,
        maxWidth: 100,
        maxHeight: 32,
      },
      position: { alignMain: "end", alignCross: "start", order: 5 },
      capabilities: { resizable: true, truncatable: false, hideable: true, repositionable: true },
      alt: "New arrival",
    },
    {
      id: "logo",
      type: "image",
      role: "branding",
      priority: 3,
      size: {
        preferredWidth: 72,
        preferredHeight: 72,
        minWidth: 28,
        minHeight: 28,
        maxWidth: 96,
        maxHeight: 96,
        preferredAspectRatio: 1,
      },
      position: { alignMain: "end", alignCross: "center", order: 6 },
      capabilities: { resizable: true, truncatable: false, hideable: true, repositionable: true },
      alt: "Brand logo",
    },
  ],
});
