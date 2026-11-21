// Keep saved values from the original five-stop slider visually consistent.
const spacingFactors = [1.5, 1.25, 1, 0.8, 2 / 3];

export const standardPaperSpacing = 2;
export const maxPaperSpacing = spacingFactors.length - 1;
export const paperPatternGap = 23;

export function paperSpacingFactor(value: number) {
  const position = Number.isFinite(value) ? Math.max(0, Math.min(maxPaperSpacing, value)) : standardPaperSpacing;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return spacingFactors[lower] + (spacingFactors[upper] - spacingFactors[lower]) * (position - lower);
}
