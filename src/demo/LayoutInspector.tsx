import { useState } from "react";
import type { AdElement } from "../engine/types";
import type { ResolvedLayout } from "../engine/types";

export interface LayoutInspectorProps {
  layout: ResolvedLayout;
  specElements: AdElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
}

export function LayoutInspector({
  layout,
  specElements,
  selectedElementId,
  onSelectElement,
}: LayoutInspectorProps) {
  const [tab, setTab] = useState<"element" | "trace">(selectedElementId ? "element" : "trace");

  const selected = selectedElementId
    ? layout.elements.find((e) => e.id === selectedElementId)
    : null;
  const selectedSpec = selectedElementId
    ? specElements.find((e) => e.id === selectedElementId)
    : null;

  return (
    <div>
      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === "element" ? " active" : ""}`}
          onClick={() => setTab("element")}
        >
          Element
        </button>
        <button
          type="button"
          className={`tab${tab === "trace" ? " active" : ""}`}
          onClick={() => setTab("trace")}
        >
          Decision trace
        </button>
      </div>

      {tab === "element" && (
        <ElementDetail
          selected={selected ?? null}
          selectedSpec={selectedSpec ?? null}
          diagnostics={layout.diagnostics}
          onClear={() => onSelectElement(null)}
        />
      )}

      {tab === "trace" && <DecisionTrace layout={layout} />}
    </div>
  );
}

function ElementDetail({
  selected,
  selectedSpec,
  diagnostics,
  onClear,
}: {
  selected: ResolvedLayout["elements"][number] | null;
  selectedSpec: AdElement | null;
  diagnostics: ResolvedLayout["diagnostics"];
  onClear: () => void;
}) {
  if (!selected || !selectedSpec) {
    return (
      <p className="inspector-empty">
        Click any element on the canvas (with debug mode on) to inspect its resolved position,
        size, constraints, and any degradation applied to it.
      </p>
    );
  }

  const ownDiagnostics = diagnostics.filter((d) => d.elementId === selected.id);

  return (
    <div>
      <p className="section-label" style={{ marginBottom: 4 }}>
        {selected.id}
      </p>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-tertiary)",
          fontSize: 11,
          cursor: "pointer",
          padding: 0,
          marginBottom: 10,
        }}
      >
        clear selection
      </button>

      <Row k="Role" v={selected.role} />
      <Row k="Type" v={selected.type} />
      <Row k="Priority" v={String(selected.priority)} />
      <Row k="Visible" v={selected.visible ? "yes" : "no"} />
      {selected.visible && (
        <>
          <Row
            k="Resolved position"
            v={`${Math.round(selected.rect.x)}, ${Math.round(selected.rect.y)}`}
          />
          <Row
            k="Resolved size"
            v={`${Math.round(selected.rect.width)} × ${Math.round(selected.rect.height)}`}
          />
          {selected.fontSize !== undefined && (
            <Row k="Font size" v={`${Math.round(selected.fontSize)}px`} />
          )}
          <Row k="Truncated" v={selected.truncated ? "yes" : "no"} />
        </>
      )}
      <Row k="Min size" v={`${selectedSpec.size.minWidth} × ${selectedSpec.size.minHeight}`} />
      <Row
        k="Preferred size"
        v={`${selectedSpec.size.preferredWidth} × ${selectedSpec.size.preferredHeight}`}
      />
      <Row k="Required" v={selectedSpec.required ? "yes" : "no"} />
      <Row
        k="Capabilities"
        v={Object.entries(selectedSpec.capabilities)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ")}
      />

      {selected.degradations.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className="section-label">Degradation applied</p>
          {selected.degradations.map((d) => (
            <span key={d} className="pill pill-warn">
              {d}
            </span>
          ))}
        </div>
      )}

      {ownDiagnostics.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className="section-label">Why</p>
          {ownDiagnostics.map((d, i) => (
            <p key={i} className="inspector-empty" style={{ marginBottom: 6 }}>
              {d.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function DecisionTrace({ layout }: { layout: ResolvedLayout }) {
  if (layout.diagnostics.length === 0) {
    return <p className="inspector-empty">No diagnostics recorded for this resolution.</p>;
  }
  return (
    <ul className="trace-list">
      {layout.diagnostics.map((d, i) => (
        <li
          key={i}
          className={`trace-item ${d.type === "VIOLATION" ? "violation" : d.type === "DEGRADATION" ? "degradation" : "info"}`}
        >
          {d.elementId && <span className="trace-id">{d.elementId}</span>}
          {d.elementId ? " — " : ""}
          {d.action ? `[${d.action}] ` : ""}
          {d.reason}
        </li>
      ))}
    </ul>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="inspector-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}
