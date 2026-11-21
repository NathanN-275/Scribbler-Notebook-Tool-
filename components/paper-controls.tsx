import { useId } from "react";
import type { CSSProperties } from "react";
import { paperTypes, type PaperType } from "../lib/notebooks";
import { maxPaperSpacing, paperSpacingFactor } from "../lib/paper";

export function paperStyle(spacing: number): CSSProperties {
  return { "--density": paperSpacingFactor(spacing) } as CSSProperties;
}

export function PaperControls({ paper, spacing, onPaperChange, onSpacingChange }: {
  paper: PaperType;
  spacing: number;
  onPaperChange: (paper: PaperType) => void;
  onSpacingChange: (spacing: number) => void;
}) {
  const spacingId = useId();
  return <>
    <fieldset className="paper-field">
      <legend>Paper type</legend>
      <div className="paper-choices">
        {paperTypes.map((type) => <label key={type} className="paper-option">
          <input type="radio" name="paper" value={type} checked={paper === type} onChange={() => onPaperChange(type)} />
          <span aria-hidden="true" className={`paper-sample ${type}`} style={paperStyle(spacing)} />
          <span>{type}</span>
        </label>)}
      </div>
    </fieldset>
    {paper !== "plain" && <div className="paper-spacing-control">
      <label htmlFor={spacingId}>Paper spacing</label>
      <input id={spacingId} type="range" min="0" max={maxPaperSpacing} step="0.01" value={spacing}
        aria-valuetext={`${Math.round(paperSpacingFactor(spacing) * 100)}% of standard spacing`}
        onChange={(event) => onSpacingChange(event.currentTarget.valueAsNumber)} />
      <div className="range-captions"><span>Less dense</span><span>More dense</span></div>
    </div>}
  </>;
}

export function PaperPreview({ paper, spacing }: { paper: PaperType; spacing: number }) {
  return <div className="create-note-preview">
    <span>Preview</span>
    <div aria-label={`Full-page ${paper} paper preview`} className={`paper-sample large-paper-preview ${paper}`}
      style={paperStyle(spacing)} role="img" />
  </div>;
}
