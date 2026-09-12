import type { SurfaceProfileInput } from "../engine/surfaces";

export interface ConstraintControlsProps {
  draft: SurfaceProfileInput;
  onChange: (next: SurfaceProfileInput) => void;
  variant: "stress" | "custom";
  onResolve?: () => void;
}

function numberField(
  label: string,
  value: number,
  onChange: (v: number) => void,
  opts?: { min?: number; max?: number; step?: number },
) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        min={opts?.min}
        max={opts?.max}
        step={opts?.step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function ConstraintControls({ draft, onChange, variant, onResolve }: ConstraintControlsProps) {
  const safeArea = draft.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };

  const set = (patch: Partial<SurfaceProfileInput>) => onChange({ ...draft, ...patch });
  const setSafeArea = (patch: Partial<typeof safeArea>) =>
    onChange({ ...draft, safeArea: { ...safeArea, ...patch } });

  return (
    <div>
      <p className="section-label">
        {variant === "stress" ? "Stress test" : "Try custom surface"}
      </p>

      <div className="field-row">
        {numberField("Width", draft.width, (v) => set({ width: v }), { min: 20, max: 4000 })}
        {numberField("Height", draft.height, (v) => set({ height: v }), { min: 20, max: 4000 })}
      </div>

      <div className="field">
        <label>Safe area (top / right / bottom / left)</label>
        <div className="field-row">
          <input
            type="number"
            value={safeArea.top}
            onChange={(e) => setSafeArea({ top: Number(e.target.value) })}
          />
          <input
            type="number"
            value={safeArea.right}
            onChange={(e) => setSafeArea({ right: Number(e.target.value) })}
          />
        </div>
        <div className="field-row" style={{ marginTop: 6 }}>
          <input
            type="number"
            value={safeArea.bottom}
            onChange={(e) => setSafeArea({ bottom: Number(e.target.value) })}
          />
          <input
            type="number"
            value={safeArea.left}
            onChange={(e) => setSafeArea({ left: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="field-row">
        {numberField("Min text size", draft.minTextSize ?? 12, (v) => set({ minTextSize: v }), {
          min: 8,
          max: 120,
        })}
        {numberField("Min tap target", draft.minTapTarget ?? 24, (v) => set({ minTapTarget: v }), {
          min: 8,
          max: 300,
        })}
      </div>

      {variant === "custom" && (
        <>
          <div className="field">
            <label>Viewing distance</label>
            <select
              value={draft.viewingDistance ?? "near"}
              onChange={(e) => set({ viewingDistance: e.target.value as "near" | "far" })}
            >
              <option value="near">Near</option>
              <option value="far">Far</option>
            </select>
          </div>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="touch-only"
              checked={draft.touchOnly ?? false}
              onChange={(e) => set({ touchOnly: e.target.checked })}
            />
            <label htmlFor="touch-only" style={{ marginBottom: 0 }}>
              Touch-only surface
            </label>
          </div>
          {onResolve && (
            <button type="button" className="button-primary" onClick={onResolve}>
              Resolve layout
            </button>
          )}
        </>
      )}
    </div>
  );
}
