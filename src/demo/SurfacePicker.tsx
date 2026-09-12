import type { SurfaceProfile } from "../engine/types";

export interface SurfacePickerProps {
  surfaces: SurfaceProfile[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function SurfacePicker({ surfaces, activeId, onSelect }: SurfacePickerProps) {
  return (
    <ul className="nav-list">
      {surfaces.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            className={`nav-item${s.id === activeId ? " active" : ""}`}
            onClick={() => onSelect(s.id)}
          >
            {formatLabel(s.id)}
            <span className="nav-item-meta">
              {s.width}×{s.height}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatLabel(id: string): string {
  return id
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
