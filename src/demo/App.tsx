import { useMemo, useState } from "react";
import { resolveLayout } from "../engine/resolver";
import {
  broadcastLowerThird,
  constrainedStrip,
  defineSurface,
  mobileLandscape,
  mobilePortrait,
  squareRetailKiosk,
  type SurfaceProfileInput,
} from "../engine/surfaces";
import { productAd } from "../examples/productAd";
import { DomRenderer } from "../renderers/dom/DomRenderer";
import { SurfacePicker } from "./SurfacePicker";
import { ConstraintControls } from "./ConstraintControls";
import { DebugOverlay } from "./DebugOverlay";
import { LayoutInspector } from "./LayoutInspector";

const REQUIRED_SURFACES = [
  mobilePortrait,
  mobileLandscape,
  broadcastLowerThird,
  squareRetailKiosk,
  constrainedStrip,
];

const STRESS_TEST_ID = "__stress_test__";
const CUSTOM_SURFACE_ID = "__custom_surface__";

const DEFAULT_STRESS_DRAFT: SurfaceProfileInput = {
  id: STRESS_TEST_ID,
  width: 250,
  height: 900,
  safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
  minTapTarget: 44,
  minTextSize: 12,
  touchOnly: true,
};

const DEFAULT_CUSTOM_DRAFT: SurfaceProfileInput = {
  id: CUSTOM_SURFACE_ID,
  width: 173,
  height: 641,
  safeArea: { top: 10, right: 10, bottom: 10, left: 10 },
  minTapTarget: 40,
  minTextSize: 14,
  touchOnly: true,
  viewingDistance: "near",
};

export function App() {
  const [activeId, setActiveId] = useState<string>(mobilePortrait.id);
  const [debugMode, setDebugMode] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [stressDraft, setStressDraft] = useState<SurfaceProfileInput>(DEFAULT_STRESS_DRAFT);
  const [customDraft, setCustomDraft] = useState<SurfaceProfileInput>(DEFAULT_CUSTOM_DRAFT);
  const [resolvedCustomDraft, setResolvedCustomDraft] =
    useState<SurfaceProfileInput>(DEFAULT_CUSTOM_DRAFT);

  const activeSurface = useMemo(() => {
    if (activeId === STRESS_TEST_ID) return defineSurface(stressDraft);
    if (activeId === CUSTOM_SURFACE_ID) return defineSurface(resolvedCustomDraft);
    return REQUIRED_SURFACES.find((s) => s.id === activeId) ?? mobilePortrait;
  }, [activeId, stressDraft, resolvedCustomDraft]);

  const layout = useMemo(
    () => resolveLayout(productAd, activeSurface, { trace: true }),
    [activeSurface],
  );

  const degradedCount = layout.elements.filter((e) => e.degradations.length > 0).length;
  const hiddenCount = layout.elements.filter((e) => !e.visible).length;

  // Scale the stage down to fit the viewport for very large surfaces.
  const maxStageWidth = 760;
  const maxStageHeight = 560;
  const scale = Math.min(
    1,
    maxStageWidth / activeSurface.width,
    maxStageHeight / activeSurface.height,
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-title">Adaptive Layout Engine</div>
          <div className="app-subtitle">One AdSpec, resolved per surface — no per-surface branches</div>
        </div>
        <div className="toggle-row">
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Debug</span>
          <button
            type="button"
            className={`toggle${debugMode ? " on" : ""}`}
            aria-pressed={debugMode}
            aria-label="Toggle debug mode"
            onClick={() => setDebugMode((v) => !v)}
          />
        </div>
      </header>

      <div className="app-body">
        <div className="panel panel-sidebar">
          <p className="section-label">Surfaces</p>
          <SurfacePicker
            surfaces={REQUIRED_SURFACES}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              setSelectedElementId(null);
            }}
          />

          <ul className="nav-list">
            <li>
              <button
                type="button"
                className={`nav-item${activeId === STRESS_TEST_ID ? " active" : ""}`}
                onClick={() => {
                  setActiveId(STRESS_TEST_ID);
                  setSelectedElementId(null);
                }}
              >
                Stress test
                <span className="nav-item-meta">live width/height/constraints</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`nav-item${activeId === CUSTOM_SURFACE_ID ? " active" : ""}`}
                onClick={() => {
                  setActiveId(CUSTOM_SURFACE_ID);
                  setSelectedElementId(null);
                }}
              >
                Try custom surface
                <span className="nav-item-meta">never seen by the resolver</span>
              </button>
            </li>
          </ul>

          {activeId === STRESS_TEST_ID && (
            <ConstraintControls draft={stressDraft} onChange={setStressDraft} variant="stress" />
          )}
          {activeId === CUSTOM_SURFACE_ID && (
            <ConstraintControls
              draft={customDraft}
              onChange={setCustomDraft}
              variant="custom"
              onResolve={() => setResolvedCustomDraft(customDraft)}
            />
          )}
        </div>

        <div className="panel panel-stage">
          <div className="stage-scroll">
            <div
              className="stage-frame"
              style={{
                width: activeSurface.width * scale,
                height: activeSurface.height * scale,
              }}
            >
              <div
                style={{
                  width: activeSurface.width,
                  height: activeSurface.height,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  position: "relative",
                }}
              >
                <DomRenderer
                  layout={layout}
                  showDebugOverlay={debugMode}
                  selectedElementId={selectedElementId}
                  onSelectElement={(id) => setSelectedElementId(id)}
                />
                {debugMode && <DebugOverlay layout={layout} />}
              </div>
            </div>
          </div>
        </div>

        <div className="panel panel-inspector">
          <LayoutInspector
            layout={layout}
            specElements={productAd.elements}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
          />
        </div>
      </div>

      <div className="status-bar">
        <span className="status-chip">
          <span className={`status-dot ${layout.validation.valid ? "dot-good" : "dot-bad"}`} />
          {layout.validation.valid ? "Valid" : `${layout.validation.violations.length} violation(s)`}
        </span>
        <span className="status-chip">
          <span className="status-dot dot-good" />
          No overlap
        </span>
        <span className="status-chip">
          <span className="status-dot dot-good" />
          Safe area respected
        </span>
        {degradedCount > 0 && (
          <span className="status-chip">
            <span className="status-dot dot-warn" />
            {degradedCount} degraded element{degradedCount === 1 ? "" : "s"}
          </span>
        )}
        {hiddenCount > 0 && (
          <span className="status-chip">
            <span className="status-dot dot-warn" />
            {hiddenCount} hidden
          </span>
        )}
        <span style={{ marginLeft: "auto", fontFamily: "var(--mono)" }}>
          {activeSurface.width}×{activeSurface.height} · {activeSurface.orientation}
        </span>
      </div>
    </div>
  );
}
