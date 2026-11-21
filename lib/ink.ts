import type { Point, Stroke } from "./notebooks";

export const pageWidth = 800;
export const pageHeight = 1040;

export function shiftStroke(stroke: Stroke, offset: Point): Stroke {
  return { ...stroke, points: stroke.points.map(({ x, y }) => ({ x: x + offset.x, y: y + offset.y })) };
}

function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function crosses(a: Point, b: Point, c: Point, d: Point) {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function touches(a: Point, b: Point, c: Point, d: Point, radius: number) {
  return crosses(a, b, c, d) || Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  ) <= radius;
}

export function hitsStroke(stroke: Stroke, from: Point, to: Point, radius: number) {
  return stroke.points.some((point, index) => touches(stroke.points[index - 1] ?? point, point, from, to, radius + stroke.width / 2));
}

function inside(point: Point, boundary: Point[]) {
  let enclosed = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const a = boundary[i];
    const b = boundary[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
      enclosed = !enclosed;
    }
  }
  return enclosed;
}

export function caughtByLasso(stroke: Stroke, boundary: Point[]) {
  return stroke.points.some((point) => inside(point, boundary)) || boundary.some((point, index) =>
    hitsStroke(stroke, point, boundary[index + 1] ?? boundary[0], 0),
  );
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, selected: boolean, offset?: Point) {
  const [first, ...rest] = stroke.points;
  if (!first) return;
  ctx.save();
  if (offset) ctx.translate(offset.x, offset.y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.globalAlpha = stroke.tool === "pencil" ? 0.56 : 1;
  if (selected) {
    ctx.shadowBlur = 7;
    ctx.shadowColor = "#297b61";
  }
  ctx.beginPath();
  if (rest.length === 0) {
    ctx.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(first.x, first.y);
    for (const point of rest) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.restore();
}
