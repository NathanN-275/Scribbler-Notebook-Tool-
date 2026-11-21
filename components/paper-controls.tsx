import type { CSSProperties } from "react";
import type { PaperType } from "../lib/notebooks";

export const spacingLabels = ["Very loose", "Loose", "Standard", "Dense", "Very dense"];
export const spacingFactors = [1.5, 1.25, 1, 0.8, 2 / 3];

export function paperStyle(spacing: number): CSSProperties {
  return { "--density": spacingFactors[spacing] ?? 1 } as CSSProperties;
}

export function PaperSpacingControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="paper-spacing-control">
    <label htmlFor="paper-spacing">Spacing: <strong>{spacingLabels[value]}</strong></label>
    <input id="paper-spacing" type="range" min="0" max="4" step="1" value={value}
      aria-valuetext={spacingLabels[value]} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    <div className="range-captions"><span>Less dense</span><span>More dense</span></div>
  </div>;
}

export function PaperPreview({ paper, spacing, className = "" }: { paper: PaperType; spacing: number; className?: string }) {
  return <div aria-label={`${paper} paper preview, ${spacingLabels[spacing]}`} className={`paper-sample ${paper} ${className}`}
    style={paperStyle(spacing)} role="img" />;
}
