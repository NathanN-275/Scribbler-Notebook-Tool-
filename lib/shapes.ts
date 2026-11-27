import { pageHeight, pageWidth } from "./ink";
import type { Point } from "./notebooks";

export type ShapeKind = "line" | "rectangle" | "circle";

export function shapePoints(kind: ShapeKind, start: Point, end: Point): Point[] {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (kind === "line") return distance >= 2 ? [start, end] : [];
  if (kind === "rectangle") {
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    if (right - left < 2 || bottom - top < 2) return [];
    return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }, { x: left, y: top }];
  }
  const radius = Math.min(distance, start.x, start.y, pageWidth - start.x, pageHeight - start.y);
  if (radius < 2) return [];
  const segments = Math.max(32, Math.min(720, Math.ceil(2 * Math.PI * radius / 4)));
  const points = Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * 2 * Math.PI;
    return { x: start.x + Math.cos(angle) * radius, y: start.y + Math.sin(angle) * radius };
  });
  return [...points, points[0]];
}
