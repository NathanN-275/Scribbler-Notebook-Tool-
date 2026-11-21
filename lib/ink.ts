import type { Point, Stroke } from "./notebooks";

export const pageWidth = 800;
export const pageHeight = 1040;

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

type Interval = [number, number];

function eraseInterval(start: Point, end: Point, from: Point, to: Point, radius: number): Interval | undefined {
  if (!touches(start, end, from, to, radius)) return;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return [0, 1];

  let first = 1;
  let last = 0;
  function include(min: number, max: number) {
    if (min > max || max < 0 || min > 1) return;
    first = Math.min(first, Math.max(0, min));
    last = Math.max(last, Math.min(1, max));
  }

  // A swept circular eraser covers two end circles and the rectangle between them.
  for (const center of [from, to]) {
    const x = start.x - center.x;
    const y = start.y - center.y;
    const projection = x * dx + y * dy;
    const discriminant = projection ** 2 - lengthSquared * (x * x + y * y - radius * radius);
    if (discriminant < 0) continue;
    const offset = Math.sqrt(discriminant);
    include((-projection - offset) / lengthSquared, (-projection + offset) / lengthSquared);
  }

  const travel = Math.hypot(to.x - from.x, to.y - from.y);
  if (travel) {
    const ux = (to.x - from.x) / travel;
    const uy = (to.y - from.y) / travel;
    const x = start.x - from.x;
    const y = start.y - from.y;
    const along = axisInterval(x * ux + y * uy, dx * ux + dy * uy, 0, travel);
    const across = axisInterval(-x * uy + y * ux, -dx * uy + dy * ux, -radius, radius);
    if (along && across) include(Math.max(along[0], across[0]), Math.min(along[1], across[1]));
  }

  if (last - first > 1e-9) return [first, last];
}

function axisInterval(start: number, delta: number, min: number, max: number): Interval | undefined {
  if (Math.abs(delta) < 1e-9) return start >= min && start <= max ? [0, 1] : undefined;
  const first = (min - start) / delta;
  const last = (max - start) / delta;
  return [Math.min(first, last), Math.max(first, last)];
}

export function eraseStrokePoints(stroke: Stroke, from: Point, to: Point, radius: number): Stroke[] | undefined {
  const reach = radius + stroke.width / 2;
  const points = stroke.points;
  if (points.length === 1) return pointSegmentDistance(points[0], from, to) <= reach ? [] : undefined;

  const fragments: Point[][] = [];
  let fragment: Point[] | undefined;
  let changed = false;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const cut = eraseInterval(start, end, from, to, reach);
    if (!fragment) {
      fragment = [start];
      fragments.push(fragment);
    }
    if (!cut) {
      fragment.push(end);
      continue;
    }

    changed = true;
    const pointAt = (position: number) => ({
      x: start.x + (end.x - start.x) * position,
      y: start.y + (end.y - start.y) * position,
    });
    const [first, last] = cut;
    if (first > 0) fragment.push(pointAt(first));
    if (fragment.length === 1) fragments.pop();
    fragment = undefined;
    if (last < 1) {
      fragment = [pointAt(last), end];
      fragments.push(fragment);
    }
  }

  if (changed) return fragments.map((points, index) => ({
    ...stroke, points, id: index === 0 ? stroke.id : crypto.randomUUID(),
  }));
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

export function caughtPolygonByLasso(corners: Point[], boundary: Point[]) {
  if (corners.some((point) => inside(point, boundary)) || boundary.some((point) => inside(point, corners))) return true;
  const edges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]] as const);
  return boundary.some((point, index) => edges.some(([a, b]) => touches(point, boundary[index + 1] ?? boundary[0], a, b, 0)));
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, selected: boolean) {
  const [first, ...rest] = stroke.points;
  if (!first) return;
  ctx.save();
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
