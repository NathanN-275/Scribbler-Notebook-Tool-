import type { Page, Point, Stroke, TextBox } from "./notebooks";

export type PageItems = Pick<Page, "strokes" | "textBoxes">;
export type Bounds = { x: number; y: number; width: number; height: number };
export type SelectionTransform = { origin: Point; scale: number; angle: number; offset: Point };

export function selectionTransform(origin: Point): SelectionTransform {
  return { origin, scale: 1, angle: 0, offset: { x: 0, y: 0 } };
}

export function boxCenter(box: Bounds): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function transformPoint(point: Point, { origin, scale, angle, offset }: SelectionTransform): Point {
  const x = (point.x - origin.x) * scale;
  const y = (point.y - origin.y) * scale;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: origin.x + x * cos - y * sin + offset.x, y: origin.y + x * sin + y * cos + offset.y };
}

export function transformStroke(stroke: Stroke, transform: SelectionTransform): Stroke {
  return { ...stroke, width: stroke.width * transform.scale, points: stroke.points.map((point) => transformPoint(point, transform)) };
}

export function transformBox<T extends Bounds>(box: T, transform: SelectionTransform) {
  const center = transformPoint(boxCenter(box), transform);
  const width = box.width * transform.scale;
  const height = box.height * transform.scale;
  return { ...box, x: center.x - width / 2, y: center.y - height / 2, width, height };
}

export function transformTextBox(box: TextBox, transform: SelectionTransform): TextBox {
  return {
    ...transformBox(box, transform),
    rotation: (box.rotation ?? 0) + transform.angle,
    textScale: (box.textScale ?? 1) * transform.scale,
  };
}

export function textBoxCorners(box: TextBox): Point[] {
  const { x, y, width, height } = box;
  const transform = { ...selectionTransform(boxCenter(box)), angle: box.rotation ?? 0 };
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
    .map((point) => transformPoint(point, transform));
}

export function hitsTextBox(box: TextBox, point: Point) {
  const local = transformPoint(point, { ...selectionTransform(boxCenter(box)), angle: -(box.rotation ?? 0) });
  return local.x >= box.x && local.x <= box.x + box.width && local.y >= box.y && local.y <= box.y + box.height;
}

export function selectionBounds(items: PageItems): Bounds | undefined {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  function include(point: Point, padding = 0) {
    left = Math.min(left, point.x - padding);
    top = Math.min(top, point.y - padding);
    right = Math.max(right, point.x + padding);
    bottom = Math.max(bottom, point.y + padding);
  }
  for (const stroke of items.strokes) {
    for (const point of stroke.points) include(point, stroke.width / 2);
  }
  for (const box of items.textBoxes) {
    for (const point of textBoxCorners(box)) include(point);
  }
  if (left === Infinity) return;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
